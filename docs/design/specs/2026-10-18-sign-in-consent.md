# Sign-in consent and another account

Task: `ux-sign-in-context`, 2026-10-18. Authority: `_AgentMethod/specs/design-first-run/plan.md` and its binding `ux-sign-in-context-rulings.md` (R-owns through R-spec).

## Exact copy

- Heading: “Your Drive, tidied by a bowerbird.”
- Lead: “Throw in photos, PDFs, links and notes. Bower names each one and files it in a folder of your own Drive.”
- Google button: “Continue with Google”
- Pending Google button: “Opening Google…”
- Consent: “Google will ask to let Bower see and change your Drive. Bower keeps to its own folder. Only people invited to this Bower can sign in.”
- Links: “See how Bower works”, “Privacy”, “Terms”
- Invitation sentence, unchanged byte for byte: “This Google account isn't invited to Bower yet. Try another account.”
- Invitation alert action: “Use another account”
- Cancellation: “Sign-in was cancelled.”
- Ordinary failure, including a rejected local sign-in: “Bower couldn't sign you in. Try again.”

## Permission and account selection

The actual `GOOGLE_SCOPE` in `api/src/google.ts` remains `openid email profile https://www.googleapis.com/auth/drive`. Its existing rationale is that Bower uses `appProperties` for its marks, and `drive.file` would hide material the person adds through Drive or another client. The consent paragraph distinguishes Google's broad permission from Bower's own folder restriction; it does not claim that Google limits the grant to one folder. The unit test imports the actual scope constant and checks the full Drive scope together with the exact consent paragraph.

Keep the existing Google button, `session.signIn()` and `buildAuthUrl()` account chooser (`select_account`). Both buttons use one local handler and one pending state. While pending, both are disabled; the Google button shows “Opening Google…”. A rejection is still reported with `console.error`, restores both controls, and displays the ordinary failure sentence. Retry clears that local failure and starts exactly one more operation.

The initial not-invited reason survives callback-parameter cleanup and local rejection, so its action remains inside the alert. A local failure takes precedence over the returned sentence; retry may show the original sentence again. Reloading the cleaned address removes both the callback notice and its account-switch action. Cancelled, failed and unknown callback reasons do not offer that action. Preserve the existing return-destination mechanism, including encoded paths, callback failures and consumption after successful sign-in.

## Navigation and regression coverage

“See how Bower works” is a normal anchor to `/landing/`, loading the exported document. Its existing header “Sign in” anchor returns to `/sign-in`. Existing session storage preserves source, scenario and time-scale selection across that document round trip. Privacy and Terms continue to use their existing routes. Remove the self-hosting link only from sign-in; landing GitHub links stay as shipped.

The new unit tests cover exact copy, actual scope, invitation bytes, query cleanup, both activation orders, shared pending state, rejection and retry. Existing `SignIn.test.tsx` regressions stay intact. Replace only the obsolete self-hosting expectation in `e2e/qa5.spec.ts` with landing/legal link assertions.

The new browser tests cover the actual landing document and return on fake and demo, 390×844 and 1440×900, light and dark; distinct callback notices and cleanup; and account-switch return to an encoded destination exactly once. Focused browser runs and the replacement qa5 test are required on both sources, alongside affected tests, lint and typecheck. Full suites remain the coordinator's batch CI gate.

No OAuth scope, permission mechanism, unverified-app warning, motion behavior or landing output changes are part of this task. Real Google consent and account selection are not exercised by these simulated-source tests.
