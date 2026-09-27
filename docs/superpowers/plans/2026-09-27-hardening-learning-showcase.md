# Hardening, security review, showcase and learning: delivery plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development, one subagent per issue, one PR per issue, the lead reviews and squash-merges. Each issue's body is the task card. Nothing in M11 to M14 is dispatched until the owner approves the spec and, for the UI issues, the new design draft is in.

**Spec:** `docs/superpowers/specs/2026-09-27-hardening-learning-showcase-design.md`.

**Goal:** an instance that is safe with strangers and untrusted content, a demo anyone can open, and an agent that knows its owner from the first run.

## Global constraints

Those of `CLAUDE.md` plus: no new runtime dependency without a one-line reason (Playwright is a dev dependency, justified once in its issue); every security change updates `docs/security.md` in the same PR; every operator-visible change updates `docs/runbook.md`; hermetic tests only in CI.

## Milestones and order

| Milestone | Issues | Depends on | Why this order |
| --- | --- | --- | --- |
| M11 · Agent hardening | minimal env, no network tools, protected paths (policy + audit), pre-scan quarantine, report fields + app, red-team corpus, security doc | main | Closes the exfiltration and persistence channels before any stranger's content reaches a run. |
| M12 · Security review | headers/CSP, supply chain in CI, Worker input limits, sessions, content rendering, ZAP baseline, operator hardening, independent review, SECURITY.md | main | What a stranger meets first. Runs in parallel with M11 (different files). |
| M13 · Public showcase | demo API + fixture, demo UI, build and deploy, demo tour, Playwright e2e | M11/M12 not required; the design draft is | The presentation needs it; the e2e harness pays for itself. |
| M14 · Bower learns | rulebook split and update, first-run interview, proposals, corrections, memory hygiene | D.1 first; D.2/D.3 need the design draft and M13's composer reuse is optional | Changes the vault contract; last so the runner's protections are in place first. |

## Sizing

| Issue | Size | Model | Notes |
| --- | --- | --- | --- |
| A.1 minimal env | S | Sonnet | run.sh + smoke stub assertion. |
| A.2 no network tools, pandoc pre-step | M | Opus | run.sh; conversion edge cases. |
| A.3 protected paths: policy + audit | M | Opus | run.sh manifest logic; settings copy. |
| A.5 pre-scan quarantine | M | Sonnet | Pure script with fixtures. |
| A.7 report fields + app | M | Sonnet | Worker validation + UI (design draft). |
| A.6 red-team corpus + procedure | S | Sonnet | Fixtures and docs. |
| B.1 headers/CSP | S | Sonnet | `_headers`, Worker headers, runbook. |
| B.2 supply chain CI | S | Sonnet | Grep-driven. |
| B.3 Worker input limits | M | Opus | Middleware order matters. |
| B.4 sessions | M | Opus | Auth code. |
| B.5 content rendering | M | Opus | Sanitiser review. |
| B.6 ZAP baseline | S | Sonnet | Workflow + allowlist. |
| B.7 operator hardening | S | Sonnet | Runbook. |
| B.8 independent review | L | Opus | Read-only audit, files issues. |
| C.1 demo API + fixture | L | Opus | Contract test shared with the real client. |
| C.2 demo UI | M | Sonnet | Per design draft. |
| C.3 build + deploy | S | Sonnet | Scripts and docs. |
| C.4 demo tour | S | Sonnet | Reuses #149. |
| C.5 Playwright e2e | M | Opus | New dev dependency, CI wiring, screenshots. |
| D.1 rulebook split + update | L | Opus | Vault contract, prompts, app migration. |
| D.2 first-run interview | M | Sonnet | Per design draft. |
| D.3 proposals | M | Opus | Agent format + app approval. |
| D.4 corrections | S | Sonnet | Tell prefill + prompt. |
| D.5 memory hygiene | S | Sonnet | Prompts + lint check. |

## Review focus

1. After A.1, grep the runner's process environment in the smoke test, not the shell's: the stub must print its own `env`.
2. After A.3, a run that changes only allowed files reports `refused: []` and uploads exactly the manifest diff; a run that touches `CLAUDE.md` uploads nothing for it.
3. After B.1, the Picker (#53, optional) still opens: CSP must allow `apis.google.com` only when `VITE_GOOGLE_API_KEY` is set.
4. After B.4, an old cookie after "Sign out everywhere" gets 401, and the app returns to Login without a loop.
5. After C.1, the production bundle size does not move (the demo module is not in it).
6. After D.1, an old vault with user rules in `CLAUDE.md` ends with them in `Rules.md`, byte for byte, and the new rulebook in place.

## Definition of done

- M11 and M12 closed; securityheaders.com A; ZAP baseline clean or allowlisted; the red-team table in `docs/security.md` with a date.
- M13: the demo public, linked from the README, e2e green in CI, screenshots in the README.
- M14: a new account answers the interview and its first run uses the answers; an old vault updated from Settings.
