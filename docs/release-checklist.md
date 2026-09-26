# Pre-publication checklist

Run once, by the operator turning the repository from private to public. The `sanitize` CI job covers the tracked-file half of this on every PR; this list also covers history and the GitHub-side settings a CI job cannot check.

- [ ] `pnpm check:sanitized` exits 0 (same check the `sanitize` CI job runs).
- [ ] History scan: `git log -p | grep -iE '@gmail|@googlemail|AIza|ya29\.|github_pat_|sk-ant-'` finds nothing. A hit here means squashing or rewriting history before anything is public — the gate only checks the current tree.
- [ ] License headers, if the project uses them, are present on source files; `LICENSE` exists at the repo root and names the intended license.
- [ ] `README.md` reads correctly for a stranger: setup steps work, no stale links, no leftover TODOs.
- [ ] The "Template repository" flag (Settings → General) is set the way the operator wants: on for a repo meant to be used as a starting point, off otherwise.
- [ ] Repository topics are set (Settings → General → Topics).
- [ ] Repository description is set (Settings → General → Description).
- [ ] A social preview image is uploaded (Settings → General → Social preview).

Once every box is ticked and the lead has signed off, flip the repository to public (Settings → General → Danger Zone → Change visibility).
