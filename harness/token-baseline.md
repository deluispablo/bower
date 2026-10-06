# Token baseline and targets

Tracks agent token use per entry before and after the TL-P2-41/42 method changes. Source of the baseline: `harness/tokens.csv`.

## 1. Baseline (2026-10-06, all runs Opus 5.5)

Implementer = last "cumulative session total" (not the sum of attempts). Review = all reviewer runs.

| Entry | Implementer | Review | Total | Review share |
|---|---:|---:|---:|---:|
| o5-final | 549,761 | 339,085 (2 runs) | 888,846 | 38.1% |
| journeys-a | 289,752 | 161,053 | 450,805 | 35.7% |
| journeys-b | 389,505 | 178,596 | 568,101 | 31.4% |
| Mean per entry | 409,673 | 226,245 | 635,917 | 35.6% |
| capability-audit (analyst) | | | 164,345 | |
| All logged | | | 2,072,097 | |

Gaps: lead and coordinator sessions not logged; no input/cache/output split; it is unclear whether "tokens" is billed total or final context size.

Approximate cost uses an assumed mix of 90% cache read, 6% 5-min cache write, 3% output and 1% uncached input. At list prices that gives about $1.12 per MTok on Opus 5.5, $0.65 on Sonnet 5.5 and $0.33 on Haiku 4.5. The baseline is then about $0.71 per entry and $2.32 for everything logged. These figures are estimates, valid to within roughly 0.5x–1.5x.

## 2. Targets per entry and per role

| Role | Baseline | Conservative | Optimistic |
|---|---:|---:|---:|
| Implementer | 409,673 Opus | 390,900 Sonnet | 214,500 Sonnet |
| Review | 226,245 Opus | 135,000 Opus | 40,000 Sonnet/Codex |
| Total tokens | 635,917 | 525,900 (-17%) | 254,500 (-60%) |
| Approx. USD | 0.71 | 0.41 (-43%) | 0.17 (-77%) |
| Review share | 35.6% | 25.7% | 15.7% |
| Lead / coordinator | not logged | baseline first | baseline first |

Assumptions per lever, applied multiplicatively to implementer volume. Conservative figure first, optimistic second.

- One-page packet with an acceptance contract and exact files: -10% / -23%.
- Output-filter hook plus guidance against re-reading files and re-running tests: -7% / -20%.
- Minimal startup, and a fresh session for each fix round instead of resuming with a cold cache: -5% / -15%.
- Sonnet instead of Opus: Sonnet uses +20% more tokens (conservative) or the same number (optimistic), priced at $0.65 instead of $1.12 per MTok.
- Single review on the diff plus contract only. Conservative: one 120k Opus review plus 0.25 delta reviews of 60k each. Optimistic: review on about half the entries, 80k on Sonnet or Codex.

Codex implementers move cost to Codex credits, so log those separately.

## 3. How to compare

Add these columns to `tokens.csv`:

```
entry,role,tool,model,effort,attempt,input,cache_write,cache_read,output,cost_usd,turns,minutes,outcome,date
```

Sources for the columns:

- **Claude workers:** run them with `claude -p --output-format json` and read the `usage` fields, or enable OpenTelemetry (`CLAUDE_CODE_ENABLE_TELEMETRY=1`, `OTEL_RESOURCE_ATTRIBUTES=entry=<id>,role=<role>`) and use `claude_code.token.usage` and `claude_code.cost.usage`.
- **Codex workers:** run `codex exec --json` and sum `turn.completed.usage` (input, cached_input, output, reasoning_output).
- **Lead and coordinator:** log one row per batch for each, from `/usage` at the batch boundary or from OTel with `query_source=main`.

Rules for measuring:

- Measure at least 3 entries per period. Runs of the same task vary by about 2x, so compare medians, not single runs.
- Compare entries of a similar kind: ordinary entry vs contract or data-safety entry.

Metrics:

- Tokens and USD per merged entry, split by role.
- Review share of the total.
- Entries spawned by review (the loop indicator).
- First-pass success: verify green and review clean on the first attempt.
- Escalations per entry.
- Lead and coordinator tokens per batch.

## 4. Measurements after the change

| Period | Entries (n) | Model mix | Median tokens/entry | Median USD/entry | Review share | Review-spawned entries | First-pass success | Lead+coord/batch |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

## 5. Refinement log

One dated line per change to targets or assumptions, with the reason.

- 2026-10-06: baseline and targets created from 3 Opus entries. Projections are estimates; replace the assumed cost mix with the measured split once the new columns exist.
