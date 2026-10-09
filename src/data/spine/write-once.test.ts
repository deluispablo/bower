/// <reference types="node" />
/**
 * One write-once rule with two cases (ARCHITECTURE, mechanism map; c2-create-by-id): a create carries an id Drive
 * reserved for it (`files.generateIds`), an update or a move carries the `bowerOp` stamp plus the checksum.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { driveError } from '../drive/drive-api';
import { updateByStamp } from './write-once';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string): string[] => readFileSync(join(ROOT, p), 'utf8').split('\n');

/** Every module that writes to the person's Drive: the app's, the run engine and its records, and the Worker's. */
const CREATES = ['src/data/vault/drive-vault.ts', 'src/data/vault/journal.ts', 'src/data/spine/engine.ts', 'src/data/spine/records.ts', 'src/data/spine/barrier.ts', 'api/src/vault.ts', 'src/data/fake/fake-worker.ts'];
/** The app's writers, the fake Worker's and the runner's repairs: each change is sent once with its stamp. */
const UPDATES = ['src/data/vault/drive-vault.ts', 'src/data/vault/journal.ts', 'src/data/fake/fake-worker.ts', 'runner/src/rules-repair.ts', 'runner/src/spine/retention.ts'];

describe('one write-once rule', () => {
  it('the app, runner and Worker write through one create-by-id and update-by-stamp helper', () => {
    const calls = (paths: string[], what: RegExp, through: RegExp): string[] =>
      paths.flatMap((p) => read(p).flatMap((line, i) => (what.test(line) && !through.test(line) ? [`${p}:${i + 1}`] : [])));
    // A create is sent only with the id reserved for it (`createById`, `makeFolder`, `makeText`).
    expect(calls(CREATES, /\.(createFolder|createText)\(/, /\bid\)/)).toEqual([]);
    // An app write to a file is sent only by the helper, with its stamp: `(op) => ...`.
    expect(calls(UPDATES, /\.(trash|untrash|update|writeText)\(/, /\(op\) =>/)).toEqual([]);
    // The run engine and the Worker make theirs through the helper itself.
    // The Worker's repair of Rules.md is sent by the helper too.
    expect(read('api/src/vault.ts').some((line) => line.includes('updateByStamp('))).toBe(true);
    for (const p of ['src/data/spine/engine.ts', 'api/src/vault.ts']) expect(read(p).some((line) => line.includes('createById(')), p).toBe(true);
    for (const p of CREATES) expect(read(p).some((line) => /from '[./a-z]*spine\/write-once(\.js)?'|from '\.\/write-once'/.test(line)), p).toBe(true);
  });
});

/** Every source file under `dir` (tests aside), relative to the repository root. */
const sources = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((n) => {
    const p = `${dir}/${n}`;
    return statSync(join(ROOT, p)).isDirectory() ? sources(p) : /\.tsx?$/.test(n) && !/\.(test|spec)\.tsx?$/.test(n) ? [p] : [];
  });

/** A source file to look through: its path from the repository root and its text. */
type Source = { path: string; text: string };

const HOME = 'src/data/spine/write-once.ts';
/** Drive's own call for ids (`files.generateIds`) and the home's call for one. */
const RESERVING = new Set(['generateIds', 'reserveId']);

/**
 * Where a reservation for an intended create is made or kept by hand, read from the code's syntax (TypeScript's own
 * parser), never from a field's name: the home's ports (its exported interfaces) say what the id's slot is called.
 * 1. a call for ids, or the call passed on (`generateIds`, `reserveId`), by any receiver or alias;
 * 2. the slot set, cleared or given by hand (`h.reserved = id`, `h['reserved'] = id`, `delete h.reserved`, `{ reserved: id }`);
 * 3. a store kept beyond one call (a class field or a module's own) that maps a key to an intended create: a Map whose
 *    values are a holder (a type with a slot for an id, or built on a port) or what a holder always carries (a line);
 * 4. the slot's id put in a store by hand (`ids.set(key, h.reserved)`).
 */
function reservationSites(files: readonly Source[]): string[] {
  const parsed = files.map((f) => ({ ...f, ast: ts.createSourceFile(f.path, f.text, ts.ScriptTarget.Latest, true) }));
  const home = parsed.find((f) => f.path === HOME)?.ast;
  if (!home) throw new Error('No write-once home');
  const ports = new Set<string>();
  const slots = new Set<string>();
  ts.forEachChild(home, (n) => {
    if (ts.isInterfaceDeclaration(n) && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      ports.add(n.name.text);
      for (const m of n.members) if (m.name && ts.isIdentifier(m.name)) slots.add(m.name.text);
    }
  });
  const nameOf = (n: ts.PropertyName | ts.BindingName | undefined): string | undefined =>
    n && (ts.isIdentifier(n) || ts.isStringLiteral(n)) ? n.text : undefined;
  const refs = (n: ts.Node | undefined, out = new Set<string>()): Set<string> => {
    if (!n) return out;
    if (ts.isTypeReferenceNode(n) && ts.isIdentifier(n.typeName)) out.add(n.typeName.text);
    if (ts.isExpressionWithTypeArguments(n) && ts.isIdentifier(n.expression)) out.add(n.expression.text);
    n.forEachChild((c) => void refs(c, out));
    return out;
  };
  // An id's type: a string, or a string not had yet (`string | null`, `string | undefined`).
  const idLike = (t: ts.TypeNode | undefined): boolean =>
    !!t && (t.kind === ts.SyntaxKind.StringKeyword || (ts.isUnionTypeNode(t) && t.types.some((u) => u.kind === ts.SyntaxKind.StringKeyword) && t.types.every((u) => u.kind === ts.SyntaxKind.StringKeyword || u.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isLiteralTypeNode(u) && u.literal.kind === ts.SyntaxKind.NullKeyword))));
  // The object types Bower declares (what a holder carries is one of them, never a platform type such as a Blob).
  const declared = new Set<string>();
  for (const { ast } of parsed) {
    const visit = (n: ts.Node): void => {
      const shaped = ts.isInterfaceDeclaration(n) || ts.isClassDeclaration(n) || (ts.isTypeAliasDeclaration(n) && (ts.isTypeLiteralNode(n.type) || ts.isIntersectionTypeNode(n.type)));
      if (shaped && n.name) declared.add(n.name.text);
      n.forEachChild(visit);
    };
    visit(ast);
  }
  // The holders (a type with the slot for an id, or built on a port) and what they carry, in every file.
  const holders = new Set<string>(ports);
  const carried = new Set<string>();
  for (const { ast } of parsed) {
    const visit = (n: ts.Node): void => {
      const decl = ts.isInterfaceDeclaration(n) || ts.isClassDeclaration(n) || ts.isTypeAliasDeclaration(n) ? n : undefined;
      const literals = decl && ts.isTypeAliasDeclaration(decl) ? (ts.isIntersectionTypeNode(decl.type) ? [...decl.type.types] : [decl.type]).flatMap((t) => (ts.isTypeLiteralNode(t) ? [...t.members] : [])) : [];
      const members: readonly ts.TypeElement[] | readonly ts.ClassElement[] | undefined = !decl ? undefined : ts.isTypeAliasDeclaration(decl) ? literals : decl.members;
      if (decl?.name && members) {
        const built = [...(ts.isTypeAliasDeclaration(decl) ? refs(decl.type) : (decl.heritageClauses ?? []).flatMap((h) => [...refs(h)]))].some((r) => ports.has(r));
        const slotted = members.some((m) => slots.has(nameOf(m.name) ?? '') && (ts.isPropertySignature(m) || ts.isPropertyDeclaration(m)) && idLike(m.type));
        if (built || slotted) {
          holders.add(decl.name.text);
          // What a holder always carries to Drive (a journal line, a thing of a pile), not what it may learn after.
          for (const m of members) if (!slots.has(nameOf(m.name) ?? '') && (ts.isPropertySignature(m) || ts.isPropertyDeclaration(m)) && !m.questionToken) refs(m.type, carried);
        }
      }
      n.forEachChild(visit);
    };
    visit(ast);
  }
  const intended = (t: ts.TypeNode | undefined): boolean => !!t && ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) && (holders.has(t.typeName.text) || (carried.has(t.typeName.text) && declared.has(t.typeName.text)));
  const isMap = (name: string): boolean => ['Map', 'WeakMap', 'ReadonlyMap', 'Record'].includes(name);
  const slotOf = (e: ts.Node): boolean =>
    (ts.isPropertyAccessExpression(e) && slots.has(e.name.text)) || (ts.isElementAccessExpression(e) && ts.isStringLiteralLike(e.argumentExpression) && slots.has(e.argumentExpression.text));
  const reads = (e: ts.Node): boolean => slotOf(e) || (e.forEachChild((c) => (reads(c) ? true : undefined)) ?? false);
  const kept = (n: ts.Node): boolean => {
    for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p) || ts.isBlock(p)) return false;
    return true;
  };
  const out: string[] = [];
  for (const { path, ast } of parsed) {
    if (path === HOME) continue;
    const at = (n: ts.Node, what: string): void => void out.push(`${path}:${ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1} ${what}`);
    const visit = (n: ts.Node): void => {
      if (ts.isTypeNode(n) || ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
      // 1. A call for ids, or that call passed on.
      if (ts.isPropertyAccessExpression(n) && RESERVING.has(n.name.text)) at(n, 'calls for ids');
      else if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression) && RESERVING.has(n.argumentExpression.text)) at(n, 'calls for ids');
      else if (ts.isIdentifier(n) && RESERVING.has(n.text) && !ts.isPropertyAccessExpression(n.parent) && !ts.isMethodSignature(n.parent) && !ts.isMethodDeclaration(n.parent) && !ts.isPropertyAssignment(n.parent) && !ts.isFunctionDeclaration(n.parent)) at(n, 'calls for ids');
      // 2. The slot set, cleared or given by hand.
      if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment && slotOf(n.left)) at(n, 'sets an id by hand');
      if (ts.isDeleteExpression(n) && slotOf(n.expression)) at(n, 'lets an id go by hand');
      if ((ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) && ts.isObjectLiteralExpression(n.parent) && slots.has(nameOf(n.name) ?? '')) at(n, 'gives an id by hand');
      // 3. A store of intended creates kept beyond one call.
      if ((ts.isPropertyDeclaration(n) || ts.isVariableDeclaration(n)) && kept(n)) {
        const init = n.initializer;
        const made = init && ts.isNewExpression(init) && ts.isIdentifier(init.expression) && isMap(init.expression.text) ? init.typeArguments?.[1] : undefined;
        const typed = n.type && ts.isTypeReferenceNode(n.type) && ts.isIdentifier(n.type.typeName) && isMap(n.type.typeName.text) ? n.type.typeArguments?.[1] : undefined;
        if (intended(made) || intended(typed)) at(n, 'keeps intended creates outside the home');
      }
      // 4. The slot's id put in a store by hand.
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'set' && n.arguments.some(reads)) at(n, 'stores an id by hand');
      n.forEachChild(visit);
    };
    visit(ast);
  }
  return out;
}

