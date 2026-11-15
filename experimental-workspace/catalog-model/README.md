# Identity design inventory and checks

Read [EXERCISE_IDENTITY.md](../EXERCISE_IDENTITY.md) for task 5.2's identity/version contract and future importer acceptance examples.

[identity-bootstrap-plan.json](identity-bootstrap-plan.json) preserves the current eleven experimental IDs as proposed permanent aliases, with present source tuples and renderer paths. Its UUIDs are deliberately null; no migration is applied. The inventory is not an allowlist, rendering environment, source approval or historical-session binding.

From the repository root, with the existing Docker renderer running:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/catalog-model/verify-identity-plan.ps1
```

[verify-identity-plan.ps1](verify-identity-plan.ps1) checks complete catalog coverage, unique aliases, no allocated UUIDs and exact correspondence to current catalog source/resolver metadata. It runs [verify-installed-sources.mjs](verify-installed-sources.mjs) through stdin in the renderer to check Git HEAD and raw-byte SHA-256 for all eleven sources, rejecting symlink components. Only public source metadata is passed to that process. No host source bind mount, session access, PG execution, database write, renderer restart or network request is needed.

Result on 2026-11-15: PASS for all eleven aliases and installed source hashes at OPL revision 0d42812d6d02960c846fc0f89215e0d4f1e761b1. This is an inventory/source check, not execution of a future database/importer. Rename/copy/reappearance/concurrent-import cases in the specification are requirements to implement and test later. Existing application/compatibility test counts are historical and were not rerun for this design-only change.

## Topic hierarchy and source mappings (5.3)

[TOPIC_TAXONOMY.md](../TOPIC_TAXONOMY.md) defines the raw-classification/curated-tree contract. [taxonomy-examples.json](taxonomy-examples.json) contains 30 design nodes across six example subjects, unpublished section assignments for all eleven current catalog IDs, a source-only differential-equations example and nine incomplete/conflicting metadata scenarios. Null UUIDs and fixture keys do not create real nodes or new playable exercises.

From the repository root, with both existing services running:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/catalog-model/verify-taxonomy-examples.ps1
```

The [runner](verify-taxonomy-examples.ps1) reads current eligible IDs from the workspace and runs [source/design checks](verify-taxonomy-examples.mjs) through stdin in the renderer. It checks both vocabulary hashes, all eleven PG hashes, source declarations, tree/assignment constraints and deduplicated counts. The extra source example is read from the pinned Git object; it is not added to the student catalog. No source bind mounts, PG evaluation, private session reads, schema writes, service interruption or network request are needed.

Fresh [observations](taxonomy-design-observations.json): PASS for 30 nodes / 6 subjects / 11 catalog examples / 1 source-only example / 9 classification cases. Six distinct playable exercises have seven subject memberships because dot product is cross-listed. The report contains only public source metadata, design keys and check results. It is a design-tool result, not a browser/compatibility run or deployed schema guarantee. Re-running refreshes the sanitized observation file; review its diff before committing. Next: student-facing metadata design (5.4).
