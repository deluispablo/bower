// The unused-code gate's rules (TL-P4-17 entry 4, addendum 6): what a knip report says, and how it compares with the
// baseline. The tool itself runs once, in scripts/check-unused-gate.mjs (pnpm check); its test feeds these a fixture.

/** One line per finding: "<kind> <file> <name>" (a file finding has no name). */
export function findingsOf(report) {
  const found = new Set();
  for (const issue of report.issues ?? []) {
    for (const [kind, list] of Object.entries(issue)) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        // A duplicate is a list of names for one value.
        const name = Array.isArray(item) ? item.map((i) => i.name).join('=') : item?.name;
        found.add([kind, issue.file, name].filter(Boolean).join(' '));
      }
    }
  }
  return found;
}

/** Findings not in the baseline, and baseline lines that are no longer findings (the baseline may only shrink). */
export function compare(found, baseline) {
  return {
    fresh: [...found].filter((f) => !baseline.has(f)).sort(),
    stale: [...baseline].filter((f) => !found.has(f)).sort(),
  };
}
