"""
LOCOMART — FastAPI Application Entry Point
Milestone M1: Authentication & Customer Profile

Features:
- Health & DB connectivity check (from M0)
- User synchronization with InsForge Auth
- Role-based authorization (CUSTOMER, SHOPKEEPER, ADMIN)
- Customer profile view & edit endpoints
- Protected role endpoints for Customer, Shopkeeper, Admin
"""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional

import httpx
import stripe
from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Query, Request, Response, Security, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response as FastAPIResponse
from pydantic import BaseModel, Field

from auth import (
    get_current_user,
    require_admin,
    require_customer,
    require_shopkeeper,
)
from config import get_settings
from database import (
    get_user_by_id,
    update_user_profile,
    create_shopkeeper_application,
    get_application_by_id,
    get_latest_user_application,
    get_all_applications,
    approve_application,
    reject_application,
    seed_demo_shops,
    get_shops,
    get_shop_by_id,
    get_shop_by_owner_id,
    update_shop_by_owner_id,
    get_products_by_shop_id,
    get_product_by_id,
    create_product,
    update_product,
    update_product_stock,
    update_product_availability,
    archive_product,
    ensure_cart_tables_exist,
    get_active_cart_by_customer_id,
    get_cart_by_id,
    create_cart,
    update_cart_shop,
    delete_cart,
    clear_cart_by_customer_id,
    get_cart_items_with_products,
    get_cart_items,
    get_cart_item_by_id,
    get_cart_item_by_product,
    add_cart_item,
    update_cart_item_quantity,
    delete_cart_item,
    ensure_order_tables_exist,
    get_order_by_id,
    get_orders_by_customer_id,
    get_orders_by_shop_id,
    create_order_transaction,
    update_order_stripe_session,
    update_order_payment_status,
    cancel_order_and_restore_stock,
    record_stripe_webhook_event,
    shopkeeper_accept_order,
    shopkeeper_cancel_order,
    shopkeeper_prepare_order,
    shopkeeper_out_for_delivery_order,
    create_or_regenerate_delivery_otp,
    get_active_delivery_otp_for_customer,
    verify_delivery_otp_by_shopkeeper,
    mark_order_delivered_leave_at_door,
    get_invoice_by_order_id,
    is_order_eligible_for_invoice,
    generate_and_store_invoice_for_order,
    get_invoice_pdf_bytes_for_order,
    get_order_invoice_lock,
    OrderError,
)
from storage import (
    ensure_bucket_exists,
    ensure_invoices_bucket_exists,
    upload_file,
    get_authorized_file_url,
)
from fastapi.security import HTTPAuthorizationCredentials
from auth import verify_insforge_token, security
from http_client import init_http_client, close_http_client

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("locomart")

settings = get_settings()


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 LOCOMART backend starting up (Milestone M5.1)")
    logger.info(f"   Environment : {settings.app_env}")
    logger.info(f"   Debug mode  : {settings.effective_debug}")
    logger.info(f"   InsForge URL: {settings.insforge_url}")
    await init_http_client()
    try:
        await ensure_bucket_exists()
    except Exception as e:
        logger.warning(f"Storage bucket init notice: {e}")
    try:
        await ensure_invoices_bucket_exists()
    except Exception as e:
        logger.warning(f"Invoices bucket init notice: {e}")
    try:
        await ensure_cart_tables_exist()
    except Exception as e:
        logger.warning(f"Cart tables init notice: {e}")
    try:
        await ensure_order_tables_exist()
    except Exception as e:
        logger.warning(f"Order tables init notice: {e}")
    yield
    logger.info("🛑 LOCOMART backend shutting down")
    await close_http_client()


# ---------------------------------------------------------------------------
# App Definition
# ---------------------------------------------------------------------------
is_prod = settings.is_production

