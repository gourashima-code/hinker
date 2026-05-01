# Hinker

Job-matching app ("Swipe. Match. Hire.") — Tinder-style swiping between candidates and employers, AI-powered match scores, and in-app chat. UI is in German.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite 5 (no TypeScript) |
| Persistence | Firebase Firestore (linkhire-d4118 — project ID cannot be renamed) |
| AI scoring | Anthropic Claude API (direct browser call — move to backend before production) |
| Styles | Inline CSS-in-JS only, no CSS files |

## Project structure

```
src/
  main.jsx      — React root mount
  App.jsx       — entire app (single file)
index.html
vite.config.js
.env            — secrets (gitignored)
.env.example    — template with Firebase defaults
```

## Dev

```bash
npm run dev      # starts Vite dev server
npm run build    # production build → dist/
npm run preview  # preview production build
```

## Environment variables (all prefixed VITE_)

- `VITE_FIREBASE_*` — Firebase config (safe to expose in browser)
- `VITE_ANTHROPIC_API_KEY` — ⚠️ must be moved server-side before shipping publicly

## Architecture notes

- All state lives in the single `App` component; screens are toggled via `screen` state string.
- Firebase Firestore collection: `hinker`. Keys use the pattern `hk_<entity>` (e.g. `hk_user`, `hk_emp_jobs`).
- The `db` helper (`get` / `set` / `del`) wraps Firestore with JSON serialisation.
- Match scoring calls `fetchScore(user, job)` which hits the Claude API and returns `{score: 0-100, reason: string}`.
- Two roles: `applicant` and `employer` — role is persisted in Firestore under `hk_role`.
- Demo jobs seed (`DEMO_JOBS`) are loaded if no `hk_emp_jobs` doc exists.

## Key Firebase Firestore keys

| Key | Contents |
|---|---|
| `hk_role` | `"applicant"` or `"employer"` |
| `hk_user` | user object |
| `hk_emp_jobs` | array of job listings |
| `hk_app_matches` | array of matched jobs (applicant) |
| `hk_app_swiped` | array of swiped job IDs |
| `hk_all_applicants` | array of all applicant objects (employer sees this) |
| `hk_app_msgs` / `hk_emp_msgs` | chat message maps |
| `hk_app_notifs` / `hk_emp_notifs` | notification arrays |
| `likes_<email>` | job IDs liked by a specific user |
