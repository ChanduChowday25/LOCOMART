# LOCOMART — Architecture Document (Milestone M0: Foundation)

## 1. System Overview
LOCOMART is a hyperlocal grocery delivery and discovery platform. Milestone M0 establishes a clean, minimal, runnable foundation.

## 2. Agreed Technology Stack
- **Frontend**: React 18+, Vite, TypeScript, Vanilla CSS (Modern design system)
- **Backend**: Python 3.11+, FastAPI, Uvicorn (ASGI)
- **Database / Infrastructure**: InsForge BaaS (PostgreSQL 15+, Auth, Storage, Edge Deployments)

## 3. Architecture Diagram
```
+-------------------------------------------------------------+
|                 Browser Client (React + Vite)                |
|                    http://localhost:5173                    |
+-------------------------------------------------------------+
                              |
                     HTTP API requests
                              v
+-------------------------------------------------------------+
|                     FastAPI Application                     |
|                    http://localhost:8000                    |
|                                                             |
|  - GET /health      (Liveness - always returns status: ok)  |
|  - GET /health/db   (Readiness - queries InsForge DB API)   |
|  - CORS enabled for frontend origin                         |
+-------------------------------------------------------------+
                              |
               HTTP API / PostgREST Interface
                              v
+-------------------------------------------------------------+
|                   InsForge Infrastructure                   |
|           https://5xekk2s5.ap-southeast.insforge.app        |
|                                                             |
|  - PostgreSQL 15.18                                         |
|  - Managed Auth / Storage / Functions (for M1+)             |
+-------------------------------------------------------------+
```

## 4. Milestone Boundaries
- **M0 (Current)**: Foundation only — health endpoints, database connection verification, environment configuration, frontend status page.
- **M1+ (Pending)**: User & shopkeeper auth, shop onboarding, product catalog, cart, orders, and delivery tracking.