app = FastAPI(
    title="LOCOMART — Local Grocery Assistance Platform",
    description=(
        "Backend API for LOCOMART.\n"
        "Milestone M1: Authentication & Customer Profile.\n"
        "All business endpoints reside under /api/v1."
    ),
    version="1.0.0",
    lifespan=lifespan,
    debug=settings.effective_debug,
    docs_url=None if is_prod else "/docs",
    redoc_url=None if is_prod else "/redoc",
    openapi_url=None if is_prod else "/openapi.json",
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic Request / Response Models
# ---------------------------------------------------------------------------
class ProfileUpdateRequest(BaseModel):
    name: str = Field(default="", max_length=255)
    phone: str = Field(default="", max_length=50)
    address: str = Field(default="")
    city: str = Field(default="", max_length=100)
    state: str = Field(default="", max_length=100)
    pincode: str = Field(default="", max_length=20)


class RoleVerifyRequest(BaseModel):
    expected_role: str = Field(..., description="CUSTOMER, SHOPKEEPER, or ADMIN")


class ApplicationSubmitRequest(BaseModel):
    shop_name: str = Field(..., min_length=2, max_length=255)
    shop_description: str = Field(default="", max_length=1000)
    shop_phone: str = Field(..., min_length=5, max_length=50)
    shop_address: str = Field(..., min_length=5)
    city: str = Field(..., min_length=2, max_length=100)
    state: str = Field(..., min_length=2, max_length=100)
    pincode: str = Field(..., min_length=3, max_length=20)
    shop_photo_url: str = Field(default="")
    document_url: str = Field(default="")
    applicant_name: Optional[str] = None
    applicant_phone: Optional[str] = None


class ApplicationRejectRequest(BaseModel):
    rejection_reason: str = Field(..., min_length=3, description="Mandatory reason for rejection")


class ShopUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    business_phone: Optional[str] = Field(None, max_length=50)
    address: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    pincode: Optional[str] = Field(None, max_length=20)
    photo_url: Optional[str] = None
    is_open: Optional[bool] = None


class ProductCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    description: str = Field(default="", max_length=1000)
    category: str = Field(default="General", max_length=100)
    unit_label: str = Field(default="piece", max_length=50)
    price: float = Field(..., ge=0.0)
    stock: int = Field(default=0, ge=0)
    image_url: str = Field(default="")
    is_available: bool = Field(default=True)


class ProductUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    category: Optional[str] = Field(None, max_length=100)
    unit_label: Optional[str] = Field(None, max_length=50)
    price: Optional[float] = Field(None, ge=0.0)
    stock: Optional[int] = Field(None, ge=0)
    image_url: Optional[str] = None
    is_available: Optional[bool] = None


class ProductStockUpdateRequest(BaseModel):
    stock: int = Field(..., ge=0)


class ProductAvailabilityUpdateRequest(BaseModel):
    is_available: bool


class CartItemAddRequest(BaseModel):
    product_id: str = Field(..., min_length=1, description="ID of product to add to cart")
    quantity: int = Field(default=1, ge=1, description="Quantity to add (must be at least 1)")
    shop_id: Optional[str] = Field(None, description="Optional shop ID verification")


class CartItemUpdateRequest(BaseModel):
    quantity: int = Field(..., ge=1, description="New quantity for cart item (must be at least 1)")


# ---------------------------------------------------------------------------
# Health Endpoints (M0)
# ---------------------------------------------------------------------------
@app.get("/health", tags=["health"], summary="Basic health check")
async def health():
    return {
        "status": "ok",
        "service": "locomart-backend",
        "milestone": "M1",
    }


@app.get("/health/db", tags=["health"], summary="Database connectivity check")
async def health_db():
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
    except Exception as e:
        logger.error(f"DB health check failed: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Database unreachable: {str(e)}",
        )


# ---------------------------------------------------------------------------
# Auth & User Synchronization Endpoints (M1)
# ---------------------------------------------------------------------------
@app.post("/api/v1/auth/sync", tags=["auth"], summary="Synchronize user after login/signup")
async def sync_current_user(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Synchronizes the authenticated user from InsForge Auth into public.users.
    Normal signup ALWAYS guarantees role = 'CUSTOMER'.
    Returns the synchronized profile and actual application role.
    """
    return {
        "status": "ok",
        "message": "User synchronized successfully",
        "user": current_user,
    }


@app.get("/api/v1/auth/me", tags=["auth"], summary="Get current user profile & role")
async def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Returns the authenticated user's profile and backend application role.
    Backend is the sole source of truth for authorization.
    """
    return {
        "status": "ok",
        "user": current_user,
    }


@app.post("/api/v1/auth/verify-role", tags=["auth"], summary="Verify role against login entry point")
async def verify_login_entry_point(
    req: RoleVerifyRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Verifies that the authenticated user's actual role matches the selected login entry point.
    If mismatched, returns allowed=False with a clear descriptive message.
    """
    expected = req.expected_role.upper().strip()
    actual = current_user.get("role", "CUSTOMER")

    if actual != expected:
        role_labels = {
            "CUSTOMER": "Customer",
            "SHOPKEEPER": "Shopkeeper",
            "ADMIN": "Administrator",
        }
        actual_label = role_labels.get(actual, actual)
        expected_label = role_labels.get(expected, expected)

        msg = (
            f"Access denied: You signed in through the {expected_label} portal, "
            f"but your account has the role '{actual_label}'. "
            f"Please sign in through the {actual_label} login portal."
        )
        return {
            "allowed": False,
            "actual_role": actual,
            "expected_role": expected,
            "message": msg,
        }

    return {
        "allowed": True,
        "actual_role": actual,
        "expected_role": expected,
        "message": "Role verified successfully",
        "user": current_user,
    }


# ---------------------------------------------------------------------------
# Profile Management Endpoints (M1)
# ---------------------------------------------------------------------------
@app.get("/api/v1/users/profile", tags=["users"], summary="Get current user profile")
async def get_profile(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Returns the authenticated user's profile information."""
    return {
        "status": "ok",
        "profile": current_user,
    }


@app.put("/api/v1/users/profile", tags=["users"], summary="Update customer profile")
async def update_profile(
    body: ProfileUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Updates the customer's profile (name, phone, address, city, state, pincode).
    Strictly scoped to the authenticated user from the verified session token.
    Clients cannot alter other users' profiles or elevate roles through this endpoint.
    """
    user_id = current_user["id"]
    try:
        updated = await update_user_profile(
            user_id=user_id,
            name=body.name,
            phone=body.phone,
            address=body.address,
            city=body.city,
            state=body.state,
            pincode=body.pincode,
        )
        return {
            "status": "ok",
            "message": "Profile updated successfully",
            "profile": updated,
        }
    except Exception as e:
        logger.error(f"Error updating profile for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update profile",
        )


# ---------------------------------------------------------------------------
# Role-Protected Area Endpoints (M1 Placeholders & Proof of Authorization)
# ---------------------------------------------------------------------------
@app.get("/api/v1/customer/overview", tags=["customer"], summary="Customer protected overview")
async def customer_overview(user: Dict[str, Any] = Depends(require_customer)):
    """Accessible only to authenticated users with role = CUSTOMER."""
    return {
        "status": "ok",
        "role": "CUSTOMER",
        "message": f"Welcome to the Customer Portal, {user.get('name') or user.get('email')}.",
        "user": user,
    }


@app.get("/api/v1/shopkeeper/overview", tags=["shopkeeper"], summary="Shopkeeper protected overview")
async def shopkeeper_overview(user: Dict[str, Any] = Depends(require_shopkeeper)):
    """Accessible only to authenticated users with role = SHOPKEEPER."""
    return {
        "status": "ok",
        "role": "SHOPKEEPER",
        "message": f"Welcome to the Shopkeeper Portal, {user.get('name') or user.get('email')}.",
        "notice": "Shopkeeper features (products, orders, shop management) will be unlocked in M2/M3.",
        "user": user,
    }


@app.get("/api/v1/admin/overview", tags=["admin"], summary="Admin protected overview")
async def admin_overview(user: Dict[str, Any] = Depends(require_admin)):
    """Accessible only to authenticated users with role = ADMIN."""
    return {
        "status": "ok",
        "role": "ADMIN",
        "message": f"Welcome to the Admin Portal, {user.get('name') or user.get('email')}.",
        "notice": "Admin management features (shopkeeper approvals, shop activation) will be unlocked in M2.",
        "user": user,
    }


# ---------------------------------------------------------------------------
# M2: Customer Shopkeeper Application Endpoints
# ---------------------------------------------------------------------------
@app.post("/api/v1/applications/upload", tags=["applications"], summary="Upload shop photo or verification document")
async def upload_application_document(
    file: UploadFile = File(...),
    category: str = Form("document"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Uploads a verification document or shop photo to private InsForge Storage.
    Accessible to authenticated users.
    Returns the stored object key.
    """
    MAX_SIZE = 10 * 1024 * 1024  # 10MB
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds the 10MB limit.",
        )

    try:
        subfolder = f"applications/{category}"
        key = await upload_file(
            content=content,
            original_filename=file.filename or "upload.bin",
            content_type=file.content_type or "application/octet-stream",
            subfolder=subfolder,
        )
        return {
            "status": "ok",
            "key": key,
            "filename": file.filename,
        }
    except Exception as e:
        logger.error(f"Failed to upload document: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload file to storage.",
        )


@app.post("/api/v1/applications/submit", tags=["applications"], summary="Submit shopkeeper application")
async def submit_application(
    body: ApplicationSubmitRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Customer submits a shopkeeper application.
    Rule:
    - User can have at most one PENDING application.
    - If already approved or already a shopkeeper, informs the user.
    """
    user_id = current_user["id"]
    if current_user.get("role") == "SHOPKEEPER":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already an approved Shopkeeper.",
        )

    applicant_name = (body.applicant_name or current_user.get("name") or "").strip()
    applicant_email = current_user.get("email", "").strip()
    applicant_phone = (body.applicant_phone or current_user.get("phone") or "").strip()

    if not applicant_name:
        applicant_name = applicant_email.split("@")[0]

    try:
        app_record = await create_shopkeeper_application(
            user_id=user_id,
            applicant_name=applicant_name,
            applicant_email=applicant_email,
            applicant_phone=applicant_phone,
            shop_name=body.shop_name,
            shop_description=body.shop_description,
            shop_phone=body.shop_phone,
            shop_address=body.shop_address,
            city=body.city,
            state=body.state,
            pincode=body.pincode,
            shop_photo_url=body.shop_photo_url,
            document_url=body.document_url,
        )
        return {
            "status": "ok",
            "message": "Shopkeeper application submitted successfully. An administrator will review your application.",
            "application": app_record,
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Application submission error for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit application. Please try again.",
        )


@app.get("/api/v1/applications/my-status", tags=["applications"], summary="Get current user application status")
async def get_my_application_status(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Returns the latest shopkeeper application status for the authenticated user.
    Statuses: PENDING, APPROVED, REJECTED, or NONE.
    """
    user_id = current_user["id"]
    app_record = await get_latest_user_application(user_id)
    if not app_record:
        return {
            "status": "NONE",
            "application": None,
            "can_apply": True,
        }

    current_status = app_record.get("status", "NONE")
    can_apply = (current_status == "REJECTED")

    return {
        "status": current_status,
        "application": app_record,
        "can_apply": can_apply,
    }


@app.get("/api/v1/applications/{application_id}/files/{file_type}", tags=["applications"], summary="Authorized file download/view")
async def get_application_file(
    application_id: str,
    file_type: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Authorized access to applicant documents or photos.
    Only accessible by ADMIN or the applicant themselves.
    Private files are never exposed publicly.
    """
    app_record = await get_application_by_id(application_id)
    if not app_record:
        raise HTTPException(status_code=404, detail="Application not found")

    # Authorization check
    is_admin = current_user.get("role") == "ADMIN"
    is_owner = str(app_record.get("user_id")) == str(current_user.get("id"))
    if not is_admin and not is_owner:
        raise HTTPException(status_code=403, detail="Forbidden: You do not have permission to view this document.")

    target_key = app_record.get("shop_photo_url") if file_type == "photo" else app_record.get("document_url")
    if not target_key:
        raise HTTPException(status_code=404, detail=f"No {file_type} uploaded for this application.")

    url = await get_authorized_file_url(target_key)
    if not url:
        raise HTTPException(status_code=404, detail="Could not resolve authorized file location.")

    return RedirectResponse(url=url)


# ---------------------------------------------------------------------------
# M2: Admin Review & Approval Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/v1/admin/applications", tags=["admin"], summary="Admin: List all applications")
async def admin_list_applications(
    status: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    """
    Admin: Lists all shopkeeper applications.
    Filterable by status ('PENDING', 'APPROVED', 'REJECTED').
    Fast DB-only retrieval without blocking sequential external storage calls.
    """
    apps = await get_all_applications(status_filter=status)
    return {
        "status": "ok",
        "count": len(apps),
        "applications": [dict(app) for app in apps],
    }


@app.get("/api/v1/admin/applications/{application_id}", tags=["admin"], summary="Admin: View single application")
async def admin_get_application(
    application_id: str,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    """Admin: Get detailed information for an application with authorized media URLs resolved on demand."""
    app_record = await get_application_by_id(application_id)
    if not app_record:
        raise HTTPException(status_code=404, detail="Application not found")

    app_dict = dict(app_record)
    photo_task = get_authorized_file_url(app_dict["shop_photo_url"]) if app_dict.get("shop_photo_url") else None
    doc_task = get_authorized_file_url(app_dict["document_url"]) if app_dict.get("document_url") else None

    if photo_task and doc_task:
        app_dict["authorized_photo_url"], app_dict["authorized_document_url"] = await asyncio.gather(photo_task, doc_task)
    elif photo_task:
        app_dict["authorized_photo_url"] = await photo_task
    elif doc_task:
        app_dict["authorized_document_url"] = await doc_task

    return {
        "status": "ok",
        "application": app_dict,
    }


@app.post("/api/v1/admin/applications/{application_id}/approve", tags=["admin"], summary="Admin: Approve application")
async def admin_approve_application(
    application_id: str,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    """
    Admin: Approves a pending application.
    - Transitions user role CUSTOMER -> SHOPKEEPER
    - Creates ACTIVE shop in public.shops
    - Prevents double reviewing
    """
    try:
        result = await approve_application(
            application_id=application_id,
            admin_id=current_user["id"],
        )
        return {
            "status": "ok",
            "message": "Application approved successfully. User role elevated to SHOPKEEPER and shop activated.",
            "application": result["application"],
            "shop": result["shop"],
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Approval failed for application {application_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to approve application.")


@app.post("/api/v1/admin/applications/{application_id}/reject", tags=["admin"], summary="Admin: Reject application")
async def admin_reject_application(
    application_id: str,
    body: ApplicationRejectRequest,
    current_user: Dict[str, Any] = Depends(require_admin),
):
    """
    Admin: Rejects a pending application.
    - Rejection requires a mandatory reason
    - User remains CUSTOMER and may reapply
    - Prevents double reviewing
    """
    try:
        updated_app = await reject_application(
            application_id=application_id,
            admin_id=current_user["id"],
            rejection_reason=body.rejection_reason,
        )
        return {
            "status": "ok",
            "message": "Application rejected.",
            "application": updated_app,
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Rejection failed for application {application_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to reject application.")


@app.post("/api/v1/admin/seed-demo-shops", tags=["admin"], summary="Admin: Seed initial 4 approved demo shops")
async def admin_seed_shops(current_user: Dict[str, Any] = Depends(require_admin)):
    """
    Admin endpoint to trigger idempotent seeding of the 4 demo shops.
    Protected strictly by require_admin.
    """
    try:
        res = await seed_demo_shops()
        return res
    except Exception as e:
        logger.error(f"Seed demo shops failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to seed demo shops.")


@app.get("/api/v1/admin/shops", tags=["admin"], summary="Admin: View shops")
async def admin_list_shops(current_user: Dict[str, Any] = Depends(require_admin)):
    """Admin: View all shops."""
    shops = await get_shops(active_only=False)
    return {
        "status": "ok",
        "count": len(shops),
        "shops": shops,
    }


# ===========================================================================
# Milestone M3: Public & Customer Shops & Products Endpoints
# ===========================================================================

@app.get("/api/v1/shops", tags=["shops"], summary="Customer: List all active shops")
async def list_active_shops():
    """
    Returns list of active shops for customer browsing.
    Resolves photo URLs for display.
    """
    shops = await get_shops(active_only=True)
    results = []
    for s in shops:
        shop_dict = dict(s)
        # Ensure is_open field has a default boolean
        if "is_open" not in shop_dict or shop_dict["is_open"] is None:
            shop_dict["is_open"] = True
        if shop_dict.get("photo_url"):
            auth_url = await get_authorized_file_url(shop_dict["photo_url"])
            if auth_url:
                shop_dict["photo_url"] = auth_url
        results.append(shop_dict)

    return {
        "status": "ok",
        "count": len(results),
        "shops": results,
    }


@app.get("/api/v1/shops/{shop_id}", tags=["shops"], summary="Customer: View single shop details")
async def get_shop_details(shop_id: str):
    """Returns details for a specific shop."""
    shop = await get_shop_by_id(shop_id)
    if not shop or not shop.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shop not found or inactive")

    shop_dict = dict(shop)
    if "is_open" not in shop_dict or shop_dict["is_open"] is None:
        shop_dict["is_open"] = True
    if shop_dict.get("photo_url"):
        auth_url = await get_authorized_file_url(shop_dict["photo_url"])
        if auth_url:
            shop_dict["photo_url"] = auth_url

    return {
        "status": "ok",
        "shop": shop_dict,
    }


@app.get("/api/v1/shops/{shop_id}/products", tags=["products"], summary="Customer: Browse products for a shop")
async def list_shop_products(
    shop_id: str,
    category: Optional[str] = None,
    search: Optional[str] = None,
):
    """
    Returns non-archived products for a specific shop.
    Supports optional category filtering and name search.
    """
    shop = await get_shop_by_id(shop_id)
    if not shop or not shop.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shop not found or inactive")

    prods = await get_products_by_shop_id(
        shop_id=shop_id,
        include_archived=False,
        category=category,
        search=search,
    )

    results = []
    for p in prods:
        p_dict = dict(p)
        if p_dict.get("image_url"):
            auth_url = await get_authorized_file_url(p_dict["image_url"])
            if auth_url:
                p_dict["image_url"] = auth_url
        results.append(p_dict)

    return {
        "status": "ok",
        "shop_id": shop_id,
        "count": len(results),
        "products": results,
    }


# ===========================================================================
# Milestone M3: Shopkeeper "My Shop" & Product Management Endpoints
# ===========================================================================

async def _resolve_shopkeeper_shop(current_user: Dict[str, Any]) -> Dict[str, Any]:
    """Helper to retrieve shop for authenticated shopkeeper and enforce ownership."""
    shop = await get_shop_by_owner_id(current_user["id"])
    if not shop:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No shop found for this shopkeeper account. Please ensure your application was approved.",
        )
    return shop


@app.get("/api/v1/shopkeeper/shop", tags=["shopkeeper"], summary="Shopkeeper: View My Shop")
async def shopkeeper_get_my_shop(current_user: Dict[str, Any] = Depends(require_shopkeeper)):
    """Retrieve the shop details owned by the authenticated shopkeeper."""
    shop = await _resolve_shopkeeper_shop(current_user)
    shop_dict = dict(shop)
    if "is_open" not in shop_dict or shop_dict["is_open"] is None:
        shop_dict["is_open"] = True
    if shop_dict.get("photo_url"):
        auth_url = await get_authorized_file_url(shop_dict["photo_url"])
        if auth_url:
            shop_dict["photo_url"] = auth_url
    return {
        "status": "ok",
        "shop": shop_dict,
    }


@app.put("/api/v1/shopkeeper/shop", tags=["shopkeeper"], summary="Shopkeeper: Update My Shop")
async def shopkeeper_update_my_shop(
    body: ShopUpdateRequest,
    current_user: Dict[str, Any] = Depends(require_shopkeeper),
):
    """
    Update shop details for the authenticated shopkeeper.
    Ownership is strictly determined by current_user['id'].
    """
    shop = await _resolve_shopkeeper_shop(current_user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return {"status": "ok", "shop": shop}

    updated = await update_shop_by_owner_id(current_user["id"], updates)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update shop details")

    return {
        "status": "ok",
        "message": "Shop details updated successfully",
        "shop": updated,
    }


@app.get("/api/v1/shopkeeper/products", tags=["shopkeeper"], summary="Shopkeeper: View My Products")
async def shopkeeper_list_products(current_user: Dict[str, Any] = Depends(require_shopkeeper)):
    """List all active (non-archived) products for the authenticated shopkeeper's shop."""
    shop = await _resolve_shopkeeper_shop(current_user)
    prods = await get_products_by_shop_id(shop["id"], include_archived=False)

    results = []
    for p in prods:
        p_dict = dict(p)
        if p_dict.get("image_url"):
            auth_url = await get_authorized_file_url(p_dict["image_url"])
            if auth_url:
                p_dict["image_url"] = auth_url
        results.append(p_dict)

    return {
        "status": "ok",
        "shop_id": shop["id"],
        "count": len(results),
        "products": results,
    }


@app.post("/api/v1/shopkeeper/products", tags=["shopkeeper"], summary="Shopkeeper: Add Product")
async def shopkeeper_create_product(
    body: ProductCreateRequest,
    current_user: Dict[str, Any] = Depends(require_shopkeeper),
):
    """Add a new product to the authenticated shopkeeper's shop."""
    shop = await _resolve_shopkeeper_shop(current_user)
    data = body.model_dump()
    product = await create_product(shop["id"], data)
    return {
        "status": "ok",
        "message": "Product created successfully",
        "product": product,
    }


@app.put("/api/v1/shopkeeper/products/{product_id}", tags=["shopkeeper"], summary="Shopkeeper: Edit Product")
async def shopkeeper_update_product(
    product_id: str,
    body: ProductUpdateRequest,
    current_user: Dict[str, Any] = Depends(require_shopkeeper),
):
    """Edit product details. Strictly verifies shop ownership."""
    shop = await _resolve_shopkeeper_shop(current_user)
    updates = body.model_dump(exclude_unset=True)

    updated = await update_product(product_id, shop["id"], updates)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found or not owned by your shop",
        )

    return {
        "status": "ok",
        "message": "Product updated successfully",
        "product": updated,
    }


@app.patch("/api/v1/shopkeeper/products/{product_id}/stock", tags=["shopkeeper"], summary="Shopkeeper: Update Stock")
async def shopkeeper_update_stock(
    product_id: str,
    body: ProductStockUpdateRequest,
    current_user: Dict[str, Any] = Depends(require_shopkeeper),
):
    """Update stock quantity for a product owned by shopkeeper."""
    shop = await _resolve_shopkeeper_shop(current_user)
    updated = await update_product_stock(product_id, shop["id"], body.stock)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found or not owned by your shop",
        )

    return {
        "status": "ok",
        "message": "Product stock updated successfully",
        "product": updated,
    }


@app.patch("/api/v1/shopkeeper/products/{product_id}/availability", tags=["shopkeeper"], summary="Shopkeeper: Toggle Availability")
async def shopkeeper_toggle_availability(
    product_id: str,
    body: ProductAvailabilityUpdateRequest,
    current_user: Dict[str, Any] = Depends(require_shopkeeper),
):
    """Toggle product available/unavailable status."""
    shop = await _resolve_shopkeeper_shop(current_user)
    updated = await update_product_availability(product_id, shop["id"], body.is_available)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found or not owned by your shop",
        )

    return {
        "status": "ok",
        "message": f"Product marked {'available' if body.is_available else 'unavailable'}",
        "product": updated,
    }


@app.delete("/api/v1/shopkeeper/products/{product_id}", tags=["shopkeeper"], summary="Shopkeeper: Archive Product")
async def shopkeeper_archive_product(
    product_id: str,
    current_user: Dict[str, Any] = Depends(require_shopkeeper),
):
    """Archive/delete a product owned by shopkeeper."""
    shop = await _resolve_shopkeeper_shop(current_user)
    success = await archive_product(product_id, shop["id"])
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found or not owned by your shop",
        )

    return {
        "status": "ok",
        "message": "Product archived successfully",
        "product_id": product_id,
    }


@app.post("/api/v1/shopkeeper/upload-image", tags=["shopkeeper"], summary="Shopkeeper: Upload Product or Shop Image")
async def shopkeeper_upload_image(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(require_shopkeeper),
):
    """Uploads a product or shop image to InsForge Storage."""
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/jpg"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type {file.content_type}. Only JPEG, PNG, or WebP images are allowed.",
        )

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:  # 5MB limit
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds maximum allowed limit of 5MB.",
        )

    try:
        storage_key = await upload_file(
            content=content,
            original_filename=file.filename or "product.jpg",
            content_type=file.content_type,
            subfolder="products",
        )
        auth_url = await get_authorized_file_url(storage_key)
        return {
            "status": "ok",
            "key": storage_key,
            "url": auth_url or storage_key,
        }
    except Exception as e:
        logger.error(f"Image upload failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload image. Please try again.",
        )


