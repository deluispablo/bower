# Privacy

This page explains what this Bower instance does with your information. It is written for the person using the app, not for developers.

## Who runs this

Bower is open source software. There is no company behind it. This particular instance is run by an operator — a person who deployed their own copy for a small group of people they invited, such as their household. The operator controls the server that runs it and, as explained below, is able to read what it stores.

## What this instance stores

When you sign in and use the app, it keeps, in its own database:

- Your email address, so it knows who you are.
- An encrypted copy of the Google refresh token your sign-in produced, so it can act on your behalf with Google Drive without asking you to sign in every time.
- The id of the Google Drive folder that holds your notes.
- The status of your most recent run (queued, running, done or failed) and a short summary of it, such as how many files were processed.
- If you turn on notifications, the push subscription your browser created, so it can tell your device when a run finishes.

## What this instance never stores

Your notes and files are never copied into this instance's own storage. They live only in your own Google Drive, in the folder you signed in with. This instance keeps a pointer to that folder, not its contents.

## What leaves where

- When you press Process, a temporary job reads the files waiting in your Bower folder in your Google Drive and sends their text to Anthropic's API (the company that makes Claude) so it can organise them for you. Nothing else leaves your Drive, and nothing is sent anywhere else.
- Everything else — signing in, browsing your notes, adding files — happens directly between your browser and your own Google Drive, or between your browser and this instance's server for the parts described above.

## Google API Services User Data Policy

This app's use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## How to delete everything

You have two ways to remove this instance's access to your information, and they do different things:

- **Settings → Delete account, in the app.** This deletes everything this instance stores about you (your email, your encrypted refresh token, your folder id, your run history, your push subscription) and, where possible, tells Google to revoke this app's access to your account. Your notes and your Bower folder are not touched — they stay in your Google Drive exactly as they are.
- **Revoke access at [myaccount.google.com](https://myaccount.google.com)**, under Security → Third-party apps with account access. This immediately stops the app from reaching your Google Drive at all. It does not, by itself, delete what this instance already stored about you — use Delete account for that too.

Doing both removes every trace of you from this instance and cuts off its access to your Google account. Your notes remain in your Drive either way; you keep them.

## How to contact the operator

If you have a question about your data or this instance, ask the person who invited you.
