# Active coordination batch

Only the named coordinator writes this file. Read the current copy in the integration checkout, not a worker's stale snapshot. See `COORDINATION.md` for the protocol. This record is not an automated lock.

## Batch

- State: no implementation batch assigned.
- Coordinator/session: unassigned.
- Integration checkout: to be recorded at assignment.
- Integration branch and base SHA: to be recorded at assignment.
- Existing dirty work: inspect Git status and establish its owner before assignment.
- Browser reservation (checkout, SHA, ports, session): none assigned by this record; inspect existing processes before starting.

Do not infer that an unassigned record means existing sessions or servers are idle. The owner or current session must establish the coordinator before implementation starts.

## Assignments

| Entry or scope | Tool/session | Role | Checkout / branch | Base / target SHA | Reserved files / contracts | State | Candidate / closure SHA |
| --- | --- | --- | --- | --- | --- | --- | --- |

States: assigned, implementing, ready for review, changes requested, ready for integration, integrated (entry still open), closed, blocked, stopped. Record exact failures and the next action below; never release an assignment by timeout alone.

## Evidence and next actions

No coordinated implementation has been started by this methodology update. Add packets, result references and measured delivery/rework time here when the first batch is assigned.
