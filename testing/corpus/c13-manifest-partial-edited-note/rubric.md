Unsupported today: the owner dropped Undo of a whole tidy-up on 2026-10-16, so this case is not run; it records the requirement. The person asks Bower to correct a tidy-up or changes it themselves, and an undo request with no answer waits.
If Undo of a tidy-up returns, the lifecycle is:
1. Forward execution. A tidy-up files `Seed_collection_final(2).txt` from the inbox as `Resources/Gardening/Seed collection.txt` and creates the note `Seed collection.md` beside it.
2. Captured manifest. The forward run's own manifest and checkpoint are kept, with the source's id and the note's created id.
3. Person edit. Alex then adds the My plans paragraph to the generated note. The starting folder is the result of the run and that edit, not proof that either happened.
4. Inverse operation. "Undo the last tidy-up" restores the source by its id to the inbox under its original name, with exactly its original bytes. The generated note stays byte identical, including Alex's paragraph, and is not binned. The report visibly says the note could not be taken back, with its identity and a short reason; a setAside count alone is not enough. An inbox return by undo needs no filing question (TL-P4-08 point 1 exception). Every inverse write is fenced like any other write.
5. Preservation. Rules.md and unrelated files stay unchanged.
6. Replay. Replaying the undo changes nothing more and reports no second recovery.
