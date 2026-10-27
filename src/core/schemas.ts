import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIBRARIAN_DIR } from './config';

type AjvCtor = typeof Ajv2020;
const Ajv: AjvCtor = (Ajv2020 as unknown as { default?: AjvCtor }).default ?? Ajv2020;
const ajv = new Ajv({ allErrors: true, strict: true });

const cache = new Map<string, ReturnType<typeof ajv.compile>>();

function compile(file: string): ReturnType<typeof ajv.compile> {
  let fn = cache.get(file);
  if (!fn) {
    fn = ajv.compile(JSON.parse(readFileSync(join(LIBRARIAN_DIR, 'schema', file), 'utf8')));
    cache.set(file, fn);
  }
  return fn;
}

export const sidecarValidator = (): ReturnType<typeof ajv.compile> => compile('note.schema.json');
export const projectValidator = (): ReturnType<typeof ajv.compile> => compile('librarian-os.schema.json');

export function firstErrors(validate: ReturnType<typeof ajv.compile>, limit = 3): string[] {
  return (validate.errors ?? []).slice(0, limit).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim());
}
