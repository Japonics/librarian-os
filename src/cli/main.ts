// Usage: tsx src/cli/main.ts <check|scaffold|toc|index> [repository directory]
// The repository defaults to the directory where npm was started (INIT_CWD), or the current directory.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runChecks } from '../core/check';
import { LIBRARIAN_DIR } from '../core/config';
import { loadLibrary, toIndex } from '../core/library';
import { scaffold } from '../core/scaffold';
import { writeToc } from '../core/toc';

const [command, ...rest] = process.argv.slice(2);
const positional = rest.filter((a) => !a.startsWith('--'));
const root = resolve(positional[0] ?? process.env.INIT_CWD ?? process.cwd());

switch (command) {
  case 'check': {
    const result = runChecks(root);
    const s = result.stats;
    for (const w of result.warnings) console.warn(`warning  ${w.file}: ${w.message}`);
    for (const e of result.errors) console.error(`error    ${e.file}: ${e.message}`);
    console.log(`${root}`);
    console.log(`${s.markdown} Markdown files, ${s.sidecars} sidecars, ${s.nodes} nodes, ${s.edges} relations, ${s.planned} planned indexes, ${s.todos} TODO lines`);
    console.log(`${result.errors.length} errors, ${result.warnings.length} warnings`);
    process.exit(result.errors.length ? 1 : 0);
    break;
  }
  case 'scaffold': {
    const dry = rest.includes('--dry');
    const created = scaffold(root, dry);
    for (const c of created) console.log(`${dry ? 'would create' : 'created'}  ${c}`);
    console.log(`${created.length} sidecars ${dry ? 'would be created' : 'created'}`);
    break;
  }
  case 'toc':
    console.log(`ToC written, ${writeToc(root)} lines`);
    break;
  case 'index': {
    const lib = loadLibrary(root);
    const dir = join(LIBRARIAN_DIR, '.cache');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'library-index.json'), `${JSON.stringify(toIndex(lib))}\n`);
    console.log(`${lib.nodes.length} nodes written to .cache/library-index.json, ${lib.issues.length} issues`);
    break;
  }
  default:
    console.error('Usage: <check|scaffold|toc|index> [repository directory]');
    process.exit(2);
}
