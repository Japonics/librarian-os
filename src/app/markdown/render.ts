import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdownLang from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import MarkdownIt, { type Token } from 'markdown-it';
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import { slugify } from '../../shared/text';
import { state, url } from '../state';

for (const [name, lang] of Object.entries({ bash, css, javascript, json, markdown: markdownLang, python, sql, typescript, xml, yaml })) hljs.registerLanguage(name, lang);
const ALIASES: Record<string, string> = { sh: 'bash', shell: 'bash', js: 'javascript', ts: 'typescript', py: 'python', html: 'xml', yml: 'yaml', md: 'markdown' };

interface Env {
  /** Repository relative path of the Markdown file being rendered. */
  path: string;
}

/** Resolve `href` against the directory of `fromPath`, both repository relative. Returns undefined when it leaves the repository. */
export function resolveRelative(fromPath: string, href: string): string | undefined {
  const parts = fromPath.split('/').slice(0, -1);
  for (const seg of href.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
}

const isExternal = (href: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
  highlight(code, lang) {
    const name = ALIASES[lang] ?? lang;
    const body = name && hljs.getLanguage(name) ? hljs.highlight(code, { language: name, ignoreIllegals: true }).value : esc(code);
    return `<pre><code class="hljs${name ? ` language-${esc(name)}` : ''}">${body}</code></pre>`;
  },
});
md.use(anchor, { slugify, level: [2, 3, 4], permalink: anchor.permalink.ariaHidden({ placement: 'before', class: 'anchor', symbol: '#' }) });
md.use(footnote);

// Mermaid blocks become placeholders that the browser renders later. The source stays in an attribute.
const defaultFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  // The source is URI-encoded: a raw "-->" inside an attribute value would be removed by the sanitizer.
  if (token && token.info.trim().split(/\s+/)[0] === 'mermaid') return `<div class="diagram" data-mermaid="${encodeURIComponent(token.content)}"><pre><code>${esc(token.content)}</code></pre></div>\n`;
  return defaultFence ? defaultFence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
};

md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n';
md.renderer.rules.table_close = () => '</table></div>\n';

md.core.ruler.push('librarian_links', (stateCore) => {
  const env = stateCore.env as unknown as Env;
  for (const block of stateCore.tokens) {
    if (block.type === 'paragraph_open') {
      const inline = stateCore.tokens[stateCore.tokens.indexOf(block) + 1];
      if (inline?.type === 'inline' && inline.content.startsWith('TODO:')) block.attrJoin('class', 'todo');
    }
    for (const t of block.children ?? []) {
      if (t.type === 'link_open') rewriteLink(t, env.path);
      if (t.type === 'image') {
        const src = attr(t, 'src');
        const target = isExternal(src) ? undefined : resolveRelative(env.path, src);
        if (target !== undefined) t.attrSet('src', url.media(target));
        t.attrSet('loading', 'lazy');
      }
    }
  }
});

const attr = (t: Token, name: string): string => String(t.attrGet(name) ?? '');

function rewriteLink(t: Token, fromPath: string): void {
  const href = attr(t, 'href');
  if (href.startsWith('#')) return;
  if (isExternal(href)) {
    t.attrSet('target', '_blank');
    t.attrSet('rel', 'noopener noreferrer');
    return;
  }
  const [rawPath = '', hash] = href.split('#');
  const target = resolveRelative(fromPath, decodeURI(rawPath));
  const node = target === undefined ? undefined : (state.byPath.get(target) ?? state.byPath.get(`${target.replace(/\/$/, '')}/README.md`));
  if (node) t.attrSet('href', url.note(node.id, hash ?? ''));
  else if (target !== undefined) t.attrSet('href', url.media(target));
}

export function renderMarkdown(source: string, path: string): string {
  const html = md.render(source, { path } satisfies Env);
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'data-mermaid'] });
}
