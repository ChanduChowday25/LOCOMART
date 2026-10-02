"""
LOCOMART — Database Connection (M0 stub)

For M0, FastAPI connects to InsForge via its HTTP API (not direct TCP).
This module is a placeholder for M1+ when the application is deployed on
InsForge infrastructure and has direct PostgreSQL access.

SQLAlchemy engine and session will be configured in M1.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models (M1+ will add models here)."""
    pass
