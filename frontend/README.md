# BuzzIt! — React Frontend

Pixel-perfect Vite + React conversion of the original HTML/CSS frontend.

## Stack
- **Vite** + **React 18**
- **React Router v6** (client-side routing)
- **socket.io-client** (real-time buzzer & round status)
- **nginx** (Docker production server, SPA routing)

## Project Structure

```
src/
  pages/
    LoginPage.jsx        →  index.html
    AdminLoginPage.jsx   →  admin.html
    LandingPage.jsx      →  landing.html
    QuizPage.jsx         →  quiz.html
    BuzzerPage.jsx       →  buzzer.html
    DashboardPage.jsx    →  dashboard.html
  components/
    Toast.jsx            →  shared toast system
  config.js              →  backend URL config
  index.css              →  common.css (global styles)
  App.jsx                →  router + auth guards
  main.jsx               →  entry point
```

## Route Map

| Path          | Page               |
|---------------|--------------------|
| `/`           | Participant Login  |
| `/admin`      | Admin Login        |
| `/landing`    | Round Selection    |
| `/quiz`       | Round 1 Quiz       |
| `/buzzer`     | Round 2 Buzzer     |
| `/dashboard`  | Admin Dashboard    |

---

## Local Development

```bash
npm install
cp .env.example .env          # set VITE_BACKEND_URL
npm run dev                   # starts at http://localhost:5173
```

---

## Deploy to Vercel (Recommended — easiest)

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → Import repo
3. Set the **Environment Variable**:
   ```
   VITE_BACKEND_URL = https://your-backend.railway.app
   ```
4. Click **Deploy** — done ✅

> `vercel.json` already handles SPA routing (all paths → `index.html`).

---

## Deploy with Docker

### Build & run locally

```bash
docker build \
  --build-arg VITE_BACKEND_URL=https://your-backend.railway.app \
  -t buzzit-frontend .

docker run -p 3000:80 buzzit-frontend
```

### Or with docker-compose

```bash
VITE_BACKEND_URL=https://your-backend.railway.app docker-compose up --build
```

Access at `http://localhost:3000`

### Deploy Docker image to any host (Railway, Render, Fly.io, etc.)

Most platforms support deploying directly from a `Dockerfile`. Set the
`VITE_BACKEND_URL` build argument / environment variable in the platform UI.

---

## Environment Variables

| Variable           | Default                    | Description             |
|--------------------|----------------------------|-------------------------|
| `VITE_BACKEND_URL` | `http://localhost:5001`    | Backend API base URL    |

> **Note:** Because Vite bakes env vars at build time, you must set
> `VITE_BACKEND_URL` **before** building (either as a build arg or in `.env`).
> For Vercel this is automatic via the Environment Variables UI.