# ===========================================================================
# Milestone M4.1: Customer Cart Endpoints
# ===========================================================================

async def _build_cart_response(cart: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Constructs a complete cart payload including shop details, items,
    embedded product info, item subtotals, and total price.
    """
    if not cart:
        return {
            "status": "ok",
            "cart": None,
            "shop": None,
            "items": [],
            "item_count": 0,
            "subtotal": 0.0,
            "total": 0.0,
        }

    shop = await get_shop_by_id(cart["shop_id"])
    shop_dict = None
    if shop:
        shop_dict = dict(shop)
        if "is_open" not in shop_dict or shop_dict["is_open"] is None:
            shop_dict["is_open"] = True
        if shop_dict.get("photo_url"):
            auth_url = await get_authorized_file_url(shop_dict["photo_url"])
            if auth_url:
                shop_dict["photo_url"] = auth_url

    raw_items = await get_cart_items_with_products(cart["id"])
    items = []
    total_amount = 0.0
    total_qty = 0

    for row in raw_items:
        qty = int(row["quantity"])
        price = float(row["product_price"] or 0.0)
        subtotal = round(qty * price, 2)
        total_amount += subtotal
        total_qty += qty

        img_url = row.get("product_image_url") or ""
        if img_url:
            auth_url = await get_authorized_file_url(img_url)
            if auth_url:
                img_url = auth_url

        items.append({
            "id": row["item_id"],
            "cart_id": row["cart_id"],
            "product_id": row["product_id"],
            "quantity": qty,
            "unit_price": price,
            "subtotal": subtotal,
            "product": {
                "id": row["product_id"],
                "shop_id": row["product_shop_id"],
                "name": row["product_name"],
                "description": row.get("product_description") or "",
                "category": row.get("product_category") or "General",
                "unit_label": row.get("product_unit_label") or "piece",
                "price": price,
                "stock": int(row.get("product_stock") or 0),
                "image_url": img_url,
                "is_available": bool(row.get("product_is_available", True)),
                "is_archived": bool(row.get("product_is_archived", False)),
            },
            "created_at": row.get("item_created_at"),
            "updated_at": row.get("item_updated_at"),
        })

    total_amount = round(total_amount, 2)

    return {
        "status": "ok",
        "cart": {
            "id": cart["id"],
            "customer_id": cart["customer_id"],
            "shop_id": cart["shop_id"],
            "status": cart.get("status", "ACTIVE"),
            "created_at": cart.get("created_at"),
            "updated_at": cart.get("updated_at"),
        },
        "shop": shop_dict,
        "items": items,
        "item_count": total_qty,
        "subtotal": total_amount,
        "total": total_amount,
    }


@app.get("/api/v1/cart", tags=["cart"], summary="Get current customer active cart")
async def get_my_cart(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Returns current customer's active cart.
    Includes shop information, cart items, product details, item subtotals, and cart total.
    Never trusts customer_id from request body/query; derives it strictly from session token.
    """
    customer_id = current_user["id"]
    cart = await get_active_cart_by_customer_id(customer_id)
    return await _build_cart_response(cart)


@app.post("/api/v1/cart/items", tags=["cart"], summary="Add product to active cart", status_code=status.HTTP_200_OK)
async def add_item_to_cart(
    body: CartItemAddRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Adds a product to the authenticated customer's active cart.
    Enforces:
    - Product existence, availability, and non-archived status.
    - Requested quantity does not exceed current product stock.
    - ONE-SHOP-PER-CART rule (returns clear 409 Conflict if adding from another shop).
    - Automatically increases quantity if product is already in cart.
    - Derived customer ID from authenticated session.
    """
    customer_id = current_user["id"]

    # 1. Input validation
    if body.quantity < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quantity must be a positive integer greater than zero.",
        )

    # 2. Verify product exists
    product = await get_product_by_id(body.product_id)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    # 3. Verify product is not archived
    if product.get("is_archived"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This product has been archived and is no longer available.",
        )

    # 4. Verify product is available
    if not product.get("is_available"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{product.get('name')}' is currently marked unavailable by the shop.",
        )

    product_shop_id = product.get("shop_id")
    if body.shop_id and body.shop_id != product_shop_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Product does not belong to the selected shop.",
        )

    # Verify the shop offering this product exists and is active
    target_shop = await get_shop_by_id(product_shop_id)
    if not target_shop or not target_shop.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The shop offering this product is inactive or not found.",
        )

    current_stock = int(product.get("stock", 0))
    if current_stock < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{product.get('name')}' is out of stock.",
        )

    # 5. Retrieve or initialize cart and enforce ONE-SHOP-PER-CART rule
    cart = await get_active_cart_by_customer_id(customer_id)

    if cart:
        existing_items = await get_cart_items(cart["id"])
        if len(existing_items) > 0 and cart.get("shop_id") != product_shop_id:
            # 409 Conflict: Cart already has items from another shop
            current_shop = await get_shop_by_id(cart["shop_id"])
            current_shop_name = current_shop["name"] if current_shop else "another shop"
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Your cart already contains items from '{current_shop_name}'. "
                    f"LOCOMART only supports ordering from one shop at a time. "
                    f"Please clear your current cart first if you wish to shop from '{target_shop.get('name')}'."
                ),
            )
        elif len(existing_items) == 0 and cart.get("shop_id") != product_shop_id:
            # Existing cart was empty; switch shop seamlessly
            await update_cart_shop(cart["id"], product_shop_id)
            cart["shop_id"] = product_shop_id
    else:
        # Create fresh cart for customer
        cart = await create_cart(customer_id, product_shop_id)

    # 6. Check if product already exists in cart
    existing_item = await get_cart_item_by_product(cart["id"], product["id"])
    target_quantity = body.quantity
    if existing_item:
        target_quantity = int(existing_item["quantity"]) + body.quantity

    # 7. Validate stock against requested total quantity
    if target_quantity > current_stock:
        current_in_cart = int(existing_item["quantity"]) if existing_item else 0
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot add {body.quantity} more of '{product.get('name')}'. "
                f"Available stock is {current_stock} (you already have {current_in_cart} in your cart)."
            ),
        )

    # 8. Insert or update cart item
    if existing_item:
        await update_cart_item_quantity(existing_item["id"], target_quantity)
    else:
        await add_cart_item(cart["id"], product["id"], body.quantity)

    # 9. Return updated full cart
    cart_data = await _build_cart_response(cart)
    return {
        "status": "ok",
        "message": f"Added '{product.get('name')}' to your cart.",
        **cart_data,
    }


@app.patch("/api/v1/cart/items/{item_id}", tags=["cart"], summary="Update cart item quantity")
async def update_item_quantity(
    item_id: str,
    body: CartItemUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Updates the quantity of a specific cart item.
    Strictly verifies that the item belongs to the authenticated customer's cart.
    Validates quantity >= 1 and checks current stock/availability.
    """
    customer_id = current_user["id"]

    if body.quantity < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quantity must be at least 1. To remove an item, please delete it.",
        )

    item = await get_cart_item_by_id(item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cart item not found.",
        )

    cart = await get_cart_by_id(item["cart_id"])
    if not cart or str(cart.get("customer_id")) != str(customer_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cart item not found in your active cart.",
        )

    product = await get_product_by_id(item["product_id"])
    if not product or product.get("is_archived") or not product.get("is_available"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This product is no longer available in the shop.",
        )

    current_stock = int(product.get("stock", 0))
    if body.quantity > current_stock:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Requested quantity ({body.quantity}) exceeds available stock ({current_stock}).",
        )

    await update_cart_item_quantity(item_id, body.quantity)
    cart_data = await _build_cart_response(cart)
    return {
        "status": "ok",
        "message": "Cart item quantity updated.",
        **cart_data,
    }


