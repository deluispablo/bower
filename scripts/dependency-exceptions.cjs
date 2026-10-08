/**
 * Who may import whom, beyond the rules in .dependency-cruiser.cjs (TL-P4-15, c1-dependency-rules).
 *
 * KNOWN: imports that break "production code imports no fake or demo module" today. Each names the
 * entry that removes it; the list may only shrink (a test fails when a line is no longer needed).
 * ROOTS: files that wire the app together and so choose between the real and the pretend source.
 */
const FAKE_DRIVE = 'src/data/drive/fake-drive.ts';
module.exports = {
  KNOWN: [
    // FencedDrive and StoredEvidence move into drive-api.ts.
    ...['src/data/spine/records.ts', 'src/data/spine/barrier.ts', 'src/data/spine/read.ts', 'runner/src/effects.ts', 'runner/src/drive.ts', 'runner/src/still-as-seen.ts', 'runner/src/spine/barrier.ts', 'runner/src/spine/retention.ts', 'runner/src/spine/run.ts'].map((from) => ({
      from,
      to: [FAKE_DRIVE],
      entry: 'c2-drive-transport',
    })),
    // The fake run service becomes only a Drive adapter; the shared engine owns these records.
    { from: 'runner/src/effects.ts', to: ['src/data/fake/fake-run-records.ts'], entry: 'c2-one-engine' },
    { from: 'src/data/spine/scripted.ts', to: ['src/data/fake/fake-run-records.ts'], entry: 'c2-one-engine' },
    // The live path imports no demo fixture.
    { from: 'src/data/spine/scripted.ts', to: ['src/data/demo/fixture.ts'], entry: 'c3-planner-split' },
  ],
  ROOTS: [
    { from: 'src/main.tsx', why: 'starts the app and reads the scenario' },
    { from: 'src/clean-start.ts', why: 'runs before any store reads the device' },
    { from: 'src/data/choose.ts', why: 'picks the source once, from ?source=' },
    { from: 'src/app/App.tsx', why: 'mounts the demo panel, shown only on demo and fake' },
  ],
  /** The demo panel and the scenario may be imported by the shell (the old screens rule). */
  SHELL_MAY_IMPORT: ['src/data/demo/DemoPanel.tsx', 'src/data/demo/scenario.ts', 'src/data/demo/world.ts', 'src/data/choose.ts'],
};
