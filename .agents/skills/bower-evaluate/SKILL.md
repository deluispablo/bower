---
name: bower-evaluate
description: Evaluate a frozen bower-app build on phone and desktop, demo and fake, reading only the worker card and the packet.
---

# Evaluate a frozen build

Read `docs/harness/WORKER.md` and the packet. Use the frozen target and the browser reservation it names; do not rebuild. Use a fresh origin (new port or cleared site data) and check the served bundle name against the build before reading any result: a cached service worker serves old builds (TL-P3-01). Walk the packet's journeys on phone and desktop, demo and fake; report Critical and Important findings with steps and SHA, Minor findings in one line each. Up to 25 lines.