@app.delete("/api/v1/cart/items/{item_id}", tags=["cart"], summary="Remove item from cart")
async def remove_item_from_cart(
    item_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Removes an item from the customer's cart.
    Strictly verifies item ownership against the authenticated customer's cart.
    """
    customer_id = current_user["id"]

    item = await get_cart_item_by_id(item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cart item not found.",
        )

    cart = await get_cart_by_id(item["cart_id"])
    if not cart or str(cart.get("customer_id")) != str(customer_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cart item not found in your active cart.",
        )

    await delete_cart_item(item_id)
    cart_data = await _build_cart_response(cart)
    return {
        "status": "ok",
        "message": "Item removed from cart.",
        **cart_data,
    }


@app.delete("/api/v1/cart", tags=["cart"], summary="Clear customer cart")
async def clear_customer_cart(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Clears the current authenticated customer's active cart.
    Deletes all cart items and resets the cart so the customer can start fresh
    or switch to another shop.
    """
    customer_id = current_user["id"]
    cart = await get_active_cart_by_customer_id(customer_id)
    if not cart:
        return {
            "status": "ok",
            "message": "Cart is already empty.",
            "cart": None,
            "shop": None,
            "items": [],
            "item_count": 0,
            "subtotal": 0.0,
            "total": 0.0,
        }

    await delete_cart(cart["id"])
    return {
        "status": "ok",
        "message": "Cart cleared successfully.",
        "cart": None,
        "shop": None,
        "items": [],
        "item_count": 0,
        "subtotal": 0.0,
        "total": 0.0,
    }


# ===========================================================================
# Milestone M5.1: Orders & Transactional Inventory Endpoints
# ===========================================================================

class CreateOrderRequest(BaseModel):
    delivery_method: Optional[str] = Field("HAND_TO_CUSTOMER", description="HAND_TO_CUSTOMER or LEAVE_AT_DOOR")
    payment_method: Optional[str] = Field("COD", description="COD or ONLINE")


async def _safe_background_generate_invoice(order_id: str, max_retries: int = 2) -> None:
    """
    Safely generates and stores an invoice in a background task with retry logic:
    - Runs non-blocking on the event loop (heavy ReportLab PDF rendering is offloaded to threads).
    - Logs errors without failing client requests or rolling back payments.
    - Retries transient storage/DB errors up to max_retries with brief delay.
    - Fully idempotent: acquires per-order lock and skips if already generated.
    """
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"[BackgroundTasks] Generating invoice for order {order_id} (attempt {attempt}/{max_retries})...")
            await generate_and_store_invoice_for_order(order_id)
            logger.info(f"[BackgroundTasks] Invoice for order {order_id} generated and stored successfully.")
            return
        except Exception as e:
            logger.warning(
                f"[BackgroundTasks] Invoice generation attempt {attempt} failed for order {order_id}: {e}"
            )
            if attempt < max_retries:
                await asyncio.sleep(1.0)
            else:
                logger.error(
                    f"[BackgroundTasks] Exhausted retries for order {order_id} invoice generation. Error: {e}",
                    exc_info=True,
                )


class CreateStripeSessionRequest(BaseModel):
    delivery_method: Optional[str] = Field("HAND_TO_CUSTOMER", description="HAND_TO_CUSTOMER or LEAVE_AT_DOOR")
    payment_method: Optional[str] = Field("ONLINE", description="ONLINE")


