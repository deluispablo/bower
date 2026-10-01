// Stand-in for jq, covering only the filters run.sh uses (each matched by
// its exact text or its start below). The tests (smoke.sh, stats.test.sh)
// and the benchmark (agent/bench/run-bench.sh) put it on PATH as `jq` when
// the real jq is not installed. It runs as a CommonJS script (node -e).
/* global require, process */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
const args = process.argv.slice(1);
const named = {};
const flags = new Set();
const rest = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--arg') {
    named[args[i + 1]] = args[i + 2];
    i += 2;
  } else if (a === '--argjson') {
    named[args[i + 1]] = JSON.parse(args[i + 2]);
    i += 2;
  } else if (/^-[a-zA-Z]+$/.test(a)) {
    for (const f of a.slice(1)) flags.add(f);
  } else rest.push(a);
}
const [filter, file] = rest;
const input = () => fs.readFileSync(file ?? 0, 'utf8');
// The JSON objects of a stream-json transcript, one per line; a line that is
// not JSON is skipped, like `fromjson?`.
const streamEvents = (text) => {
  const out = [];
  for (const line of text.split('\n')) {
    try {
      const e = JSON.parse(line);
      if (e !== null && typeof e === 'object' && !Array.isArray(e)) out.push(e);
    } catch {
      // not JSON
    }
  }
  return out;
};
if (filter === '$ARGS.named') {
  process.stdout.write(JSON.stringify(named) + '\n');
} else if (filter === '[inputs]' && flags.has('R')) {
  const lines = input().split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  process.stdout.write(JSON.stringify(lines) + '\n');
} else if (filter === '.files[].name' && flags.has('r')) {
  const files = JSON.parse(input()).files;
  if (!Array.isArray(files)) {
    process.stderr.write('jq stand-in: cannot iterate\n');
    process.exit(5);
  }
  for (const f of files) process.stdout.write(String(f.name) + '\n');
} else if (filter.startsWith('.[] | select((.IsDir | not)') && flags.has('r')) {
  // run.sh's LISTING_FILTER (#597).
  for (const o of JSON.parse(input())) {
    if (o.IsDir || typeof o.ID !== 'string' || /[\t\n]/.test(o.ID + o.Path))
      continue;
    process.stdout.write(o.ID + '\t' + o.Path + '\n');
  }
} else if (
  filter.startsWith('to_entries[] | select((.value | type) == "string"') &&
  flags.has('r')
) {
  // run.sh's PATHS_READ_FILTER (#597).
  const m = JSON.parse(input());
  if (m === null || typeof m !== 'object' || Array.isArray(m)) {
    process.stderr.write('jq stand-in: not an object\n');
    process.exit(5);
  }
  for (const [k, v] of Object.entries(m)) {
    if (typeof v === 'string' && !/[\t\n]/.test(k + v))
      process.stdout.write(k + '\t' + v + '\n');
  }
} else if (filter.startsWith('[inputs | split(') && flags.has('R')) {
  // run.sh's PATHS_WRITE_FILTER (#597).
  const lines = input().split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const m = {};
  for (const l of lines) {
    const parts = l.split('\t');
    m[parts[0]] = parts[1];
  }
  process.stdout.write(JSON.stringify(m) + '\n');
} else if (
  filter.startsWith('to_entries[] | select((.value | type) == "object"') &&
  flags.has('r')
) {
  // run.sh's FACTS_KEYS_FILTER (#610).
  const m = JSON.parse(input());
  if (m === null || typeof m !== 'object' || Array.isArray(m)) {
    process.stderr.write('jq stand-in: not an object\n');
    process.exit(5);
  }
  for (const [k, v] of Object.entries(m)) {
    if (
      v !== null &&
      typeof v === 'object' &&
      typeof v.k === 'string' &&
      !/[\t\n]/.test(k + v.k)
    ) {
      process.stdout.write(k + '\t' + v.k + '\n');
    }
  }
} else if (filter.startsWith('$prev as $p | [inputs') && flags.has('R')) {
  // run.sh's FACTS_WRITE_FILTER (#610).
  const lines = fs.readFileSync(0, 'utf8').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const m = {};
  for (const l of lines) {
    const [path, key, kind, n] = l.split('\t');
    m[path] =
      kind === 'keep' ? named.prev[path] : { k: key, [kind]: Number(n) };
  }
  process.stdout.write(JSON.stringify(m, null, 2) + '\n');
} else if (
  filter.startsWith('if type == "object" and .state == "failed"') &&
  flags.has('r')
) {
  // run.sh's ALREADY_WRITTEN_FILTER (R-AG-10).
  const r = JSON.parse(input());
  if (
    r !== null &&
    typeof r === 'object' &&
    r.state === 'failed' &&
    Array.isArray(r.created)
  ) {
    for (const c of r.created) {
      if (typeof c === 'string' && c.length > 0)
        process.stdout.write(c.replace(/[\r\n]/g, ' ') + '\n');
    }
  }
} else if (filter.startsWith('def n($v)')) {
  // run.sh's REPORT_FILTER (R-RUNNER-1): the named arguments, created,
  // updated and left cut to $list each, then left, updated and created cut
  // until everything fits in $max.
  const { list, max, ...r } = named;
  const n = (v) => (Array.isArray(v) ? Math.min(v.length, list) : 0);
  for (const k of ['created', 'updated', 'left'])
    if (k in r) r[k] = r[k].slice(0, list);
  for (const k of ['left', 'updated', 'created']) {
    if (!(k in r)) continue;
    const over =
      n(r.processed) +
      n(r.items) +
      n(r.setAside) +
      n(r.created) +
      n(r.updated) +
      n(r.left) -
      max;
    if (over > 0) r[k] = r[k].slice(0, Math.max(r[k].length - over, 0));
  }
  process.stdout.write(JSON.stringify(r) + '\n');
} else if (filter.startsWith('[inputs | . as $line') && flags.has('R')) {
  // run.sh's UPDATED_FILTER (R-RUNNER-1).
  const lines = input().split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  process.stdout.write(
    JSON.stringify(
      lines.map((l) => {
        const [path, ...what] = l.split('\t');
        return what.length > 0
          ? { path, what: [...what.join('\t')].slice(0, named.cut).join('') }
          : { path };
      }),
    ) + '\n',
  );
} else if (filter.startsWith('[inputs | sub(') && flags.has('R')) {
  // run.sh's DISAGREE_FILTER and NEXT_FILTER (R-MEAN-1).
  const next = filter.includes('{action: .[1]}');
  const lines = input().split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const out = [];
  for (const l of lines) {
    const f = l
      .replace(/\r$/, '')
      .split('\t')
      .map((x) => x.trim());
    if (f.length !== (next ? 2 : 3) || f.some((x) => x.length === 0)) continue;
    if ([...f[f.length - 1]].length > named.cut) continue;
    if (next)
      out.push(f[0] === '-' ? { action: f[1] } : { path: f[0], action: f[1] });
    else out.push({ a: f[0], b: f[1], reason: f[2] });
  }
  process.stdout.write(JSON.stringify(out.slice(0, named.max)) + '\n');
} else if (filter === '.[$k] // empty' && flags.has('r')) {
  const v = JSON.parse(input())[named.k];
  if (v !== undefined && v !== null && v !== false) {
    process.stdout.write(
      (typeof v === 'string' ? v : JSON.stringify(v)) + '\n',
    );
  }
} else if (
  filter.startsWith(
    '[inputs | fromjson? | select(type == "object" and .type == "result")]',
  ) &&
  filter.endsWith('.result? | strings') &&
  flags.has('R')
) {
  // run.sh's RESULT_TEXT_FILTER (R-SS-2): the last result event's text.
  const results = streamEvents(input()).filter((e) => e.type === 'result');
  const last = results[results.length - 1];
  if (last !== undefined && typeof last.result === 'string')
    process.stdout.write(last.result + '\n');
} else if (
  filter.startsWith('def n($x): if ($x | type) == "number"') &&
  flags.has('R')
) {
  // run.sh's STATS_FILTER (R-SS-2): the session's numbers and tool counts.
  const events = streamEvents(input());
  const results = events.filter((e) => e.type === 'result');
  const r = results[results.length - 1] ?? {};
  const u =
    r.usage !== null && typeof r.usage === 'object' && !Array.isArray(r.usage)
      ? r.usage
      : {};
  const n = (x) => (typeof x === 'number' ? String(Math.floor(x)) : '-');
  const blocks = [];
  for (const e of events) {
    if (e.type !== 'assistant') continue;
    const m = e.message;
    if (
      m === null ||
      typeof m !== 'object' ||
      Array.isArray(m) ||
      !Array.isArray(m.content)
    )
      continue;
    for (const b of m.content) {
      if (b !== null && typeof b === 'object' && b.type === 'tool_use')
        blocks.push(b);
    }
  }
  const seen = new Set();
  const counts = new Map();
  for (const b of blocks) {
    if (typeof b.id === 'string') {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
    }
    const name =
      typeof b.name === 'string' && /^[A-Za-z0-9_-]+$/.test(b.name)
        ? b.name
        : 'other';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const names = [...counts.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const tools = names.map((k) => `${k}:${counts.get(k)}`).join(',') || '-';
  process.stdout.write(
    `turns=${n(r.num_turns)} api_ms=${n(r.duration_api_ms)} in=${n(u.input_tokens)} out=${n(u.output_tokens)} cache_read=${n(u.cache_read_input_tokens)} cache_write=${n(u.cache_creation_input_tokens)} tools=${tools}\n`,
  );
} else if (filter.includes('"error_max_turns"') && flags.has('R')) {
  // run.sh's RESULT_ERROR_FILTER (R-SS-2): how the session says it failed.
  const results = streamEvents(input()).filter((e) => e.type === 'result');
  const r = results[results.length - 1];
  if (r !== undefined) {
    if (r.subtype === 'error_max_turns') process.stdout.write('max_turns\n');
    else if (r.is_error === true) {
      process.stdout.write(
        `error\n${typeof r.result === 'string' ? r.result : ''}\n`,
      );
    }
  }
} else {
  process.stderr.write('jq stand-in: unsupported filter\n');
  process.exit(3);
}
