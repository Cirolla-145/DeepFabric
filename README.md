# Smart Study Coach

An Express + MySQL backend for turning source notes into reviewed concepts, a versioned question bank, study attempts, and explainable mastery review schedules. The React + TypeScript client lives in `frontend/`.

## Run locally

1. Run `mysql -u root -p < database/schema.sql` from the repository root to create the `deepfabric` database and schema.
2. Update `backend/db/connectToDB.js` with local database credentials if needed.
3. Copy `backend/.env.example` to `backend/.env`, set `JWT_SECRET`, and optionally set `GEMINI_API_KEY`.
4. Run `npm install` in `backend/`, then `npm run server`.
5. Run `npm install` in `frontend/`, then run the Vite dev command.

The backend allows cookie-based requests from `CLIENT_ORIGIN` (default: `http://localhost:5173`). Frontend requests to protected endpoints must use `credentials: 'include'`.

## Core API workflow

- Create workspace, subject, and module through `/api/content`.
- Add a source and source versions through `/api/learning/sources` and `/api/learning/source-versions`.
- Create/review concepts and questions through `/api/learning/concepts` and `/api/learning/questions`.
- Start a session, create an attempt, then grade it:
  - `PATCH /api/learning/attempts/:attemptId/grade`
  - `PATCH /api/learning/attempts/:attemptId/override`
  - `GET /api/learning/mastery/due?module_id=<module-id>`

## Read APIs for the frontend

- `GET /api/content/workspaces`
- `GET /api/content/workspaces/:workspaceId/subjects`
- `GET /api/content/subjects/:subjectId/modules`
- `GET /api/content/modules/:moduleId`
- `GET /api/learning/modules/:moduleId/sources`
- `GET /api/learning/modules/:moduleId/concepts`
- `GET /api/learning/modules/:moduleId/questions`
- `GET /api/learning/modules/:moduleId/study-sessions`
- `GET /api/learning/study-sessions/:sessionId/attempts`

Each endpoint scopes its result through the authenticated user. Nested resources belonging to a different user are returned as not found.

## Additional backend workflows

- `POST /api/learning/sources/:sourceId/process` runs the deterministic local concept-extraction mock. It creates a provenance-linked AI run and suggested concepts for the current source version.
- `PATCH /api/learning/concepts/:conceptId/merge` accepts `target_concept_id`; active questions move to the target while the source concept and its mastery history remain as merged historical data.
- `POST /api/learning/modules/:moduleId/questions/regenerate` accepts an optional candidate `questions` array. Without it, the deterministic local mock creates one short-answer question per active concept and records a question-generation AI run. Generated questions are updated by content hash; approved and manually edited questions are preserved; obsolete generated questions are retired.
- `POST /api/learning/study-sessions` accepts `question_count`, `question_types`, and `focus_mode`. It persists the selected question versions in `study_session_questions`.
- `GET /api/learning/study-sessions/:sessionId/questions` returns the selected quiz questions without answers; `PATCH /api/learning/study-sessions/:sessionId/end` ends the session.
- `GET /api/learning/search?q=<text>` searches active concepts and questions.
- `GET /api/learning/modules/:moduleId/insights` returns mastery distribution, seven-day accuracy trend, and weak concepts.
- `GET /api/learning/modules/:moduleId/ai-runs` returns AI model, prompt, input/output metadata, and timestamps for the module.
- `GET /api/learning/modules/:moduleId/audit-logs` returns user actions and before/after snapshots for the module.

Organisation names, descriptions, and tags can be edited with `PATCH /api/content/workspaces/:workspaceId`, `PATCH /api/content/subjects/:subjectId`, and `PATCH /api/content/modules/:moduleId`.

MCQ and true/false answers are graded by a normalized exact comparison. Calling the grade endpoint for a short answer without a result uses the deterministic local key-term grading mock and records its AI run, rationale, and confidence. An external grader can instead supply a `result`, `confidence`, `grading_reason`, and optional `grading_ai_run_id`. A user override is recorded on the attempt and replaces the grade used in all later calculations.

## Mastery and review algorithm

Every grade or override recalculates the concept from its complete immutable attempt history. Result points are `correct = +10`, `partial = +5`, and `incorrect = -8`. An attempt is weighted by `max(0.25, 1 - age_in_days / 30)`, so recent work has more influence. The summed score is rounded and clamped to 0–100.

| Score | Bucket | Next review |
| --- | --- | --- |
| 0–24 | New | 1 day |
| 25–49 | Learning | 2 days |
| 50–74 | Proficient | 4 days |
| 75–100 | Mastered | 7 days |

The due endpoint only returns active, current concepts and includes score, bucket, most recent result, elapsed days, and a deterministic explanation.

## Integrity rules

- Editing a source creates a new immutable source version and marks derived concepts outdated; it never overwrites user-reviewed content.
- Questions use a content hash scoped to their module to prevent identical duplicates. Manual question edits create an immutable question version and are never silently replaced.
- Attempts keep the exact question-version reference used at the time of answering. Grades, overrides, and mastery recalculations write audit log entries.
- AI outputs are stored as `ai_runs` with model, prompt version, input, and output. AI content is treated as a suggestion: concepts and questions require user review, and short-answer grading exposes its rationale and confidence for correction.

## Current limitations

The backend uses Google's official Gemini Node SDK when `GEMINI_API_KEY` is configured. It calls Gemini for concept extraction, question generation, and short-answer grading, while retaining a deterministic local fallback when no key is available. The frontend is currently only scaffolded; the review and dashboard UI is the next implementation area.

## Tests

Run `npm test` inside `backend/`. The current automated baseline verifies JWT cookie signing and the safe no-key Gemini fallback; integration tests can be added with an isolated MySQL test database.