/** Every source file Bower runs, tests aside. */
const ALL = (): Source[] => ['src', 'runner/src', 'api/src'].flatMap(sources).map((path) => ({ path, text: read(path).join('\n') }));
/** How many reservation sites each file has, from `reservationSites`. */
const count = (sites: readonly string[]): Record<string, number> =>
  sites.reduce<Record<string, number>>((n, s) => {
    const p = s.slice(0, s.indexOf(':'));
    n[p] = (n[p] ?? 0) + 1;
    return n;
  }, {});

/**
 * Who may reserve a Drive id outside the home (TL-P4-17 addendum 1), and at how many sites: the ruled batch sites
 * (TL-P4-14 addendum 11), and the Drive adapters that pass the call on.
 * A ratchet, as the duplication baseline: a site more fails, and a site fewer fails until its number is lowered here.
 * This list may only shrink.
 */
const ALLOWED: Record<string, number> = {
  'src/data/spine/engine.ts': 2, // one batch for a run's creates; one id for a create the batch did not cover
  'runner/src/drive.ts': 3, // a per-attempt pool none outlives, and the fenced create that carries its id
  'src/data/fake/fake-worker.ts': 1, // the template's batch
  'api/src/vault.ts': 5, // the Worker's template, which fake-worker stands in for (the lead rules on it)
  'src/data/drive/seen-files.ts': 1, // passes the call on
  'src/data/fake/fake-run-drive.ts': 1, // passes the call on
  'src/data/drive/fake-drive.ts': 6, // the pretend Drive: its reserved ids and the creates that carry them
};

