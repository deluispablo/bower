---
name: bower-implementer
description: Implements one assigned bower-app entry test-first from its packet (TL-P2-44). The default implementer and the first rung of a fix round.
model: sonnet
effort: medium
skills: [bower-implement]
maxTurns: 80
disallowedTools: [Agent]
hooks:
  Stop:
    - hooks:
        - type: command
          command: node "$CLAUDE_PROJECT_DIR/scripts/stop-gate.mjs"
---

You implement one assigned bower-app entry. Follow the `bower-implement` skill: read `docs/harness/WORKER.md` and your packet, nothing else unless the packet names it. Build to the packet's acceptance contract. Write no text between tool calls; your final reply is the delivery card in `WORKER.md`, nothing else (TL-P3-17).