@app.post(
    "/api/v1/orders",
    tags=["orders"],
    summary="Create order from active customer cart",
    status_code=status.HTTP_201_CREATED,
)
async def create_order_endpoint(
    background_tasks: BackgroundTasks,
    payload: Optional[CreateOrderRequest] = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Converts the authenticated customer's active cart into a permanent order:
    1. Derives customer_id exclusively from authenticated Bearer token.
    2. Validates that customer profile has a complete delivery address.
    3. Validates that active cart exists and has items.
    4. Executes atomic, transactional database operation:
       - Row locks products FOR UPDATE to prevent race conditions & overselling
       - Verifies product existence, active shop match, availability, non-archived status
       - Checks stock >= requested quantity
       - Reads live product price at purchase time
       - Atomically deducts stock
       - Snapshots immutable product information and prices into order_items
       - Snapshots customer delivery address into orders
       - Clears/converts the active cart
    5. Returns the created order with its snapshot items and totals.
    """
    customer_id = current_user["id"]

    deliv_method = "HAND_TO_CUSTOMER"
    if payload and payload.delivery_method:
        dm_clean = payload.delivery_method.strip().upper()
        if dm_clean in ("HAND_TO_CUSTOMER", "LEAVE_AT_DOOR"):
            deliv_method = dm_clean

    pay_method = "COD"
    if payload and payload.payment_method:
        pm_clean = payload.payment_method.strip().upper()
        if pm_clean in ("COD", "ONLINE"):
            pay_method = pm_clean

    if deliv_method == "LEAVE_AT_DOOR" and pay_method == "COD":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cash on Delivery is not available for Leave-at-Door delivery. Please select Online Payment.",
        )

    # 1. Validate complete delivery address snapshot from profile
    user = await get_user_by_id(customer_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer profile not found.",
        )

    name = (user.get("name") or "").strip()
    phone = (user.get("phone") or "").strip()
    address = (user.get("address") or "").strip()
    city = (user.get("city") or "").strip()
    state_val = (user.get("state") or "").strip()
    pincode = (user.get("pincode") or "").strip()

    missing = []
    if not name:
        missing.append("full name")
    if not phone:
        missing.append("phone number")
    if not address:
        missing.append("street address")
    if not city:
        missing.append("city")
    if not state_val:
        missing.append("state")
    if not pincode:
        missing.append("pincode")

    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Your delivery profile is incomplete. Please update your {', '.join(missing)} "
                "in your Profile before placing an order."
            ),
        )

    delivery_snapshot = {
        "name": name,
        "phone": phone,
        "address": address,
        "city": city,
        "state": state_val,
        "pincode": pincode,
    }

    # 2. Check active cart existence and item count before entering transaction
    cart = await get_active_cart_by_customer_id(customer_id)
    if not cart:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active shopping cart found. Add products to your cart before placing an order.",
        )

    cart_items = await get_cart_items(cart["id"])
    if not cart_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your cart is empty. Please add products before placing an order.",
        )

    # 3. Execute atomic transaction in PostgreSQL
    try:
        order_data = await create_order_transaction(
            customer_id=customer_id,
            delivery=delivery_snapshot,
            payment_method="COD",
            payment_status="PENDING",
            delivery_method=deliv_method,
        )
    except OrderError as oe:
        raise HTTPException(
            status_code=oe.status_code,
            detail=oe.message,
        )
    except Exception as exc:
        logger.error(f"Unexpected error creating order: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while placing your order. Please try again.",
        )

    # M9/M10: Non-blocking invoice generation for COD order via BackgroundTasks
    background_tasks.add_task(_safe_background_generate_invoice, order_data["id"])

    return {
        "status": "ok",
        "message": "Order created successfully.",
        "order": order_data,
        **order_data,
    }


# ---------------------------------------------------------------------------
# Milestone M6: Stripe Test Mode Checkout & Payments
# ---------------------------------------------------------------------------

@app.post(
    "/api/v1/checkout/stripe/create-session",
    tags=["checkout", "payments"],
    summary="Create Stripe Checkout Session from authenticated cart",
    status_code=status.HTTP_200_OK,
)
async def create_stripe_checkout_session(
    request: Request,
    payload: Optional[CreateStripeSessionRequest] = None,
    current_user: Dict[str, Any] = Depends(require_customer),
):
    """
    Creates an authoritative Stripe Checkout Session for the customer's active cart.
    - Validates delivery profile completeness from PostgreSQL
    - Validates cart items, product availability, and stock >= quantity
    - Atomically creates order in PostgreSQL with payment_method='ONLINE', payment_status='PENDING'
    - Reserves inventory by deducting stock atomically (per M5 rules)
    - Creates Stripe Checkout session in Test Mode
    - Returns Stripe checkout URL for frontend redirect
    """
    customer_id = current_user["id"]

    deliv_method = "HAND_TO_CUSTOMER"
    if payload and payload.delivery_method:
        dm_clean = payload.delivery_method.strip().upper()
        if dm_clean in ("HAND_TO_CUSTOMER", "LEAVE_AT_DOOR"):
            deliv_method = dm_clean

    pay_method = "ONLINE"
    if payload and payload.payment_method:
        pm_clean = payload.payment_method.strip().upper()
        if pm_clean in ("COD", "ONLINE"):
            pay_method = pm_clean

    if deliv_method == "LEAVE_AT_DOOR" and pay_method == "COD":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cash on Delivery is not available for Leave-at-Door delivery. Please select Online Payment.",
        )

    if pay_method == "COD":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Stripe checkout requires Online Payment. For Cash on Delivery, please use the standard checkout.",
        )

    # 1. Delivery profile verification
    name = (current_user.get("name") or "").strip()
    phone = (current_user.get("phone") or "").strip()
    address = (current_user.get("address") or "").strip()
    city = (current_user.get("city") or "").strip()
    state_val = (current_user.get("state") or "").strip()
    pincode = (current_user.get("pincode") or "").strip()

    missing = []
    if not name: missing.append("Full Name")
    if not phone: missing.append("Phone Number")
    if not address: missing.append("Street Address")
    if not city: missing.append("City")
    if not state_val: missing.append("State")
    if not pincode: missing.append("Pincode")

    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Please complete required delivery profile fields before checkout: {', '.join(missing)}.",
        )

    delivery_snapshot = {
        "name": name,
        "phone": phone,
        "address": address,
        "city": city,
        "state": state_val,
        "pincode": pincode,
    }

    # 2. Check active cart existence and items
    cart = await get_active_cart_by_customer_id(customer_id)
    if not cart:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active shopping cart found. Add products to your cart before checking out.",
        )

    cart_items = await get_cart_items_with_products(cart["id"])
    if not cart_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your cart is empty. Please add products before checking out.",
        )

    # 3. Verify Stripe secret key
    api_key = settings.stripe_secret_key or os.getenv("STRIPE_SECRET_KEY", "")
    if not api_key:
        logger.error("STRIPE_SECRET_KEY is not configured in backend settings/environment.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe online payment is not configured. Please set STRIPE_SECRET_KEY in backend/.env.",
        )

    # 4. Atomically create order with payment_method='ONLINE', payment_status='PENDING'
    try:
        order_data = await create_order_transaction(
            customer_id=customer_id,
            delivery=delivery_snapshot,
            payment_method="ONLINE",
            payment_status="PENDING",
            delivery_method=deliv_method,
        )
    except OrderError as oe:
        raise HTTPException(status_code=oe.status_code, detail=oe.message)
    except Exception as exc:
        logger.error(f"Error creating order for Stripe checkout: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while preparing your order. Please try again.",
        )

    # 5. Build authoritative line items for Stripe Checkout
    stripe_line_items = []
    items_source = order_data.get("items") or []
    if items_source:
        for it in items_source:
            p_name = it.get("product_name_snapshot") or "Grocery Item"
            p_unit = it.get("unit_label_snapshot") or "piece"
            p_price = float(it.get("unit_price") or 0.0)
            unit_amount_cents = int(round(p_price * 100))
            stripe_line_items.append({
                "price_data": {
                    "currency": "inr",
                    "product_data": {
                        "name": f"{p_name} ({p_unit})",
                    },
                    "unit_amount": unit_amount_cents,
                },
                "quantity": int(it.get("quantity") or 1),
            })
    else:
        for it in cart_items:
            prod = it.get("product") or {}
            p_name = it.get("product_name") or prod.get("name") or "Grocery Item"
            p_unit = it.get("product_unit_label") or prod.get("unit_label") or "piece"
            p_price = float(it.get("product_price") or it.get("unit_price") or 0.0)
            unit_amount_cents = int(round(p_price * 100))
            stripe_line_items.append({
                "price_data": {
                    "currency": "inr",
                    "product_data": {
                        "name": f"{p_name} ({p_unit})",
                    },
                    "unit_amount": unit_amount_cents,
                },
                "quantity": int(it.get("quantity") or 1),
            })

    # 6. Create Stripe Checkout Session
    try:
        stripe.api_key = api_key
        # Safe frontend origin resolution for Stripe Checkout redirects:
        # 1. Normalize configured CORS origins, excluding blank values and wildcard '*'.
        concrete_origins = [o.strip().rstrip("/") for o in settings.cors_origins_list if o.strip() and o.strip() != "*"]

        # 2. In production, require at least one concrete configured origin; fail closed otherwise.
        if settings.is_production and not concrete_origins:
            logger.error("Production configuration error: CORS_ORIGINS must contain at least one valid frontend origin for Stripe Checkout redirects.")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Payment redirection is misconfigured. Please contact support.",
            )

        # 3. Select origin: match incoming request Origin against concrete list, else use primary concrete origin.
        req_origin = (request.headers.get("origin") or "").strip().rstrip("/")
        if req_origin and req_origin in concrete_origins:
            frontend_origin = req_origin
        elif concrete_origins:
            frontend_origin = concrete_origins[0]
        else:
            # Preserved for local development only
            frontend_origin = "http://localhost:5173"

        session = await asyncio.to_thread(
            stripe.checkout.Session.create,
            line_items=stripe_line_items,
            mode="payment",
            client_reference_id=order_data["id"],
            customer_email=current_user.get("email") or None,
            metadata={
                "order_id": order_data["id"],
                "customer_id": customer_id,
                "shop_id": order_data["shop_id"],
            },
            success_url=f"{frontend_origin}/customer?tab=order-success&orderId={order_data['id']}&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{frontend_origin}/customer?tab=checkout&orderId={order_data['id']}&cancelled=true",
        )

        # Store Stripe session ID on order
        await update_order_stripe_session(order_data["id"], session.id)

        return {
            "status": "ok",
            "checkout_url": session.url,
            "session_id": session.id,
            "order_id": order_data["id"],
            "order": order_data,
        }
    except Exception as e:
        logger.error(f"Failed to create Stripe Checkout Session: {e}", exc_info=True)
        # Roll back order and restore stock if Stripe session creation fails
        await cancel_order_and_restore_stock(order_data["id"], reason=f"Stripe session creation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Unable to connect to Stripe Checkout: {str(e)}",
        )


@app.post(
    "/api/v1/payments/webhook",
    tags=["payments"],
    summary="Stripe Webhook Handler",
    status_code=status.HTTP_200_OK,
)
async def stripe_webhook_endpoint(request: Request, background_tasks: BackgroundTasks):
    """
    Receives and processes asynchronous Stripe events.
    - Verifies Stripe cryptographic signature using STRIPE_WEBHOOK_SECRET.
    - Enforces idempotency via public.stripe_webhook_events table.
    - On checkout.session.completed: marks order as PAID, confirms order, keeps stock deducted.
    - On payment failure or checkout session expiration: marks order CANCELLED, restores inventory.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    webhook_secret = settings.stripe_webhook_secret or os.getenv("STRIPE_WEBHOOK_SECRET", "")
    api_key = settings.stripe_secret_key or os.getenv("STRIPE_SECRET_KEY", "")
    stripe.api_key = api_key

    if not webhook_secret:
        logger.error("Stripe webhook received but STRIPE_WEBHOOK_SECRET is not configured.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook signing secret is not configured on the server",
        )

    if not sig_header:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing stripe-signature header",
        )

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, webhook_secret
        )
    except ValueError as e:
        logger.error(f"Stripe webhook payload error: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload")
    except stripe.error.SignatureVerificationError as e:
        logger.error(f"Stripe webhook signature verification failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")
    except Exception as e:
        logger.error(f"Stripe webhook parsing error: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    event_id = event.get("id", "")
    event_type = event.get("type", "")
    data_object = event.get("data", {}).get("object", {})
    order_id = data_object.get("client_reference_id") or data_object.get("metadata", {}).get("order_id")

    # Idempotency check: record event in public.stripe_webhook_events
    if event_id:
        is_new = await record_stripe_webhook_event(event_id, event_type, order_id)
        if not is_new:
            logger.info(f"Duplicate Stripe webhook event {event_id} skipped.")
            return {"status": "ok", "message": "Duplicate event ignored"}

    logger.info(f"Processing Stripe webhook event: {event_type} for order: {order_id}")

    if event_type == "checkout.session.completed":
        session_id = data_object.get("id")
        payment_intent_id = data_object.get("payment_intent")
        if order_id:
            await update_order_payment_status(
                order_id=order_id,
                payment_status="PAID",
                order_status="PENDING",
                stripe_payment_intent_id=payment_intent_id,
                stripe_session_id=session_id,
            )
            logger.info(f"Order {order_id} marked as PAID and PENDING via Stripe webhook.")
            # M9/M10: Non-blocking background invoice generation upon successful Stripe payment
            background_tasks.add_task(_safe_background_generate_invoice, order_id)

    elif event_type in ("checkout.session.expired", "checkout.session.async_payment_failed"):
        if order_id:
            await cancel_order_and_restore_stock(
                order_id=order_id,
                reason=f"Stripe webhook: {event_type}",
            )
            logger.info(f"Order {order_id} cancelled and stock restored via Stripe webhook ({event_type}).")

    return {"status": "ok", "received": True, "event": event_type}


@app.post(
    "/api/v1/orders/{order_id}/sync-stripe-session",
    tags=["orders"],
    summary="Synchronize verified Stripe Checkout session status",
    status_code=status.HTTP_200_OK,
)
async def sync_stripe_session_endpoint(
    order_id: str,
    background_tasks: BackgroundTasks,
    session_id: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_customer),
):
    """
    Called upon return to Order Success page.
    Directly queries Stripe API with the secret key to verify session payment status.
    Never trusts client input; verifies that:
    1. Session client_reference_id matches order_id
    2. Session payment_status is 'paid'
    If verified, marks order as PAID and CONFIRMED.
    """
    order = await get_order_by_id(order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if str(order["customer_id"]) != str(current_user["id"]) and current_user.get("role") != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # If already marked PAID, ensure invoice generation is scheduled if missing, and return immediately
    if order.get("payment_status") == "PAID":
        existing_inv = await get_invoice_by_order_id(order_id)
        if not existing_inv:
            background_tasks.add_task(_safe_background_generate_invoice, order_id)
        return {"status": "ok", "payment_status": "PAID", "order": order}

    target_session_id = session_id or order.get("stripe_session_id")
    if not target_session_id:
        return {"status": "ok", "payment_status": order.get("payment_status", "PENDING"), "order": order}

    api_key = settings.stripe_secret_key or os.getenv("STRIPE_SECRET_KEY", "")
    if not api_key:
        return {"status": "ok", "payment_status": order.get("payment_status", "PENDING"), "order": order}

    try:
        stripe.api_key = api_key
        # Move synchronous Stripe retrieve to asyncio.to_thread
        session = await asyncio.to_thread(stripe.checkout.Session.retrieve, target_session_id)

        metadata = getattr(session, "metadata", None)
        metadata_order_id = None
        if metadata:
            metadata_order_id = metadata.get("order_id") if isinstance(metadata, dict) else getattr(metadata, "order_id", None)

        sess_order_id = getattr(session, "client_reference_id", None) or metadata_order_id

        if sess_order_id and sess_order_id == order_id:
            payment_status = getattr(session, "payment_status", None)
            session_status = getattr(session, "status", None)
            if payment_status == "paid":
                payment_intent = getattr(session, "payment_intent", None)
                payment_intent_id = payment_intent if isinstance(payment_intent, str) else getattr(payment_intent, "id", None)
                session_id_val = getattr(session, "id", None) or target_session_id

                # Update DB payment state before scheduling background invoice generation
                updated_order = await update_order_payment_status(
                    order_id=order_id,
                    payment_status="PAID",
                    order_status="PENDING",
                    stripe_payment_intent_id=payment_intent_id,
                    stripe_session_id=session_id_val,
                )

                # Schedule background invoice generation without blocking customer response
                background_tasks.add_task(_safe_background_generate_invoice, order_id)

                return {"status": "ok", "payment_status": "PAID", "order": updated_order or order}
            elif session_status == "expired":
                updated_order = await cancel_order_and_restore_stock(
                    order_id=order_id,
                    reason="Stripe checkout session expired",
                )
                return {"status": "ok", "payment_status": "FAILED", "order": updated_order or order}
    except Exception as e:
        logger.warning(f"Error retrieving Stripe session {target_session_id}: {e}")

    return {"status": "ok", "payment_status": order.get("payment_status", "PENDING"), "order": order}


@app.post(
    "/api/v1/orders/{order_id}/cancel-checkout",
    tags=["orders"],
    summary="Cancel unpaid online order and restore stock when user cancels at Stripe",
    status_code=status.HTTP_200_OK,
)
async def cancel_checkout_endpoint(
    order_id: str,
    current_user: Dict[str, Any] = Depends(require_customer),
):
    """
    Cancels an unpaid online order and restores inventory stock when user cancels at Stripe checkout.
    - Validates customer order ownership
    - Only allows cancellation of ONLINE payment method orders (rejects COD orders)
    - Only allows cancellation of orders in CREATED or PENDING state (rejects accepted/preparing/dispatched/delivered/cancelled)
    - Rejects already PAID orders
    - Atomically cancels order and restores inventory
    """
    order = await get_order_by_id(order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if str(order["customer_id"]) != str(current_user["id"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # SEC-01 Guard: Cash on Delivery orders cannot be cancelled via checkout cancel
    if str(order.get("payment_method", "")).upper() != "ONLINE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cash on Delivery orders cannot be cancelled via checkout cancel.",
        )

    # SEC-01 Guard: Orders already paid cannot be cancelled via checkout cancel
    if order.get("payment_status") == "PAID":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Paid orders cannot be cancelled via checkout cancel.",
        )

    # SEC-01 Guard: Only initial checkout states (CREATED, PENDING) can be cancelled
    if order.get("status") not in ("CREATED", "PENDING"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel order with status '{order.get('status')}'.",
        )

    updated_order = await cancel_order_and_restore_stock(order_id, reason="Customer cancelled checkout")
    if not updated_order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    # Handle concurrent race if order was already cancelled or paid between pre-check and atomic cancellation
    if not updated_order.get("cancellation_applied", False):
        canc_status = updated_order.get("cancellation_status")
        if canc_status == "PAID_ORDER" or updated_order.get("payment_status") == "PAID":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Paid orders cannot be cancelled via checkout cancel.",
            )
        if canc_status == "ALREADY_CANCELLED" or updated_order.get("status") == "CANCELLED":
            return {
                "status": "ok",
                "message": "Checkout is already cancelled.",
                "order": updated_order,
            }
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel order with status '{updated_order.get('status')}'.",
        )

    return {
        "status": "ok",
        "message": "Checkout cancelled and stock restored.",
        "order": updated_order,
    }


