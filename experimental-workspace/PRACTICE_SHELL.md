# Planned practice shell (task 10)

## Candidate state

The candidate follows Exercise.png around the existing PG frame: neutral rounded panel, topic breadcrumbs, title, bookmark control, more question space and a prominent dark Check answer button. PG-generated fields, scripts, assets, graph geometry, answer collection, hints, grading and draft/recovery logic are preserved. Only the surrounding shell is restyled. The catalog remains available below the practice panel, so existing Choose another focuses a real list without discarding work.

Bookmarks store only exercise IDs in browser-local storage. They do not store seeds, renderer tokens, answers, correctness or account identity. Corrupt/blocked storage produces a visible failure and does not interfere with practicing. Account synchronization is deferred to task 12.

Previous/Skip and an "Exercise N of M" indicator will be exposed only when task 11 supplies a real retained set; no simulated progress or invented navigation is added.

## Evidence and deployment checkpoint

Current host source changes invalidate the old runtime fingerprint deliberately. The original running player image remains unchanged and continues serving its six exercises. Do not rebuild/redeploy it until fresh complete compatibility evidence is generated with compatibility/widget-acceptance.mjs and the existing build-catalog.mjs publisher.

Two bookmark storage tests pass. The default API unit tests currently fail closed against stale host evidence, as expected before regeneration; they are not waived or altered. A full isolated 44-case (two-seed/desktop/mobile) candidate run is in progress in container linear-algebra-practice-shell-gate, using image linear-algebra-practice-candidate-qa, original private renderer and read-only OPL volume. Retain any failures and run the existing publisher only if every member of the existing six-entry active batch passes. Imported database certification/review gates remain unchanged.

If interrupted, inspect that container's status/logs and /artifacts/regression-results.json before restarting tests. The running application/session volumes must not be reset. After proof regeneration, run all server tests, legacy browser checks and focused shell/bookmark checks; only then replace the player image.
