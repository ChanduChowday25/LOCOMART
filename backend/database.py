"""
LOCOMART — Database Layer (M1)
Provides async access to the PostgreSQL database hosted on InsForge.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import httpx

from config import get_settings
from http_client import get_http_client

logger = logging.getLogger("locomart.database")
settings = get_settings()


async def execute_sql(query: str) -> List[Dict[str, Any]]:
    """
    Executes a SQL query against InsForge PostgreSQL via the advance rawsql API.
    Reuses the shared pooled httpx.AsyncClient for high performance.
    Returns list of row dictionaries.
    """
    url = f"{settings.insforge_url}/api/database/advance/rawsql"
    headers = {
        "Authorization": f"Bearer {settings.insforge_api_key}",
        "Content-Type": "application/json",
    }
    payload = {"query": query}

    client = await get_http_client()
    response = await client.post(url, headers=headers, json=payload, timeout=15.0)
    response.raise_for_status()
    data = response.json()
    return data.get("rows", [])



def _escape(val: Optional[str]) -> str:
    """Escapes string literals for safe SQL embedding in rawsql queries."""
    if val is None:
        return "NULL"
    # replace single quote with two single quotes
    clean = str(val).replace("'", "''")
    return f"'{clean}'"


async def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    """Fetch user by InsForge user ID from public.users."""
    escaped_id = _escape(user_id)
    query = f"SELECT id, email, role, name, phone, address, city, state, pincode, created_at, updated_at FROM public.users WHERE id = {escaped_id} LIMIT 1;"
    rows = await execute_sql(query)
    return rows[0] if rows else None


async def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Fetch user by email from public.users."""
    escaped_email = _escape(email.strip().lower())
    query = f"SELECT id, email, role, name, phone, address, city, state, pincode, created_at, updated_at FROM public.users WHERE LOWER(email) = {escaped_email} LIMIT 1;"
    rows = await execute_sql(query)
    return rows[0] if rows else None


async def sync_user(user_id: str, email: str, name: str = "") -> Dict[str, Any]:
    """
    Synchronizes an authenticated InsForge user into public.users.
    
    CRITICAL SECURITY RULE:
    - If user does not exist, insert with role = 'CUSTOMER'.
    - Normal registration/sync must NEVER assign 'ADMIN' or 'SHOPKEEPER'.
    - If user already exists, preserve their existing role.
    """
    existing = await get_user_by_id(user_id)
    if not existing:
        # Check by email in case of ID linking
        existing_by_email = await get_user_by_email(email)
        if existing_by_email:
            old_id = existing_by_email.get("id")
            # Update user ID while preserving role
            escaped_id = _escape(user_id)
            escaped_email = _escape(email.strip().lower())
            query = f"""
                UPDATE public.users 
                SET id = {escaped_id}, updated_at = CURRENT_TIMESTAMP 
                WHERE LOWER(email) = {escaped_email}
                RETURNING id, email, role, name, phone, address, city, state, pincode;
            """
            rows = await execute_sql(query)
            if old_id and old_id != user_id:
                esc_old_id = _escape(old_id)
                await execute_sql(f"UPDATE public.shops SET owner_id = {escaped_id}, updated_at = CURRENT_TIMESTAMP WHERE owner_id = {esc_old_id};")
            return rows[0] if rows else existing_by_email

        # Brand new user: Insert with role = CUSTOMER
        esc_id = _escape(user_id)
        esc_email = _escape(email.strip().lower())
        esc_name = _escape(name.strip())
        query = f"""
            INSERT INTO public.users (id, email, role, name, phone, address, city, state, pincode, created_at, updated_at)
            VALUES ({esc_id}, {esc_email}, 'CUSTOMER', {esc_name}, '', '', '', '', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id, email, role, name, phone, address, city, state, pincode, created_at, updated_at;
        """
        rows = await execute_sql(query)
        if rows:
            logger.info(f"Registered new CUSTOMER in public.users: {email}")
            return rows[0]
        # Fallback fetch
        return await get_user_by_id(user_id)

    # Existing user: update name if provided and not already set
    if name and not existing.get("name"):
        esc_id = _escape(user_id)
        esc_name = _escape(name.strip())
        query = f"""
            UPDATE public.users 
            SET name = {esc_name}, updated_at = CURRENT_TIMESTAMP 
            WHERE id = {esc_id}
            RETURNING id, email, role, name, phone, address, city, state, pincode;
        """
        rows = await execute_sql(query)
        if rows:
            return rows[0]

    return existing


async def update_user_profile(
    user_id: str,
    name: str,
    phone: str,
    address: str,
    city: str,
    state: str,
    pincode: str,
) -> Dict[str, Any]:
    """
    Updates customer profile fields in public.users.
    Ownership is strictly enforced by user_id from the verified session.
    """
    esc_id = _escape(user_id)
    esc_name = _escape(name.strip())
    esc_phone = _escape(phone.strip())
    esc_address = _escape(address.strip())
    esc_city = _escape(city.strip())
    esc_state = _escape(state.strip())
    esc_pincode = _escape(pincode.strip())

    query = f"""
        UPDATE public.users
        SET name = {esc_name},
            phone = {esc_phone},
            address = {esc_address},
            city = {esc_city},
            state = {esc_state},
            pincode = {esc_pincode},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = {esc_id}
        RETURNING id, email, role, name, phone, address, city, state, pincode, created_at, updated_at;
    """
    rows = await execute_sql(query)
    if not rows:
        raise ValueError(f"User with ID {user_id} not found")
    return rows[0]


async def set_user_role(email_or_id: str, new_role: str) -> Optional[Dict[str, Any]]:
    """
    Administrative utility to promote/set role (CUSTOMER, SHOPKEEPER, ADMIN).
    Used by developer CLI or controlled administrative script.
    """
    new_role = new_role.upper().strip()
    if new_role not in ("CUSTOMER", "SHOPKEEPER", "ADMIN"):
        raise ValueError("Invalid role. Must be CUSTOMER, SHOPKEEPER, or ADMIN")

    esc_val = _escape(email_or_id.strip())
    esc_role = _escape(new_role)
    query = f"""
        UPDATE public.users
        SET role = {esc_role}, updated_at = CURRENT_TIMESTAMP
        WHERE id = {esc_val} OR LOWER(email) = LOWER({esc_val})
        RETURNING id, email, role, name;
    """
    rows = await execute_sql(query)
    return rows[0] if rows else None


# ---------------------------------------------------------------------------
# M2: Shopkeeper Applications & Shop Management
# ---------------------------------------------------------------------------

async def get_application_by_id(application_id: str) -> Optional[Dict[str, Any]]:
    """Fetch an application by its ID."""
    esc_id = _escape(application_id)
    query = f"SELECT * FROM public.shopkeeper_applications WHERE id = {esc_id} LIMIT 1;"
    rows = await execute_sql(query)
    return rows[0] if rows else None


