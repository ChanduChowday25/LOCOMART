"""
LOCOMART — Authentication & Authorization Middleware (M1)

Verifies InsForge authentication tokens, enforces application roles,
and protects endpoints against unauthorized access.
"""

import logging
import time
from typing import Any, Dict, List, Optional
import httpx
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import get_settings
from database import get_user_by_id, sync_user
from http_client import get_http_client

logger = logging.getLogger("locomart.auth")
settings = get_settings()

security = HTTPBearer(auto_error=False)

# Short-lived in-memory cache for verified tokens (token -> (user_info, timestamp))
_TOKEN_CACHE: Dict[str, tuple[Dict[str, Any], float]] = {}
CACHE_TTL_SECONDS = 30.0


async def verify_insforge_token(token: str) -> Dict[str, Any]:
    """
    Verifies the JWT token against InsForge's session API.
    Returns the verified user dict containing 'id' and 'email'.
    Raises HTTPException(401) if invalid or expired.
    """
    now = time.time()
    if token in _TOKEN_CACHE:
        cached_user, ts = _TOKEN_CACHE[token]
        if now - ts < CACHE_TTL_SECONDS:
            return cached_user

    url = f"{settings.insforge_url}/api/auth/sessions/current"
    headers = {"Authorization": f"Bearer {token}"}

    try:
        client = await get_http_client()
        resp = await client.get(url, headers=headers, timeout=10.0)
        if resp.status_code != 200:
            logger.warning(f"InsForge token verification failed with status {resp.status_code}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication session",
                headers={"WWW-Authenticate": "Bearer"},
            )
        data = resp.json()
        user_data = data.get("user")
        if not user_data or not user_data.get("id"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Malformed user session returned by authentication provider",
                headers={"WWW-Authenticate": "Bearer"},
            )

        _TOKEN_CACHE[token] = (user_data, now)
        # Prune cache periodically
        if len(_TOKEN_CACHE) > 500:
            for k, v in list(_TOKEN_CACHE.items()):
                if now - v[1] > CACHE_TTL_SECONDS:
                    _TOKEN_CACHE.pop(k, None)

        return user_data

    except httpx.RequestError as e:
        logger.error(f"Failed to communicate with InsForge Auth: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is temporarily unavailable",
        )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> Dict[str, Any]:
    """
    Dependency that extracts the Bearer token, verifies it with InsForge,
    and returns the application-level user record from public.users.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    insforge_user = await verify_insforge_token(token)

    user_id = insforge_user["id"]
    email = insforge_user.get("email", "")

    # Look up in application database
    db_user = await get_user_by_id(user_id)
    if not db_user:
        # Synchronize new user into public.users with role = CUSTOMER
        db_user = await sync_user(user_id=user_id, email=email)

    return db_user


def require_role(allowed_roles: List[str]):
    """
    Dependency factory to enforce role-based access control.
    Allowed roles: 'CUSTOMER', 'SHOPKEEPER', 'ADMIN'.
    """
    async def role_checker(current_user: Dict[str, Any] = Depends(get_current_user)):
        user_role = current_user.get("role", "CUSTOMER")
        if user_role not in allowed_roles:
            logger.warning(
                f"Unauthorized access: user {current_user.get('email')} with role {user_role} "
                f"attempted to access endpoint requiring {allowed_roles}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Your role is '{user_role}', but this action requires one of: {allowed_roles}.",
            )
        return current_user

    return role_checker


# Convenient role-specific dependencies
require_customer = require_role(["CUSTOMER"])
require_shopkeeper = require_role(["SHOPKEEPER"])
require_admin = require_role(["ADMIN"])
