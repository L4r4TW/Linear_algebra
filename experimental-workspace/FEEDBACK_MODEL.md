# PG feedback model

This is the student-feedback contract for continuity subtask 4. PG remains the grading authority. The application projects a small, named-field model, persists it with the updated renderer token, and derives presentation without recomputing mathematical grades.

## Field states

One feedback object belongs to one generated PG answer name, not to its array position, label text or number of DOM controls. Its shape is `{name, status, score, message, reason?}`. Scores are numeric fractions of full credit; `null` means no individual grade is exposed.

| State | Rule | Student presentation |
| --- | --- | --- |
| `unanswered` | PG did not award full credit and the submitted group has no non-whitespace value | Not answered; complete the field/group |
| `invalid` | A nonblank response has a PG error flag, or an error message with an explicitly null parsed `student_value` | Invalid input; prefer PG's parser/error message |
| `incorrect` | A parsed/non-error, nonblank response has PG score 0 | Incorrect; use PG's message if present, otherwise generic guidance |
| `partial` | PG gives the individual answer a score strictly between 0 and 1 | Partially correct; retain the exact PG fraction |
| `correct` | PG gives the individual answer score 1 | Correct; this takes precedence even if an authored evaluator accepts an empty response |
| `ungraded` | Individual grading is withheld or no grade entry/score is available | Feedback withheld (`reason: suppressed`) or Not graded (`reason: unavailable`) |

Precedence is suppression/unavailability, then PG full credit, then blank detection, then explicit parse/error evidence, then fractional/zero credit. Message wording is never used to decide whether mathematics was parsed. MathObjects can place mathematical advice in `error_message` for a parsed but incorrect vector; that remains incorrect. Invalid and unanswered states retain PG's score if an evaluator awards partial credit; the application does not invent a zero.

For visible feedback, an invalid field prefers `error_message` over `ans_message`; other states prefer `ans_message` and fall back to `error_message`. Messages are projected to canonical text with reviewed notation; [FEEDBACK_PRESENTATION.md](FEEDBACK_PRESENTATION.md) defines safe typesetting. If PG supplies no explanation, the app uses clearly generic guidance, without inventing a mathematical hint. Only reviewed explicit TeX is typeset; arbitrary feedback HTML stays inactive.

Stored field states and scores must agree: correct=1, incorrect=0, partial strictly between 0 and 1, ungraded=null, and invalid/unanswered below 1. Only ungraded fields may carry `suppressed`/`unavailable` reasons. Suppressed fields have an empty message. Duplicate names, unknown names and inconsistent metadata fail validation. Legacy snapshots without reasons or a visibility field remain supported.

## Overall results

The aggregate score is **PG's `problem_result.score`**, not an average, sum or count calculated from the exposed fields. Weighted and custom graders can differ from a simple average.

| Condition, in priority order | Headline |
| --- | --- |
| Grading visibility suppressed | Answers submitted; no score or derived correctness claim |
| Aggregate unavailable | Answers submitted; no invented overall result |
| Any visible invalid field | Check your input, retaining PG's aggregate score |
| Aggregate 1 and every visible field correct | All answers correct |
| Aggregate 1 with unavailable or conflicting field detail | Full credit awarded; no claim that every field was correct |
| Aggregate strictly between 0 and 1 | Partially correct |
| Aggregate 0 with unanswered fields | Some answers are missing |
| Other aggregate 0 | Not correct yet |

An invalid field can coexist with an overall partial score. The audit verifies this real case: 25% aggregate credit with an invalid numeric answer, a correct vector answer and unanswered fields. The headline asks for input repair rather than hiding the parser error behind the partial score.

Percentages normally show at most one decimal place. A tiny positive score displays `>0%`, and a near-full partial score displays `<100%` if normal rounding would mislabel it as an endpoint. Exact zero/full scores still display 0%/100%. Missing individual feedback is described as unavailable; the UI no longer promises that another check will necessarily reveal it.

## Suppression is a server-controlled policy

A false/0/`"0"` PG `showPartialCorrectAnswers` flag sets `feedbackVisibility: suppressed`. The real OPL suppression fixture returns numeric aggregate and answer-token scores even with that flag disabled. Their presence in raw renderer JSON is not permission for the student UI to infer correctness.

This application conservatively withholds derived overall correctness as well as individual grades whenever that flag is false. This is an explicit presentation/privacy policy; it does not claim that the raw renderer omitted its internal scores.

- The private session record keeps PG's aggregate score and updated tokens, plus the visibility policy, atomically with the latest submission.
- The owned student API returns `submission.score: null`, `exercise.score: null`, empty overall grading messages and `{status: ungraded, score: null, message: '', reason: suppressed}` for the fields. It does not return the private score, answer claims or tokens.
- The UI shows Answers submitted and Feedback withheld, with no hidden numeric score text or implied correct/incorrect headline. Editing still creates a draft and stale marker; its guidance says checking saves current answers while feedback remains withheld.
- Refresh preserves that policy. If a legacy snapshot lacks visibility metadata but the restored PG response suppresses results, the response adopts suppression without rewriting or deleting the saved record.
- A later visible submission resets score/message visibility correctly. A suppressed saved result remains suppressed until a new grade replaces it; old private data is not exposed retroactively.

