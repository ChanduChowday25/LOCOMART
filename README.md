# LOCOMART — Local Grocery Assistance Platform

> **Current Milestone: M0 — Foundation**  
> Authentication, shops, products, cart, orders, payments, delivery, and invoices are **not yet implemented**. They are planned for M1–M10.

---

## Project Purpose

LOCOMART is a portfolio-sized local grocery ordering platform that connects customers with four predefined local shops. Customers can browse products, manage a cart, place orders (COD or Stripe Test Mode), and track delivery. Shopkeepers manage their shop, products, and incoming orders. Admins approve shopkeeper applications before shops become active.

---

## Architecture

```
React + Vite (TypeScript)
        │
        │  HTTP REST API (/api/v1/...)
        ▼
FastAPI (Python)
        │
        ├── PostgreSQL on InsForge
        └── InsForge services (Auth, Storage, as required per milestone)
```

**FastAPI** owns all business logic.  
**InsForge** provides the managed infrastructure (PostgreSQL, Auth, Storage, Deployment).

---

## Project Structure

```
LOCOMART/
├── frontend/           React + Vite + TypeScript
│   ├── src/
│   │   ├── api/        API client layer
│   │   ├── App.tsx     Foundation page (M0)
│   │   └── App.css     Design system
│   └── .env            (gitignored — not committed)
├── backend/            Python + FastAPI
│   ├── main.py         FastAPI application
│   ├── config.py       Settings (loaded from .env)
│   ├── database.py     SQLAlchemy async engine
│   ├── requirements.txt
│   └── test_health.py  M0 health tests
├── docs/               Architecture documentation
├── .env.example        Environment variable template (commit this)
├── .gitignore
└── README.md
```

---

## Local Setup

### Prerequisites

| Tool    | Version  |
|---------|----------|
| Python  | 3.11+    |
| Node.js | 18+      |
| npm     | 9+       |

---

### 1. Clone and configure environment

```bash
# Copy the environment template
cp .env.example backend/.env
```

Edit `backend/.env` and fill in your real values:

```env
DATABASE_URL=postgresql+asyncpg://project_admin:<password>@5xekk2s5.ap-southeast.insforge.app:5432/insforge
DATABASE_SYNC_URL=postgresql://project_admin:<password>@5xekk2s5.ap-southeast.insforge.app:5432/insforge
INSFORGE_URL=https://5xekk2s5.ap-southeast.insforge.app
INSFORGE_ANON_KEY=<your-anon-key>
SECRET_KEY=<long-random-string>
CORS_ORIGINS=http://localhost:5173
```

> ⚠️ **Never commit `.env`** — it is in `.gitignore`.

---

### 2. Start the FastAPI Backend

```bash
cd backend

# Create virtual environment
py -3 -m venv .venv
.venv\Scripts\activate        # Windows
# or: source .venv/bin/activate   # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Run the development server
uvicorn main:app --reload --port 8000
```

FastAPI will be available at: **http://localhost:8000**  
Interactive API docs: **http://localhost:8000/docs**

---

### 3. Start the React/Vite Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Vite will be available at: **http://localhost:5173**

---

## Verify M0 is Working

### Backend health check

```bash
curl http://localhost:8000/health
# Expected: {"status":"ok"}

curl http://localhost:8000/health/db
# Expected: {"status":"ok","database":"connected","version":"PostgreSQL 15..."}
```

### Frontend

Open **http://localhost:5173** — the foundation page will:
1. Auto-call `/health` and `/health/db`
2. Display **Connected** badges for both API and Database
3. Show an "All systems operational" banner when M0 is fully verified

---

## Required Environment Variables

| Variable             | Description                                  | Used By  |
|----------------------|----------------------------------------------|----------|
| `DATABASE_URL`       | SQLAlchemy async Postgres URL                | Backend  |
| `DATABASE_SYNC_URL`  | Synchronous Postgres URL (for Alembic)       | Backend  |
| `INSFORGE_URL`       | InsForge project base URL                    | Backend  |
| `INSFORGE_ANON_KEY`  | InsForge anonymous JWT                       | Backend  |
| `SECRET_KEY`         | Long random key for JWT signing (future M1)  | Backend  |
| `CORS_ORIGINS`       | Comma-separated allowed CORS origins         | Backend  |
| `VITE_API_URL`       | FastAPI base URL for the frontend            | Frontend |

---

## Running Tests

```bash
cd backend
# Ensure .venv is activated
pytest test_health.py -v
```

---

## InsForge Connection

| Property     | Value                                           |
|--------------|-------------------------------------------------|
| Backend URL  | https://5xekk2s5.ap-southeast.insforge.app      |
| Region       | ap-southeast                                    |
| Database     | PostgreSQL 15 (insforge)                        |
| Auth         | Email/password + Google OAuth                   |

---

## Development Milestones

| Milestone | Description             | Status      |
|-----------|-------------------------|-------------|
| **M0**    | Foundation              | ✅ Complete |
| M1        | Auth & Customer Profile | ⬜ Planned  |
| M2        | Shopkeeper App & Admin  | ⬜ Planned  |
| M3        | Shops & Products        | ⬜ Planned  |
| M4        | Cart & Shopping         | ⬜ Planned  |
| M5        | Orders & Inventory      | ⬜ Planned  |
| M6        | Stripe Test Payments    | ⬜ Planned  |
| M7        | Shopkeeper Fulfillment  | ⬜ Planned  |
| M8        | Delivery & OTP          | ⬜ Planned  |
| M9        | Invoices                | ⬜ Planned  |
| M10       | Final Polish & Deploy   | ⬜ Planned  |

See [FINAL_PROJECT_SPECIFICATION (1).md](./FINAL_PROJECT_SPECIFICATION%20(1).md) for the complete specification.
