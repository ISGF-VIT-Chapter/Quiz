# IAC Quiz & Buzzer Platform

Two-round quiz system: Round 1 (online proctored MCQ) + Round 2 (live buzzer).

## Setup

### 1. Backend
```bash
cd Backend
npm install
cp .env.example .env
# Fill in DATABASE_URL, REDIS_URL, JWT_SECRET, ADMIN_JWT_SECRET

npx prisma migrate dev --name init
node seed/seedAdmin.js
node seed/seedRounds.js
node seedQuestions.js
npm start
```

### 2. Frontend
Edit `frontend/config.js` — set `backendUrl` to your backend URL.
Open `frontend/index.html` in a browser or serve via any static host.

## Pages
- `index.html` — Participant login
- `landing.html` — Round selection (with live/offline status)
- `quiz.html` — Round 1 proctored MCQ quiz
- `buzzer.html` — Round 2 live buzzer
- `admin.html` — Admin login
- `dashboard.html` — Full admin panel (team mgmt, round control, R1 results, buzzer)

## Admin Panel Tabs
- **Home** — Round on/off toggles + live violation feed
- **Team Registration** — Add/remove teams
- **Round 1 Results** — Leaderboard, per-team drill-down, CSV export
- **Buzzer Control** — Live Round 2 buzzer panel (unchanged)
- **Scoring Panel** — Manual point awards
- **Team Overview** — Combined leaderboard

## Seed Scripts
```bash
node seed/seedAdmin.js      # creates admin user
node seed/seedRounds.js     # creates round 1 & 2 controls (both live by default)
node seedQuestions.js       # seeds 10 R1 MCQ + 5 R2 buzzer questions
```

## New Prisma Models (added)
- `RoundControl` — stores live/offline state per round
- `QuizSession` — tracks each team's quiz progress
- `QuizAttempt` — stores each answer with timing and score

## Scoring Formula
`score = 10 - (timeTaken / timeLimit) * 9 + tiny_random_noise`
- Max: ~10.0 (instant answer)
- Min: ~1.0 (last second)
- No ties possible due to float precision + random noise
