"""
LOCOMART — Backend Tests (M0)
Uses FastAPI's synchronous TestClient to avoid asyncio event loop conflicts.
"""

from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_ok():
    """GET /health must return 200 with status=ok."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "locomart-backend"
    assert data["milestone"] == "M0"


def test_health_db_connected():
    """GET /health/db returns 200 when InsForge DB API responds successfully."""
    import httpx
    mock_response = MagicMock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "rows": [{"version": "PostgreSQL 15.18 on aarch64-unknown-linux-gnu"}],
        "rowCount": 1,
        "command": "SELECT",
    }

    mock_client = AsyncMock()
    mock_client.post.return_value = mock_response

    with patch("httpx.AsyncClient", return_value=mock_client):
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = False
        response = client.get("/health/db")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"


def test_health_db_unreachable():
    """GET /health/db returns 503 when InsForge DB API is unreachable."""
    import httpx

    mock_client = AsyncMock()
    mock_client.post.side_effect = httpx.ConnectError("Connection refused")

    with patch("httpx.AsyncClient", return_value=mock_client):
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = False
        response = client.get("/health/db")

    assert response.status_code == 503
    data = response.json()
    assert "detail" in data

