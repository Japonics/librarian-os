import { describe, expect, it } from 'vitest';
import { resolveContentPath } from '../src/server/content';
import { parseQuestions } from '../src/server/ai/provider';
import { proposeQuestions } from '../src/server/ai/questions';
import type { LibNode } from '../src/shared/types';
import { isAllowedGitUrl } from '../src/core/git';
import { pickProvider, providerInfos } from '../src/server/ai/providers';
import type { ToolConfig } from '../src/core/config';

describe('resolveContentPath', () => {
  const root = '/repo';
  it('serves images below the root', () => {
    expect(resolveContentPath(root, '_assets/arts/a.png')).toBe('/repo/_assets/arts/a.png');
  });
  it('refuses traversal, hidden, blocked and non-media paths', () => {
    for (const p of ['../etc/passwd.png', '%2e%2e/x.png', '.git/config.png', 'node_modules/a.png', 'notes/README.md', 'a%00.png']) {
      expect(resolveContentPath(root, p), p).toBeUndefined();
    }
  });
});

describe('parseQuestions', () => {
  const headings = [{ level: 2, text: 'Core concepts', slug: 'core-concepts' }];
  const raw = 'Here you go:\n[{"type":"recall","q":"What is X?","a":"X is Y - always.","anchor":"core-concepts"},{"type":"bad","q":"no","a":"no"},{"type":"explain","q":"Why Z?","a":"Because."},{"type":"explain","q":"Why Z?","a":"Dup."}]';
  it('keeps valid items, drops invalid and duplicate ones, marks them as unreviewed AI output', () => {
    const out = parseQuestions(raw, headings, [], 5, 1000);
    expect(out.map((q) => q.q)).toEqual(['What is X?', 'Why Z?']);
    expect(out[0]).toMatchObject({ origin: 'ai', reviewed: false, anchor: '#core-concepts' });
    expect(out[1]?.anchor).toBeUndefined();
  });
  it('replaces long dashes and respects the count', () => {
    const dash = String.fromCharCode(0x2014);
    const out = parseQuestions(`[{"type":"recall","q":"A ${dash} B?","a":"C"},{"type":"recall","q":"D?","a":"E"}]`, [], [], 1);
    expect(out).toHaveLength(1);
    expect(out[0]?.q).toBe('A - B?');
  });
  it('rejects output without an array', () => {
    expect(() => parseQuestions('sorry', [], [], 3)).toThrow();
  });
});

describe('proposeQuestions', () => {
  it('uses the provider and fails clearly when nothing is usable', async () => {
    const node = { title: 'T', questions: [], headings: [] } as unknown as LibNode;
    const ok = await proposeQuestions({ name: 'fake', complete: async () => '[{"type":"recall","q":"Q?","a":"A."}]' }, node, '# T', 3);
    expect(ok).toHaveLength(1);
    await expect(proposeQuestions({ name: 'fake', complete: async () => '[]' }, node, '# T', 3)).rejects.toThrow('no usable');
  });
});

describe('isAllowedGitUrl', () => {
  it('accepts https and ssh git URLs', () => {
    for (const u of ['https://github.com/owner/repo', 'https://github.com/owner/repo.git', 'git@github.com:owner/repo.git', 'ssh://git@host.example/owner/repo']) expect(isAllowedGitUrl(u), u).toBe(true);
  });
  it('refuses options, helpers, local files and shell syntax', () => {
    for (const u of ['--upload-pack=touch /tmp/x', 'ext::sh -c id', 'file:///etc', '/tmp/repo', 'http://github.com/a/b', 'https://x.com/a;b', 'https://x.com/a b', '-oProxyCommand=x']) expect(isAllowedGitUrl(u), u).toBe(false);
  });
});

const TOOL: ToolConfig = {
  port: 1, host: '127.0.0.1', dataDir: '/tmp/x', configPath: '/tmp/x.json', git: { pullOnSwitch: true, pullCooldownSeconds: 60 },
  ai: { enabled: true, default: { provider: 'anthropic', model: 'm1' }, maxQuestions: 5, providers: {
    anthropic: { label: 'A', apiKeyEnv: 'KEY_A', models: [{ id: 'm1' }, { id: 'm2' }] },
    openai: { label: 'O', apiKeyEnv: 'KEY_O', models: [{ id: 'o1' }] },
    gemini: { label: 'G', apiKeyEnv: 'KEY_G', models: [] },
    unknown: { label: 'U', apiKeyEnv: 'KEY_U', models: [{ id: 'u1' }] } } },
};

describe('AI provider selection', () => {
  it('reports key presence without exposing the key', () => {
    const infos = providerInfos(TOOL, { KEY_A: 'secret' });
    expect(infos.find((p) => p.id === 'anthropic')?.keyPresent).toBe(true);
    expect(infos.find((p) => p.id === 'openai')?.keyPresent).toBe(false);
    expect(JSON.stringify(infos)).not.toContain('secret');
    expect(infos.find((p) => p.id === 'unknown')?.keyPresent).toBe(false);
  });
  it('uses the default, accepts configured models and rejects the rest', () => {
    expect(pickProvider(TOOL, {}, { KEY_A: 'k' }).name).toBe('anthropic');
    expect(pickProvider(TOOL, { provider: 'openai', model: 'o1' }, { KEY_O: 'k' }).name).toBe('openai');
    expect(() => pickProvider(TOOL, { provider: 'anthropic', model: 'nope' }, { KEY_A: 'k' })).toThrow('not configured');
    expect(() => pickProvider(TOOL, { provider: 'nope' }, {})).toThrow('Unknown provider');
    expect(() => pickProvider(TOOL, { provider: 'unknown' }, { KEY_U: 'k' })).toThrow('Unknown provider');
    expect(() => pickProvider(TOOL, {}, {})).toThrow('KEY_A');
    expect(() => pickProvider({ ...TOOL, ai: { ...TOOL.ai, enabled: false } }, {}, { KEY_A: 'k' })).toThrow('switched off');
  });
});
