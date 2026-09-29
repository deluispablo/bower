# Privacy

This page explains what this Bower instance does with your information. It is written for the person using the app, not for developers.

## Who runs this

Bower is open source software. There is no company behind it. This particular instance is run by an operator — a person who deployed their own copy for a small group of people they invited, such as their household. The operator controls the server that runs it and, as explained below, is able to read what it stores.

## What this instance stores

When you sign in and use the app, it keeps, in its own database:

- Your email address, so it knows who you are.
- Your first name, from your Google profile, so it can greet you by name.
- An encrypted copy of the Google refresh token your sign-in produced, so it can act on your behalf with Google Drive without asking you to sign in every time.
- The id of the Google Drive folder that holds your notes.
- The status of your most recent run (queued, running, done or failed) and a short summary of it, such as how many files it tidied up.
- If you turn on notifications, the push subscription your browser created, so it can tell your device when a run finishes.
- When you finished or skipped the first-run tour (a date and time), so the tour is shown once per account and not again when you sign in on another device.

## What this instance never stores

Your notes and files are never copied into this instance's own storage. They live only in your own Google Drive, in the folder you signed in with. This instance keeps a pointer to that folder, not its contents. When you copy in files from elsewhere in your Drive, they land in that same folder and the originals elsewhere in your Drive are never changed.

If you sign in with an address that is not on the invite list, nothing is stored about you. Your browser keeps a small cookie for at most five minutes, holding that address encrypted, only so the app can show you which account was turned away; it is deleted as soon as that screen reads it.

The first-run questions the bird asks (what you will keep here, your notes' languages, a few areas to start with, how you like titles and tags) go straight into your own Bower folder in your Drive — `About-Me.md`, `Rules.md` and a folder note per area — the same as anything else you tell the app. This instance's own database never sees your answers; you can change them any time from **Settings → Advanced → "Tell Bower about yourself again"**, or by editing those files directly.

Bower keeps learning after that first conversation, the same way: it can notice your preferences, which kinds of document keep coming up, and words or names you use often, and write those into `About-Me.md` or `Rules.md` in your own Bower folder — never into this instance's own database. It only ever writes things you would say about yourself; it never copies in a password or other credential, an account or document number, a health or financial detail, or anything about someone else, even when a note it reads holds one. The weekly health check looks over `Rules.md` for you and flags anything like that it finds, so you can fix it.

## What leaves where

- When you tap Tidy up, a temporary job reads the files waiting in your Bower folder in your Google Drive and sends their text to Anthropic's API (the company that makes Claude) so it can organise them for you. Nothing else leaves your Drive, and nothing is sent anywhere else.
- That job has no web access by default: it cannot look things up or open links, so text inside a clipped page or a forwarded file cannot make it send your notes anywhere. Web lookups need two yeses: the operator allows them for this instance, and you turn on **Let Bower look things up on the web** in Settings (off until you do; your choice is kept with your account and sent with each tidy-up). Only then may it search the web or open a page to fill in what a document leaves out: the search engine and the sites it visits see those requests, which are text Bower writes from what it is reading. Turn the switch off and the next tidy-up has no web access again. The weekly health check never looks anything up.
- If you dictate with the microphone button, your browser turns your voice into text. Bower never receives the audio. Your browser's speech service does: in Chrome that is Google's, and other browsers use their own. You can pick the language it listens for in Settings.
- Everything else — signing in, browsing your notes, adding files — happens directly between your browser and your own Google Drive, or between your browser and this instance's server for the parts described above.

## Google API Services User Data Policy

This app's use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## Signing out

Signing in keeps you signed in on that device for at most 30 days; then you sign in again. **Settings → Sign out** signs out this device. **Settings → Sign out everywhere** signs you out on every device where you are signed in to Bower, this one included, for example after using a shared computer or losing a phone. Neither changes your notes or your Bower folder.

## How to delete everything

You have two ways to remove this instance's access to your information, and they do different things:

- **Settings → Delete account, in the app.** This deletes everything this instance stores about you (your email, your first name, your encrypted refresh token, your folder id, your run history, your push subscription, when you saw the tour) and, where possible, tells Google to revoke this app's access to your account. It also signs you out on every device. All that remains is a marker holding the account's random id, with nothing about you, so the deleted account can never be used again; signing in later starts a new one. Your notes and your Bower folder are not touched — they stay in your Google Drive exactly as they are.
- **Revoke access at [myaccount.google.com](https://myaccount.google.com)**, under Security → Third-party apps with account access. This immediately stops the app from reaching your Google Drive at all. It does not, by itself, delete what this instance already stored about you — use Delete account for that too.

Doing both removes every trace of you from this instance and cuts off its access to your Google account. Your notes remain in your Drive either way; you keep them.

## How to contact the operator

If you have a question about your data or this instance, ask the person who invited you.

See also the [Terms of Service](/terms).