async def get_latest_user_application(user_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch the most relevant application for a user.
    Prioritizes PENDING, then most recent by created_at.
    """
    esc_id = _escape(user_id)
    query = f"""
        SELECT * FROM public.shopkeeper_applications 
        WHERE user_id = {esc_id}
        ORDER BY 
            CASE WHEN status = 'PENDING' THEN 1 ELSE 2 END,
            created_at DESC
        LIMIT 1;
    """
    rows = await execute_sql(query)
    return rows[0] if rows else None


async def get_pending_user_application(user_id: str) -> Optional[Dict[str, Any]]:
    """Check if the user already has an active PENDING application."""
    esc_id = _escape(user_id)
    query = f"""
        SELECT * FROM public.shopkeeper_applications 
        WHERE user_id = {esc_id} AND status = 'PENDING'
        LIMIT 1;
    """
    rows = await execute_sql(query)
    return rows[0] if rows else None


async def create_shopkeeper_application(
    user_id: str,
    applicant_name: str,
    applicant_email: str,
    applicant_phone: str,
    shop_name: str,
    shop_description: str,
    shop_phone: str,
    shop_address: str,
    city: str,
    state: str,
    pincode: str,
    shop_photo_url: str = "",
    document_url: str = "",
) -> Dict[str, Any]:
    """
    Submits a new shopkeeper application.
    Enforces the rule: Customer can submit one pending application.
    """
    import uuid

    pending = await get_pending_user_application(user_id)
    if pending:
        raise ValueError("You already have an application under review. Please wait for admin approval.")

    app_id = f"app-{uuid.uuid4().hex[:12]}"
    esc_app_id = _escape(app_id)
    esc_user_id = _escape(user_id)
    esc_app_name = _escape(applicant_name.strip())
    esc_app_email = _escape(applicant_email.strip())
    esc_app_phone = _escape(applicant_phone.strip())
    esc_shop_name = _escape(shop_name.strip())
    esc_shop_desc = _escape(shop_description.strip())
    esc_shop_phone = _escape(shop_phone.strip())
    esc_shop_address = _escape(shop_address.strip())
    esc_city = _escape(city.strip())
    esc_state = _escape(state.strip())
    esc_pincode = _escape(pincode.strip())
    esc_photo = _escape(shop_photo_url.strip())
    esc_doc = _escape(document_url.strip())

    query = f"""
        INSERT INTO public.shopkeeper_applications (
            id, user_id, applicant_name, applicant_email, applicant_phone,
            shop_name, shop_description, shop_phone, shop_address,
            city, state, pincode, shop_photo_url, document_url,
            status, rejection_reason, created_at, updated_at
        ) VALUES (
            {esc_app_id}, {esc_user_id}, {esc_app_name}, {esc_app_email}, {esc_app_phone},
            {esc_shop_name}, {esc_shop_desc}, {esc_shop_phone}, {esc_shop_address},
            {esc_city}, {esc_state}, {esc_pincode}, {esc_photo}, {esc_doc},
            'PENDING', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *;
    """
    rows = await execute_sql(query)
    if not rows:
        raise RuntimeError("Failed to create application record")
    return rows[0]


async def get_all_applications(status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Admin: List applications, ordered by pending first, then newest.
    """
    where_clause = ""
    if status_filter and status_filter.upper() in ("PENDING", "APPROVED", "REJECTED"):
        esc_status = _escape(status_filter.upper())
        where_clause = f"WHERE status = {esc_status}"

    query = f"""
        SELECT * FROM public.shopkeeper_applications
        {where_clause}
        ORDER BY 
            CASE WHEN status = 'PENDING' THEN 1 ELSE 2 END,
            created_at DESC;
    """
    return await execute_sql(query)


async def approve_application(application_id: str, admin_id: str) -> Dict[str, Any]:
    """
    Admin: Approves a shopkeeper application.
    Rules:
    - Prevent approving an already reviewed application.
    - Change user role CUSTOMER -> SHOPKEEPER.
    - Create the associated ACTIVE shop from the application data.
    - Ensure shop is available for future customer browsing.
    """
    import uuid

    app = await get_application_by_id(application_id)
    if not app:
        raise ValueError("Application not found")
    if app["status"] != "PENDING":
        raise ValueError(f"Application has already been reviewed (current status: {app['status']})")

    esc_app_id = _escape(application_id)
    esc_admin_id = _escape(admin_id)
    user_id = app["user_id"]
    esc_user_id = _escape(user_id)

    # 1. Update application status
    q_app = f"""
        UPDATE public.shopkeeper_applications
        SET status = 'APPROVED',
            reviewed_by = {esc_admin_id},
            reviewed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = {esc_app_id}
        RETURNING *;
    """
    app_rows = await execute_sql(q_app)
    updated_app = app_rows[0] if app_rows else app

    # 2. Update user role to SHOPKEEPER
    q_user = f"""
        UPDATE public.users
        SET role = 'SHOPKEEPER',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = {esc_user_id};
    """
    await execute_sql(q_user)

    # 3. Create active shop from application data
    shop_id = f"shop-{uuid.uuid4().hex[:12]}"
    esc_shop_id = _escape(shop_id)
    esc_name = _escape(app["shop_name"])
    esc_desc = _escape(app.get("shop_description", ""))
    esc_phone = _escape(app["shop_phone"])
    esc_addr = _escape(app["shop_address"])
    esc_city = _escape(app["city"])
    esc_state = _escape(app["state"])
    esc_pincode = _escape(app["pincode"])
    esc_photo = _escape(app.get("shop_photo_url", ""))

    q_shop = f"""
        INSERT INTO public.shops (
            id, owner_id, name, description, business_phone,
            address, city, state, pincode, photo_url,
            is_active, created_at, updated_at
        ) VALUES (
            {esc_shop_id}, {esc_user_id}, {esc_name}, {esc_desc}, {esc_phone},
            {esc_addr}, {esc_city}, {esc_state}, {esc_pincode}, {esc_photo},
            TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *;
    """
    shop_rows = await execute_sql(q_shop)
    created_shop = shop_rows[0] if shop_rows else None

    return {
        "application": updated_app,
        "shop": created_shop,
    }


async def reject_application(application_id: str, admin_id: str, rejection_reason: str) -> Dict[str, Any]:
    """
    Admin: Rejects a shopkeeper application.
    Rules:
    - Prevent rejecting an already reviewed application.
    - Rejection requires a reason.
    - User remains CUSTOMER.
    """
    if not rejection_reason or not rejection_reason.strip():
        raise ValueError("A clear rejection reason must be provided")

    app = await get_application_by_id(application_id)
    if not app:
        raise ValueError("Application not found")
    if app["status"] != "PENDING":
        raise ValueError(f"Application has already been reviewed (current status: {app['status']})")

    esc_app_id = _escape(application_id)
    esc_admin_id = _escape(admin_id)
    esc_reason = _escape(rejection_reason.strip())

    q = f"""
        UPDATE public.shopkeeper_applications
        SET status = 'REJECTED',
            rejection_reason = {esc_reason},
            reviewed_by = {esc_admin_id},
            reviewed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = {esc_app_id}
        RETURNING *;
    """
    rows = await execute_sql(q)
    return rows[0] if rows else app


async def get_shops(active_only: bool = True) -> List[Dict[str, Any]]:
    """List shops from public.shops."""
    where_clause = "WHERE is_active = TRUE" if active_only else ""
    query = f"SELECT * FROM public.shops {where_clause} ORDER BY name ASC;"
    return await execute_sql(query)


async def get_shop_by_owner_id(owner_id: str) -> Optional[Dict[str, Any]]:
    """Fetch shop belonging to a shopkeeper."""
    esc_id = _escape(owner_id)
    query = f"SELECT * FROM public.shops WHERE owner_id = {esc_id} LIMIT 1;"
    rows = await execute_sql(query)
    return rows[0] if rows else None


async def seed_demo_shops() -> Dict[str, Any]:
    """
    Idempotent seed mechanism for the initial 4 approved demo shops and shopkeeper accounts:
    1. FreshMart
    2. Green Valley Groceries
    3. Sri Lakshmi Stores
    4. Daily Needs Mart
    
    Creates real database records with role = 'SHOPKEEPER' and status = 'ACTIVE'.
    Can be run repeatedly without duplicating records.
    """
    demo_data = [
        {
            "user_id": "664f565e-7e19-444f-a628-f1a6852acf85",
            "email": "shop1@locomart.com",
            "name": "Ramesh Kumar",
            "phone": "+91 98765 00001",
            "shop_id": "shop-demo-freshmart",
            "shop_name": "FreshMart",
            "description": "Fresh farm vegetables, dairy, pantry staples, and daily grocery essentials delivered to your door.",
            "business_phone": "+91 98765 00001",
            "address": "12 Market Road, T. Nagar",
            "city": "Chennai",
            "state": "Tamil Nadu",
            "pincode": "600017",
            "photo_url": "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80",
        },
        {
            "user_id": "4dbe77c2-a6c4-4a5b-a125-6c0e06fc5c01",
            "email": "shop2@locomart.com",
            "name": "Priya Sharma",
            "phone": "+91 98765 00002",
            "shop_id": "shop-demo-greenvalley",
            "shop_name": "Green Valley Groceries",
            "description": "Wholesome organic pulses, aromatic spices, grains, cold-pressed oils, and natural grocery selections.",
            "business_phone": "+91 98765 00002",
            "address": "45 Gandhi Bazaar, Adyar",
            "city": "Chennai",
            "state": "Tamil Nadu",
            "pincode": "600028",
            "photo_url": "https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=800&q=80",
        },
        {
            "user_id": "b89d544c-80e0-4b90-9579-10070bbcbfa0",
            "email": "shop3@locomart.com",
            "name": "Murugan Swamy",
            "phone": "+91 98765 00003",
            "shop_id": "shop-demo-srilakshmi",
            "shop_name": "Sri Lakshmi Stores",
            "description": "Trusted traditional neighborhood provision store for premium rice, dhal, spices, and South Indian culinary essentials.",
            "business_phone": "+91 98765 00003",
            "address": "78 Temple Street, Mylapore",
            "city": "Chennai",
            "state": "Tamil Nadu",
            "pincode": "600004",
            "photo_url": "https://images.unsplash.com/photo-1583258292688-d0213dc5a3a8?auto=format&fit=crop&w=800&q=80",
        },
        {
            "user_id": "3d63593b-85b0-472e-8208-cb85ede4a688",
            "email": "shop4@locomart.com",
            "name": "Anil Verma",
            "phone": "+91 98765 00004",
            "shop_id": "shop-demo-dailyneeds",
            "shop_name": "Daily Needs Mart",
            "description": "One-stop neighborhood mart for packaged groceries, beverages, bakery, snacks, and household cleaning supplies.",
            "business_phone": "+91 98765 00004",
            "address": "22 Station Road, Nungambakkam",
            "city": "Chennai",
            "state": "Tamil Nadu",
            "pincode": "600034",
            "photo_url": "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=800&q=80",
        },
    ]

    seeded_shops = []
    for item in demo_data:
        # 1. Upsert Shopkeeper user
        existing_user = await get_user_by_email(item["email"])
        owner_id = item["user_id"]
        if existing_user:
            owner_id = existing_user["id"]
            esc_id = _escape(owner_id)
            esc_name = _escape(item["name"])
            esc_phone = _escape(item["phone"])
            await execute_sql(f"""
                UPDATE public.users
                SET role = 'SHOPKEEPER', name = {esc_name}, phone = {esc_phone}, updated_at = CURRENT_TIMESTAMP
                WHERE id = {esc_id};
            """)
        else:
            esc_id = _escape(owner_id)
            esc_email = _escape(item["email"].lower())
            esc_name = _escape(item["name"])
            esc_phone = _escape(item["phone"])
            await execute_sql(f"""
                INSERT INTO public.users (id, email, role, name, phone, address, city, state, pincode, created_at, updated_at)
                VALUES ({esc_id}, {esc_email}, 'SHOPKEEPER', {esc_name}, {esc_phone}, '', { _escape(item["city"]) }, { _escape(item["state"]) }, { _escape(item["pincode"]) }, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (id) DO UPDATE SET role = 'SHOPKEEPER', updated_at = CURRENT_TIMESTAMP;
            """)

        # 2. Upsert Shop record
        esc_shop_id = _escape(item["shop_id"])
        esc_owner = _escape(owner_id)
        esc_sname = _escape(item["shop_name"])
        esc_sdesc = _escape(item["description"])
        esc_sphone = _escape(item["business_phone"])
        esc_saddr = _escape(item["address"])
        esc_scity = _escape(item["city"])
        esc_sstate = _escape(item["state"])
        esc_spin = _escape(item["pincode"])
        esc_sphoto = _escape(item["photo_url"])

        # Check existing shop by shop_id or by name
        existing_shops = await execute_sql(f"SELECT id FROM public.shops WHERE id = {esc_shop_id} OR name = {esc_sname} LIMIT 1;")
        if existing_shops:
            target_id = _escape(existing_shops[0]["id"])
            await execute_sql(f"""
                UPDATE public.shops
                SET owner_id = {esc_owner},
                    name = {esc_sname},
                    description = {esc_sdesc},
                    business_phone = {esc_sphone},
                    address = {esc_saddr},
                    city = {esc_scity},
                    state = {esc_sstate},
                    pincode = {esc_spin},
                    photo_url = {esc_sphoto},
                    is_active = TRUE,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = {target_id};
            """)
        else:
            await execute_sql(f"""
                INSERT INTO public.shops (
                    id, owner_id, name, description, business_phone,
                    address, city, state, pincode, photo_url,
                    is_active, created_at, updated_at
                ) VALUES (
                    {esc_shop_id}, {esc_owner}, {esc_sname}, {esc_sdesc}, {esc_sphone},
                    {esc_saddr}, {esc_scity}, {esc_sstate}, {esc_spin}, {esc_sphoto},
                    TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                );
            """)

        # 3. Upsert an approved application for audit tracking
        app_id = f"app-{item['shop_id']}"
        esc_app_id = _escape(app_id)
        existing_app = await execute_sql(f"SELECT id FROM public.shopkeeper_applications WHERE id = {esc_app_id} LIMIT 1;")
        if not existing_app:
            await execute_sql(f"""
                INSERT INTO public.shopkeeper_applications (
                    id, user_id, applicant_name, applicant_email, applicant_phone,
                    shop_name, shop_description, shop_phone, shop_address,
                    city, state, pincode, shop_photo_url, document_url,
                    status, rejection_reason, reviewed_by, reviewed_at, created_at, updated_at
                ) VALUES (
                    {esc_app_id}, {esc_owner}, {esc_name}, {_escape(item['email'])}, {esc_phone},
                    {esc_sname}, {esc_sdesc}, {esc_sphone}, {esc_saddr},
                    {esc_scity}, {esc_sstate}, {esc_spin}, {esc_sphoto}, '',
                    'APPROVED', '', 'system-seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                );
            """)

        seeded_shops.append(item["shop_name"])

    return {
        "status": "ok",
        "message": f"Idempotently seeded {len(seeded_shops)} approved demo shops.",
        "shops": seeded_shops,
    }


# ===========================================================================
# Milestone M3: Shops & Products Database Layer
# ===========================================================================

async def get_shop_by_id(shop_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a shop by its primary key ID."""
    esc_id = _escape(shop_id)
    query = f"SELECT * FROM public.shops WHERE id = {esc_id} LIMIT 1;"
    rows = await execute_sql(query)
    return rows[0] if rows else None


async def update_shop_by_owner_id(owner_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update shop details strictly for the authenticated shopkeeper (owner_id)."""
    current_shop = await get_shop_by_owner_id(owner_id)
    if not current_shop:
        return None

    allowed_fields = [
        "name", "description", "business_phone", "address",
        "city", "state", "pincode", "photo_url", "is_open"
    ]
    set_clauses = []
    for field in allowed_fields:
        if field in updates and updates[field] is not None:
            val = updates[field]
            if isinstance(val, bool):
                set_clauses.append(f"{field} = {str(val).upper()}")
            else:
                set_clauses.append(f"{field} = {_escape(str(val))}")

    if not set_clauses:
        return current_shop

    set_clauses.append("updated_at = CURRENT_TIMESTAMP")
    esc_owner = _escape(owner_id)
    query = f"""
        UPDATE public.shops
        SET {", ".join(set_clauses)}
        WHERE owner_id = {esc_owner}
        RETURNING *;
    """
    rows = await execute_sql(query)
    return rows[0] if rows else None


async def get_products_by_shop_id(
    shop_id: str,
    include_archived: bool = False,
    category: Optional[str] = None,
    search: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Fetch products belonging to a shop."""
    esc_shop_id = _escape(shop_id)
    conditions = [f"shop_id = {esc_shop_id}"]
    if not include_archived:
        conditions.append("is_archived = FALSE")
    if category and category.strip() and category.lower() != "all":
        conditions.append(f"LOWER(category) = {_escape(category.strip().lower())}")
    if search and search.strip():
        term = search.strip().replace("'", "''")
        conditions.append(f"(LOWER(name) LIKE '%{term.lower()}%' OR LOWER(description) LIKE '%{term.lower()}%')")

    where_str = " AND ".join(conditions)
    query = f"SELECT * FROM public.products WHERE {where_str} ORDER BY name ASC;"
    return await execute_sql(query)


async def get_product_by_id(product_id: str) -> Optional[Dict[str, Any]]:
    """Fetch product by ID."""
    esc_id = _escape(product_id)
    query = f"SELECT * FROM public.products WHERE id = {esc_id} LIMIT 1;"
    rows = await execute_sql(query)
    return rows[0] if rows else None


async def create_product(shop_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new product for a shop."""
    import uuid
    prod_id = f"prod-{uuid.uuid4().hex[:10]}"
    esc_id = _escape(prod_id)
    esc_shop_id = _escape(shop_id)
    esc_name = _escape(data.get("name", "").strip())
    esc_desc = _escape(data.get("description", "").strip())
    esc_cat = _escape(data.get("category", "General").strip() or "General")
    esc_unit = _escape(data.get("unit_label", "piece").strip() or "piece")
    price = max(0.0, float(data.get("price", 0.0)))
    stock = max(0, int(data.get("stock", 0)))
    esc_img = _escape(data.get("image_url", "").strip())
    is_avail = "TRUE" if data.get("is_available", True) else "FALSE"

    query = f"""
        INSERT INTO public.products (
            id, shop_id, name, description, category, unit_label,
            price, stock, image_url, is_available, is_archived,
            created_at, updated_at
        ) VALUES (
            {esc_id}, {esc_shop_id}, {esc_name}, {esc_desc}, {esc_cat}, {esc_unit},
            {price}, {stock}, {esc_img}, {is_avail}, FALSE,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *;
    """
    rows = await execute_sql(query)
    return rows[0] if rows else {
        "id": prod_id, "shop_id": shop_id, "name": data.get("name"),
        "description": data.get("description"), "category": data.get("category"),
        "unit_label": data.get("unit_label"), "price": price, "stock": stock,
        "image_url": data.get("image_url"), "is_available": data.get("is_available", True),
        "is_archived": False,
    }


async def update_product(product_id: str, shop_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update a product ensuring it belongs to the shopkeeper's shop."""
    current = await get_product_by_id(product_id)
    if not current or current["shop_id"] != shop_id or current.get("is_archived"):
        return None

    set_clauses = []
    if "name" in data and data["name"] is not None:
        set_clauses.append(f"name = {_escape(data['name'].strip())}")
    if "description" in data and data["description"] is not None:
        set_clauses.append(f"description = {_escape(data['description'].strip())}")
    if "category" in data and data["category"] is not None:
        set_clauses.append(f"category = {_escape(data['category'].strip())}")
    if "unit_label" in data and data["unit_label"] is not None:
        set_clauses.append(f"unit_label = {_escape(data['unit_label'].strip())}")
    if "price" in data and data["price"] is not None:
        p = max(0.0, float(data["price"]))
        set_clauses.append(f"price = {p}")
    if "stock" in data and data["stock"] is not None:
        s = max(0, int(data["stock"]))
        set_clauses.append(f"stock = {s}")
    if "image_url" in data and data["image_url"] is not None:
        set_clauses.append(f"image_url = {_escape(data['image_url'].strip())}")
    if "is_available" in data and data["is_available"] is not None:
        set_clauses.append(f"is_available = {'TRUE' if data['is_available'] else 'FALSE'}")

    if not set_clauses:
        return current

    set_clauses.append("updated_at = CURRENT_TIMESTAMP")
    esc_prod_id = _escape(product_id)
    esc_shop_id = _escape(shop_id)

    query = f"""
        UPDATE public.products
        SET {", ".join(set_clauses)}
        WHERE id = {esc_prod_id} AND shop_id = {esc_shop_id}
        RETURNING *;
    """
    rows = await execute_sql(query)
    return rows[0] if rows else None


async def update_product_stock(product_id: str, shop_id: str, stock: int) -> Optional[Dict[str, Any]]:
    """Update stock quantity with non-negative validation and ownership enforcement."""
    stock = max(0, int(stock))
    esc_prod_id = _escape(product_id)
    esc_shop_id = _escape(shop_id)
    query = f"""
        UPDATE public.products
        SET stock = {stock}, updated_at = CURRENT_TIMESTAMP
        WHERE id = {esc_prod_id} AND shop_id = {esc_shop_id} AND is_archived = FALSE
        RETURNING *;
    """
    rows = await execute_sql(query)
    return rows[0] if rows else None


async def update_product_availability(product_id: str, shop_id: str, is_available: bool) -> Optional[Dict[str, Any]]:
    """Toggle product availability with ownership enforcement."""
    avail_val = "TRUE" if is_available else "FALSE"
    esc_prod_id = _escape(product_id)
    esc_shop_id = _escape(shop_id)
    query = f"""
        UPDATE public.products
        SET is_available = {avail_val}, updated_at = CURRENT_TIMESTAMP
        WHERE id = {esc_prod_id} AND shop_id = {esc_shop_id} AND is_archived = FALSE
        RETURNING *;
    """
    rows = await execute_sql(query)
    return rows[0] if rows else None


async def archive_product(product_id: str, shop_id: str) -> bool:
    """Soft-delete/archive a product with ownership enforcement."""
    esc_prod_id = _escape(product_id)
    esc_shop_id = _escape(shop_id)
    query = f"""
        UPDATE public.products
        SET is_archived = TRUE, is_available = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE id = {esc_prod_id} AND shop_id = {esc_shop_id}
        RETURNING id;
    """
    rows = await execute_sql(query)
    return len(rows) > 0


# ===========================================================================
# Milestone M4.1: Customer Cart Database Layer
# ===========================================================================

async def ensure_cart_tables_exist() -> None:
    """
    Idempotent DDL execution to guarantee public.carts and public.cart_items
    tables, foreign keys, and constraints exist in PostgreSQL.
    """
    ddl = """
    CREATE TABLE IF NOT EXISTS public.carts (
        id VARCHAR(255) PRIMARY KEY,
        customer_id VARCHAR(255) NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        shop_id VARCHAR(255) NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CONVERTED', 'ABANDONED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_customer_active_cart UNIQUE (customer_id)
    );

    CREATE TABLE IF NOT EXISTS public.cart_items (
        id VARCHAR(255) PRIMARY KEY,
        cart_id VARCHAR(255) NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
        product_id VARCHAR(255) NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_cart_product UNIQUE (cart_id, product_id)
    );

    CREATE INDEX IF NOT EXISTS idx_carts_customer_id ON public.carts (customer_id);
    CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items (cart_id);
    CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON public.cart_items (product_id);
    """
    try:
        await execute_sql(ddl)
    except Exception as e:
        logger.warning(f"Notice during cart table verification: {e}")


async def get_active_cart_by_customer_id(customer_id: str) -> Optional[Dict[str, Any]]:
    """Fetch the active cart for a specific customer."""
    esc_customer_id = _escape(customer_id)
    query = f"""
        SELECT * FROM public.carts
        WHERE customer_id = {esc_customer_id} AND status = 'ACTIVE'
        LIMIT 1;
    """
    rows = await execute_sql(query)
    return rows[0] if rows else None


async def get_cart_by_id(cart_id: str) -> Optional[Dict[str, Any]]:
    """Fetch cart by primary key ID."""
    esc_id = _escape(cart_id)
    query = f"SELECT * FROM public.carts WHERE id = {esc_id} LIMIT 1;"
    rows = await execute_sql(query)
    return rows[0] if rows else None


async def create_cart(customer_id: str, shop_id: str) -> Dict[str, Any]:
    """
    Create a new active cart for a customer belonging to exactly one shop.
    Uses ON CONFLICT (customer_id) DO UPDATE to guarantee only one active cart.
    """
    import uuid
    cart_id = f"cart-{uuid.uuid4().hex[:12]}"
    esc_id = _escape(cart_id)
    esc_customer = _escape(customer_id)
    esc_shop = _escape(shop_id)

    query = f"""
        INSERT INTO public.carts (id, customer_id, shop_id, status, created_at, updated_at)
        VALUES ({esc_id}, {esc_customer}, {esc_shop}, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (customer_id) DO UPDATE
        SET shop_id = {esc_shop}, status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
        RETURNING *;
    """
    rows = await execute_sql(query)
    return rows[0] if rows else {
        "id": cart_id,
        "customer_id": customer_id,
        "shop_id": shop_id,
        "status": "ACTIVE",
    }


async def update_cart_shop(cart_id: str, new_shop_id: str) -> Optional[Dict[str, Any]]:
    """Update shop_id of an active cart (e.g., when previous cart had 0 items)."""
    esc_id = _escape(cart_id)
    esc_shop = _escape(new_shop_id)
    query = f"""
        UPDATE public.carts
        SET shop_id = {esc_shop}, updated_at = CURRENT_TIMESTAMP
        WHERE id = {esc_id}
        RETURNING *;
    """
    rows = await execute_sql(query)
    return rows[0] if rows else None


async def delete_cart(cart_id: str) -> bool:
    """Deletes cart and cascades deletion to all cart items."""
    esc_id = _escape(cart_id)
    query = f"DELETE FROM public.carts WHERE id = {esc_id} RETURNING id;"
    rows = await execute_sql(query)
    return len(rows) > 0


async def clear_cart_by_customer_id(customer_id: str) -> bool:
    """Clears and deletes active cart for customer."""
    esc_customer_id = _escape(customer_id)
    query = f"DELETE FROM public.carts WHERE customer_id = {esc_customer_id} RETURNING id;"
    rows = await execute_sql(query)
    return len(rows) > 0


async def get_cart_items_with_products(cart_id: str) -> List[Dict[str, Any]]:
    """
    Fetch all items for a cart joined with current product data.
    Orders items by created_at.
    """
    esc_cart_id = _escape(cart_id)
    query = f"""
        SELECT 
            ci.id AS item_id,
            ci.cart_id,
            ci.product_id,
            ci.quantity,
            ci.created_at AS item_created_at,
            ci.updated_at AS item_updated_at,
            p.name AS product_name,
            p.description AS product_description,
            p.price AS product_price,
            p.unit_label AS product_unit_label,
            p.stock AS product_stock,
            p.image_url AS product_image_url,
            p.is_available AS product_is_available,
            p.is_archived AS product_is_archived,
            p.category AS product_category,
            p.shop_id AS product_shop_id
        FROM public.cart_items ci
        JOIN public.products p ON ci.product_id = p.id
        WHERE ci.cart_id = {esc_cart_id}
        ORDER BY ci.created_at ASC;
    """
    return await execute_sql(query)


async def get_cart_items(cart_id: str) -> List[Dict[str, Any]]:
    """Fetch raw cart item rows for a cart."""
    esc_cart_id = _escape(cart_id)
    query = f"SELECT * FROM public.cart_items WHERE cart_id = {esc_cart_id} ORDER BY created_at ASC;"
    return await execute_sql(query)


async def get_cart_item_by_id(item_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a single cart item by ID."""
    esc_id = _escape(item_id)
    query = f"SELECT * FROM public.cart_items WHERE id = {esc_id} LIMIT 1;"
    rows = await execute_sql(query)
    return rows[0] if rows else None


async def get_cart_item_by_product(cart_id: str, product_id: str) -> Optional[Dict[str, Any]]:
    """Find cart item for a specific product inside a cart."""
    esc_cart_id = _escape(cart_id)
    esc_prod_id = _escape(product_id)
    query = f"""
        SELECT * FROM public.cart_items
        WHERE cart_id = {esc_cart_id} AND product_id = {esc_prod_id}
        LIMIT 1;
    """
    rows = await execute_sql(query)
    return rows[0] if rows else None


async def add_cart_item(cart_id: str, product_id: str, quantity: int) -> Dict[str, Any]:
    """Add a new item to cart."""
    import uuid
    item_id = f"ci-{uuid.uuid4().hex[:12]}"
    esc_id = _escape(item_id)
    esc_cart_id = _escape(cart_id)
    esc_prod_id = _escape(product_id)
    qty = max(1, int(quantity))

    query = f"""
        INSERT INTO public.cart_items (id, cart_id, product_id, quantity, created_at, updated_at)
        VALUES ({esc_id}, {esc_cart_id}, {esc_prod_id}, {qty}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *;
    """
    rows = await execute_sql(query)
    return rows[0] if rows else {
        "id": item_id,
        "cart_id": cart_id,
        "product_id": product_id,
        "quantity": qty,
    }


async def update_cart_item_quantity(item_id: str, quantity: int) -> Optional[Dict[str, Any]]:
    """Update quantity for a cart item."""
    esc_id = _escape(item_id)
    qty = max(1, int(quantity))
    query = f"""
        UPDATE public.cart_items
        SET quantity = {qty}, updated_at = CURRENT_TIMESTAMP
        WHERE id = {esc_id}
        RETURNING *;
    """
    rows = await execute_sql(query)
    return rows[0] if rows else None


async def delete_cart_item(item_id: str) -> bool:
    """Delete a single cart item."""
    esc_id = _escape(item_id)
    query = f"DELETE FROM public.cart_items WHERE id = {esc_id} RETURNING id;"
    rows = await execute_sql(query)
    return len(rows) > 0


# ===========================================================================
# Milestone M5.1: Orders & Transactional Inventory Layer
# ===========================================================================

class OrderError(Exception):
    """Custom exception representing an error during order operations."""
    def __init__(self, message: str, status_code: int = 400, retry_after: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.retry_after = retry_after


async def ensure_order_tables_exist() -> None:
    """
    Idempotent DDL execution to guarantee public.orders, public.order_items,
    indexes, and stored transaction procedure exist in PostgreSQL.
    """
    ddl = """
    CREATE TABLE IF NOT EXISTS public.orders (
        id VARCHAR(255) PRIMARY KEY,
        customer_id VARCHAR(255) NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        shop_id VARCHAR(255) NOT NULL REFERENCES public.shops(id) ON DELETE RESTRICT,
        status VARCHAR(50) NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'PENDING', 'CONFIRMED', 'CANCELLED', 'DELIVERED')),
        subtotal NUMERIC(10, 2) NOT NULL,
        total NUMERIC(10, 2) NOT NULL,
        delivery_name VARCHAR(255) NOT NULL,
        delivery_phone VARCHAR(50) NOT NULL,
        delivery_address TEXT NOT NULL,
        delivery_city VARCHAR(100) NOT NULL,
        delivery_state VARCHAR(100) NOT NULL,
        delivery_pincode VARCHAR(20) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS public.order_items (
        id VARCHAR(255) PRIMARY KEY,
        order_id VARCHAR(255) NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
        product_id VARCHAR(255) NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
        product_name_snapshot VARCHAR(255) NOT NULL,
        product_description_snapshot TEXT,
        unit_label_snapshot VARCHAR(50),
        unit_price NUMERIC(10, 2) NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        subtotal NUMERIC(10, 2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders (customer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_shop_id ON public.orders (shop_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items (product_id);

    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) NOT NULL DEFAULT 'COD';
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) NOT NULL DEFAULT 'PENDING';
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255);
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_status VARCHAR(50);
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(50) NOT NULL DEFAULT 'HAND_TO_CUSTOMER';

    CREATE INDEX IF NOT EXISTS idx_orders_stripe_session_id ON public.orders (stripe_session_id);
    CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent_id ON public.orders (stripe_payment_intent_id);

    DO $$
    BEGIN
        ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
        ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
            CHECK (status IN ('CREATED', 'PENDING', 'ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY', 'CONFIRMED', 'CANCELLED', 'DELIVERED'));
    EXCEPTION
        WHEN OTHERS THEN NULL;
    END $$;

    DO $$
    BEGIN
        ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_delivery_method_check;
        ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_method_check 
            CHECK (delivery_method IN ('HAND_TO_CUSTOMER', 'LEAVE_AT_DOOR'));
    EXCEPTION
        WHEN OTHERS THEN NULL;
    END $$;

    CREATE TABLE IF NOT EXISTS public.delivery_verifications (
        id VARCHAR(255) PRIMARY KEY,
        order_id VARCHAR(255) NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
        otp_hash VARCHAR(255) NOT NULL,
        encrypted_code TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED', 'MAX_ATTEMPTS_EXCEEDED', 'INVALIDATED')),
        expires_at TIMESTAMPTZ NOT NULL,
        verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_delivery_verifications_order_id ON public.delivery_verifications (order_id);
    CREATE INDEX IF NOT EXISTS idx_delivery_verifications_status ON public.delivery_verifications (status);

    CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
        event_id VARCHAR(255) PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        order_id VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS public.invoices (
        id VARCHAR(255) PRIMARY KEY,
        order_id VARCHAR(255) NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
        invoice_number VARCHAR(100) NOT NULL UNIQUE,
        storage_key TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON public.invoices (order_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices (invoice_number);

    DROP FUNCTION IF EXISTS public.create_order_from_cart(VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR);
    DROP FUNCTION IF EXISTS public.create_order_from_cart(VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR);
    DROP FUNCTION IF EXISTS public.create_order_from_cart(VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR);
    CREATE OR REPLACE FUNCTION public.create_order_from_cart(
        p_customer_id VARCHAR(255),
        p_order_id VARCHAR(255),
        p_delivery_name VARCHAR(255),
        p_delivery_phone VARCHAR(50),
        p_delivery_address TEXT,
        p_delivery_city VARCHAR(100),
        p_delivery_state VARCHAR(100),
        p_delivery_pincode VARCHAR(20),
        p_payment_method VARCHAR(50) DEFAULT 'COD',
        p_payment_status VARCHAR(50) DEFAULT 'PENDING',
        p_stripe_session_id VARCHAR(255) DEFAULT NULL,
        p_delivery_method VARCHAR(50) DEFAULT 'HAND_TO_CUSTOMER'
    )
    RETURNS VARCHAR(255) AS $$
    DECLARE
        v_cart_id VARCHAR(255);
        v_shop_id VARCHAR(255);
        v_shop_active BOOLEAN;
        v_shop_name VARCHAR(255);
        v_item_count INT;
        v_cart_item RECORD;
        v_prod RECORD;
        v_item_subtotal NUMERIC(10, 2);
        v_order_subtotal NUMERIC(10, 2) := 0.00;
        v_order_total NUMERIC(10, 2) := 0.00;
        v_order_item_id VARCHAR(255);
        v_verified_order_id VARCHAR(255);
    BEGIN
        -- 1. Find active cart for customer
        SELECT id, shop_id INTO v_cart_id, v_shop_id
        FROM public.carts
        WHERE customer_id = p_customer_id AND status = 'ACTIVE'
        LIMIT 1;

        IF v_cart_id IS NULL THEN
            RAISE EXCEPTION 'CART_NOT_FOUND: No active cart found for this customer.';
        END IF;

        -- Verify shop is active
        SELECT is_active, name INTO v_shop_active, v_shop_name
        FROM public.shops
        WHERE id = v_shop_id;

        IF v_shop_name IS NULL OR v_shop_active IS NOT TRUE THEN
            RAISE EXCEPTION 'SHOP_INACTIVE: The shop associated with this cart is currently inactive.';
        END IF;

        -- Verify cart has items
        SELECT COUNT(*) INTO v_item_count
        FROM public.cart_items
        WHERE cart_id = v_cart_id;

        IF v_item_count = 0 THEN
            RAISE EXCEPTION 'CART_EMPTY: Cannot place an order with an empty cart.';
        END IF;

        -- Validate delivery and payment method combination
        IF COALESCE(p_delivery_method, 'HAND_TO_CUSTOMER') = 'LEAVE_AT_DOOR' AND COALESCE(p_payment_method, 'COD') = 'COD' THEN
            RAISE EXCEPTION 'INVALID_DELIVERY_PAYMENT_COMBINATION: Cash on Delivery is not available for Leave-at-Door delivery. Please select Online Payment.';
        END IF;

        -- Step 2 in transaction sequence: Create the parent row in public.orders FIRST
        -- Satisfies foreign key constraint "order_items_order_id_fkey"
        INSERT INTO public.orders (
            id, customer_id, shop_id, status,
            subtotal, total,
            delivery_name, delivery_phone, delivery_address,
            delivery_city, delivery_state, delivery_pincode,
            delivery_method,
            payment_method, payment_status, stripe_session_id,
            created_at, updated_at
        ) VALUES (
            p_order_id, p_customer_id, v_shop_id, 'CREATED',
            0.00, 0.00,
            p_delivery_name, p_delivery_phone, p_delivery_address,
            p_delivery_city, p_delivery_state, p_delivery_pincode,
            COALESCE(p_delivery_method, 'HAND_TO_CUSTOMER'),
            COALESCE(p_payment_method, 'COD'), COALESCE(p_payment_status, 'PENDING'), p_stripe_session_id,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        );

        -- Step 3 in transaction sequence: Confirm that the orders row exists with the generated order.id
        SELECT id INTO v_verified_order_id
        FROM public.orders
        WHERE id = p_order_id;

        IF v_verified_order_id IS NULL THEN
            RAISE EXCEPTION 'ORDER_VERIFICATION_FAILED: Parent order % could not be verified in database.', p_order_id;
        END IF;

        -- Step 4 & 5 in transaction sequence:
        -- Lock product, validate stock, snapshot into order_items, deduct inventory
        FOR v_cart_item IN
            SELECT id, product_id, quantity
            FROM public.cart_items
            WHERE cart_id = v_cart_id
            ORDER BY created_at ASC
        LOOP
            -- Exclusive row-level lock on product row
            SELECT id, shop_id, name, description, unit_label, price, stock, is_available, is_archived
            INTO v_prod
            FROM public.products
            WHERE id = v_cart_item.product_id
            FOR UPDATE;

            IF v_prod.id IS NULL THEN
                RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product in cart no longer exists.';
            END IF;

            IF v_prod.shop_id <> v_shop_id THEN
                RAISE EXCEPTION 'PRODUCT_SHOP_MISMATCH: Product ''%'' belongs to a different shop.', v_prod.name;
            END IF;

            IF v_prod.is_archived IS TRUE THEN
                RAISE EXCEPTION 'PRODUCT_ARCHIVED: Product ''%'' has been archived.', v_prod.name;
            END IF;

            IF v_prod.is_available IS NOT TRUE THEN
                RAISE EXCEPTION 'PRODUCT_UNAVAILABLE: Product ''%'' is currently marked unavailable.', v_prod.name;
            END IF;

            IF v_prod.stock < v_cart_item.quantity THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Only % in stock for ''%'' (requested: %).', v_prod.stock, v_prod.name, v_cart_item.quantity;
            END IF;

            -- Calculate item subtotal using CURRENT price
            v_item_subtotal := ROUND((v_cart_item.quantity * v_prod.price)::numeric, 2);
            v_order_subtotal := v_order_subtotal + v_item_subtotal;

            -- Create unique order item id
            v_order_item_id := 'oi-' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);

            -- Step 4: Insert public.order_items using that exact existing order.id
            INSERT INTO public.order_items (
                id, order_id, product_id,
                product_name_snapshot, product_description_snapshot, unit_label_snapshot,
                unit_price, quantity, subtotal, created_at
            ) VALUES (
                v_order_item_id, p_order_id, v_prod.id,
                v_prod.name, v_prod.description, v_prod.unit_label,
                v_prod.price, v_cart_item.quantity, v_item_subtotal,
                CURRENT_TIMESTAMP
            );

            -- Step 5: Perform the existing transactional stock deduction
            UPDATE public.products
            SET stock = stock - v_cart_item.quantity,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = v_prod.id;
        END LOOP;

        v_order_total := v_order_subtotal;

        -- Update parent order with finalized calculated subtotal and total
        UPDATE public.orders
        SET subtotal = v_order_subtotal,
            total = v_order_total,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = p_order_id;

        -- Step 6: Convert / clear the active cart
        DELETE FROM public.cart_items WHERE cart_id = v_cart_id;
        DELETE FROM public.carts WHERE id = v_cart_id;

        -- Step 7: Commit transaction on function return
        RETURN p_order_id;
    END;
    $$ LANGUAGE plpgsql;

    DROP FUNCTION IF EXISTS public.regenerate_delivery_otp(VARCHAR, VARCHAR, VARCHAR, VARCHAR, TIMESTAMPTZ, BOOLEAN);
    CREATE OR REPLACE FUNCTION public.regenerate_delivery_otp(
        p_order_id VARCHAR,
        p_new_id VARCHAR,
        p_otp_hash VARCHAR,
        p_encrypted_code VARCHAR,
        p_expires_at TIMESTAMPTZ,
        p_is_regeneration BOOLEAN DEFAULT TRUE
    )
    RETURNS TABLE (
        success BOOLEAN,
        error_code VARCHAR,
        error_message VARCHAR,
        retry_after INTEGER,
        regenerations_used INTEGER,
        regenerations_remaining INTEGER
    ) AS $$
    DECLARE
        v_order_status VARCHAR(50);
        v_delivery_method VARCHAR(50);
        v_latest_created_at TIMESTAMPTZ;
        v_total_otps INT;
        v_regenerations_used INT;
        v_elapsed_seconds INT;
        v_remaining_cooldown INT;
    BEGIN
        -- 1. Row-level lock on public.orders to serialize concurrent requests for this order
        SELECT status, delivery_method INTO v_order_status, v_delivery_method
        FROM public.orders
        WHERE id = p_order_id
        FOR UPDATE;

        IF v_order_status IS NULL THEN
            RETURN QUERY SELECT FALSE, 'ORDER_NOT_FOUND'::VARCHAR, 'Order not found.'::VARCHAR, 0, 0, 0;
            RETURN;
        END IF;

        IF v_order_status != 'OUT_FOR_DELIVERY' THEN
            RETURN QUERY SELECT FALSE, 'INVALID_STATUS'::VARCHAR, 
                ('Cannot generate OTP for order with status ' || v_order_status || '. OTP is only available when order is OUT_FOR_DELIVERY.')::VARCHAR, 0, 0, 0;
            RETURN;
        END IF;

        IF COALESCE(v_delivery_method, 'HAND_TO_CUSTOMER') != 'HAND_TO_CUSTOMER' THEN
            RETURN QUERY SELECT FALSE, 'INVALID_DELIVERY_METHOD'::VARCHAR, 
                'This order uses contactless Leave-at-Door delivery. No OTP is required.'::VARCHAR, 0, 0, 0;
            RETURN;
        END IF;

        -- 2. Count existing OTP records for this order
        SELECT COUNT(*), MAX(created_at)
        INTO v_total_otps, v_latest_created_at
        FROM public.delivery_verifications
        WHERE order_id = p_order_id;

        -- First OTP record is the initial creation. Any subsequent records represent regenerations.
        v_regenerations_used := GREATEST(0, v_total_otps - 1);

        -- 3. If this is a customer regeneration request:
        IF p_is_regeneration IS TRUE AND v_total_otps > 0 THEN
            -- Check 60-second cooldown from the most recent OTP generation
            v_elapsed_seconds := EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v_latest_created_at))::INT;
            IF v_elapsed_seconds < 60 THEN
                v_remaining_cooldown := 60 - v_elapsed_seconds;
                RETURN QUERY SELECT FALSE, 'COOLDOWN_ACTIVE'::VARCHAR, 
                    ('Please wait ' || v_remaining_cooldown || ' seconds before requesting a new OTP.')::VARCHAR, 
                    v_remaining_cooldown, 
                    v_regenerations_used, 
                    GREATEST(0, 5 - v_regenerations_used);
                RETURN;
            END IF;

            -- Check maximum 5 regenerations limit
            IF v_regenerations_used >= 5 THEN
                RETURN QUERY SELECT FALSE, 'MAX_REGENERATIONS_EXCEEDED'::VARCHAR, 
                    'Maximum 5 OTP regenerations reached for this order.'::VARCHAR, 
                    0, 
                    v_regenerations_used, 
                    0;
                RETURN;
            END IF;
        END IF;

        -- 4. Invalidate prior active OTPs
        UPDATE public.delivery_verifications
        SET status = 'INVALIDATED',
            updated_at = CURRENT_TIMESTAMP
        WHERE order_id = p_order_id AND status = 'ACTIVE';

        -- 5. Insert new active OTP record
        INSERT INTO public.delivery_verifications (
            id, order_id, otp_hash, encrypted_code, attempt_count,
            status, expires_at, created_at, updated_at
        ) VALUES (
            p_new_id, p_order_id, p_otp_hash, p_encrypted_code, 0,
            'ACTIVE', p_expires_at, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        );

        -- Recalculate regenerations used and remaining after insert
        IF p_is_regeneration IS TRUE AND v_total_otps > 0 THEN
            v_regenerations_used := v_regenerations_used + 1;
        ELSE
            v_regenerations_used := 0;
        END IF;

        RETURN QUERY SELECT TRUE, 'SUCCESS'::VARCHAR, 'New delivery OTP generated successfully.'::VARCHAR, 
            0, v_regenerations_used, GREATEST(0, 5 - v_regenerations_used);
    END;
    $$ LANGUAGE plpgsql;
    """
    try:
        await execute_sql(ddl)
        logger.info("Order tables and transaction function verified.")
    except Exception as e:
        logger.warning(f"Notice during order table verification: {e}")


async def get_order_by_id(order_id: str) -> Optional[Dict[str, Any]]:
    """Fetch order by ID with shop, customer, and order items snapshot."""
    esc_order_id = _escape(order_id)
    query = f"""
        SELECT 
            o.id,
            o.customer_id,
            o.shop_id,
            o.status,
            o.subtotal,
            o.total,
            o.delivery_name,
            o.delivery_phone,
            o.delivery_address,
            o.delivery_city,
            o.delivery_state,
            o.delivery_pincode,
            o.created_at,
            o.updated_at,
            o.payment_method,
            o.payment_status,
            o.stripe_session_id,
            o.stripe_payment_intent_id,
            o.cancellation_reason,
            o.refund_status,
            o.delivery_method,
            s.name AS shop_name,
            s.address AS shop_address,
            s.city AS shop_city,
            s.business_phone AS shop_phone,
            s.photo_url AS shop_photo_url,
            u.name AS customer_name,
            u.email AS customer_email,
            u.phone AS customer_phone
        FROM public.orders o
        LEFT JOIN public.shops s ON o.shop_id = s.id
        LEFT JOIN public.users u ON o.customer_id = u.id
        WHERE o.id = {esc_order_id}
        LIMIT 1;
    """
    rows = await execute_sql(query)
    if not rows:
        return None

    order_row = rows[0]
    items_query = f"""
        SELECT 
            id,
            order_id,
            product_id,
            product_name_snapshot,
            product_description_snapshot,
            unit_label_snapshot,
            unit_price,
            quantity,
            subtotal,
            created_at
        FROM public.order_items
        WHERE order_id = {esc_order_id}
        ORDER BY created_at ASC;
    """
    item_rows = await execute_sql(items_query)

    items = [
        {
            "id": it["id"],
            "product_id": it["product_id"],
            "product_name": it["product_name_snapshot"],
            "product_description": it.get("product_description_snapshot") or "",
            "unit_label": it.get("unit_label_snapshot") or "piece",
            "unit_price": float(it["unit_price"]),
            "quantity": int(it["quantity"]),
            "subtotal": float(it["subtotal"]),
            "created_at": it["created_at"].isoformat() if hasattr(it["created_at"], "isoformat") else str(it["created_at"]),
        }
        for it in item_rows
    ]

    total_qty = sum(item["quantity"] for item in items)
    created_at_str = order_row["created_at"].isoformat() if hasattr(order_row["created_at"], "isoformat") else str(order_row["created_at"])
    updated_at_str = order_row["updated_at"].isoformat() if hasattr(order_row["updated_at"], "isoformat") else str(order_row["updated_at"])

    return {
        "id": order_row["id"],
        "customer_id": order_row["customer_id"],
        "shop_id": order_row["shop_id"],
        "status": order_row["status"],
        "subtotal": float(order_row["subtotal"]),
        "total": float(order_row["total"]),
        "delivery_method": order_row.get("delivery_method") or "HAND_TO_CUSTOMER",
        "payment_method": order_row.get("payment_method") or "COD",
        "payment_status": order_row.get("payment_status") or "PENDING",
        "stripe_session_id": order_row.get("stripe_session_id") or None,
        "stripe_payment_intent_id": order_row.get("stripe_payment_intent_id") or None,
        "cancellation_reason": order_row.get("cancellation_reason") or None,
        "refund_status": order_row.get("refund_status") or None,
        "delivery_address": {
            "name": order_row["delivery_name"],
            "phone": order_row["delivery_phone"],
            "address": order_row["delivery_address"],
            "city": order_row["delivery_city"],
            "state": order_row["delivery_state"],
            "pincode": order_row["delivery_pincode"],
        },
        "customer": {
            "id": order_row["customer_id"],
            "name": order_row.get("customer_name") or order_row["delivery_name"],
            "email": order_row.get("customer_email") or "",
            "phone": order_row.get("customer_phone") or order_row["delivery_phone"],
        },
        "shop": {
            "id": order_row["shop_id"],
            "name": order_row.get("shop_name") or "Neighborhood Store",
            "address": order_row.get("shop_address") or "",
            "city": order_row.get("shop_city") or "",
            "phone": order_row.get("shop_phone") or "",
            "photo_url": order_row.get("shop_photo_url") or "",
        },
        "items": items,
        "item_count": total_qty,
        "created_at": created_at_str,
        "updated_at": updated_at_str,
    }


async def get_orders_by_customer_id(customer_id: str) -> List[Dict[str, Any]]:
    """
    Fetch all orders for a specific customer, ordered by newest first (created_at DESC).
    Includes snapshot items, totals, delivery address snapshot, and shop info.
    """
    esc_cust_id = _escape(customer_id)
    query = f"""
        SELECT 
            o.id,
            o.customer_id,
            o.shop_id,
            o.status,
            o.subtotal,
            o.total,
            o.delivery_name,
            o.delivery_phone,
            o.delivery_address,
            o.delivery_city,
            o.delivery_state,
            o.delivery_pincode,
            o.created_at,
            o.updated_at,
            o.payment_method,
            o.payment_status,
            o.stripe_session_id,
            o.stripe_payment_intent_id,
            o.cancellation_reason,
            o.refund_status,
            o.delivery_method,
            s.name AS shop_name,
            s.address AS shop_address,
            s.city AS shop_city,
            s.business_phone AS shop_phone,
            s.photo_url AS shop_photo_url
        FROM public.orders o
        LEFT JOIN public.shops s ON o.shop_id = s.id
        WHERE o.customer_id = {esc_cust_id}
        ORDER BY o.created_at DESC;
    """
    rows = await execute_sql(query)
    if not rows:
        return []

    order_ids = [r["id"] for r in rows]
    in_clause = ", ".join(_escape(oid) for oid in order_ids)
    items_query = f"""
        SELECT 
            id,
            order_id,
            product_id,
            product_name_snapshot,
            product_description_snapshot,
            unit_label_snapshot,
            unit_price,
            quantity,
            subtotal,
            created_at
        FROM public.order_items
        WHERE order_id IN ({in_clause})
        ORDER BY created_at ASC;
    """
    item_rows = await execute_sql(items_query)

    items_by_order: Dict[str, List[Dict[str, Any]]] = {}
    for it in item_rows:
        oid = it["order_id"]
        if oid not in items_by_order:
            items_by_order[oid] = []
        items_by_order[oid].append({
            "id": it["id"],
            "product_id": it["product_id"],
            "product_name": it["product_name_snapshot"],
            "product_description": it.get("product_description_snapshot") or "",
            "unit_label": it.get("unit_label_snapshot") or "piece",
            "unit_price": float(it["unit_price"]),
            "quantity": int(it["quantity"]),
            "subtotal": float(it["subtotal"]),
            "created_at": it["created_at"].isoformat() if hasattr(it["created_at"], "isoformat") else str(it["created_at"]),
        })

    result = []
    for r in rows:
        items = items_by_order.get(r["id"], [])
        total_qty = sum(item["quantity"] for item in items)
        created_at_str = r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"])
        updated_at_str = r["updated_at"].isoformat() if hasattr(r["updated_at"], "isoformat") else str(r["updated_at"])

        result.append({
            "id": r["id"],
            "customer_id": r["customer_id"],
            "shop_id": r["shop_id"],
            "status": r["status"],
            "subtotal": float(r["subtotal"]),
            "total": float(r["total"]),
            "delivery_method": r.get("delivery_method") or "HAND_TO_CUSTOMER",
            "payment_method": r.get("payment_method") or "COD",
            "payment_status": r.get("payment_status") or "PENDING",
            "stripe_session_id": r.get("stripe_session_id") or None,
            "stripe_payment_intent_id": r.get("stripe_payment_intent_id") or None,
            "cancellation_reason": r.get("cancellation_reason") or None,
            "refund_status": r.get("refund_status") or None,
            "delivery_address": {
                "name": r["delivery_name"],
                "phone": r["delivery_phone"],
                "address": r["delivery_address"],
                "city": r["delivery_city"],
                "state": r["delivery_state"],
                "pincode": r["delivery_pincode"],
            },
            "shop": {
                "id": r["shop_id"],
                "name": r.get("shop_name") or "Neighborhood Store",
                "address": r.get("shop_address") or "",
                "city": r.get("shop_city") or "",
                "phone": r.get("shop_phone") or "",
                "photo_url": r.get("shop_photo_url") or "",
            },
            "items": items,
            "item_count": total_qty,
            "created_at": created_at_str,
            "updated_at": updated_at_str,
        })
    return result


async def get_orders_by_shop_id(
    shop_id: str,
    status_filter: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch all orders belonging strictly to a specific shop, ordered by newest first (created_at DESC).
    Includes snapshot items, customer details, delivery address snapshot, and totals.
    Enforces shop isolation.
    """
    esc_shop_id = _escape(shop_id)
    where_clauses = [
        f"o.shop_id = {esc_shop_id}",
        # Shopkeeper only receives/sees orders that are either COD or confirmed PAID online orders.
        # Unpaid, pending, or failed online checkouts must not be exposed as active shopkeeper orders.
        "(COALESCE(o.payment_method, 'COD') != 'ONLINE' OR o.payment_status = 'PAID')",
    ]

    if status_filter:
        s_upper = status_filter.strip().upper()
        if s_upper == "PENDING":
            where_clauses.append("o.status IN ('PENDING', 'CREATED')")
        elif s_upper == "CONFIRMED":
            where_clauses.append("o.status IN ('CONFIRMED', 'ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY')")
        elif s_upper != "ALL":
            esc_status = _escape(s_upper)
            where_clauses.append(f"o.status = {esc_status}")

    where_sql = " AND ".join(where_clauses)

    query = f"""
        SELECT 
            o.id,
            o.customer_id,
            o.shop_id,
            o.status,
            o.subtotal,
            o.total,
            o.delivery_name,
            o.delivery_phone,
            o.delivery_address,
            o.delivery_city,
            o.delivery_state,
            o.delivery_pincode,
            o.created_at,
            o.updated_at,
            o.payment_method,
            o.payment_status,
            o.stripe_session_id,
            o.stripe_payment_intent_id,
            o.cancellation_reason,
            o.refund_status,
            o.delivery_method,
            u.name AS customer_name,
            u.email AS customer_email,
            u.phone AS customer_phone
        FROM public.orders o
        LEFT JOIN public.users u ON o.customer_id = u.id
        WHERE {where_sql}
        ORDER BY o.created_at DESC;
    """
    rows = await execute_sql(query)
    if not rows:
        return []

    order_ids = [r["id"] for r in rows]
    in_clause = ", ".join(_escape(oid) for oid in order_ids)
    items_query = f"""
        SELECT 
            id,
            order_id,
            product_id,
            product_name_snapshot,
            product_description_snapshot,
            unit_label_snapshot,
            unit_price,
            quantity,
            subtotal,
            created_at
        FROM public.order_items
        WHERE order_id IN ({in_clause})
        ORDER BY created_at ASC;
    """
    item_rows = await execute_sql(items_query)

    items_by_order: Dict[str, List[Dict[str, Any]]] = {}
    for it in item_rows:
        oid = it["order_id"]
        if oid not in items_by_order:
            items_by_order[oid] = []
        items_by_order[oid].append({
            "id": it["id"],
            "product_id": it["product_id"],
            "product_name": it["product_name_snapshot"],
            "product_description": it.get("product_description_snapshot") or "",
            "unit_label": it.get("unit_label_snapshot") or "piece",
            "unit_price": float(it["unit_price"]),
            "quantity": int(it["quantity"]),
            "subtotal": float(it["subtotal"]),
            "created_at": it["created_at"].isoformat() if hasattr(it["created_at"], "isoformat") else str(it["created_at"]),
        })

    result = []
    for r in rows:
        items = items_by_order.get(r["id"], [])
        total_qty = sum(item["quantity"] for item in items)
        created_at_str = r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"])
        updated_at_str = r["updated_at"].isoformat() if hasattr(r["updated_at"], "isoformat") else str(r["updated_at"])

        raw_status = r["status"]
        display_status = "PENDING" if raw_status == "CREATED" else raw_status

        result.append({
            "id": r["id"],
            "customer_id": r["customer_id"],
            "shop_id": r["shop_id"],
            "status": display_status,
            "raw_status": raw_status,
            "subtotal": float(r["subtotal"]),
            "total": float(r["total"]),
            "delivery_method": r.get("delivery_method") or "HAND_TO_CUSTOMER",
            "payment_method": r.get("payment_method") or "COD",
            "payment_status": r.get("payment_status") or "PENDING",
            "stripe_session_id": r.get("stripe_session_id") or None,
            "stripe_payment_intent_id": r.get("stripe_payment_intent_id") or None,
            "cancellation_reason": r.get("cancellation_reason") or None,
            "refund_status": r.get("refund_status") or None,
            "delivery_address": {
                "name": r["delivery_name"],
                "phone": r["delivery_phone"],
                "address": r["delivery_address"],
                "city": r["delivery_city"],
                "state": r["delivery_state"],
                "pincode": r["delivery_pincode"],
            },
            "customer": {
                "id": r["customer_id"],
                "name": r.get("customer_name") or r["delivery_name"],
                "email": r.get("customer_email") or "",
                "phone": r.get("customer_phone") or r["delivery_phone"],
            },
            "items": items,
            "item_count": total_qty,
            "created_at": created_at_str,
            "updated_at": updated_at_str,
        })
    return result


async def create_order_transaction(
    customer_id: str,
    delivery: Dict[str, str],
    payment_method: str = "COD",
    payment_status: str = "PENDING",
    stripe_session_id: Optional[str] = None,
    delivery_method: str = "HAND_TO_CUSTOMER",
) -> Dict[str, Any]:
    """
    Executes atomic, transactional order creation from active customer cart.
    1. BEGIN transaction
    2. Create parent row in public.orders
    3. Confirm that the orders row exists with generated order.id
    4. Insert public.order_items using that exact existing order.id (satisfying FK)
    5. Perform transactional stock deduction
    6. Convert/clear active cart
    7. COMMIT
    - Snapshots purchase-time product info and prices into order_items
    - Snapshots delivery address into orders
    - Sets delivery_method ('HAND_TO_CUSTOMER' or 'LEAVE_AT_DOOR')
    - Sets payment_method ('COD' or 'ONLINE') and initial payment_status ('PENDING')
    - Rolls back 100% on any stock, availability, or foreign key failure
    """
    import uuid
    order_id = f"ord-{uuid.uuid4().hex[:12]}"

    dm = str(delivery_method or "HAND_TO_CUSTOMER").strip().upper()
    if dm not in ("HAND_TO_CUSTOMER", "LEAVE_AT_DOOR"):
        dm = "HAND_TO_CUSTOMER"

    pm = str(payment_method or "COD").strip().upper()
    if dm == "LEAVE_AT_DOOR" and pm == "COD":
        raise OrderError(
            "Cash on Delivery is not available for Leave-at-Door delivery. Please select Online Payment.",
            status_code=400,
        )

    esc_cust = _escape(customer_id)
    esc_ord = _escape(order_id)
    esc_name = _escape(delivery.get("name", "").strip())
    esc_phone = _escape(delivery.get("phone", "").strip())
    esc_addr = _escape(delivery.get("address", "").strip())
    esc_city = _escape(delivery.get("city", "").strip())
    esc_state = _escape(delivery.get("state", "").strip())
    esc_pincode = _escape(delivery.get("pincode", "").strip())
    esc_pm = _escape(payment_method)
    esc_ps = _escape(payment_status)
    esc_sess = _escape(stripe_session_id)
    esc_dm = _escape(dm)

    call_query = f"""
        SELECT public.create_order_from_cart(
            {esc_cust},
            {esc_ord},
            {esc_name},
            {esc_phone},
            {esc_addr},
            {esc_city},
            {esc_state},
            {esc_pincode},
            {esc_pm},
            {esc_ps},
            {esc_sess},
            {esc_dm}
        ) AS created_order_id;
    """
    try:
        rows = await execute_sql(call_query)
        if not rows or not rows[0].get("created_order_id"):
            raise OrderError("Failed to create order.", status_code=500)
    except httpx.HTTPStatusError as e:
        err_msg = ""
        try:
            err_data = e.response.json()
            err_msg = err_data.get("message") or err_data.get("error") or ""
        except Exception:
            err_msg = e.response.text

        logger.warning(f"Order transaction aborted by database: {err_msg}")

        # Map domain exceptions from PL/pgSQL
        if "INVALID_DELIVERY_PAYMENT_COMBINATION" in err_msg:
            raise OrderError("Cash on Delivery is not available for Leave-at-Door delivery. Please select Online Payment.", status_code=400)
        elif "INSUFFICIENT_STOCK" in err_msg:
            clean_msg = err_msg.split("INSUFFICIENT_STOCK:")[-1].strip()
            raise OrderError(f"Insufficient stock: {clean_msg}", status_code=409)
        elif "PRODUCT_UNAVAILABLE" in err_msg:
            clean_msg = err_msg.split("PRODUCT_UNAVAILABLE:")[-1].strip()
            raise OrderError(f"Product unavailable: {clean_msg}", status_code=409)
        elif "PRODUCT_ARCHIVED" in err_msg:
            clean_msg = err_msg.split("PRODUCT_ARCHIVED:")[-1].strip()
            raise OrderError(f"Product archived: {clean_msg}", status_code=409)
        elif "PRODUCT_SHOP_MISMATCH" in err_msg:
            clean_msg = err_msg.split("PRODUCT_SHOP_MISMATCH:")[-1].strip()
            raise OrderError(clean_msg, status_code=409)
        elif "CART_EMPTY" in err_msg:
            raise OrderError("Your cart is empty. Add products before placing an order.", status_code=400)
        elif "CART_NOT_FOUND" in err_msg:
            raise OrderError("No active shopping cart found. Add products before placing an order.", status_code=400)
        elif "SHOP_INACTIVE" in err_msg:
            clean_msg = err_msg.split("SHOP_INACTIVE:")[-1].strip()
            raise OrderError(clean_msg, status_code=400)
        elif "ORDER_VERIFICATION_FAILED" in err_msg:
            clean_msg = err_msg.split("ORDER_VERIFICATION_FAILED:")[-1].strip()
            raise OrderError(f"Order verification failed: {clean_msg}", status_code=500)
        else:
            raise OrderError(f"Unable to place order: {err_msg}", status_code=400)

    # Fetch created order with all snapshot details
    full_order = await get_order_by_id(order_id)
    if not full_order:
        raise OrderError("Order created but failed to load order details.", status_code=500)
    return full_order


async def update_order_stripe_session(order_id: str, session_id: str) -> None:
    """Updates the stripe_session_id for an order."""
    esc_order_id = _escape(order_id)
    esc_sess = _escape(session_id)
    await execute_sql(f"""
        UPDATE public.orders
        SET stripe_session_id = {esc_sess},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = {esc_order_id};
    """)


async def update_order_payment_status(
    order_id: str,
    payment_status: str,
    order_status: Optional[str] = None,
    stripe_payment_intent_id: Optional[str] = None,
    stripe_session_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Updates payment and order status on public.orders idempotently.
    When payment_status is 'PAID', marks order as CONFIRMED and keeps stock deducted.
    """
    esc_order_id = _escape(order_id)
    existing = await get_order_by_id(order_id)
    if not existing:
        return None

    # Idempotent guard: if already marked PAID, don't revert to pending
    if existing.get("payment_status") == "PAID" and payment_status != "PAID":
        logger.warning(f"Ignoring payment status update to '{payment_status}' for already PAID order {order_id}")
        return existing

    set_clauses = [
        f"payment_status = {_escape(payment_status)}",
        "updated_at = CURRENT_TIMESTAMP",
    ]
    if order_status:
        current_status = (existing.get("status") or "").upper()
        # If the order is already past PENDING (e.g. ACCEPTED, PREPARING, OUT_FOR_DELIVERY), do not revert to PENDING
        if order_status == "PENDING" and current_status in ("ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"):
            logger.info(f"Preserving existing fulfillment status '{current_status}' for order {order_id} while updating payment.")
        else:
            set_clauses.append(f"status = {_escape(order_status)}")
    if stripe_payment_intent_id:
        set_clauses.append(f"stripe_payment_intent_id = {_escape(stripe_payment_intent_id)}")
    if stripe_session_id:
        set_clauses.append(f"stripe_session_id = {_escape(stripe_session_id)}")

    set_sql = ", ".join(set_clauses)
    query = f"UPDATE public.orders SET {set_sql} WHERE id = {esc_order_id};"
    await execute_sql(query)
    return await get_order_by_id(order_id)


async def cancel_order_and_restore_stock(
    order_id: str,
    reason: str = "Payment failed or cancelled",
) -> Optional[Dict[str, Any]]:
    """
    Restores deducted product inventory and marks order as CANCELLED atomically.
    Enforces M5 inventory restoration rules idempotently using a single PostgreSQL CTE:
    - Atomically transitions order status: (CREATED | PENDING) -> CANCELLED, payment_status -> FAILED.
    - In the same atomic database transaction, aggregates and restores deducted stock for all order items.
    - If order is already CANCELLED, stock is NOT restored again (duplicate prevention).
    - If order is already PAID, refuses cancellation (race prevention with Stripe completion).
    - If order is in fulfillment (ACCEPTED, PREPARING, OUT_FOR_DELIVERY, DELIVERED), refuses cancellation.
    - Returns updated order dict with 'cancellation_applied' and 'cancellation_status' metadata.
    """
    esc_order_id = _escape(order_id)
    esc_reason = _escape(str(reason or "").strip() or "Payment failed or cancelled")

    # Atomic PostgreSQL CTE:
    # 1. Locks and updates public.orders IF AND ONLY IF status in ('CREATED', 'PENDING') AND payment_status != 'PAID'.
    # 2. In the same statement, aggregates and restores stock into public.products from public.order_items.
    # 3. If the order was already CANCELLED, PAID, or in fulfillment, target_order updates 0 rows and NO product stock is altered.
    atomic_sql = f"""
        WITH target_order AS (
            UPDATE public.orders
            SET status = 'CANCELLED',
                payment_status = 'FAILED',
                cancellation_reason = COALESCE(cancellation_reason, {esc_reason}),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = {esc_order_id}
              AND status IN ('CREATED', 'PENDING')
              AND payment_status != 'PAID'
            RETURNING id
        ),
        items_to_restore AS (
            SELECT oi.product_id, SUM(oi.quantity)::integer AS qty
            FROM public.order_items oi
            JOIN target_order o ON o.id = oi.order_id
            GROUP BY oi.product_id
        ),
        restored_products AS (
            UPDATE public.products p
            SET stock = p.stock + itr.qty,
                updated_at = CURRENT_TIMESTAMP
            FROM items_to_restore itr
            WHERE p.id = itr.product_id
            RETURNING p.id
        )
        SELECT id FROM target_order;
    """

    rows = await execute_sql(atomic_sql)
    updated = await get_order_by_id(order_id)
    if not updated:
        return None

    order_dict = dict(updated)

    if rows and rows[0].get("id"):
        # Cancellation succeeded atomically on this exact call
        logger.info(f"Successfully cancelled order {order_id} and restored stock atomically. Reason: {reason}")
        order_dict["cancellation_applied"] = True
        order_dict["cancellation_status"] = "SUCCESS"

        # M9.1: Refresh invoice if an invoice record was already created
        try:
            inv = await get_invoice_by_order_id(order_id)
            if inv:
                await generate_and_store_invoice_for_order(order_id, force_refresh=True)
        except Exception as inv_err:
            logger.warning(f"Invoice refresh on cancel for order {order_id}: {inv_err}")

        return order_dict

    # If target_order updated 0 rows, determine why to return diagnostic info
    order_dict["cancellation_applied"] = False
    current_status = updated.get("status")
    current_pay_status = updated.get("payment_status")

    if current_status == "CANCELLED":
        logger.info(f"Order {order_id} is already CANCELLED. Stock already restored.")
        order_dict["cancellation_status"] = "ALREADY_CANCELLED"
    elif current_pay_status == "PAID":
        logger.warning(f"Refused cancellation of already PAID order {order_id}. Aborting.")
        order_dict["cancellation_status"] = "PAID_ORDER"
    else:
        logger.warning(f"Refused cancellation of order {order_id} with non-cancellable status '{current_status}'.")
        order_dict["cancellation_status"] = "INELIGIBLE_STATUS"

    return order_dict


async def record_stripe_webhook_event(
    event_id: str,
    event_type: str,
    order_id: Optional[str] = None,
) -> bool:
    """
    Records an incoming Stripe webhook event into public.stripe_webhook_events.
    Returns True if this is a NEW event.
    Returns False if event was already recorded/processed (duplicate detection).
    """
    esc_eid = _escape(event_id)
    esc_type = _escape(event_type)
    esc_oid = _escape(order_id)

    # Check existence
    existing = await execute_sql(f"SELECT event_id FROM public.stripe_webhook_events WHERE event_id = {esc_eid} LIMIT 1;")
    if existing:
        logger.info(f"Stripe webhook event {event_id} already processed. Skipping duplicate.")
        return False

    await execute_sql(f"""
        INSERT INTO public.stripe_webhook_events (event_id, event_type, order_id, created_at)
        VALUES ({esc_eid}, {esc_type}, {esc_oid}, CURRENT_TIMESTAMP)
        ON CONFLICT (event_id) DO NOTHING;
    """)
    return True


# ===========================================================================
# Milestone M7.1: Shopkeeper Accept / Cancel Order State Transitions
# ===========================================================================

async def shopkeeper_accept_order(order_id: str, shop_id: str) -> Dict[str, Any]:
    """
    Shopkeeper accepts a PENDING order:
    - Enforces shop ownership
    - Only PENDING / CREATED orders can be accepted
    - Transition: PENDING -> ACCEPTED
    - Returns updated full order details
    """
    esc_order_id = _escape(order_id)
    existing = await get_order_by_id(order_id)
    if not existing:
        raise OrderError("Order not found.", status_code=404)

    if str(existing["shop_id"]) != str(shop_id):
        raise OrderError("You are not authorized to modify orders from another store.", status_code=403)

    if str(existing.get("payment_method", "")).upper() == "ONLINE" and existing.get("payment_status") != "PAID":
        raise OrderError("Order cannot be accepted before online payment is confirmed.", status_code=400)

    current_status = existing["status"]
    if current_status not in ("PENDING", "CREATED"):
        raise OrderError(
            f"Cannot accept order with status '{current_status}'. Only PENDING orders can be accepted.",
            status_code=400,
        )

    await execute_sql(f"""
        UPDATE public.orders
        SET status = 'ACCEPTED',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = {esc_order_id};
    """)
    logger.info(f"Order {order_id} accepted by shopkeeper (shop: {shop_id}).")

    # M9.1: Refresh invoice with latest ACCEPTED fulfillment status
    try:
        await generate_and_store_invoice_for_order(order_id, force_refresh=True)
    except Exception as inv_err:
        logger.warning(f"Invoice refresh on accept for order {order_id}: {inv_err}")

    updated = await get_order_by_id(order_id)
    if not updated:
        raise OrderError("Failed to load updated order.", status_code=500)
    return updated


async def shopkeeper_cancel_order(
    order_id: str,
    shop_id: str,
    reason: str,
) -> Dict[str, Any]:
    """
    Shopkeeper cancels a PENDING order:
    - Enforces shop ownership
    - Requires non-empty cancellation reason
    - Only PENDING / CREATED orders can be cancelled
    - Transition: PENDING -> CANCELLED
    - Restores deducted inventory back to products table atomically
    - Preserves payment_status and order items snapshots
    - Persists cancellation_reason
    - Returns updated full order details
    """
    clean_reason = (reason or "").strip()
    if not clean_reason:
        raise OrderError("A cancellation reason is required.", status_code=422)

    esc_order_id = _escape(order_id)
    esc_shop_id = _escape(shop_id)
    esc_reason = _escape(clean_reason)
    existing = await get_order_by_id(order_id)
    if not existing:
        raise OrderError("Order not found.", status_code=404)

    if str(existing["shop_id"]) != str(shop_id):
        raise OrderError("You are not authorized to modify orders from another store.", status_code=403)

    if str(existing.get("payment_method", "")).upper() == "ONLINE" and existing.get("payment_status") != "PAID":
        raise OrderError("Unpaid online orders cannot be modified.", status_code=400)

    current_status = existing["status"]
    if current_status not in ("PENDING", "CREATED"):
        raise OrderError(
            f"Cannot cancel order with status '{current_status}'. Only PENDING orders can be cancelled.",
            status_code=400,
        )

    is_online_paid = (
        str(existing.get("payment_method", "")).upper() == "ONLINE"
        and existing.get("payment_status") == "PAID"
    )
    refund_val = "'REFUND_INITIATED'" if is_online_paid else "NULL"

    # Atomic PostgreSQL CTE for shopkeeper cancellation:
    # Atomically updates order and restores stock in a single transaction
    atomic_query = f"""
        WITH target_order AS (
            UPDATE public.orders
            SET status = 'CANCELLED',
                cancellation_reason = {esc_reason},
                refund_status = {refund_val},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = {esc_order_id}
              AND shop_id = {esc_shop_id}
              AND status IN ('CREATED', 'PENDING')
            RETURNING id
        ),
        items_to_restore AS (
            SELECT oi.product_id, SUM(oi.quantity)::integer AS qty
            FROM public.order_items oi
            JOIN target_order o ON o.id = oi.order_id
            GROUP BY oi.product_id
        ),
        restored_products AS (
            UPDATE public.products p
            SET stock = p.stock + itr.qty,
                updated_at = CURRENT_TIMESTAMP
            FROM items_to_restore itr
            WHERE p.id = itr.product_id
            RETURNING p.id
        )
        SELECT id FROM target_order;
    """
    rows = await execute_sql(atomic_query)

    if not rows or not rows[0].get("id"):
        # Check current state if atomic update didn't apply (e.g. concurrent cancel)
        check_order = await get_order_by_id(order_id)
        if check_order and check_order.get("status") == "CANCELLED":
            raise OrderError("Order has already been cancelled.", status_code=400)
        raise OrderError(
            f"Cannot cancel order with status '{check_order.get('status') if check_order else 'UNKNOWN'}'. Only PENDING orders can be cancelled.",
            status_code=400,
        )

    logger.info(f"Order {order_id} cancelled by shopkeeper (shop: {shop_id}) atomically. Reason: {clean_reason}, refund_status: {refund_val}")

    # M9.1: Refresh invoice with CANCELLED status (preserved for COD or Online paid)
    try:
        await generate_and_store_invoice_for_order(order_id, force_refresh=True)
    except Exception as inv_err:
        logger.warning(f"Invoice refresh on cancel for order {order_id}: {inv_err}")

    updated = await get_order_by_id(order_id)
    if not updated:
        raise OrderError("Failed to load updated order.", status_code=500)
    return updated


# ===========================================================================
# Milestone M7.2: Shopkeeper Preparing & Out For Delivery Transitions
# ===========================================================================

async def shopkeeper_prepare_order(order_id: str, shop_id: str) -> Dict[str, Any]:
    """
    Shopkeeper moves an ACCEPTED order to PREPARING:
    - Enforces shop ownership
    - Only ACCEPTED orders can be moved to PREPARING
    - Transition: ACCEPTED -> PREPARING
    - Preserves payment, items, and address snapshots
    - Updates updated_at timestamp
    - Returns updated full order details
    """
    esc_order_id = _escape(order_id)
    existing = await get_order_by_id(order_id)
    if not existing:
        raise OrderError("Order not found.", status_code=404)

    if str(existing["shop_id"]) != str(shop_id):
        raise OrderError("You are not authorized to modify orders from another store.", status_code=403)

    if str(existing.get("payment_method", "")).upper() == "ONLINE" and existing.get("payment_status") != "PAID":
        raise OrderError("Order cannot be prepared before online payment is confirmed.", status_code=400)

    current_status = existing["status"]
    if current_status != "ACCEPTED":
        raise OrderError(
            f"Cannot start preparing order with status '{current_status}'. Only ACCEPTED orders can be moved to PREPARING.",
            status_code=400,
        )

    await execute_sql(f"""
        UPDATE public.orders
        SET status = 'PREPARING',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = {esc_order_id};
    """)
    logger.info(f"Order {order_id} marked as PREPARING by shopkeeper (shop: {shop_id}).")

    # M9.1: Refresh invoice with latest PREPARING fulfillment status
    try:
        await generate_and_store_invoice_for_order(order_id, force_refresh=True)
    except Exception as inv_err:
        logger.warning(f"Invoice refresh on prepare for order {order_id}: {inv_err}")

    updated = await get_order_by_id(order_id)
    if not updated:
        raise OrderError("Failed to load updated order.", status_code=500)
    return updated


async def shopkeeper_out_for_delivery_order(order_id: str, shop_id: str) -> Dict[str, Any]:
    """
    Shopkeeper dispatches a PREPARING order for delivery:
    - Enforces shop ownership
    - Only PREPARING orders can be moved to OUT_FOR_DELIVERY
    - Transition: PREPARING -> OUT_FOR_DELIVERY
    - Preserves payment, items, and address snapshots
    - Updates updated_at timestamp
    - Generates 6-digit Delivery OTP if delivery_method == 'HAND_TO_CUSTOMER'
    - Returns updated full order details
    """
    esc_order_id = _escape(order_id)
    existing = await get_order_by_id(order_id)
    if not existing:
        raise OrderError("Order not found.", status_code=404)

    if str(existing["shop_id"]) != str(shop_id):
        raise OrderError("You are not authorized to modify orders from another store.", status_code=403)

    if str(existing.get("payment_method", "")).upper() == "ONLINE" and existing.get("payment_status") != "PAID":
        raise OrderError("Order cannot be dispatched before online payment is confirmed.", status_code=400)

    current_status = existing["status"]
    if current_status != "PREPARING":
        raise OrderError(
            f"Cannot mark order out for delivery with status '{current_status}'. Only PREPARING orders can be moved to OUT_FOR_DELIVERY.",
            status_code=400,
        )

    await execute_sql(f"""
        UPDATE public.orders
        SET status = 'OUT_FOR_DELIVERY',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = {esc_order_id};
    """)
    logger.info(f"Order {order_id} marked as OUT_FOR_DELIVERY by shopkeeper (shop: {shop_id}).")

    # If delivery_method is HAND_TO_CUSTOMER, automatically generate a new active OTP
    delivery_method = existing.get("delivery_method") or "HAND_TO_CUSTOMER"
    if delivery_method == "HAND_TO_CUSTOMER":
        try:
            await create_or_regenerate_delivery_otp(order_id, is_regeneration=False)
        except Exception as e:
            logger.error(f"Failed to auto-generate delivery OTP for order {order_id}: {e}")

    # M9.1: Refresh invoice with latest OUT_FOR_DELIVERY fulfillment status
    try:
        await generate_and_store_invoice_for_order(order_id, force_refresh=True)
    except Exception as inv_err:
        logger.warning(f"Invoice refresh on out_for_delivery for order {order_id}: {inv_err}")

    updated = await get_order_by_id(order_id)
    if not updated:
        raise OrderError("Failed to load updated order.", status_code=500)
    return updated


# ===========================================================================
# Milestone M8: Delivery & Verification Functions
# ===========================================================================

import base64
import hashlib
import secrets
from datetime import timedelta


def _hash_otp(otp_code: str) -> str:
    """Computes SHA-256 hash of normalized OTP string for secure verification storage."""
    return hashlib.sha256(otp_code.strip().encode("utf-8")).hexdigest()


def _encrypt_otp_code(otp_code: str) -> str:
    """
    Encrypts 6-digit OTP code using AES/XOR cipher keyed with backend secret.
    Stores ciphertext in DB, never plaintext.
    """
    secret = settings.secret_key
    key_bytes = hashlib.sha256(secret.encode("utf-8")).digest()
    code_bytes = otp_code.strip().encode("utf-8")
    cipher = bytes([b ^ key_bytes[i % len(key_bytes)] for i, b in enumerate(code_bytes)])
    return base64.urlsafe_b64encode(cipher).decode("ascii")


def _decrypt_otp_code(cipher_str: str) -> str:
    """Decrypts ciphertext into 6-digit OTP code."""
    secret = settings.secret_key
    key_bytes = hashlib.sha256(secret.encode("utf-8")).digest()
    cipher = base64.urlsafe_b64decode(cipher_str.encode("ascii"))
    code_bytes = bytes([b ^ key_bytes[i % len(key_bytes)] for i, b in enumerate(cipher)])
    return code_bytes.decode("utf-8")


def generate_random_6digit_otp() -> str:
    """Generates cryptographically secure random 6-digit numeric OTP."""
    return f"{secrets.randbelow(900000) + 100000:06d}"


async def create_or_regenerate_delivery_otp(
    order_id: str,
    is_regeneration: bool = True,
) -> Dict[str, Any]:
    """
    Generates or regenerates a fresh 6-digit Delivery OTP for an OUT_FOR_DELIVERY order:
    - Atomically enforces 60-second cooldown between successful OTP generations
    - Atomically enforces maximum 5 successful regenerations per order
    - Validity: 10 minutes from creation
    - Max 5 failed attempts
    - Invalidates any prior active OTPs for this order
    - Stored securely with SHA-256 hash for verification and encrypted ciphertext
    """
    import uuid
    esc_order_id = _escape(order_id)

    otp_code = generate_random_6digit_otp()
    otp_hash = _hash_otp(otp_code)
    encrypted_code = _encrypt_otp_code(otp_code)

    verification_id = f"dv-{uuid.uuid4().hex[:12]}"
    esc_vid = _escape(verification_id)
    esc_hash = _escape(otp_hash)
    esc_enc = _escape(encrypted_code)

    # Validity: 10 minutes
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=10)
    expires_at_iso = expires_at.isoformat()
    esc_exp = _escape(expires_at_iso)
    is_regen_str = "TRUE" if is_regeneration else "FALSE"

    call_query = f"""
        SELECT success, error_code, error_message, retry_after, regenerations_used, regenerations_remaining
        FROM public.regenerate_delivery_otp(
            {esc_order_id},
            {esc_vid},
            {esc_hash},
            {esc_enc},
            {esc_exp}::timestamptz,
            {is_regen_str}
        );
    """
    try:
        rows = await execute_sql(call_query)
    except Exception as e:
        if "regenerate_delivery_otp" in str(e):
            await ensure_order_tables_exist()
            rows = await execute_sql(call_query)
        else:
            raise

    if not rows:
        raise OrderError("Failed to process delivery OTP request.", status_code=500)

    res = rows[0]
    success = res.get("success") is True
    err_code = res.get("error_code") or ""
    err_msg = res.get("error_message") or ""
    retry_after = int(res.get("retry_after") or 0)
    regen_used = int(res.get("regenerations_used") or 0)
    regen_remaining = int(res.get("regenerations_remaining") or 0)

    if not success:
        if err_code == "COOLDOWN_ACTIVE":
            raise OrderError(err_msg, status_code=429, retry_after=retry_after)
        elif err_code == "MAX_REGENERATIONS_EXCEEDED":
            raise OrderError(err_msg, status_code=400)
        elif err_code == "ORDER_NOT_FOUND":
            raise OrderError(err_msg, status_code=404)
        else:
            raise OrderError(err_msg, status_code=400)

    logger.info(f"Generated new Delivery OTP for order {order_id} (valid until {expires_at_iso}). Regenerations: {regen_used}/5 used.")

    return {
        "code": otp_code,
        "expires_at": expires_at_iso,
        "seconds_remaining": 600,
        "attempt_count": 0,
        "max_attempts": 5,
        "is_expired": False,
        "is_locked": False,
        "status": "ACTIVE",
        "cooldown_seconds_remaining": 60,
        "regenerations_used": regen_used,
        "regenerations_remaining": regen_remaining,
        "max_regenerations": 5,
    }


async def get_active_delivery_otp_for_customer(order_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetches current delivery OTP info strictly for authenticated customer order view.
    Checks expiry, attempt limits, cooldown remaining, and regenerations count dynamically.
    Returns None if order is not eligible or no record exists.
    """
    esc_order_id = _escape(order_id)
    query = f"""
        SELECT 
            id, order_id, otp_hash, encrypted_code, attempt_count, status, expires_at, verified_at, created_at,
            (SELECT COUNT(*) FROM public.delivery_verifications WHERE order_id = {esc_order_id}) AS total_otps
        FROM public.delivery_verifications
        WHERE order_id = {esc_order_id}
        ORDER BY created_at DESC
        LIMIT 1;
    """
    rows = await execute_sql(query)
    if not rows:
        return None

    r = rows[0]
    vid = r["id"]
    esc_vid = _escape(vid)
    attempt_count = int(r.get("attempt_count") or 0)
    status_val = r.get("status") or "ACTIVE"

    # Parse expiration
    exp_val = r["expires_at"]
    if isinstance(exp_val, str):
        try:
            exp_dt = datetime.fromisoformat(exp_val.replace("Z", "+00:00"))
        except Exception:
            exp_dt = datetime.now(timezone.utc)
    elif hasattr(exp_val, "tzinfo") and exp_val.tzinfo:
        exp_dt = exp_val
    else:
        exp_dt = exp_val.replace(tzinfo=timezone.utc)

    # Parse created_at for cooldown calculation
    created_val = r.get("created_at")
    if isinstance(created_val, str):
        try:
            created_dt = datetime.fromisoformat(created_val.replace("Z", "+00:00"))
        except Exception:
            created_dt = datetime.now(timezone.utc)
    elif hasattr(created_val, "tzinfo") and created_val.tzinfo:
        created_dt = created_val
    else:
        created_dt = datetime.now(timezone.utc)

    now = datetime.now(timezone.utc)
    seconds_left = int((exp_dt - now).total_seconds())
    seconds_since_created = int((now - created_dt).total_seconds())
    cooldown_seconds_remaining = max(0, 60 - seconds_since_created)

    total_otps = int(r.get("total_otps") or 1)
    regenerations_used = max(0, total_otps - 1)
    regenerations_remaining = max(0, 5 - regenerations_used)

    # Check if expired
    if seconds_left <= 0:
        if status_val == "ACTIVE":
            await execute_sql(f"""
                UPDATE public.delivery_verifications
                SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
                WHERE id = {esc_vid};
            """)
            status_val = "EXPIRED"

        return {
            "code": None,
            "expires_at": exp_dt.isoformat(),
            "seconds_remaining": 0,
            "attempt_count": attempt_count,
            "max_attempts": 5,
            "is_expired": True,
            "is_locked": attempt_count >= 5,
            "status": "EXPIRED",
            "cooldown_seconds_remaining": cooldown_seconds_remaining,
            "regenerations_used": regenerations_used,
            "regenerations_remaining": regenerations_remaining,
            "max_regenerations": 5,
        }

    # Check max attempts exceeded
    if attempt_count >= 5 or status_val == "MAX_ATTEMPTS_EXCEEDED":
        return {
            "code": None,
            "expires_at": exp_dt.isoformat(),
            "seconds_remaining": max(0, seconds_left),
            "attempt_count": attempt_count,
            "max_attempts": 5,
            "is_expired": False,
            "is_locked": True,
            "status": "MAX_ATTEMPTS_EXCEEDED",
            "cooldown_seconds_remaining": cooldown_seconds_remaining,
            "regenerations_used": regenerations_used,
            "regenerations_remaining": regenerations_remaining,
            "max_regenerations": 5,
        }

    if status_val != "ACTIVE":
        return None

    # Active and valid! Decrypt code for customer display
    try:
        decrypted_code = _decrypt_otp_code(r["encrypted_code"])
    except Exception as e:
        logger.error(f"Failed to decrypt OTP for order {order_id}: {e}")
        return None

    return {
        "code": decrypted_code,
        "expires_at": exp_dt.isoformat(),
        "seconds_remaining": seconds_left,
        "attempt_count": attempt_count,
        "max_attempts": 5,
        "is_expired": False,
        "is_locked": False,
        "status": "ACTIVE",
        "cooldown_seconds_remaining": cooldown_seconds_remaining,
        "regenerations_used": regenerations_used,
        "regenerations_remaining": regenerations_remaining,
        "max_regenerations": 5,
    }


async def verify_delivery_otp_by_shopkeeper(order_id: str, shop_id: str, otp_input: str) -> Dict[str, Any]:
    """
    Shopkeeper verifies the 6-digit delivery OTP for an OUT_FOR_DELIVERY order:
    - Enforces shop ownership
    - Only OUT_FOR_DELIVERY orders can be verified
    - Checks delivery_method == 'HAND_TO_CUSTOMER'
    - Matches SHA-256 hash against public.delivery_verifications
    - Max 5 failed attempts; locks on 5th failure
    - Rejects expired OTPs
    - On success: marks verification USED, marks order DELIVERED
    - Returns updated order
    """
    esc_order_id = _escape(order_id)
    order = await get_order_by_id(order_id)
    if not order:
        raise OrderError("Order not found.", status_code=404)

    if str(order["shop_id"]) != str(shop_id):
        raise OrderError("You are not authorized to verify orders from another store.", status_code=403)

    if order["status"] != "OUT_FOR_DELIVERY":
        raise OrderError(
            f"Cannot verify OTP for order with status '{order['status']}'. Only OUT_FOR_DELIVERY orders can be verified.",
            status_code=400,
        )

    if (order.get("delivery_method") or "HAND_TO_CUSTOMER") != "HAND_TO_CUSTOMER":
        raise OrderError(
            "This order was designated for Leave-at-Door contactless delivery and does not use an OTP.",
            status_code=400,
        )

    # Fetch latest verification record
    rows = await execute_sql(f"""
        SELECT id, otp_hash, attempt_count, status, expires_at
        FROM public.delivery_verifications
        WHERE order_id = {esc_order_id}
        ORDER BY created_at DESC
        LIMIT 1;
    """)
    if not rows:
        raise OrderError(
            "No active delivery OTP found for this order. Please ask the customer to generate a new OTP.",
            status_code=400,
        )

    rec = rows[0]
    vid = rec["id"]
    esc_vid = _escape(vid)
    attempt_count = int(rec.get("attempt_count") or 0)
    current_status = rec.get("status") or "ACTIVE"

    if current_status in ("USED", "INVALIDATED"):
        raise OrderError(
            "This delivery OTP is no longer valid. Please ask the customer to generate a new OTP.",
            status_code=400,
        )

    if attempt_count >= 5 or current_status == "MAX_ATTEMPTS_EXCEEDED":
        raise OrderError(
            "This OTP has reached the maximum 5 verification attempts and is locked. Please ask the customer to generate a new OTP.",
            status_code=400,
        )

    # Check expiration
    exp_val = rec["expires_at"]
    if isinstance(exp_val, str):
        try:
            exp_dt = datetime.fromisoformat(exp_val.replace("Z", "+00:00"))
        except Exception:
            exp_dt = datetime.now(timezone.utc)
    elif hasattr(exp_val, "tzinfo") and exp_val.tzinfo:
        exp_dt = exp_val
    else:
        exp_dt = exp_val.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) > exp_dt:
        await execute_sql(f"""
            UPDATE public.delivery_verifications
            SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
            WHERE id = {esc_vid};
        """)
        raise OrderError(
            "Delivery OTP has expired (10-minute validity exceeded). Please ask the customer to generate a new OTP.",
            status_code=400,
        )

    # Compare SHA-256 hash
    clean_otp = str(otp_input).strip()
    if len(clean_otp) != 6 or not clean_otp.isdigit():
        raise OrderError("Please provide a valid 6-digit numeric OTP.", status_code=400)

    computed_hash = _hash_otp(clean_otp)
    if computed_hash == rec["otp_hash"]:
        # Correct OTP!
        await execute_sql(f"""
            UPDATE public.delivery_verifications
            SET status = 'USED',
                verified_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = {esc_vid};
        """)
        # For COD orders, successful delivery OTP verification confirms cash collection
        is_cod = str(order.get("payment_method") or "").upper() == "COD"
        update_payment_sql = ", payment_status = 'PAID'" if is_cod else ""
        await execute_sql(f"""
            UPDATE public.orders
            SET status = 'DELIVERED'{update_payment_sql},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = {esc_order_id};
        """)
        logger.info(f"Order {order_id} successfully verified with OTP and marked DELIVERED by shopkeeper. (COD paid: {is_cod})")

        # M9.1: Refresh invoice AFTER both status and payment_status are updated
        try:
            await generate_and_store_invoice_for_order(order_id, force_refresh=True)
        except Exception as inv_err:
            logger.warning(f"Invoice refresh on delivery for order {order_id}: {inv_err}")

        updated_order = await get_order_by_id(order_id)
        if not updated_order:
            raise OrderError("Failed to load updated order.", status_code=500)
        return updated_order
    else:
        # Failed attempt
        new_attempts = attempt_count + 1
        if new_attempts >= 5:
            await execute_sql(f"""
                UPDATE public.delivery_verifications
                SET attempt_count = 5,
                    status = 'MAX_ATTEMPTS_EXCEEDED',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = {esc_vid};
            """)
            raise OrderError(
                "Incorrect OTP. Maximum attempts (5/5) reached. This OTP is now locked. Please ask the customer to generate a new OTP.",
                status_code=400,
            )
        else:
            await execute_sql(f"""
                UPDATE public.delivery_verifications
                SET attempt_count = {new_attempts},
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = {esc_vid};
            """)
            remaining = 5 - new_attempts
            raise OrderError(
                f"Incorrect delivery OTP. {remaining} attempt(s) remaining.",
                status_code=400,
            )


async def mark_order_delivered_leave_at_door(order_id: str, shop_id: str) -> Dict[str, Any]:
    """
    Shopkeeper marks a LEAVE_AT_DOOR order as DELIVERED:
    - Enforces shop ownership
    - Only OUT_FOR_DELIVERY orders can be moved to DELIVERED
    - Enforces delivery_method == 'LEAVE_AT_DOOR' (HAND_TO_CUSTOMER requires OTP)
    - Updates updated_at timestamp
    - For COD orders, marks payment_status as PAID upon delivery
    - Returns updated full order details
    """
    esc_order_id = _escape(order_id)
    order = await get_order_by_id(order_id)
    if not order:
        raise OrderError("Order not found.", status_code=404)

    if str(order["shop_id"]) != str(shop_id):
        raise OrderError("You are not authorized to modify orders from another store.", status_code=403)

    if order["status"] != "OUT_FOR_DELIVERY":
        raise OrderError(
            f"Cannot mark order delivered with status '{order['status']}'. Only OUT_FOR_DELIVERY orders can be moved to DELIVERED.",
            status_code=400,
        )

    delivery_method = order.get("delivery_method") or "HAND_TO_CUSTOMER"
    if delivery_method != "LEAVE_AT_DOOR":
        raise OrderError(
            "This order requires customer OTP verification for Hand-to-Customer delivery.",
            status_code=400,
        )

    # For COD orders, contactless drop-off completion confirms settlement
    is_cod = str(order.get("payment_method") or "").upper() == "COD"
    update_payment_sql = ", payment_status = 'PAID'" if is_cod else ""
    await execute_sql(f"""
        UPDATE public.orders
        SET status = 'DELIVERED'{update_payment_sql},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = {esc_order_id};
    """)
    logger.info(f"LEAVE_AT_DOOR Order {order_id} marked as DELIVERED by shopkeeper (shop: {shop_id}). (COD paid: {is_cod})")

    # M9.1: Refresh invoice AFTER both status and payment_status are updated
    try:
        await generate_and_store_invoice_for_order(order_id, force_refresh=True)
    except Exception as inv_err:
        logger.warning(f"Invoice refresh on delivery for order {order_id}: {inv_err}")

    updated_order = await get_order_by_id(order_id)
    if not updated_order:
        raise OrderError("Failed to load updated order.", status_code=500)
    return updated_order


# ===========================================================================
# Milestone M9: Invoice Database & Generation Operations
# ===========================================================================

async def get_invoice_by_order_id(order_id: str) -> Optional[Dict[str, Any]]:
    """Fetches existing invoice record from public.invoices for the given order_id."""
    esc_order_id = _escape(order_id)
    query = f"""
        SELECT id, order_id, invoice_number, storage_key, created_at, updated_at
        FROM public.invoices
        WHERE order_id = {esc_order_id}
        LIMIT 1;
    """
    rows = await execute_sql(query)
    if not rows:
        return None
    r = rows[0]
    return {
        "id": r["id"],
        "order_id": r["order_id"],
        "invoice_number": r["invoice_number"],
        "storage_key": r["storage_key"],
        "created_at": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
        "updated_at": r["updated_at"].isoformat() if hasattr(r["updated_at"], "isoformat") else str(r["updated_at"]),
    }


async def is_order_eligible_for_invoice(order: Dict[str, Any]) -> tuple[bool, str]:
    """
    Checks if an order is eligible for invoice generation:
    - COD: eligible upon order creation, throughout fulfillment, upon delivery, and if cancelled
    - ONLINE: eligible only if payment_status == 'PAID' (throughout fulfillment and if cancelled with refund)
    - CANCELLED unpaid online orders: not eligible
    Returns (is_eligible, reason_if_not)
    """
    pm = str(order.get("payment_method") or "COD").upper()
    ps = str(order.get("payment_status") or "PENDING").upper()
    order_status = str(order.get("status") or "").upper()

    if pm == "ONLINE" and ps != "PAID":
        if order_status == "CANCELLED":
            return False, "Invoice is not available for cancelled unpaid online orders."
        return False, "Invoice is not available yet. Invoices for online orders are generated once payment is confirmed."

    if pm == "COD":
        return True, ""

    if pm == "ONLINE" and ps == "PAID":
        return True, ""

    return False, "Order payment method is not eligible for invoice generation."


# Per-order async concurrency locks to ensure exactly one invoice generation per order
_INVOICE_LOCKS: Dict[str, asyncio.Lock] = {}
_INVOICE_LOCKS_GUARD = asyncio.Lock()


async def get_order_invoice_lock(order_id: str) -> asyncio.Lock:
    """
    Returns an order-scoped asyncio.Lock to serialize concurrent invoice operations
    for the same order without requiring external distributed lock infrastructure.
    """
    async with _INVOICE_LOCKS_GUARD:
        if order_id not in _INVOICE_LOCKS:
            _INVOICE_LOCKS[order_id] = asyncio.Lock()
        return _INVOICE_LOCKS[order_id]


async def _generate_and_store_invoice_unlocked(
    order_id: str,
    order: Optional[Dict[str, Any]] = None,
    force_refresh: bool = False,
) -> Dict[str, Any]:
    """
    Internal invoice generation and storage worker.
    Assumes caller is already running under the per-order lock.
    - Double checks if an invoice was already created to prevent duplicate work.
    - Generates PDF using ReportLab in a thread pool (asyncio.to_thread) to avoid event loop blocking.
    - Uploads PDF to private InsForge storage bucket.
    - Upserts record into public.invoices table with ON CONFLICT (order_id) DO UPDATE.
    """
    import uuid
    from storage import upload_invoice_pdf
    import invoice_generator

    if not order:
        order = await get_order_by_id(order_id)
    if not order:
        raise OrderError("Order not found.", status_code=404)

    eligible, reason = await is_order_eligible_for_invoice(order)
    if not eligible:
        raise OrderError(reason, status_code=400)

    existing_inv = await get_invoice_by_order_id(order_id)
    if existing_inv and not force_refresh:
        return existing_inv

    # Generate or reuse invoice number
    if existing_inv:
        invoice_number = existing_inv["invoice_number"]
        inv_id = existing_inv["id"]
    else:
        # Deterministic, unique invoice number format: INV-YYYYMMDD-<SUFFIX>
        order_suffix = order_id.replace("ord-", "").replace("-", "").upper()[:8]
        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        invoice_number = f"INV-{date_str}-{order_suffix}"
        inv_id = f"inv-{uuid.uuid4().hex[:12]}"

    # Offload CPU-bound ReportLab rendering to thread pool so it does NOT block the asyncio event loop
    pdf_bytes = await asyncio.to_thread(invoice_generator.generate_invoice_pdf, order, invoice_number)

    # Upload to private InsForge storage
    storage_key = await upload_invoice_pdf(
        content=pdf_bytes,
        customer_id=order["customer_id"],
        order_id=order_id,
        invoice_number=invoice_number,
    )

    # Persist in public.invoices table
    esc_inv_id = _escape(inv_id)
    esc_order_id = _escape(order_id)
    esc_inv_num = _escape(invoice_number)
    esc_key = _escape(storage_key)

    upsert_query = f"""
        INSERT INTO public.invoices (
            id, order_id, invoice_number, storage_key, created_at, updated_at
        ) VALUES (
            {esc_inv_id}, {esc_order_id}, {esc_inv_num}, {esc_key}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (order_id) DO UPDATE
        SET storage_key = EXCLUDED.storage_key,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id, order_id, invoice_number, storage_key, created_at, updated_at;
    """
    rows = await execute_sql(upsert_query)
    if not rows:
        raise OrderError("Failed to save invoice record.", status_code=500)

    r = rows[0]
    logger.info(f"Successfully generated and stored invoice {invoice_number} for order {order_id}.")
    return {
        "id": r["id"],
        "order_id": r["order_id"],
        "invoice_number": r["invoice_number"],
        "storage_key": r["storage_key"],
        "created_at": r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
        "updated_at": r["updated_at"].isoformat() if hasattr(r["updated_at"], "isoformat") else str(r["updated_at"]),
    }


async def generate_and_store_invoice_for_order(order_id: str, force_refresh: bool = False) -> Dict[str, Any]:
    """
    Public entry point with per-order locking:
    - Serializes concurrent generation attempts for the same order.
    - If another task already completed invoice generation, returns existing invoice immediately.
    - Retry-safe and idempotent.
    """
    lock = await get_order_invoice_lock(order_id)
    async with lock:
        return await _generate_and_store_invoice_unlocked(order_id, force_refresh=force_refresh)


async def get_invoice_pdf_bytes_for_order(order_id: str, force_refresh: bool = False) -> tuple[Dict[str, Any], bytes]:
    """
    Retrieves the invoice metadata and raw PDF bytes for an order:
    - Runs under per-order lock so concurrent requests or background tasks do not race.
    - If invoice exists, downloads from private storage.
    - If force_refresh or if order was updated after invoice, regenerates PDF.
    - If storage download fails or invoice does not exist yet (but eligible), generates and uploads it.
    - PDF rendering is safely offloaded to thread pool.
    Returns (invoice_dict, pdf_bytes).
    """
    from storage import download_invoice_pdf_bytes
    import invoice_generator

    order = await get_order_by_id(order_id)
    if not order:
        raise OrderError("Order not found.", status_code=404)

    eligible, reason = await is_order_eligible_for_invoice(order)
    if not eligible:
        raise OrderError(reason, status_code=400)

    lock = await get_order_invoice_lock(order_id)
    async with lock:
        inv = await get_invoice_by_order_id(order_id)
        needs_refresh = force_refresh
        if inv and not needs_refresh:
            inv_up = str(inv.get("updated_at") or "")
            ord_up = str(order.get("updated_at") or "")
            if inv_up and ord_up and inv_up < ord_up:
                needs_refresh = True

        if not inv or needs_refresh:
            inv = await _generate_and_store_invoice_unlocked(order_id, order=order, force_refresh=True)

        pdf_bytes = await download_invoice_pdf_bytes(inv["storage_key"])
        if not pdf_bytes:
            # Self-healing fallback: regenerate and re-upload if storage object was lost
            inv = await _generate_and_store_invoice_unlocked(order_id, order=order, force_refresh=True)
            pdf_bytes = await download_invoice_pdf_bytes(inv["storage_key"])

        if not pdf_bytes:
            # Direct in-memory generation fallback (offloaded to thread)
            pdf_bytes = await asyncio.to_thread(invoice_generator.generate_invoice_pdf, order, inv["invoice_number"])

        return inv, pdf_bytes





