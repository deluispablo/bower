/**
 * Who may import whom, beyond the rules in .dependency-cruiser.cjs (TL-P4-15, c1-dependency-rules).
 *
 * KNOWN: imports that break "production code imports no fake or demo module" today. Each names the
 * entry that removes it; the list may only shrink (a test fails when a line is no longer needed).
 * ROOTS: files that wire the app together and so choose between the real and the pretend source.
 */
module.exports = {
  KNOWN: [
  ],
  ROOTS: [
    { from: 'src/main.tsx', why: 'starts the app and reads the scenario' },
    { from: 'src/clean-start.ts', why: 'runs before any store reads the device' },
    { from: 'src/data/choose.ts', why: 'picks the source once, from ?source=' },
    { from: 'src/app/App.tsx', why: 'mounts the demo panel, shown only on demo and fake' },
    { from: 'runner/src/provider.ts', why: 'picks the scripted provider (the demo fixture) or the Claude provider, from BOWER_PROVIDER' },
  ],
  /** The demo panel and the scenario may be imported by the shell (the old screens rule). */
  SHELL_MAY_IMPORT: ['src/data/demo/DemoPanel.tsx', 'src/data/demo/scenario.ts', 'src/data/demo/world.ts', 'src/data/choose.ts'],
};
