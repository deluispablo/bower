# Hardening, security review, public showcase and a Bower that learns

Design for the four technical tracks the owner asked for on 2026-09-27, after the app redesign (M6 to M9) shipped. Status: **draft for the owner's review**; nothing is dispatched until the owner approves it and the new UI design draft is in (the screens of tracks C and D follow that draft).

## 1. Goal

Make an instance safe to expose to strangers and to feed with untrusted content, let people see what Bower is without an account, and give every new user an agent that already knows how they want their notes kept.

## 2. What is true today

- The runner (`agent/run.sh`) starts `claude -p` **with the Drive access token (`RCLONE_CONFIG_VAULT_TOKEN`), `BOWER_API_KEY` and the model credential in its environment**. The model's tools are `Read, Write, Edit, MultiEdit, Glob, Grep, LS` and `Bash(mv|mkdir|ls|cp|pandoc)`. `pandoc` accepts URLs as input, so a run that follows a malicious instruction could send data to an arbitrary host in a URL; `cp` can copy `/proc/self/environ` into the vault.
- The ingest prompt and the rulebook already say that note contents are data, that instruction notes are only the narrow kind the app writes (#129), and that rules never change on the agent's own initiative. The agent **can** edit `CLAUDE.md` (the Instructions workflow appends permanent rules there), so a successful injection can persist.
- The Worker's security posture is documented in `docs/security.md` (CORS, CSRF, cookies, rate limit on two routes, headers on every response, log hygiene). The app ships **no `_headers` file**: no CSP, no HSTS, no frame-ancestors. CI runs lint, typecheck, tests, build and the personal-data grep; it does not audit dependencies, scan for secrets, or pin actions by SHA.
- A vault starts from `vault-template/`: `CLAUDE.md` (the rulebook, with an `## About the owner` section and a `## Rules` section the agent appends to), `About-Me.md` (profile) and `log.md` (with `Proposal:` entries when a document kind repeats). Existing vaults never receive rulebook updates.
- The app has one build, one deployment, and no way to be seen without an invited Google account.

## 3. Track A: the agent under untrusted content

Threat: text inside a note, a clipping or an uploaded file tells the model to do something else. The model may comply. The defence is not to detect every injection (impossible) but to make compliance harmless: nothing to steal, nowhere to send it, nothing to persist, everything reversible, and the user told what was set aside.

### A.1 Nothing to steal

`run.sh` syncs the vault down with rclone, then runs Claude in a **minimal environment**: only the model credential (`ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`), `HOME`, `PATH` and what Claude Code needs. The Drive token, `BOWER_API_KEY`, `BOWER_API_URL`, the folder ids and every `RCLONE_*` variable are not exported to that process. The upload and the status report happen after Claude exits, in the parent shell.

### A.2 Nowhere to send it

The tool list loses `Bash(pandoc:*)` and `Bash(cp:*)`. Conversion of Office, HTML and EPUB files to Markdown becomes a **pre-step in `run.sh`** (`pandoc --sandbox`, input files only, output next to the original, original moved to `Processed/` after the run). Web tools stay opt-in (`BOWER_ALLOW_WEB=1`) and are documented as the one way a run can reach the network. `curl`/`wget` stay denied.

### A.3 Nothing to persist

Protected paths: `CLAUDE.md`, `.claude/**`, `.obsidian/**`, `README.md`. Two layers:

1. **Permission policy from the instance repo.** `agent/claude-settings.json` is copied over `<vault>/.claude/settings.json` at the start of every run (the vault's own copy, if any, is ignored and never uploaded). It denies `Write`, `Edit` and `MultiEdit` on the protected paths and `Bash` commands whose arguments contain `://`.
2. **Post-run audit in `run.sh`.** The manifest from #122 already knows every file the agent changed. Any change to a protected path is reverted from the pre-run copy; any new or changed file outside the vault's known roots (`0-Inbox`, `1-Projects`, `2-Areas`, `3-Resources`, `4-Archives`, `Answers`, `Clippings`, `Rules.md`, `About-Me.md`, `index.md`, `log.md`) is reverted. Each revert is a `refused` entry in the status report (path only).

User rules move out of `CLAUDE.md` into `Rules.md` (track D, D.1) so that the rulebook can be fully protected; until D.1 lands, `CLAUDE.md` is protected and the Instructions workflow writes permanent rules to `Rules.md`, which the rulebook includes by reference.

### A.4 Everything reversible

Already true (originals to `Processed/`, `log.md`, never delete). The audit adds: a run may not modify more than `BOWER_MAX_CHANGES` files (default 200); above that, the run's changes are reverted entirely and the report says `refused: too many changes`.

### A.5 Set aside, and say so

A **pre-scan** (`agent/scan.sh`, pure, tested with fixtures) runs before Claude over every new file in `0-Inbox/` and `Clippings/`: text files matching injection heuristics (imperatives aimed at an assistant: "ignore (all|any|the) (previous|prior|above) instructions", "you are now", "system prompt", "as an AI", role markers such as `<|im_start|>`, `### Instruction`, `Assistant:`; HTML comments or hidden elements holding imperatives; zero-width or bidi control characters; long base64 blobs) are moved to `0-Inbox/Quarantine/` and listed as `quarantined` in the report. The prompt tells the agent to leave `Quarantine/` alone. The app shows "Bower set aside 2 files that contained instructions; look at them in Drive and move them back if they are fine". False positives cost one manual move; the heuristics stay narrow.

Detection is best-effort; the controls in A.1 to A.4 are what make the outcome harmless.

### A.6 Proving it

Hermetic: smoke tests with a stub `claude` that (a) asserts the secret variables are absent from its environment, (b) writes to a protected path and checks the revert and the `refused` entry, (c) plants an injection fixture and checks the quarantine. Non-hermetic: `agent/test/redteam/` holds ten injection fixtures (exfiltration, rule rewriting, deletion, mass moves, a clipping that impersonates an instruction note) and `docs/security.md` gets a procedure to run them against a throwaway vault with a real model and record the outcome table. The lead runs it once per release.

## 4. Track B: security review before opening the doors

Ordered by what a stranger meets first.

- **B.1 Response headers.** `app/public/_headers`: CSP (`default-src 'self'`; `connect-src` the API origin and `www.googleapis.com`; `img-src 'self' data: blob: lh3.googleusercontent.com`; `script-src 'self' apis.google.com` and `frame-src` for the Picker when enabled; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`), HSTS with preload, `X-Frame-Options: DENY`, `Permissions-Policy` denying camera, microphone, geolocation. The Worker adds HSTS and `frame-ancestors 'none'`. Target: A on securityheaders.com, documented in the runbook.
- **B.2 Supply chain in CI.** `pnpm audit --audit-level=high` as a gate; gitleaks on every PR; Dependabot weekly, grouped; every `uses:` pinned to a commit SHA in `ci.yml` and the instance workflows; `permissions:` least privilege per job.
- **B.3 Worker input.** A body size limit (64 KB) on every JSON route, a generic per-IP rate limit on every cookie route (120/min) in addition to the two strict ones, strict `Content-Type` on writes, bounded strings everywhere (#132 folds in).
- **B.4 Sessions.** New session on every sign-in; absolute lifetime 30 days; a per-user session generation so "Sign out everywhere" (Settings) and account deletion invalidate every cookie; deletion revokes the Google refresh token at Google.
- **B.5 Content rendering.** Review the sanitiser profile (no SVG or MathML, `data:` only where the app needs it), `rel="noopener noreferrer"` on external links, attachments through blob URLs and, for PDFs, a sandboxed frame; transclusion depth and size caps.
- **B.6 Dynamic scan.** A manually dispatched workflow runs the OWASP ZAP baseline against a deployed app and Worker with an allowlist of accepted findings; results summarised in `docs/security.md`.
- **B.7 Operator hardening in the runbook.** Cloudflare zone: DNSSEC, the free managed WAF rules, Bot Fight Mode, a rate-limiting rule on `/auth/*`; GitHub: private instance repo, Actions permissions, secret rotation cadence; Google Cloud: OAuth client restricted to the real origins; rotation procedure for `SESSION_SECRET` (with a grace window), `ADMIN_KEY`, `BOWER_API_KEY`.
- **B.8 Independent review.** A fresh reviewer audits the whole system against the threat model and OWASP ASVS level 1, writes `docs/security-review-<date>.md`, and files an issue per finding. `SECURITY.md` gets private vulnerability reporting (a repository setting the owner enables).

## 5. Track C: a public showcase of the app

Chosen approach: **the same app in a demo build**, not a second app and not a shared demo account.

- `VITE_DEMO=1` selects `app/src/demo/api.ts`, an implementation of the same `api.ts` surface backed by a fixture vault (an invented person, "Alex"; about thirty English notes across PARA; an inbox with three items; one health report; a sent history) that lives only in memory. Production builds never include it (dynamic import behind the flag, checked by the size budget).
- Tidy up plays a scripted run: queued, running with the three inbox items filed one by one, done with the toast; Tell Bower answers with scripted replies for the example chips and one generic reply otherwise; Add accepts files into the fixture inbox; Settings shows the real screens with actions that explain they are disabled in the demo.
- Login becomes **"Run your own Bower"**: what it is, what you need (a Google account, free Cloudflare and GitHub accounts, a Claude subscription or API key, about an hour), the three links (repository, runbook, the "what is Bower" page the owner is writing), and "Explore the demo". The first-run tour (#149) runs in the demo with demo copy and ends on that screen. A persistent banner says the notes are samples.
- Deployed to its own Pages project (`bower-demo`) by `scripts/deploy-demo.sh`; linked from the README. Real instances add `<meta name="robots" content="noindex">`; the demo does not.
- The demo doubles as the hermetic end-to-end fixture: Playwright drives it in CI (no network, no Google, no Claude) through the six main flows and produces the README screenshots (#152).

Screens and copy follow the owner's upcoming UI design draft.

## 6. Track D: a Bower that learns, from the first sign-in

### D.1 Three files, three owners

| File | Owner | Who writes it |
| --- | --- | --- |
| `CLAUDE.md` | Bower (the template) | Only the template; versioned by `bower_rules_version` in its frontmatter; protected by track A. |
| `Rules.md` | The user | The Instructions workflow (permanent rules the user asked for) and accepted proposals (D.3). Read by every run. |
| `About-Me.md` | The user, with the agent's help | The first-run interview (D.2) and Ingest step 7 as today. |

The app compares the vault's `bower_rules_version` with the template's (it knows the template at build time) and offers **"Update Bower's rules"** in Settings: it writes the new `CLAUDE.md` and moves any user additions from the old `## Rules` section into `Rules.md`. This also fixes the manual step existing vaults needed after #129.

### D.2 The first-run interview

Right after "Building your bower", the bird asks four questions in the Tell Bower conversation (#146's composer): what you will keep here, which languages your notes come in, three areas of your life to start with, and how you like titles and tags (an example is shown). The answers are written by the app, through Drive, into `About-Me.md` (profile) and `Rules.md` (title and tag preferences), and the three areas become folder notes under `2-Areas/`. Skippable; replayable from Settings. No run is needed for the agent to know this on its first Tidy up.

### D.3 Proposals the user approves

The agent keeps proposing (as `log.md` does today) but in a structured file, `Answers/Bower - Proposals.md` (one YAML-fronted section per proposal: kind, text, evidence). The app lists open proposals (in Health, or a "Rules" screen per the design draft) with Accept and Dismiss; Accept appends the rule to `Rules.md` through Drive and marks the proposal; the agent never writes `Rules.md` outside the Instructions workflow.

### D.4 Corrections

On a note, "This was misfiled" opens Tell Bower with a prefilled message naming the note and asking for the right folder; the resulting instruction note moves the file and, when the same correction happens twice, the agent files a proposal. The lint run reads recent corrections from `log.md`.

### D.5 Memory hygiene

The rulebook's self-learning section says what may be learned (preferences, recurring document kinds, vocabulary) and what may not (credentials, identifiers, health or financial details found inside notes, anything about third parties). The lint run checks `Rules.md` for contradictions and size (cap 200 lines) and reports.

## 7. Order and dependencies

A and B first, together (B.1, B.2 and A.1 to A.3 are the cheapest and close the biggest holes). Then C (needed for the presentation, and it gives the e2e harness). Then D (D.1 first; D.2 and D.3 need the design draft). Track A's `Rules.md` shim is superseded by D.1.

## 8. Testing

Hermetic in CI: bash tests for `run.sh` and `scan.sh` with fixtures; Worker handler tests for limits, sessions and the new report fields; app unit tests for the demo API contract (the same test file runs against the demo implementation), the version comparison and the proposal parsing; Playwright against the demo. Manual, per release: the red-team corpus with a real model; securityheaders.com and the ZAP baseline against production.

## 9. Open points for the owner

1. Track C copy and screens wait for the UI design draft; so do D.2 and D.3.
2. B.8 can be complemented by an outside human reviewer; the lead cannot arrange that.
3. Whether the demo should be reachable at a subdomain of the owner's domain or only at `*.pages.dev` (a domain choice, not a code one).
