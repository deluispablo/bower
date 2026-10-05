# Skills for the Bower harness

Research and selection: 2026-10-05. Optimize useful context and reproducible behavior rather than the number of installed skills. Startup requirements live in `STARTUP.md`; capabilities are checked in each session, not inferred from this document.

## Adopted project skills

| Skill | Load when | Outcome |
| --- | --- | --- |
| `bower-session` | Starting or resuming work in this project | Checkout/ownership/capability report before action |
| `bower-implement` | Assigned implementation or integration of a harness entry | Failed assertion, smallest fix, candidate or honest closure evidence |
| `bower-review` | Independent review of pinned commits | Reproducible findings and explicit reviewed scope |
| `bower-evaluate` | Evaluation of a frozen build with a browser reservation | Phone/desktop, demo/fake findings with SHA and steps |

Definitions are in `.agents/skills/`; Claude discovers relative links in `.claude/skills/`. Each definition routes to the existing method or brief rather than repeating the rulebook. Both tools may choose them implicitly by their narrow descriptions, or explicitly (`$name` in Codex, `/name` in Claude Code). The map requires startup even when automatic selection does not occur. This change creates repository skills; it does not alter global skills, host settings or model preferences.

## Codex capabilities researched

| Skill / capability | Benefit here | Selection and availability |
| --- | --- | --- |
| `openai-docs` | Current guidance for Codex setup, skills, hooks and OpenAI APIs | Available in the Codex catalog used for this research. Load only for those subjects; not every app task. Claude can consult the same official sources without that installed skill. |
| `skill-creator` | Small, well-triggered project skills; frontmatter validation | Available in this session; used to author this set. Load for skill maintenance only. |
| `skill-installer` | Fetch an explicitly selected upstream skill with its supporting files | Available in this session; not needed to install our versioned project skills. Do not install a whole catalog at startup. |
| Upstream `playwright` | Terminal-driven browser exploration and snapshots for an evaluator lacking a browser connector | Optional, researched but not installed by this change. Requires its CLI wrapper and Node/npm prerequisites. It is an exploration workflow, not Bower's Playwright test runner. Use available native automation first. |
| Upstream `security-best-practices` | Focused TypeScript security guidance for a specifically assigned Worker/auth security review | Optional, researched but not installed. Its trigger is an explicit security request; normal review continues using Bower contracts. Plan a separate review during phase 3, not a blanket audit at every startup. |
| Superpowers design/debugging/TDD skills | May aid design discussions and hypothesis-driven debugging when actually installed | Optional existing convention; no dependency on a particular plugin or vendor. The project's test-first/proof rules already apply. Check the live catalog before naming a skill. |
| GitHub PR/CI/publishing skills | Useful only if future work authorizes those services | Exclude from this local-only workflow. No pushes, remotes, PR creation or CI assumptions. |
| Sites, artifact/design-generation skills | Specialized work outside the current Harness task | Do not load for ordinary Bower coding; preserve the existing app and exported landing workflow. |

The optional skills are recommendations, not installed capabilities or permission to run their actions. If the owner later selects one, inspect its current SKILL.md, tools, scripts, license and trigger first; use the installer for its full bundle and record the tested revision and prerequisites. Retain existing project commands and make-up-data rules. Do not silently replace `pnpm e2e`/`pnpm e2e:fake` with another browser workflow. Avoid duplicate global and repository skill names; inspect the catalog for collisions before renaming or disabling anything.

## Why this design

[OpenAI's skill documentation](https://learn.chatgpt.com/docs/build-skills) describes selective loading and `.agents/skills` repository discovery. Our four entry points keep startup focused and role guidance conditional. [Claude Code's skills documentation](https://code.claude.com/docs/en/skills) documents project skills and symlinked directories, letting both agents read one source.

The [OpenAI skills catalog](https://github.com/openai/skills) is the upstream distribution source. We read the [Playwright skill](https://github.com/openai/skills/blob/main/skills/.curated/playwright/SKILL.md) and [security review skill](https://github.com/openai/skills/blob/main/skills/.curated/security-best-practices/SKILL.md) directly. Their scope and prerequisites support optional targeted use, not loading everything at session start. Catalog paths and content may change; recheck before installing.

A skill provides instructions and resources, a tool executes an action, repository gates produce proof, and the assignment establishes ownership. None substitutes for the others. Cross-tool communication and reservations remain explicit and manual.

## Validation and upkeep

Validate new/changed skill frontmatter with the available skill-creator `quick_validate.py`, and check every Claude link resolves to the canonical directory. Verify the links are tracked while local launch/settings files remain ignored. Run `pnpm check` before the documentation commit; executable harness changes still require a real test-first entry.

Exercise startup with representative prompts: resume this project (session only initially), fix an assigned entry (session + implement), review a pinned range (session + review, no init), evaluate a frozen build (session + evaluate, no rebuild), update a spec (session + relevant docs, no browser/security skill). Inspect the loaded skill and role, not merely the response wording. This update validates files and links; native discovery and model routing need fresh live Claude/Codex sessions. Record observed misrouting before changing descriptions.

Measure verified integration time, rework and missing evidence in `ACTIVE.md` for actual batches. Do not call this pairing optimal from source recommendations alone. Keep descriptions narrow, retain automatic discovery and refine after demonstrated failures; do not grow the always-loaded map with copied manuals.

## Planning revision and role boundaries

The four shared skills remain the entry points; no large always-loaded planner skill is needed. bower-session routes the owner-appointed planning/method lead to GOVERNANCE and the technical-lead brief. Implementers, reviewers and evaluators name the adopted plan revision, phase and capability IDs. P2 evaluation checks the entire acceptance matrix, not only registered historical entries. Native discovery and a live Claude/Codex handoff still need actual session evidence; files passing validation alone do not prove orchestration.
