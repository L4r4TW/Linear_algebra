# Durable local practice sets (11.1 groundwork)

The standalone server/practice-sets.mjs module is implemented and tested, but is not imported into the player yet. HTTP/UI integration is next after task 10's current verification/deployment checkpoint. It does not change catalog eligibility or the task-10 runtime fingerprint while unused.

It uses Node's built-in SQLite (experimental in the pinned local Node 22 image), an owner-hashed private file, WAL transactions and bounded immutable membership. The intended local filename is under the existing private sessions directory; no new discovery mount or database grants are required. This is a local prototype adapter, not the later Supabase account store.

Four disposable-data test groups pass: retained order/restart and idempotent creation, independent database connections fencing one item start and retaining an acknowledged session after a lost client response, ambiguous renderer failure refusing automatic regeneration, and optimistic navigation/skips/withdrawal retaining history. These are synthetic ownership tests, not Supabase Auth proof.

Creation accepts only topic selectors and an owner-scoped idempotency key. Existing item sessions are reused. Opening claims commit before renderer calls; a crashed/ambiguous call remains opening/uncertain and cannot start another seed silently. Navigation uses revision comparison, records skips without dropping items, and treats position as location rather than correctness. Source identities remain bound and withdrawn/changed exercises fail explicitly. A local per-owner limit is explicit; no historical sets are deleted to make room.

Integrate owner-checked /api/sessions/sets endpoints under the existing cookie path, guarded chooser-to-set start, player Previous/Skip restoration and current-item URL/history. Add the module and any client files to the actual runtime fingerprint and regenerate complete evidence after integration. Keep renderer state in the existing private session store until a separately verified account adapter migrates it.
