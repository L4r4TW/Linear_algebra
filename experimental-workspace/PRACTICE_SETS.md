# Durable local practice sets (11.1 groundwork)

## Current checkpoint: deployed and verified (10 + 11.4)

The combined shell and durable-set runtime is deployed on localhost:3100 and through the home at localhost:3105. Its measured fingerprint is 20fb8629d71be21f0886a47ae17a5ac21d4a5c0f8c0d2df7622dc6eb259e63ad. Fresh publisher evidence enables only the same six previously approved local exercises.

Validation passes 182 server tests, all 62 existing browser checks, seven home plus five chooser browser checks, actual PG three-item set navigation/restoration, final desktop/mobile shell/bookmark checks and the live six-entry eligibility check. The complete 44-case operator run retains 43 passes and one mobile GraphTool keyboard failure (seed 4321); its command remains nonzero and that fixture stays disabled. Sixteen cases retain declared capability/layout limitations. No unsupported candidate or imported database batch was enabled.

The four failures from the first shell browser run were resolved: mobile actions retain 48px comfortable sizes, keyboard coverage now explicitly visits the bookmark control, and flex children stretch within bounded widths so feedback math scrolls instead of overflowing. PG internal geometry/style rules were not reset.

The final evidence/status files live in compatibility/ and workspace/server/catalog-compatibility-evidence.json. Durable sets live only in the existing private session volume's practice-sets.sqlite (Node 22 built-in SQLite); no data volumes were removed. Home Continue can retain the saved set/item context through the owner's recent pointer. The later task-12 Supabase account adapter is separate work, not an already implemented migration.

Earlier candidate notes below are historical checkpoints, not instructions to keep the now-verified image undeployed.


The standalone server/practice-sets.mjs module is implemented and tested, but is not imported into the player yet. HTTP/UI integration is next after task 10's current verification/deployment checkpoint. It does not change catalog eligibility or the task-10 runtime fingerprint while unused.

It uses Node's built-in SQLite (experimental in the pinned local Node 22 image), an owner-hashed private file, WAL transactions and bounded immutable membership. The intended local filename is under the existing private sessions directory; no new discovery mount or database grants are required. This is a local prototype adapter, not the later Supabase account store.

Four disposable-data test groups pass: retained order/restart and idempotent creation, independent database connections fencing one item start and retaining an acknowledged session after a lost client response, ambiguous renderer failure refusing automatic regeneration, and optimistic navigation/skips/withdrawal retaining history. These are synthetic ownership tests, not Supabase Auth proof.

Creation accepts only topic selectors and an owner-scoped idempotency key. Existing item sessions are reused. Opening claims commit before renderer calls; a crashed/ambiguous call remains opening/uncertain and cannot start another seed silently. Navigation uses revision comparison, records skips without dropping items, and treats position as location rather than correctness. Source identities remain bound and withdrawn/changed exercises fail explicitly. A local per-owner limit is explicit; no historical sets are deleted to make room.

Integrate owner-checked /api/sessions/sets endpoints under the existing cookie path, guarded chooser-to-set start, player Previous/Skip restoration and current-item URL/history. Add the module and any client files to the actual runtime fingerprint and regenerate complete evidence after integration. Keep renderer state in the existing private session store until a separately verified account adapter migrates it.

## 11.2–11.3 integrated candidate

Durable sets now have owner-checked /api/sessions/sets create/get/open/position endpoints under the existing anonymous cookie scope. Creation and item opening are idempotent; navigation uses revisions, fixed source bindings, and explicit unavailable/uncertain states. Seven set foundation/API groups pass (nine including bookmark tests). The chooser starts a server-saved set and records its first session before entering /practice with session/set/item URL state.

The player now shows a real bounded position indicator and Previous/Skip/Next/Choose another controls. Previous and browser history reopen the same saved session; skipped items remain in the order, and the final Next is explicitly labelled Back to first. These positions are not mastery. Existing navigation consent protects unfinished work; a cancelled transition makes no set/session request. Withdrawn targets leave the current frame and work intact.

The real three-exercise private-renderer check passed: cancelled transition, same-session draft restoration, back/forward, skip retention, refresh without a new start, ownership and withdrawal. Two sessions were created and retained during the test, not regenerated on revisits. Its report is compatibility/practice-sets-observations.json.

The first task-10 live browser run found four issues: mobile action dimensions, an expected new bookmark tab stop, and flex-width feedback overflow. The current combined candidate fixes touch sizes and stretches/bounds the panel; its keyboard test explicitly includes the bookmark. A fresh full 44-case gate runs in linear-algebra-practice-sets-gate and the 62-browser suite runs against private linear-algebra-practice-staging. Do not deploy current host source until fresh evidence and those checks finish. The live service is still the earlier task-10 shell image with fingerprint 64c691132e983b71a2e9c2d4c39f0914a93841b62941e2d098ff8efa4343702e, serving the same six entries.

Task 12 environment choice: user explicitly selected a new local Supabase development environment on 2026-11-17. Keep it separate from existing catalog/student/application data. Auth/account work is not implemented yet.
