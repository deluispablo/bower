import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';

export const checkout = '/private/tmp/bower-p2-journal-ack';
const integration = '/Users/deluisp/Projects/bower-app';
const ts = createRequire(import.meta.url)(`${checkout}/node_modules/typescript`);
const cache = new Map();
export const sourceHashes = {};
export const diagnostics = [];
export function loadPublic(path) {
  if (cache.has(path)) return cache.get(path).exports;
  if (!path.startsWith('src/data/') || path.includes('..') || !path.endsWith('.ts')) throw new Error('Outside assigned data source boundary.');
  const source = readFileSync(resolve(checkout, path), 'utf8');
  const integrated = readFileSync(resolve(integration, path), 'utf8');
  if (source !== integrated) throw new Error(`Source differs from integration: ${path}`);
  sourceHashes[path] = createHash('sha256').update(source).digest('hex');
  const module = { exports: {} }; cache.set(path, module);
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) throw new Error('Unexpected runtime package.');
    const target = resolve(checkout, dirname(path), specifier);
    return loadPublic(relative(checkout, target).replace(/\.js$/, '.ts') + (target.endsWith('.ts') || target.endsWith('.js') ? '' : '.ts'));
  };
  const captureConsole = { ...console, error: (...args) => diagnostics.push(args.map((v) => v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v)) };
  new Function('require', 'module', 'exports', 'console', output)(localRequire, module, module.exports, captureConsole);
  return module.exports;
}
