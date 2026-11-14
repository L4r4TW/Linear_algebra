# Experimental workspace conventions

Session handoff and next steps: [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md). Repository-wide guidance: [AGENTS.md](../AGENTS.md).

- Keep experiments inside this directory, separate from the existing Next.js application.
- Run Compose commands from this directory or pass its compose.yaml explicitly.
- The renderer is the official pinned upstream source with its PG submodule, built using Docker's Git context. Do not clone its source or OPL onto Google Drive.
- Mount the external linear-algebra-experimental_opl volume's webwork-open-problem-library subdirectory read-only into the renderer.
- Keep renderer/editor ports on localhost. This development configuration allows raw PG execution and is not for public deployment.
- The starter uses Node.js and a pinned parse5 HTML parser, installed from the sandbox package lockfile. RENDERER_URL points to the renderer on the Docker network; the main app and Supabase are not integrated.
- Starter source is copied into its image because Google Drive bind mounts appeared empty. Edit host source and rebuild.
- Do not mount the repository root, Docker socket, or application secrets.
- Validate Compose changes with docker compose config and docker compose up --build -d --wait. Run powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./smoke-renderer.ps1 for renderer changes; it checks rendering, grading, and session restoration.
- The smoke check's instructor answer map is for local diagnostics only. Future student APIs must allowlist problem files, keep privileged parameters server-side, and accept grading only from PG.
- Verify the pinned renderer's API implementation and actual responses before adding integration code.

- Maintain workspace/server/exercise-catalog.json as the exercise allowlist. Use stable unique IDs; keep PG paths in server code and return only friendly summaries to clients. Add only real verified OPL entries with source attribution. Verification seeds are fixtures, not the future session seed policy.

- Use workspace/server/renderer-client.mjs for exercise loading. Keep renderer configuration, catalog paths, error causes, and session tokens server-side. Validate client changes with docker compose exec -T workspace npm test and npm run smoke:renderer-client inside that container.

- Use exercise-sessions.mjs to generate and persist session IDs, seeds, and renderer tokens. Resume through the stored token; never silently regenerate a failed session. Session JSON belongs only in /data/sessions on the named Docker volume. Run npm run smoke:sessions inside the workspace container for persistence changes. HTTP sessions enforce anonymous browser ownership using a HttpOnly cookie and a stored token hash. Unowned CLI records must never be exposed through HTTP. Supabase account ownership is still required before account-based deployment.

- API routes live in workspace/server/http-app.mjs. POST /api/sessions accepts only exerciseId; never forward caller renderer parameters. Project only the PG problem wrapper to API HTML, never the renderer form or JWT inputs. Maintain same-origin checks, strict body validation, friendly errors, and owner verification. Run npm test and npm run smoke:api inside the workspace container for API changes.

- The picker is in workspace/public. Preserve loading/empty/error states, URL-based session restoration, and cookie ownership. Keep PG HTML inside the sandboxed frame without allow-same-origin or form permissions. Only MathJax JavaScript may be proxied from the configured renderer. Verify new PG widget types separately. Browser checks: docker build -f browser-tests/Dockerfile -t linear-algebra-picker-qa . then docker run --rm --network linear-algebra-experimental_default --shm-size=1g linear-algebra-picker-qa.

- Answer collection uses answer-fields.js and answer-bridge.js inside workspace/public. Preserve exact names/values and ordered duplicate-name pairs, exclude renderer/helper fields, and keep snapshots session-bound. Use collectCurrentAnswers for fresh values before future grading. Maintain source/origin/channel/request checks, revision ordering, timeout cleanup, and bridge destruction when replacing frames. Never treat client field names as a backend allowlist.

- Grading uses POST /api/sessions/:id/answers with only an answers array of ordered string pairs. Verify ownership before PG requests. Derive the field contract from restored server-trusted HTML, never a client manifest. Preserve valid duplicate names, reject scalar duplicates/reserved fields, clear missing answers, and atomically advance saved tokens. The submission guard supports one Node process only. Validate changes with npm test and npm run smoke:grading inside the workspace container; instructor answers belong only to operator diagnostics.

- Persist lastSubmission and submissionCount atomically with the updated renderer tokens. Keep exact submitted pairs, server-derived fieldNames, server timestamps, PG score, and plain-text PG feedback together. Preserve legacy token-only records; never invent historical submissions. API submission snapshots are owner-only and must not include renderer tokens. Validate state changes with smoke:submission-state, smoke:grading, and the grading/refresh browser check; retain the latest snapshot only until a dedicated history store is implemented.

- Practice controls in picker.js submit fresh ordered pairs through the owned grading endpoint. Lock before answer collection, prevent repeat submissions, and never automatically retry a grade. Keep the live frame and inputs intact on failure and while awaiting the response. Clear/abort pending browser work on frame replacement and ignore late results. Preserve native keyboard button activation, mobile sizing, live status/error messages, and the browser checks for failure, duplicates, and navigation.

- Student field feedback is projected only from the configured renderer response JWT.answer score.answers; never accept a browser grading token or return correct answers/claims. PG error_message can contain mathematical hints: use explicit error flags or a missing parsed student_value with an error to identify invalid syntax. Parsed wrong-coordinate hints remain mathematical errors. Persist the safe fieldFeedback snapshot, preserve legacy snapshots, respect suppressed individual grades, and render messages as text. Preserve frame message authentication, aria-describedby/aria-invalid, changed-since-check handling, and the real mixed-feedback/refresh browser test.

- Enter submission is limited to eligible single-line answer inputs. Preserve multiline/native widget keys, modifiers, repeats, IME composition/key code 229, and explicit opt-outs. Route shortcuts and focus commands only through the authenticated opaque-frame bridge and retain the parent submission guard. Manage focus only if there has been no intervening user interaction; keep return-to-answer navigation and cross-frame focus outlines visible. Use the dedicated live region for state transitions, not per-keystroke result announcements. Reference stale-result descriptions only when visible. Retain assistive MathML, narrow-screen touch targets, forced colors, reduced motion, and the accessibility browser checks. Automated semantic checks do not replace an actual screen-reader listening review.
