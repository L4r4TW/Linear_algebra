# Identity design inventory and checks

Read [EXERCISE_IDENTITY.md](../EXERCISE_IDENTITY.md) for task 5.2's identity/version contract and future importer acceptance examples.

[identity-bootstrap-plan.json](identity-bootstrap-plan.json) preserves the current eleven experimental IDs as proposed permanent aliases, with present source tuples and renderer paths. Its UUIDs are deliberately null; no migration is applied. The inventory is not an allowlist, rendering environment, source approval or historical-session binding.

From the repository root, with the existing Docker renderer running:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./experimental-workspace/catalog-model/verify-identity-plan.ps1
```

[verify-identity-plan.ps1](verify-identity-plan.ps1) checks complete catalog coverage, unique aliases, no allocated UUIDs and exact correspondence to current catalog source/resolver metadata. It runs [verify-installed-sources.mjs](verify-installed-sources.mjs) through stdin in the renderer to check Git HEAD and raw-byte SHA-256 for all eleven sources, rejecting symlink components. Only public source metadata is passed to that process. No host source bind mount, session access, PG execution, database write, renderer restart or network request is needed.

Result on 2026-11-15: PASS for all eleven aliases and installed source hashes at OPL revision 0d42812d6d02960c846fc0f89215e0d4f1e761b1. This is an inventory/source check, not execution of a future database/importer. Rename/copy/reappearance/concurrent-import cases in the specification are requirements to implement and test later. Existing application/compatibility test counts are historical and were not rerun for this design-only change.
