"""
LOCOMART — FastAPI Application Entry Point
Milestone M0: Foundation — Health + DB connectivity verification only.

Architecture note:
  The PostgreSQL database is hosted on InsForge and accessed via InsForge's
  HTTP API (PostgREST-style) for application queries.
  SQLAlchemy is configured and ready for direct connection once the application
  is deployed on InsForge infrastructure (where direct DB access is available).
  For local development, DB connectivity is verified via the InsForge HTTP API.
"""

import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("locomart")

settings = get_settings()


# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    logger.info("🚀 LOCOMART backend starting up")
    logger.info(f"   Environment : {settings.app_env}")
    logger.info(f"   InsForge URL: {settings.insforge_url}")
    yield
    logger.info("🛑 LOCOMART backend shutting down")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="LOCOMART — Local Grocery Assistance Platform",
    description=(
        "Backend API for the Local Grocery Assistance Platform. "
        "Milestone M0 — Foundation. "
        "API base path for business routes will be /api/v1/... (M1+)."
    ),
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes — M0 only
# ---------------------------------------------------------------------------

@app.get("/health", tags=["health"], summary="Basic health check")
async def health():
    """
    Returns a simple OK status to confirm the API is running.
    Does NOT require database connectivity — always returns 200 if FastAPI is up.
    """
    return {
        "status": "ok",
        "service": "locomart-backend",
        "milestone": "M0",
    }


@app.get("/health/db", tags=["health"], summary="Database connectivity check")
async def health_db():
    """
    Verifies that the backend can reach the InsForge PostgreSQL database via HTTP API.
    Calls the InsForge raw SQL endpoint with a lightweight read-only query.
    Returns 200 on success, 503 if the database is unreachable.
    """
    url = f"{settings.insforge_url}/api/database/advance/rawsql"
    headers = {
        "Authorization": f"Bearer {settings.insforge_api_key}",
        "Content-Type": "application/json",
    }
    payload = {"query": "SELECT version() AS version"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            version = ""
            if data.get("rows") and len(data["rows"]) > 0:
                version = data["rows"][0].get("version", "")
            return {
                "status": "ok",
                "database": "connected",
                "version": version,
            }
    except httpx.HTTPStatusError as e:
        logger.error(f"DB health check HTTP error: {e.response.status_code}")
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail=f"Database HTTP error: {e.response.status_code}",
        )
    except Exception as e:
        logger.error(f"DB health check failed: {e}")
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail=f"Database unreachable: {str(e)}",
        )
