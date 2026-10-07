# Technical-lead decision TL-P3-2026-10-07-13: the instance repository becomes the new app's

**Owner decision, 2026-10-07:** the existing private instance repository, `deluispablo/bower-home`, runs the new app's GitHub Actions, as it did for the original. It is fully replaced with the new runner. It is the private "personal copy" made from the public repository, which anyone uses to set up their own Bower. This makes owner decision 2 of [P3_DRAFT](../P3_DRAFT.md) concrete for the runner, and amends [TL-P3-12](2026-10-07-tl-p3-12-r3-r4-and-p3-6-close.md) on one point: the repository is no longer production's to protect.

## What follows

- **R3 runs there now** with its probe workflow, as already ruled. The probe file is deleted after R3.
- **The full replacement happens once the new runner exists,** at the `worker-dispatch` and spine entries, not before. Until then there is nothing new to put there. The original's workflows stay so the repository is never left empty or half-new.
- **The new workflows use their own event types.** They never reuse `ingest` or `bower-lint`, and they are named per type in `worker-dispatch`. A dispatch still sent by the original Worker therefore starts nothing, rather than a new runner with an old ticket.
- **The repository's `BOWER_API_URL` points at the Worker that dispatches.** During P3 that is staging, set once at the replacement. The owner sets the Claude credential there with `gh secret set`; no session enters it.
- **Consequence the owner accepts:** from the replacement on, the original app's "Tidy up" stops running until P4 switches people to the new app. Reading and browsing in the original are unaffected.
- **Set-up as a product step.** Creating and updating the personal copy from the public repository is the original's `scripts/new-instance.sh`, adapted. It belongs to `deploy-and-migrations` and `runbook-p3`. The replacement of `bower-home` is that script's first real run.
- **No change to the push rule** beyond what is above. The lead pushes to this repository only for the probe file and the replacement. Workers never push.
