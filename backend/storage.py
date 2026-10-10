"""
LOCOMART — Storage Service (M2)
Handles secure file uploads to private InsForge Storage bucket ('shop-documents')
and authorized retrieval of applicant verification documents and photos.
"""

import logging
import os
import uuid
from typing import Optional
import httpx

from config import get_settings
from http_client import get_http_client

logger = logging.getLogger("locomart.storage")
settings = get_settings()

BUCKET_NAME = "shop-documents"
INVOICES_BUCKET = "invoices"


async def ensure_bucket_exists():
    """Ensure the private shop-documents and invoices buckets exist."""
    url = f"{settings.insforge_url}/api/storage/buckets"
    headers = {
        "Authorization": f"Bearer {settings.insforge_api_key}",
        "Content-Type": "application/json",
    }
    for b_name in (BUCKET_NAME, INVOICES_BUCKET):
        payload = {"bucketName": b_name, "isPublic": False}
        try:
            client = await get_http_client()
            resp = await client.post(url, headers=headers, json=payload, timeout=10.0)
            if resp.status_code in (200, 201, 409):
                logger.info(f"Storage bucket '{b_name}' verified.")
        except Exception as e:
            logger.warning(f"Could not verify bucket '{b_name}': {e}")


async def ensure_invoices_bucket_exists():
    """Ensure the private invoices bucket exists in InsForge storage."""
    url = f"{settings.insforge_url}/api/storage/buckets"
    headers = {
        "Authorization": f"Bearer {settings.insforge_api_key}",
        "Content-Type": "application/json",
    }
    payload = {"bucketName": INVOICES_BUCKET, "isPublic": False}
    try:
        client = await get_http_client()
        resp = await client.post(url, headers=headers, json=payload, timeout=10.0)
        if resp.status_code in (200, 201, 409):
            logger.info(f"Storage bucket '{INVOICES_BUCKET}' verified.")
    except Exception as e:
        logger.warning(f"Could not verify invoices bucket: {e}")


async def upload_file(
    content: bytes,
    original_filename: str,
    content_type: str,
    subfolder: str = "applications",
) -> str:
    """
    Uploads a file to the private InsForge Storage bucket.
    Returns the storage key identifier (e.g., 'applications/<uuid>_<filename>').
    """
    safe_name = os.path.basename(original_filename).replace(" ", "_")
    unique_key = f"{subfolder}/{uuid.uuid4().hex[:12]}_{safe_name}"

    url = f"{settings.insforge_url}/api/storage/buckets/{BUCKET_NAME}/objects/{unique_key}"
    headers = {
        "Authorization": f"Bearer {settings.insforge_api_key}",
    }
    files = {
        "file": (safe_name, content, content_type or "application/octet-stream"),
    }

    client = await get_http_client()
    resp = await client.put(url, headers=headers, files=files, timeout=30.0)
    if resp.status_code not in (200, 201):
        logger.error(f"Storage upload failed ({resp.status_code}): {resp.text}")
        raise RuntimeError(f"Storage upload failed: {resp.text}")
    logger.info(f"Successfully uploaded {unique_key} to {BUCKET_NAME}")
    return unique_key


async def upload_invoice_pdf(
    content: bytes,
    customer_id: str,
    order_id: str,
    invoice_number: str,
) -> str:
    """
    Uploads generated invoice PDF to private InsForge Storage bucket ('invoices').
    Dedicated path: invoices/{customer_id}/{order_id}/invoice_{invoice_number}.pdf
    Returns the storage key identifier.
    """
    clean_inv_num = invoice_number.replace("/", "_").replace("\\", "_")
    storage_key = f"invoices/{customer_id}/{order_id}/invoice_{clean_inv_num}.pdf"

    url = f"{settings.insforge_url}/api/storage/buckets/{INVOICES_BUCKET}/objects/{storage_key}"
    headers = {
        "Authorization": f"Bearer {settings.insforge_api_key}",
    }
    files = {
        "file": (f"invoice_{clean_inv_num}.pdf", content, "application/pdf"),
    }

    client = await get_http_client()
    resp = await client.put(url, headers=headers, files=files, timeout=30.0)
    if resp.status_code not in (200, 201):
        logger.error(f"Invoice storage upload failed ({resp.status_code}): {resp.text}")
        raise RuntimeError(f"Invoice storage upload failed: {resp.text}")
    logger.info(f"Successfully uploaded invoice {storage_key} to {INVOICES_BUCKET}")
    return storage_key


async def download_invoice_pdf_bytes(storage_key: str) -> Optional[bytes]:
    """
    Securely downloads raw invoice PDF bytes from the private InsForge Storage bucket.
    Follows redirects and authenticates using backend API credentials.
    """
    if not storage_key:
        return None

    clean_key = storage_key
    if INVOICES_BUCKET in clean_key:
        clean_key = clean_key.split(f"{INVOICES_BUCKET}/objects/")[-1].split("?")[0]

    url = f"{settings.insforge_url}/api/storage/buckets/{INVOICES_BUCKET}/objects/{clean_key}"
    headers = {
        "Authorization": f"Bearer {settings.insforge_api_key}",
    }

    client = await get_http_client()
    resp = await client.get(url, headers=headers, timeout=15.0, follow_redirects=True)
    if resp.status_code == 200:
        return resp.content
    logger.warning(f"Could not download invoice from storage ({resp.status_code}) for key: {clean_key}")
    return None


async def get_authorized_file_url(key: str) -> Optional[str]:
    """
    Retrieves the temporary authorized signed URL for a file in the private bucket.
    InsForge Storage returns a 302 redirect with signed CDN query parameters.
    """
    if not key:
        return None

    if key.startswith("http://") or key.startswith("https://"):
        return key

    clean_key = key
    if BUCKET_NAME in clean_key:
        clean_key = clean_key.split(f"{BUCKET_NAME}/objects/")[-1].split("?")[0]

    url = f"{settings.insforge_url}/api/storage/buckets/{BUCKET_NAME}/objects/{clean_key}"
    headers = {
        "Authorization": f"Bearer {settings.insforge_api_key}",
    }

    client = await get_http_client()
    resp = await client.get(url, headers=headers, timeout=10.0, follow_redirects=False)
    if resp.status_code == 302:
        return resp.headers.get("location")
    if resp.status_code == 200:
        return url
    logger.warning(f"Could not retrieve authorized URL for {clean_key}: {resp.status_code}")
    return None
