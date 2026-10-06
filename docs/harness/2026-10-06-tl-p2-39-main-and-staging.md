# Technical-lead decision TL-P2-2026-10-06-39: frequent main integration and a P2 staging preview

**Owner request, 2026-10-06:** code should reach main and GitHub more often, and the app should be deployed, even if only as staging, so the owner can try it and give feedback. This amends BACKUP.md, GOVERNANCE and TL-P2-38.

## 1. Main and GitHub after every green batch

- **When.** The coordinator integrates the integration branch into local `main` after **every green integration batch**, not only at phase close.
- **What counts as green.** The batch's entries are closed with their proofs, and `pnpm check` plus the batch's full `pnpm e2e` and `pnpm e2e:fake` pass on that SHA.
- **Then** the coordinator pushes `main` to the private repository, under BACKUP.md's verification steps.
- **What main means now.** Main is "the latest green, integrated app", not "an accepted phase". Phase acceptance stays a separate, recorded event.
- **Never merged:** candidate branches, work in review, and anything with a red gate.
- **The first batch** is the integration at `38a3dbc` (check 3393, e2e 208, e2e:fake 218, all green). After its eight entries close, it can go to main right away.

## 2. A staging preview of the P2 app

- **Where.** A static Cloudflare Pages deployment of `main`, with its own project and `*.pages.dev` address, separate from the original production. This uses the free plan ([Cloudflare Pages: direct upload with Wrangler](https://developers.cloudflare.com/pages/get-started/direct-upload/)).
- **What it contains.**
  - It is built **without** `VITE_API_URL`, so it runs the demo by default, and `?source=fake` gives the full simulated app with its data kept in that browser.
  - It has no Worker, no Google sign-in, no secrets and no real Drive. The real source is not reachable until P3.
- **Who and when.** The lead deploys it from `main` in the lead's own documentation checkout after each main update, and gives the owner the address. The coordinator's workers are never used for this.
- **What it is not.** It is not P3 staging and not phase acceptance. P3 staging (Worker plus real services) replaces it later, as planned.
- **Feedback.** The owner's feedback from the preview reaches the coordinator through the lead. It is triaged under TL-P2-38: Critical or Important becomes an entry, anything else goes to the P2 polish list.