describe('one home for an intended create', () => {
  it('only the write-once home and the ruled batch sites reserve Drive ids', () => {
    const sites = reservationSites(ALL());
    const outside = sites.filter((s) => !(s.slice(0, s.indexOf(':')) in ALLOWED));
    expect(outside, 'Reserve an id for an intended create through write-once (makeOnce, Intended, reserveFor), keeping it on its holder').toEqual([]);
    expect(count(sites), 'A ratchet: a site more fails; a site fewer, lower its number in ALLOWED').toEqual(ALLOWED);
  });

  it('a renamed intent map, an id set or stored by hand, or the call for ids by another name is found by what it does', () => {
    const fixture = (path: string, text: string): string[] =>
      reservationSites([...ALL(), { path, text }]).filter((s) => s.startsWith(`${path}:`)).map((s) => s.slice(path.length + 1));
    // The drift at journal.ts:166, renamed: an intent -> line map kept outside the home.
    expect(fixture('src/data/vault/renamed.ts', "import type { JournalRecord } from './journal';\nexport class Journal {\n  private intents = new Map<string, JournalRecord>();\n}\n")).toEqual(['3 keeps intended creates outside the home']);
    // An intent -> id map, filled from a holder's slot.
    expect(fixture('src/data/vault/ids.ts', "import type { Holder } from '../spine/write-once';\nexport class Ids {\n  private readonly idFor = new Map<string, string>();\n  keep(intent: string, h: Holder): void { this.idFor.set(intent, h.reserved ?? ''); }\n}\n")).toEqual(['4 stores an id by hand']);
    // The slot set or cleared by hand, by any spelling, and the call for ids by an alias.
    expect(fixture('src/data/vault/hand.ts', "export function hand(w: { reserved?: string }, id: string, d: { generateIds(n: number): Promise<string[]> }): void {\n  w['reserved'] = id;\n  delete w.reserved;\n  const more = d['generateIds'];\n  void more;\n}\n")).toEqual(['2 sets an id by hand', '3 lets an id go by hand', '4 calls for ids']);
    // Not a reservation: a map of numbers named `intended`, a map made for one call, the slot read.
    expect(fixture('src/data/vault/fine.ts', "import type { JournalRecord } from './journal';\nexport class Fine {\n  private intended = new Map<string, number>();\n  list(all: JournalRecord[], h: { reserved?: string }): number {\n    const byId = new Map<string, JournalRecord>(all.map((r) => [r.id, r]));\n    return byId.size + (h.reserved ? 1 : 0) + this.intended.size;\n  }\n}\n")).toEqual([]);
  });
});

describe('a stamp read back', () => {
  it('a Bin after a restore in Drive is not taken as landed from its stamp alone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const drive = new FakeDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    const f = await drive.createText(root, 'Lease.md', 'Words.');
    const lost = async (): Promise<never> => {
      throw driveError('offline');
    };
    // Binned by Bower, then restored in Drive's own page, which keeps Bower's stamp on it.
    await updateByStamp(drive, f, 'bin', (op) => drive.trash(f.id, op));
    await drive.untrash(f.id);
    // The same Bin sent again from a page that read the note before, with no answer and never landed: not landed.
    await expect(updateByStamp(drive, f, 'bin', lost)).rejects.toMatchObject({ code: 'offline' });
    // And a restore: restored by Bower, binned again in Drive's own page, then a restore that never landed.
    await drive.trash(f.id);
    const restored = await drive.get(f.id, { binned: true });
    await updateByStamp(drive, restored, 'unbin', (op) => drive.untrash(f.id, op));
    await drive.trash(f.id);
    await expect(updateByStamp(drive, restored, 'unbin', lost)).rejects.toMatchObject({ code: 'offline' });
  });
});
