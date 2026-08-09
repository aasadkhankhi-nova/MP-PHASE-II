# MP — Mockup Platform (Phase II)

Etsy print-on-demand mockup + SEO platform, as a real 3-tier web app.

## Structure
- `frontend/` — React (Vite). UI: stores, mockups, designs, generate, SEO.
- `backend/`  — Node.js + Express API. Auth, SEO (Gemini server-side), Etsy, data.
- `db/`       — PostgreSQL schema (Supabase).
- `MP-Phase-II.html` — legacy single-file app (still served at site root during migration).

## Live site (GitHub Pages via Actions)
- `/`     → legacy app (full features, during migration)
- `/app/` → new React app (migration in progress)

One-time setting: repo **Settings → Pages → Source: "GitHub Actions"**.

## Run locally
```bash
# frontend
cd frontend && npm install && npm run dev
# backend
cd backend && npm install && cp .env.example .env  # fill values
npm start
```

## Deploy
- Frontend: auto — every push to `main` builds and deploys via `.github/workflows/deploy.yml`.
- Backend: Render.com free web service → root `backend/`, build `npm install`, start `npm start`.
- DB: Supabase → run `db/schema.sql` in SQL editor.
