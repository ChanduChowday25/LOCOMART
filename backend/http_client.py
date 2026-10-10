"""
LOCOMART — Shared HTTP Client & Connection Pooling (M10.2 Phase 1)

Provides a shared, long-lived httpx.AsyncClient managed by the FastAPI lifespan,
reused across database.py, auth.py, and storage.py for high-performance connection
pooling (TCP Keep-Alive) with InsForge BaaS and external services.
"""

import asyncio
import logging
from typing import Optional
import httpx

logger = logging.getLogger("locomart.http_client")

# Sensible connection pool configuration
DEFAULT_TIMEOUT = httpx.Timeout(15.0, connect=10.0, read=15.0, write=15.0)
DEFAULT_LIMITS = httpx.Limits(
    max_keepalive_connections=20,
    max_connections=50,
    keepalive_expiry=30.0,
)

_shared_client: Optional[httpx.AsyncClient] = None
_shared_client_loop: Optional[asyncio.AbstractEventLoop] = None


async def get_http_client() -> httpx.AsyncClient:
    """
    Returns the shared, pooled httpx.AsyncClient instance.
    If called outside of the lifespan context or if the previous event loop was closed,
    it safely initializes a persistent client on the current active event loop without leaking.
    """
    global _shared_client, _shared_client_loop

    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    # Check if existing client is alive and bound to the current event loop
    if (
        _shared_client is None
        or _shared_client.is_closed
        or (_shared_client_loop is not None and _shared_client_loop != current_loop)
    ):
        if _shared_client is not None and not _shared_client.is_closed:
            try:
                await _shared_client.aclose()
            except Exception as e:
                logger.debug(f"Error closing stale HTTP client: {e}")

        logger.debug("Initializing shared httpx.AsyncClient with connection pooling")
        _shared_client = httpx.AsyncClient(
            timeout=DEFAULT_TIMEOUT,
            limits=DEFAULT_LIMITS,
        )
        _shared_client_loop = current_loop

    return _shared_client


async def init_http_client() -> httpx.AsyncClient:
    """
    Initializes the shared HTTP client during FastAPI application startup lifespan.
    """
    client = await get_http_client()
    logger.info("Shared HTTP connection pool initialized.")
    return client


async def close_http_client() -> None:
    """
    Cleanly closes the shared HTTP client during application shutdown lifespan.
    """
    global _shared_client, _shared_client_loop

    if _shared_client is not None and not _shared_client.is_closed:
        logger.info("Closing shared HTTP connection pool...")
        try:
            await _shared_client.aclose()
        except Exception as e:
            logger.warning(f"Error while closing shared HTTP client: {e}")

    _shared_client = None
    _shared_client_loop = None