@app.get(
    "/api/v1/orders",
    tags=["orders"],
    summary="List authenticated customer orders",
    status_code=status.HTTP_200_OK,
)
async def list_orders_endpoint(
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Fetch all orders belonging to the authenticated customer:
    - Own orders only (customer_id = current_user['id'])
    - Newest first (ordered by created_at DESC)
    """
    customer_id = current_user["id"]
    orders = await get_orders_by_customer_id(customer_id)
    return {
        "status": "ok",
        "orders": orders,
        "count": len(orders),
    }


@app.get(
    "/api/v1/orders/{order_id}",
    tags=["orders"],
    summary="Get order details by ID",
    status_code=status.HTTP_200_OK,
)
async def get_order_endpoint(
    order_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Fetch an order by ID. Customer can only access their own orders."""
    order = await get_order_by_id(order_id)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found.",
        )

    if current_user.get("role") != "ADMIN" and str(order["customer_id"]) != str(current_user["id"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view this order.",
        )

    # For customer view, attach active delivery OTP when OUT_FOR_DELIVERY and HAND_TO_CUSTOMER
    delivery_method = order.get("delivery_method") or "HAND_TO_CUSTOMER"
    if order.get("status") == "OUT_FOR_DELIVERY" and delivery_method == "HAND_TO_CUSTOMER":
        otp_info = await get_active_delivery_otp_for_customer(order_id)
        if otp_info is None:
            try:
                otp_info = await create_or_regenerate_delivery_otp(order_id, is_regeneration=False)
            except Exception as e:
                logger.error(f"Error auto-generating OTP on view for order {order_id}: {e}")
                otp_info = None
        order["delivery_otp"] = otp_info
    else:
        order["delivery_otp"] = None

    # M9: Attach invoice metadata if order is eligible
    try:
        inv = await get_invoice_by_order_id(order_id)
        if not inv:
            lock = await get_order_invoice_lock(order_id)
            if not lock.locked():
                eligible, _ = await is_order_eligible_for_invoice(order)
                if eligible:
                    inv = await generate_and_store_invoice_for_order(order_id)
        order["invoice"] = inv
    except Exception as inv_err:
        logger.warning(f"Could not attach invoice for order {order_id}: {inv_err}")
        order["invoice"] = None

    return {
        "status": "ok",
        **order,
        "order": order,
    }


@app.post(
    "/api/v1/orders/{order_id}/regenerate-otp",
    tags=["orders"],
    summary="Customer: Generate New Delivery OTP",
    status_code=status.HTTP_200_OK,
)
async def regenerate_delivery_otp_endpoint(
    order_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Allows authenticated customer to generate a new 6-digit delivery OTP:
    - Customer can only regenerate OTP for their own order
    - Only allowed when order status is strictly OUT_FOR_DELIVERY
    - Only allowed for HAND_TO_CUSTOMER delivery method
    - Invalidate prior OTP and returns fresh active OTP
    """
    order = await get_order_by_id(order_id)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found.",
        )

    if current_user.get("role") != "ADMIN" and str(order["customer_id"]) != str(current_user["id"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to regenerate OTP for this order.",
        )

    if order["status"] != "OUT_FOR_DELIVERY":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot generate OTP for order with status '{order['status']}'. OTP is only available when order is OUT_FOR_DELIVERY.",
        )

    delivery_method = order.get("delivery_method") or "HAND_TO_CUSTOMER"
    if delivery_method != "HAND_TO_CUSTOMER":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This order uses contactless Leave-at-Door delivery. No OTP is required.",
        )

    try:
        otp_info = await create_or_regenerate_delivery_otp(order_id, is_regeneration=True)
    except OrderError as oe:
        headers = {}
        if oe.retry_after:
            headers["Retry-After"] = str(oe.retry_after)
        raise HTTPException(
            status_code=oe.status_code,
            detail=oe.message,
            headers=headers if headers else None,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error regenerating delivery OTP for order {order_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate new delivery OTP. Please try again.",
        )

    return {
        "status": "ok",
        "message": "New delivery OTP generated successfully.",
        "delivery_otp": otp_info,
    }


# ===========================================================================
# Milestone M9: Invoice Generation Endpoints
# ===========================================================================

async def _authorize_invoice_access(order: Dict[str, Any], current_user: Dict[str, Any]) -> None:
    """
    Authorizes access to an order's invoice:
    - Customer who owns the order: ALLOWED
    - Shopkeeper who owns the shop: ALLOWED
    - Admin: ALLOWED
    - Everyone else: HTTP 403 Forbidden
    """
    user_id = str(current_user.get("id") or "")
    role = str(current_user.get("role") or "").upper()

    if role == "ADMIN":
        return

    # Check customer ownership
    if str(order.get("customer_id")) == user_id:
        return

    # Check shopkeeper ownership
    if role == "SHOPKEEPER":
        try:
            shop = await _resolve_shopkeeper_shop(current_user)
            if str(order.get("shop_id")) == str(shop.get("id")):
                return
        except Exception:
            pass

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You are not authorized to view or download the invoice for this order.",
    )


async def get_current_user_flexible(
    token: Optional[str] = Query(None, description="Optional authentication token query parameter"),
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> Dict[str, Any]:
    """
    Supports both Bearer authorization header and ?token= query parameter
    for direct in-browser PDF download or inline streaming.
    """
    raw_token = credentials.credentials if (credentials and credentials.credentials) else token
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )
    insforge_user = await verify_insforge_token(raw_token)
    user_id = insforge_user["id"]
    email = insforge_user.get("email", "")
    db_user = await get_user_by_id(user_id)
    if not db_user:
        db_user = await sync_user(user_id=user_id, email=email)
    return db_user


@app.get(
    "/api/v1/orders/{order_id}/invoice",
    tags=["orders", "invoices"],
    summary="Get order invoice metadata and availability",
    status_code=status.HTTP_200_OK,
)
async def get_order_invoice_endpoint(
    order_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Returns invoice metadata and status for an authorized user:
    - Verifies order ownership (customer, shopkeeper, or admin)
    - Checks invoice eligibility (COD or ONLINE+PAID)
    - Generates invoice on-demand if eligible and not yet created
    - Returns availability status and invoice metadata
    """
    order = await get_order_by_id(order_id)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found.",
        )

    await _authorize_invoice_access(order, current_user)

    eligible, reason = await is_order_eligible_for_invoice(order)
    if not eligible:
        return {
            "status": "unavailable",
            "available": False,
            "message": reason,
            "order_id": order_id,
        }

    # Concurrency check: if background generation is actively running for this order,
    # wait briefly (up to 1.5s) to avoid unnecessary unavailable status or duplicated work.
    lock = await get_order_invoice_lock(order_id)
    if lock.locked():
        try:
            async def _wait_for_lock():
                async with lock:
                    return
            await asyncio.wait_for(_wait_for_lock(), timeout=1.5)
        except asyncio.TimeoutError:
            return {
                "status": "processing",
                "available": False,
                "message": "Invoice generation is in progress. Please check back in a moment.",
                "order_id": order_id,
            }

    try:
        invoice = await get_invoice_by_order_id(order_id)
        if not invoice:
            invoice = await generate_and_store_invoice_for_order(order_id)
        else:
            inv_up = str(invoice.get("updated_at") or "")
            ord_up = str(order.get("updated_at") or "")
            if inv_up and ord_up and inv_up < ord_up:
                invoice = await generate_and_store_invoice_for_order(order_id, force_refresh=True)

        # Confirm invoice record has a valid storage key
        if not invoice or not invoice.get("storage_key"):
            return {
                "status": "processing",
                "available": False,
                "message": "Invoice PDF is being prepared. Please check back shortly.",
                "order_id": order_id,
            }

        return {
            "status": "ok",
            "available": True,
            "invoice": invoice,
            "download_url": f"/api/v1/orders/{order_id}/invoice/download",
        }
    except Exception as e:
        logger.error(f"Error fetching/generating invoice for order {order_id}: {e}", exc_info=True)
        return {
            "status": "processing",
            "available": False,
            "message": "Invoice generation in progress or temporarily unavailable.",
            "order_id": order_id,
        }


@app.get(
    "/api/v1/orders/{order_id}/invoice/download",
    tags=["orders", "invoices"],
    summary="Securely stream or download order invoice PDF",
)
async def download_order_invoice_endpoint(
    order_id: str,
    download: bool = False,
    current_user: Dict[str, Any] = Depends(get_current_user_flexible),
):
    """
    Securely streams the invoice PDF for an authorized user:
    - Authorizes order ownership (customer, shopkeeper, or admin)
    - Verifies eligibility (COD or ONLINE+PAID)
    - Fetches PDF from private storage or generates on-demand
    - Returns application/pdf stream with inline or attachment disposition
    - Never exposes direct public storage URLs
    """
    order = await get_order_by_id(order_id)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found.",
        )

    await _authorize_invoice_access(order, current_user)

    eligible, reason = await is_order_eligible_for_invoice(order)
    if not eligible:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=reason,
        )

    try:
        invoice, pdf_bytes = await get_invoice_pdf_bytes_for_order(order_id)
    except OrderError as oe:
        raise HTTPException(status_code=oe.status_code, detail=oe.message)
    except Exception as e:
        logger.error(f"Error streaming invoice PDF for order {order_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate or retrieve invoice PDF.",
        )

    filename = f"{invoice['invoice_number']}.pdf"
    disposition = "attachment" if download else "inline"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            "Cache-Control": "private, no-cache, no-store, must-revalidate",
            "X-Content-Type-Options": "nosniff",
        },
    )


