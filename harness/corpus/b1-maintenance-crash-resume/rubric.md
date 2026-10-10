# Maintenance crash and resume

Alex adds the rule "Keep gardening notes in Resources", with no inbox material and no new facts to append.
The existing Rules update is the positive control for a settled no-item instruction run.
The runner persists one deterministic maintenance effect, rebuilds its index and scoped retrieval state,
and keeps their cursor with that state. These internal writes have no report rows (TL-P4-41 Q11).

The contract test drops the reply after a derived write has landed, then redispatches the same run.
It checks the exact manifest bytes and operation id, checkpoint chain, no premature report barrier,
no duplicate log lines, and no second maintenance write on a done redispatch.
The original note remains byte identical. This is scripted recovery evidence, not model quality evidence.