The suppression fixture is operator-only. It has **not** been added to the six-exercise student catalog or approved for full mobile/keyboard compatibility. Raw grading settings remain under server control; students cannot request instructor mode or alter visibility flags through the API.

## Field association and stale results

The backend obtains allowed names from server-restored PG HTML, completes omitted groups for grading, and projects only matching names from the configured renderer's private answer token. Repeated-name checkbox pairs remain ordered values for one field/group; radio groups and GraphTool receive feedback at their reviewed group/widget anchor. Feedback order can differ from control order without changing the association.

The saved submission is immutable historical feedback for its exact submitted pairs. The frame compares current values by generated name, preserving whitespace and duplicate-value order and treating absent groups as blank. A changed field shows Changed since last check, replaces the old message, and removes stale `aria-invalid`. Other fields retain their own results. The overall panel marks its score/result as belonging to the previous check.

Reverting to the exact checked value restores its saved status, message and invalid semantics without grading again. A refresh that restores a draft also restores the stale marker over the old saved result. No input/change, edit, revert or refresh is treated as a new check. Source/origin/channel/request guards continue to bind feedback to the current isolated frame and session.

## Real-PG evidence

[feedback-observations.json](compatibility/feedback-observations.json) records **22 passing owned-session browser cases at seeds 1234 and 4321**, plus two stale/revert checks. [feedback-fixtures.json](compatibility/feedback-fixtures.json) records exact source revision/hash/URL, attribution, requirements and conditional license evidence. No OPL files were copied into Drive.

| Real source | Cases verified at both seeds |
| --- | --- |
| Fort Lewis dot-product exercise; Paul Pearson | Unanswered, invalid, all incorrect, aggregate partial, mixed invalid/correct/unanswered, all correct; named-field binding, exact feedback/answer restoration, editing one field, unchanged-field retention, stale draft refresh and revert without grading |
| UMass Amherst Probability `Problem4.pg`; Vladislav Emelyanov | Authored suppression for blank, incorrect and internally correct submissions; public score/message redaction, neutral labels, persistence/refresh and stale-withheld guidance |
| College of Idaho equation exercise; RA Cruz | Two authored TeX equation forms typeset with assistive math after grading and refresh; this fixture remains operator-only |
| PCC GraphTool line exercise; Alex Jordan | Actual widget submission with one correct point; a real **1/9 individual answer score**, partial field/overall state, visible widget association and canonical answer/feedback restoration |

The GraphTool audit operates the desktop widget. It does not certify touch plotting or enable GraphTool; the two mobile grading failures remain blocked. The full eleven-fixture seeded compatibility matrix remains a separate gate. Extra model safeguards such as endpoint rounding, accepting PG full credit on empty values and neutral handling of absent aggregates have unit coverage; these are not claimed as additional real-OPL cases.

The audit captures actual student-mode renderer responses in operator memory alongside the normal renderer client, server answer contract, owned HTTP API, picker, iframe, feedback renderer and session persistence. Expected scalar/choice/point calibration uses instructor diagnostics only in that private test process. Checked values, raw messages, answer tokens, correct-answer maps, cookies, session IDs and random private session data are never serialized into the report. Artifacts contain only verification seeds, public fixture IDs, scores/states, flags and booleans.

## Reproduce

With normal Compose services running, run from `experimental-workspace/`:

```powershell
docker build -f compatibility/Dockerfile -t linear-algebra-compatibility-qa .
$feedbackArtifacts = Join-Path $env:TEMP ('feedback-model-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $feedbackArtifacts | Out-Null
docker run --rm --network linear-algebra-experimental_default --shm-size=1g --mount type=volume,source=linear-algebra-experimental_opl,target=/opl,readonly --mount "type=bind,source=$feedbackArtifacts,target=/artifacts" linear-algebra-compatibility-qa node compatibility/feedback-audit.mjs
docker compose exec -T workspace npm test
```

The audit hosts its own temporary application inside the QA container with factory-injected operator fixtures and private temporary sessions, then removes those sessions. It publishes no host port, changes no production allowlist and never relaxes the default capability gate. Review/sanitize the JSON before replacing checked-in observations. Run the standard browser suite and regenerate the full seeded compatibility evidence after runtime changes.

Core implementation: [grading-feedback.mjs](workspace/server/grading-feedback.mjs), [renderer-client.mjs](workspace/server/renderer-client.mjs), [submission-state.mjs](workspace/server/submission-state.mjs), [feedback-model.js](workspace/public/feedback-model.js), [field-feedback.js](workspace/public/field-feedback.js), and the session/API projection. Runtime visibility is not inferred from browser metadata.
Previous subtask-4 validation on 2026-11-15: 153 server tests, 49 browser checks and 14 publisher/report tests passed, alongside all 20 real-PG cases and two stale/revert checks, the six-entry live catalog check, and renderer-client/session/API/grading/submission-state smoke checks. Renewed full compatibility evidence records 42/44 passes; the two existing mobile GraphTool grading failures remain blocked. The suppression fixture remains operator-only.
