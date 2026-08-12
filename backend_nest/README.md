# Smart Study Coach — NestJS Backend

This is a separate NestJS implementation of the existing Express backend. It uses the same MySQL database tables and exposes the same `/api` paths used by the frontend.

## Run

1. Copy `.env.example` to `.env` and set `JWT_SECRET` and `GEMINI_API_KEY`.
2. Ensure the existing `deepfabric` MySQL database has already been created from `../database/schema.sql`.
3. Run:

```powershell
npm install
npm run dev
```

`npm run dev` watches the `src` folder and restarts the server whenever you save a code change.

It starts at `http://localhost:4001/api` by default. To use it with the existing frontend, change only `baseURL` in `frontend/src/api/client.ts` from port `4000` to port `4001`.

The Express backend in `../backend` is independent and is not changed by this NestJS project.
