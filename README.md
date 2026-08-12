# DeepFabric — Smart Study Coach

DeepFabric turns study material into AI-assisted concepts and practice questions. Users organise work into workspaces, subjects, and modules; review generated content; take study sessions; and track mastery and learning activity.

## Project structure

```text
frontend/       React + TypeScript + Redux + shadcn UI
backend/        Original Express backend
backend_nest/   NestJS backend used by the current frontend
database/       Shared MySQL schema
```

The Express and Nest backends are independent. The frontend currently uses the Nest backend at `http://localhost:4001/api`.

## Prerequisites

- Node.js 20 or newer
- MySQL 8 or newer
- A Gemini API key for AI concept extraction, question generation, concept merging, and short-answer grading

## Run the application

### 1. Create the MySQL database

Create the `deepfabric` database and tables from the repository root:

```powershell
mysql -u root -p < database/schema.sql
```

### 2. Configure the Nest backend

Create `backend_nest/.env` by copying `backend_nest/.env.example`.

```powershell
Copy-Item backend_nest/.env.example backend_nest/.env
```

Set a secure JWT secret and your Gemini API key in `backend_nest/.env`:

```env
JWT_SECRET=use-a-long-random-secret
GEMINI_API_KEY=your-gemini-api-key
```

The default MySQL configuration is:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=deepfabric
PORT=4001
CLIENT_ORIGIN=http://localhost:5173
```

Start the backend:

```powershell
cd backend_nest
npm install
npm run dev
```

The Nest server runs at `http://localhost:4001/api` and automatically restarts when files in `src/` change.

### 3. Run the frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`.

## Test account

Use this account to explore the application:

```text
Email: shadcn@gmail.com
Password: shadcn@123
```

## Main workflow

1. Register or log in.
2. Create a workspace, subject, and module from the sidebar.
3. Add text, a PDF, or a web link as a source.
4. Process the source to generate concept suggestions with Gemini.
5. Accept, edit, reject, or merge concepts.
6. Generate and review questions.
7. Start a 10-question study session.
8. View module insights, audit history, and the home activity dashboard.

## Important behavior

- Source edits create a new source version. Existing reviewed concepts are marked outdated rather than deleted.
- Concept edit history is reconstructed from audit-log snapshots.
- Question edits create entries in `question_versions`.
- Audit entries are scoped to the logged-in user and module.
- The home dashboard aggregates the logged-in user's attempts and sessions across all modules.
