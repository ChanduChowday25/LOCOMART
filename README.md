# LOCOMART — Local Grocery Assistance Platform

> **Status:** Full-Stack Implementation Complete (Milestones M1–M10)  
> Connects local neighborhood grocery stores with customers for local ordering, delivery verification, and digital invoicing.

---

## 1. Project Purpose & Architecture

LOCOMART is a full-featured local grocery ordering platform. Customers browse neighborhood shops, manage a cart, place orders via Cash on Delivery (COD) or Stripe Test Mode, and verify order delivery via a 6-digit OTP or contactless Leave-at-Door proof. Shopkeepers manage product catalogs, inventory, and order fulfillment. Administrators review and approve merchant applications.

### Architecture Overview

```
React 19 + Vite Frontend (TypeScript)
    │
    │  Client Authentication (InsForge Auth SDK)
    ▼
InsForge Auth Service (JWT Sessions & Google OAuth)

React 19 + Vite Frontend (TypeScript)
    │
    │  Application REST API (/api/v1/...)
    ▼
FastAPI Backend (Python 3.11+)
    │
    ├── InsForge PostgreSQL Database (Admin API / Advance Raw SQL)
    │   └── Row Level Security (RLS) enabled across all 11 application tables
    │
    ├── InsForge Private Storage
    │   ├── 'shop-documents' (Merchant KYC documents & storefront photos)
    │   └── 'invoices' (Generated PDF invoices with authenticated proxy streaming)
    │
    └── Stripe Gateway (Test Mode Checkout Sessions & Webhooks)
```

- **React + Vite Frontend:** Responsive single-page application built with React 19, TypeScript, and modern modular CSS. Uses `@insforge/sdk` strictly for user authentication. All business data flows through FastAPI.
- **FastAPI Backend:** The authoritative security and business boundary. Enforces role-based access control (`CUSTOMER`, `SHOPKEEPER`, `ADMIN`), transaction isolation, inventory locking, and order fulfillment verification.
- **InsForge Infrastructure:** Hosted PostgreSQL database, authentication with email/password and Google OAuth, and private file storage buckets.
- **Stripe Integration:** Secure Stripe-hosted Checkout sessions for online card payments in test mode with cryptographic webhook signature verification and replay prevention.

---

## 2. Implemented Features & Milestones

1. **Authentication & Role-Based Access Control (M1):**
   - Three distinct portal entries: Customer, Shopkeeper, and Admin.
   - Public registrations strictly default to `CUSTOMER`.
   - Role verification on login prevents cross-portal access.
   - Secure token verification cache with short TTL.
2. **Merchant Onboarding & Admin Verification (M2):**
   - Customers can submit a merchant application with store details and KYC documents.
   - KYC documents stored in private InsForge storage buckets.
   - Admin review dashboard with approval (auto-creates active shop & promotes role to `SHOPKEEPER`) or rejection with reason.
3. **Shop & Product Management (M3):**
   - Public shop directory and product catalog browsing with real-time category filtering and text search.
   - Shopkeeper inventory management: add, edit, adjust stock, toggle availability, and archive products.
4. **Customer Shopping Cart (M4):**
   - Single-shop cart enforcement preventing cross-store item mixing.
   - Real-time stock validation and quantity adjustments.
5. **Transactional Order Placement & Inventory Reservation (M5):**
   - Server-side atomic order creation using PostgreSQL stored procedure (`create_order_from_cart`) with row-level locks (`SELECT ... FOR UPDATE`).
   - Order price snapshotting preventing client-side price tampering.
6. **Payment Processing (M6):**
   - Cash on Delivery (COD) and Online Payment via Stripe Test Mode.
   - Server-side Stripe Checkout session creation.
   - Webhook processing with cryptographic signature verification (`STRIPE_WEBHOOK_SECRET`) and idempotency tracking table (`stripe_webhook_events`).
7. **Order Fulfillment Lifecycle (M7):**
   - Multi-step status progression: `PENDING` -> `ACCEPTED` -> `PREPARING` -> `OUT_FOR_DELIVERY` -> `DELIVERED` (or `CANCELLED`).
   - Customer-initiated online checkout cancellation with atomic inventory restoration.
8. **Delivery Handover Verification (M8):**
   - **Hand-to-Customer:** 6-digit delivery OTP generated at dispatch, verified by shopkeeper at handover. Rate-limited regeneration with cooldown. OTP is never exposed to merchants.
   - **Leave-at-Door:** Contactless verification workflow for door drop-offs.
9. **Automated PDF Invoice Generation (M9):**
   - ReportLab PDF generator creating branded invoices with order snapshots and Unicode Indian Rupee (₹) support.
   - Uploaded to private `invoices` InsForge storage bucket.
   - Secure authenticated streaming endpoint with customer/shopkeeper ownership authorization.