# ===========================================================================
# Milestone M5: Shopkeeper Order Management Endpoints
# ===========================================================================

@app.get(
    "/api/v1/shopkeeper/orders",
    tags=["shopkeeper"],
    summary="Shopkeeper: View Shop Orders",
    status_code=status.HTTP_200_OK,
)
async def shopkeeper_list_orders_endpoint(
    status: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_shopkeeper),
):
    """
    List orders belonging strictly to the authenticated shopkeeper's shop:
    - Enforces shop ownership (resolves shop from authenticated token)
    - Orders ordered newest first
    - Optional status filter (PENDING, CONFIRMED, DELIVERED, CANCELLED, ALL)
    """
    shop = await _resolve_shopkeeper_shop(current_user)
    orders = await get_orders_by_shop_id(shop["id"], status_filter=status)
    return {
        "status": "ok",
        "shop_id": shop["id"],
        "count": len(orders),
        "orders": orders,
    }


@app.get(
    "/api/v1/shopkeeper/orders/{order_id}",
    tags=["shopkeeper"],
    summary="Shopkeeper: View Single Order Details",
    status_code=status.HTTP_200_OK,
)
async def shopkeeper_get_order_endpoint(
    order_id: str,
    current_user: Dict[str, Any] = Depends(require_shopkeeper),
):
    """
    Fetch single order details for the authenticated shopkeeper's shop:
    - Enforces shop ownership: shopkeeper can ONLY access their own shop's orders.
    """
    shop = await _resolve_shopkeeper_shop(current_user)
    order = await get_order_by_id(order_id)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found.",
        )
    if str(order["shop_id"]) != str(shop["id"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view orders from another store.",
        )
    # Shopkeeper only receives/views online orders once payment is confirmed PAID
    if str(order.get("payment_method", "")).upper() == "ONLINE" and order.get("payment_status") != "PAID":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found or awaiting online payment confirmation.",
        )
    raw_status = order["status"]
    display_status = "PENDING" if raw_status == "CREATED" else raw_status
    order_copy = dict(order)
    order_copy["status"] = display_status
    order_copy["raw_status"] = raw_status
    order_copy["payment_method"] = order.get("payment_method") or "COD"
    order_copy["payment_status"] = order.get("payment_status") or "PENDING"
    order_copy["stripe_session_id"] = order.get("stripe_session_id")
    order_copy["stripe_payment_intent_id"] = order.get("stripe_payment_intent_id")
    order_copy["cancellation_reason"] = order.get("cancellation_reason")
    order_copy["refund_status"] = order.get("refund_status")

    # M9: Attach invoice metadata if eligible
    try:
        inv = await get_invoice_by_order_id(order_id)
        if not inv:
            lock = await get_order_invoice_lock(order_id)
            if not lock.locked():
                eligible, _ = await is_order_eligible_for_invoice(order)
                if eligible:
                    inv = await generate_and_store_invoice_for_order(order_id)
        order_copy["invoice"] = inv
    except Exception:
        order_copy["invoice"] = None

    return {
        "status": "ok",
        "order": order_copy,
        **order_copy,
    }


