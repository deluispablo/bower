**Q1c live questions — adversarial review, pass 4 (scoped)**

Verdict: **PASS**  
Range: `67616500..94ce85e5`

No Blocking findings within scope.

- `runner/src/main.ts:254`: both publication entry points catch failures. Simulated 503, network, 401, malformed-response and stale-attempt failures did not stop subsequent reports reaching `done`.
- `runner/src/status.ts:72`: count, length, shape and 64 KiB omissions preserve complete stored questions. Each ordinary trimming case logged one line.
- `api/src/runner.ts:113,177`: strict snapshot validation and the body limit remain enforced.
- `src/data/vault/drive-vault.ts:1534`: the complete Drive copy takes precedence without public snapshot bounds.
- No second publication mechanism or scripted asker bound was added.

Minor / v1 limits:

- `runner/src/status.ts:80,162`: eleven questions whose first ten exactly fill 64 KiB log twice when sequence recovery grows the envelope from one digit to two. Count trimming logs first; recovery trimming logs again. The run completes and all eleven stored questions remain intact.

Validation: source inspection and in-memory probes with simulated responses. No network or file edits; full test suites were not run.