10. **Security Hardening (SEC-01 – SEC-10 & Database Protection):**
    - PostgreSQL Row Level Security (RLS) enabled on all 11 tables.
    - PostgREST table and RPC function grants revoked from `anon` and `authenticated` roles.
    - Webhook handler fails closed when secrets are unconfigured.
    - Production `SECRET_KEY` validator enforcing strong random keys.
    - Safe CORS origin verification for Stripe redirects.

---

## 3. Database Schema

All 11 application tables reside in the `public` schema in InsForge PostgreSQL. Under SEC-03, direct PostgREST table access and custom RPC function execution (`create_order_from_cart`, `regenerate_delivery_otp`) have been revoked from `anon` and `authenticated` roles, with PostgreSQL Row-Level Security (RLS) enabled across all tables as defense in depth. All application data flows strictly through the FastAPI backend:

| Table Name | Description | Key Columns |
| :--- | :--- | :--- |
| `public.users` | User accounts & delivery profiles | `id`, `email`, `role`, `name`, `phone`, `address`, `city`, `state`, `pincode` |
| `public.shops` | Approved local merchant stores | `id`, `owner_id`, `name`, `description`, `business_phone`, `address`, `city`, `is_active`, `is_open` |
| `public.products` | Store item catalog & live stock | `id`, `shop_id`, `name`, `category`, `unit_label`, `price`, `stock`, `is_available`, `is_archived` |
| `public.shopkeeper_applications` | KYC merchant registration requests | `id`, `user_id`, `applicant_name`, `shop_name`, `document_url`, `status`, `rejection_reason` |
| `public.carts` | Active customer cart session | `id`, `customer_id`, `shop_id`, `status` |
| `public.cart_items` | Cart line items & quantities | `id`, `cart_id`, `product_id`, `quantity` |
| `public.orders` | Placed customer orders | `id`, `customer_id`, `shop_id`, `status`, `subtotal`, `total`, `payment_method`, `payment_status`, `delivery_method` |
| `public.order_items` | Itemized order snapshots | `id`, `order_id`, `product_id`, `product_name_snapshot`, `unit_price`, `quantity`, `subtotal` |
| `public.delivery_verifications` | OTP delivery security records | `id`, `order_id`, `otp_hash`, `encrypted_code`, `attempt_count`, `status`, `expires_at` |
| `public.stripe_webhook_events` | Webhook idempotency tracking | `event_id`, `event_type`, `order_id`, `created_at` |
| `public.invoices` | Generated invoice PDF records | `id`, `order_id`, `invoice_number`, `storage_key` |

---

## 4. Environment Configuration

Copy `.env.example` to create the appropriate environment files:
- Backend: `backend/.env`
- Frontend: `frontend/.env`

### Backend Variables (`backend/.env`)

```ini
APP_ENV=development                       # Set to 'production' in production
APP_DEBUG=true                            # Forced to False when APP_ENV=production
SECRET_KEY=your-secure-random-secret-key  # Must be 32+ chars in production

# InsForge BaaS Connection
INSFORGE_URL=https://<your-project>.insforge.app
INSFORGE_API_KEY=<your-insforge-admin-api-key>
INSFORGE_ANON_KEY=<your-insforge-anon-key>

# CORS — Allowed Frontend Origins (comma-separated)
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# Stripe Test Mode
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Frontend Variables (`frontend/.env`)

```ini
VITE_API_URL=http://localhost:8000
VITE_INSFORGE_URL=https://<your-project>.insforge.app
VITE_INSFORGE_ANON_KEY=<your-insforge-anon-key>
```

> **Build Note:** In production, `VITE_API_URL` must point to the production backend API URL before running `npm run build`, as Vite compiles environment variables into static client bundles at build time.

---

## 5. Local Setup & Running

### Prerequisites
- Python 3.11+
- Node.js 18+ & npm

### Terminal 1: FastAPI Backend
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
- API runs on `http://localhost:8000`.
- Interactive Swagger docs available at `http://localhost:8000/docs` (disabled when `APP_ENV=production`).

### Terminal 2: React Frontend
```powershell
cd frontend
npm install
npm run dev
```
- Frontend runs on `http://localhost:5173`.

---

## 6. Administrative Utilities

### Seed Initial Demo Stores
To populate the database with the initial four approved demo stores and merchant accounts:
```powershell
cd backend
python seed_demo_shops.py
```

### Promote User Role (Admin Tool)
To assign `ADMIN` or `SHOPKEEPER` roles without public sign-up backdoors:
```powershell
cd backend
python set_role.py admin@locomart.com ADMIN
python set_role.py shopkeeper@locomart.com SHOPKEEPER
```

---

## 7. Authentication & OAuth Setup

- Google OAuth is integrated into the frontend via `@insforge/sdk` using `signInWithOAuth('google')`.
- In development, the redirect URI is `http://localhost:5173/auth/callback`.
- When deploying to production, add your production domain redirect URL (`https://<your-domain>/auth/callback`) in the InsForge dashboard under **Auth Methods -> Google -> Redirect URLs**.