# ===========================================================================
# Milestone M7.1: Shopkeeper Accept & Cancel Endpoints
# ===========================================================================

class ShopkeeperCancelOrderRequest(BaseModel):
    reason: str


@app.post(
    "/api/v1/shopkeeper/orders/{order_id}/accept",
    tags=["shopkeeper"],
    summary="Shopkeeper: Accept Order",
    status_code=status.HTTP_200_OK,
)
async def shopkeeper_accept_order_endpoint(
    order_id: str,
    current_user: Dict[str, Any] = Depends(require_shopkeeper),
):
    """
    Shopkeeper accepts a PENDING order:
    - Enforces shopkeeper role and shop ownership
    - Validates state transition: PENDING -> ACCEPTED
    - Rejects invalid transitions with clear HTTP errors
    """
    shop = await _resolve_shopkeeper_shop(current_user)
    try:
        updated_order = await shopkeeper_accept_order(order_id=order_id, shop_id=shop["id"])
    except OrderError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.error(f"Error accepting order {order_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to accept order.",
        )

    return {
        "status": "ok",
        "message": "Order successfully accepted.",
        "order": updated_order,
        **updated_order,
    }


@app.post(
    "/api/v1/shopkeeper/orders/{order_id}/cancel",
    tags=["shopkeeper"],
    summary="Shopkeeper: Cancel Order",
    status_code=status.HTTP_200_OK,
)
async def shopkeeper_cancel_order_endpoint(
    order_id: str,
    payload: ShopkeeperCancelOrderRequest,
    current_user: Dict[str, Any] = Depends(require_shopkeeper),
):
    """
    Shopkeeper cancels a PENDING order:
    - Enforces shopkeeper role and shop ownership
    - Requires non-empty cancellation reason
    - Validates state transition: PENDING -> CANCELLED
    - Restores product stock (per existing cancellation implementation)
    - Preserves payment status and snapshots
    - Persists cancellation reason
    - Rejects invalid transitions with clear HTTP errors
    """
    clean_reason = (payload.reason or "").strip()
    if not clean_reason:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cancellation reason is required.",
        )

    shop = await _resolve_shopkeeper_shop(current_user)
    try:
        updated_order = await shopkeeper_cancel_order(
            order_id=order_id,
            shop_id=shop["id"],
            reason=clean_reason,
        )
    except OrderError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.error(f"Error cancelling order {order_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel order.",
        )

    return {
        "status": "ok",
        "message": "Order successfully cancelled.",
        "order": updated_order,
        **updated_order,
    }


# ===========================================================================
# Milestone M7.2: Shopkeeper Preparing & Out For Delivery Endpoints
# ===========================================================================

@app.post(
    "/api/v1/shopkeeper/orders/{order_id}/prepare",
    tags=["shopkeeper"],
    summary="Shopkeeper: Start Preparing Order",
    status_code=status.HTTP_200_OK,
)
async def shopkeeper_prepare_order_endpoint(
    order_id: str,
    current_user: Dict[str, Any] = Depends(require_shopkeeper),
):
    """
    Shopkeeper moves an ACCEPTED order to PREPARING:
    - Enforces shopkeeper role and shop ownership
    - Validates state transition: ACCEPTED -> PREPARING
    - Rejects invalid transitions with clear HTTP errors
    """
    shop = await _resolve_shopkeeper_shop(current_user)
    try:
        updated_order = await shopkeeper_prepare_order(order_id=order_id, shop_id=shop["id"])
    except OrderError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.error(f"Error marking order {order_id} as PREPARING: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update order to PREPARING.",
        )

    return {
        "status": "ok",
        "message": "Order is now being prepared.",
        "order": updated_order,
        **updated_order,
    }


@app.post(
    "/api/v1/shopkeeper/orders/{order_id}/out-for-delivery",
    tags=["shopkeeper"],
    summary="Shopkeeper: Mark Order Out For Delivery",
    status_code=status.HTTP_200_OK,
)
async def shopkeeper_out_for_delivery_order_endpoint(
    order_id: str,
    current_user: Dict[str, Any] = Depends(require_shopkeeper),
):
    """
    Shopkeeper moves a PREPARING order to OUT_FOR_DELIVERY:
    - Enforces shopkeeper role and shop ownership
    - Validates state transition: PREPARING -> OUT_FOR_DELIVERY
    - Rejects invalid transitions with clear HTTP errors
    """
    shop = await _resolve_shopkeeper_shop(current_user)
    try:
        updated_order = await shopkeeper_out_for_delivery_order(order_id=order_id, shop_id=shop["id"])
    except OrderError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.error(f"Error marking order {order_id} as OUT_FOR_DELIVERY: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update order to OUT_FOR_DELIVERY.",
        )

    # Ensure shopkeeper response never contains delivery_otp
    sanitized_order = {k: v for k, v in updated_order.items() if k != "delivery_otp"}

    return {
        "status": "ok",
        "message": "Order is now out for delivery.",
        "order": sanitized_order,
        **sanitized_order,
    }


class VerifyDeliveryOtpRequest(BaseModel):
    otp: str = Field(..., min_length=6, max_length=6, description="6-digit numeric delivery OTP")


@app.post(
    "/api/v1/shopkeeper/orders/{order_id}/verify-delivery-otp",
    tags=["shopkeeper"],
    summary="Shopkeeper: Verify Delivery OTP and Complete Handover",
    status_code=status.HTTP_200_OK,
)
async def shopkeeper_verify_delivery_otp_endpoint(
    order_id: str,
    payload: VerifyDeliveryOtpRequest,
    current_user: Dict[str, Any] = Depends(require_shopkeeper),
):
    """
    Shopkeeper verifies the 6-digit delivery OTP provided by customer:
    - Enforces shopkeeper role and shop ownership
    - Only OUT_FOR_DELIVERY orders can be verified
    - Validates state transition: OUT_FOR_DELIVERY -> DELIVERED
    - Increments attempt count on mismatch (locks after 5 failures)
    - Rejects expired OTPs
    - Never exposes OTP in response
    """
    shop = await _resolve_shopkeeper_shop(current_user)
    try:
        updated_order = await verify_delivery_otp_by_shopkeeper(
            order_id=order_id,
            shop_id=shop["id"],
            otp_input=payload.otp,
        )
    except OrderError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.error(f"Error verifying delivery OTP for order {order_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify delivery OTP.",
        )

    # Ensure shopkeeper response never contains delivery_otp
    sanitized_order = {k: v for k, v in updated_order.items() if k != "delivery_otp"}

    return {
        "status": "ok",
        "message": "Delivery OTP verified successfully. Order marked as DELIVERED.",
        "order": sanitized_order,
        **sanitized_order,
    }


@app.post(
    "/api/v1/shopkeeper/orders/{order_id}/mark-delivered",
    tags=["shopkeeper"],
    summary="Shopkeeper: Mark Leave-at-Door Order Delivered",
    status_code=status.HTTP_200_OK,
)
async def shopkeeper_mark_delivered_endpoint(
    order_id: str,
    current_user: Dict[str, Any] = Depends(require_shopkeeper),
):
    """
    Shopkeeper marks a LEAVE_AT_DOOR order as DELIVERED:
    - Enforces shopkeeper role and shop ownership
    - Only OUT_FOR_DELIVERY orders can be transitioned to DELIVERED
    - Only allowed for LEAVE_AT_DOOR orders (HAND_TO_CUSTOMER requires OTP)
    """
    shop = await _resolve_shopkeeper_shop(current_user)
    try:
        updated_order = await mark_order_delivered_leave_at_door(
            order_id=order_id,
            shop_id=shop["id"],
        )
    except OrderError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        logger.error(f"Error marking order {order_id} as DELIVERED: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update order to DELIVERED.",
        )

    sanitized_order = {k: v for k, v in updated_order.items() if k != "delivery_otp"}

    return {
        "status": "ok",
        "message": "Order marked as DELIVERED successfully.",
        "order": sanitized_order,
        **sanitized_order,
    }







