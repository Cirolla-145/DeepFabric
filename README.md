# Smart Study Coach

An Express + MySQL backend for turning source notes into reviewed concepts, a versioned question bank, study attempts, and explainable mastery review schedules. The React + TypeScript client lives in `frontend/`.

## Run locally

### Prerequisites

- Node.js 20 or newer
- MySQL 8 or newer, running locally
- A Gemini API key for AI-powered extraction, question generation, and short-answer grading. The app has a limited local fallback when no key is provided.

### 1. Create the database

From the repository root, create the `deepfabric` database and tables:

```powershell
mysql -u root -p < database/schema.sql
```

The default backend connection uses MySQL on `localhost:3306` with user `root`, password `root`, and database `deepfabric`. If your MySQL setup differs, update [backend/db/connectToDB.js](backend/db/connectToDB.js).

### 2. Configure and run the backend

Create `backend/.env` from `backend/.env.example`, then set at least a secure `JWT_SECRET`. Add your Gemini key to enable AI features:

```env
JWT_SECRET=use-a-long-random-secret
CLIENT_ORIGIN=http://localhost:5173
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.6-flash
```

In one terminal:

```powershell
cd backend
npm install
npm run server
```

The API starts at `http://localhost:4000`.

### 3. Run the frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL shown by Vite, normally `http://localhost:5173`.

The frontend is already configured to call `http://localhost:4000/api` and sends authentication cookies with requests. Keep the backend and frontend running at the same time.



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

## Mastery and review algorithm

Every grade or override recalculates the concept from its complete immutable attempt history. Result points are `correct = +10`, `partial = +5`, and `incorrect = -8`. An attempt is weighted by `max(0.25, 1 - age_in_days / 30)`, so recent work has more influence. The summed score is rounded and clamped to 0–100.

| Score | Bucket | Next review |
| --- | --- | --- |
| 0–24 | New | 1 day |
| 25–49 | Learning | 2 days |
| 50–74 | Proficient | 4 days |
| 75–100 | Mastered | 7 days |

The due endpoint only returns active, current concepts and includes score, bucket, most recent result, elapsed days, and a deterministic explanation.


