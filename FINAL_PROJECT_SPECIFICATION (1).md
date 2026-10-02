# Local Grocery Assistance Platform — Final Project Specification

**Version:** 2.1 — Final Agreed Scope  
**Date:** 2 October 2026  
**Status:** Source of truth for implementation

---

## 1. Project Purpose

Build a realistic, portfolio-sized local grocery ordering platform.

The application connects customers with four predefined local shops. Customers can browse products, add quantities to a cart, place an order using Cash on Delivery or Stripe Test Mode, and track the order. Shopkeepers manage their own shop, products, inventory, and incoming orders. Admins approve shopkeeper applications before shops become active.

The project must demonstrate:

- Authentication and Google OAuth
- Role-based access
- Admin approval workflow
- React + FastAPI full-stack development
- PostgreSQL database
- Shopping cart and inventory management
- Online and COD payments
- Order workflow
- Delivery OTP
- Leave-at-door delivery
- Invoice generation/download
- Private file storage
- Secure backend business rules

The project is intentionally **portfolio-sized**. Do not turn it into a production-scale logistics platform.

---

# 2. Technology Stack

## Frontend

- React
- Vite
- TypeScript
- React Router
- Tailwind CSS
- Axios or equivalent HTTP client

## Backend

- Python
- FastAPI
- SQLAlchemy
- Alembic
- PostgreSQL driver

## Infrastructure

- InsForge
  - PostgreSQL
  - Authentication
  - Google OAuth where supported
  - Storage
  - Deployment/hosting where appropriate

## Payments

- Stripe Test Mode only
- No real-money transactions

## Development

- Git
- GitHub
- Antigravity
- MCP

---

# 3. User Roles

Exactly three application roles:

1. CUSTOMER
2. SHOPKEEPER
3. ADMIN

Newly registered users become CUSTOMER.

Creating an account must never automatically create a shop or grant shopkeeper permissions.

A customer must submit a shopkeeper application and receive admin approval before becoming a SHOPKEEPER.

---

# 4. Authentication

Users can:

- Register/login with email and password
- Login with Google OAuth
- Logout

Authentication is handled through InsForge Auth.

FastAPI must verify the authenticated identity and enforce application roles and ownership.

Admin accounts are created through controlled developer/admin setup and are not available through normal public registration.

---

# 5. Customer Profile

After login, the customer dashboard contains a sidebar.

Example:

```text
CUSTOMER SIDEBAR

🏪 Shops
🛒 Cart
📦 My Orders
👤 Profile
🔔 Notifications
🚪 Logout
```

The Profile page/panel allows the customer to edit:

- Name
- Email
- Phone number
- Full delivery address
- City
- State
- Pincode

Example:

```text
MY PROFILE

Name
[ Chandu ]

Email
[ chandu@gmail.com ]

Phone
[ 9876543210 ]

Address
[ 12, ABC Street ]

City
[ Chennai ]

State
[ Tamil Nadu ]

Pincode
[ 600001 ]

[ Save Changes ]
```

Changing the email must update the authentication account through the supported InsForge Auth mechanism. If email verification is required, use the provider's verification flow.

An existing order must preserve the delivery address, phone number, customer name, and other relevant details that existed when the order was placed.

Changing the profile later must not change historical orders.

---

# 6. Shopkeeper Application and Admin Approval

A normal customer can choose:

**Become a Shopkeeper**

The application contains:

### Applicant Information

- Shopkeeper name
- Email
- Personal phone number

### Shop Information

- Shop name
- Shop address
- Shop phone number
- Shop registration phone number/registration identifier

### Verification Information

- Shop photo
- Shop registration/supporting document photo

Uploaded images/documents are stored in InsForge Storage.

Application status:

```text
PENDING
APPROVED
REJECTED
```

Flow:

```text
CUSTOMER
   ↓
Submit Shopkeeper Application
   ↓
PENDING
   ↓
ADMIN REVIEW
   ├── APPROVE → Shop created + user becomes SHOPKEEPER
   └── REJECT  → User remains CUSTOMER
```

Rejected applicants may submit another application later.

Only an approved shopkeeper can manage products and receive orders for their shop.

---

# 7. Four Shops

The platform will have four approved shops.

Every customer sees the same four shops.

There is:

- No Google Maps
- No live GPS
- No automatic nearest-shop calculation
- No location-based shop filtering

The four shops can be seeded/admin-created for the portfolio demonstration.

Example:

- FreshMart
- Green Valley Groceries
- Sri Lakshmi Stores
- Daily Needs Mart

The actual shopkeeper accounts are associated with these approved shops.

---

# 8. Shop Management

A shopkeeper can manage their own shop:

- Shop name
- Description
- Address
- Phone number
- Shop photo
- Open/closed or accepting-orders status

A shopkeeper can never manage another shop.

An inactive/closed shop should not accept new orders.

Existing order information remains accessible to the appropriate shopkeeper/admin.

---

# 9. Products

Each product belongs to exactly one shop.

Product fields:

- Product ID
- Shop ID
- Name
- Description
- Category
- Unit label
- Price
- Stock quantity
- Product image
- Available/unavailable status
- Created/updated timestamps

Example:

```text
Wheat Packet
₹60
Stock: 100
Available: Yes
```

Shopkeepers can:

- Add products
- Edit products
- Change price
- Change stock
- Mark available/unavailable
- Upload/change product image
- Archive a product

Customers only see products that are available and currently purchasable.

---

# 10. Product Availability and Alternative Shops

If a product is unavailable at the selected shop, the customer must clearly see that it is unavailable.

Example:

```text
Wheat Packet

Currently unavailable at FreshMart.

[ Contact Shop ]
[ Find at Other Shops ]
```

## Contact Shop

The customer can see the shop's public business phone number and use a **Call Shop** button on supported devices.

The application does not need to implement an internal calling system.

The purpose is to allow the customer to directly contact the shopkeeper and ask whether:

- The product will become available
- An alternative product is available
- Another arrangement is possible

Do not expose private personal information of the shopkeeper. Only the shop's configured business contact number is displayed.

## Find at Other Shops

The customer can choose:

**Find this product at other shops**

The system searches the four shops and displays matching available products.

Example:

```text
Wheat Packet

FreshMart
Unavailable

Available at:

Green Valley Groceries
₹62
[ View Product ]

Sri Lakshmi Stores
₹60
[ View Product ]
```

If the customer chooses another shop, the customer can view that shop's product and start a new cart/order there.

The customer must not silently combine products from multiple shops in one order.

---

# 11. Cart

A customer has one active cart.

A cart can contain products from only one shop.

Customer actions:

- Add product
- Increase quantity
- Decrease quantity
- Remove product
- Clear cart

Example:

```text
Wheat       × 1
Milk        × 2
Eggs        × 1
```

The cart displays:

- Product
- Unit price
- Quantity
- Item total
- Subtotal
- Final total

If the customer wants to shop from another shop while the cart contains products from the current shop, the UI must ask for confirmation before clearing/switching the cart.

---

# 12. Quantity and Inventory

Quantities are whole numbers.

Example:

```text
Wheat stock before order = 100

Customer orders:
Wheat × 2

New stock:
98
```

The order item records:

```text
product = Wheat
quantity = 2
```

The shopkeeper sees:

```text
Wheat
Current Stock: 98
```

The order dashboard separately shows:

```text
Wheat × 2
```

This allows the shopkeeper to pick the exact quantity requested by the customer.

## Stock validation

The backend must verify stock before accepting an order.

If:

```text
Stock = 1
Customer requests = 2
```

the order must not be accepted.

Return a clear insufficient-stock error and refresh the relevant product/cart information.

Stock must never become negative.

Stock decrement must occur transactionally so concurrent orders cannot oversell the same inventory.

---

# 13. Payment Failure and Stock Restoration

When an order is created for online payment, the system may temporarily reduce/reserve the ordered stock while payment is being completed.

If the online payment fails, is abandoned, or the order is cancelled because payment was not completed, the reserved quantity must be returned.

Example:

```text
Stock = 100
   ↓
Online order for 2
   ↓
Stock = 98
   ↓
Payment fails / order cancelled
   ↓
Stock = 100
```

For a successfully placed COD order, the stock remains deducted.

The implementation must ensure that stock is changed exactly once.

---

# 14. Customer Shopping Flow

```text
Login
  ↓
Customer Dashboard
  ↓
View 4 Shops
  ↓
Select Shop
  ↓
View Products
  ↓
Add Products
  ↓
Cart
  ↓
Checkout
```

Customers can browse products without sharing their location.

---

# 15. Delivery Address

At checkout the customer can select/use their saved profile address or enter/update delivery information.

Required information:

- Customer name
- Phone number
- Full address
- City
- State
- Pincode

The order stores a snapshot of the delivery details.

---

# 16. Checkout

Checkout displays:

```text
ORDER SUMMARY

Wheat × 2       ₹120
Milk × 1         ₹30
Eggs × 1         ₹70
---------------------
Total            ₹220

Delivery Address:
...

Payment Method:
○ Cash on Delivery
○ Online Payment

Delivery Method:
○ Hand to Customer
○ Leave at Door

[ Confirm Order ]
```

The backend calculates prices and totals from database data.

The frontend must never be trusted for final prices, stock, or totals.

---

# 17. Payment

Two payment methods:

## Cash on Delivery

```text
Payment Method = COD
Payment Status = PENDING
```

The order is sent to the shopkeeper after successful order creation.

## Online Payment

Use Stripe Test Mode only.

Flow:

```text
Customer confirms order
        ↓
Stripe Test Checkout
        ↓
Payment succeeds
        ↓
Payment verified by backend/webhook
        ↓
Order becomes confirmed for shop processing
        ↓
Shopkeeper receives order
```

The browser redirect alone must not be treated as payment confirmation.

Stripe secret keys remain server-side.

The UI must clearly indicate:

**TEST MODE — No real money will be charged.**

---

# 18. Order

An order contains:

- Order ID
- Human-readable order number
- Customer ID
- Shop ID
- Customer name snapshot
- Phone snapshot
- Address snapshot
- Order items
- Product name snapshot
- Price snapshot
- Quantity
- Total amount
- Payment method
- Payment status
- Order status
- Delivery method
- Created timestamp
- Updated timestamp

Historical orders must remain unchanged if the customer later edits their profile or the shopkeeper changes a product price.

---

# 19. Order Status

The main order lifecycle is:

```text
PENDING
   ↓
ACCEPTED
   ↓
PREPARING
   ↓
OUT_FOR_DELIVERY
   ↓
DELIVERED
```

Cancellation:

```text
PENDING
   ↓
CANCELLED
```

The shopkeeper can accept or cancel a pending order.

The customer can cancel only while the order is still cancellable according to the implemented order rules.

The backend owns the valid state transitions.

---

# 20. Shopkeeper Order Dashboard

When a customer successfully places an order, it appears in the corresponding shopkeeper dashboard.

Example:

```text
NEW ORDER #ORD-1001

Customer:
Chandu

Phone:
XXXXXXXXXX

Address:
12, ABC Street
Chennai
Tamil Nadu
600001

Items:
-----------------------
Wheat       × 2
Milk        × 1
Eggs        × 1
-----------------------

Total: ₹220

Payment:
Cash on Delivery

Delivery:
Hand to Customer

Status:
PENDING

[ ACCEPT ORDER ]
[ CANCEL ORDER ]
```

The shopkeeper sees only orders belonging to their own shop.

---

# 21. Shopkeeper Fulfillment

After accepting:

```text
PENDING
   ↓
ACCEPTED
   ↓
PREPARING
   ↓
OUT_FOR_DELIVERY
```

The customer sees each status update.

Example:

```text
ORDER #ORD-1001

✓ Order Placed
✓ Order Accepted
✓ Preparing
○ Out for Delivery
○ Delivered
```

The shopkeeper can see the ordered quantities and current inventory while preparing the order.

---

# 22. Delivery Method

The customer chooses one of two methods at checkout:

### Hand to Customer

The order is handed directly to the customer.

OTP verification is required.

### Leave at Door

The order can be left at the customer's specified delivery address.

OTP is not required.

---

# 23. OTP Delivery Verification

For Hand to Customer:

1. Order becomes OUT_FOR_DELIVERY.
2. Customer generates/views a 6-digit delivery OTP.
3. OTP has an expiration time.
4. Delivery person/shopkeeper enters the OTP.
5. Backend verifies it.
6. Successful verification changes the order to DELIVERED.

Example:

```text
DELIVERY OTP

482913

Share this code only with the delivery person.
```

The backend must not store plaintext OTP values.

Use secure hashing/HMAC and limit incorrect attempts.

No SMS provider is required.

---

# 24. Leave-at-Door Delivery

For Leave at Door:

```text
OUT_FOR_DELIVERY
       ↓
Shopkeeper confirms delivery
       ↓
DELIVERED
```

No OTP is required.

Record:

- Delivery method
- Delivery timestamp
- Order status

---

# 25. Invoice

An invoice must be available to the customer after a successful order is placed.

The invoice represents the order snapshot at the time the order was created.

For COD:

```text
Order placed
   ↓
Invoice available
   ↓
Payment method = Cash on Delivery
```

For online payment:

```text
Successful payment verification
   ↓
Invoice available
```

The invoice should clearly show its payment status.

After delivery, the invoice can be finalized with the delivery status/timestamp if desired.

Invoice PDF contains:

- Invoice number
- Order number
- Shop name
- Customer name
- Customer address
- Customer phone
- Order date
- Products
- Quantities
- Unit prices
- Item totals
- Total amount
- Payment method
- Payment status
- Delivery method
- Order status
- Appropriate test-mode/non-tax-document note

Example:

```text
LOCAL GROCERY ASSISTANCE PLATFORM

Invoice: INV-2026-0001
Order: ORD-1001

Shop: FreshMart

Wheat       2 × ₹60     ₹120
Milk        1 × ₹30      ₹30
Eggs        1 × ₹70      ₹70
----------------------------
Total                   ₹220

Payment: Cash on Delivery
Delivery: Hand to Customer
Status: PENDING
```

The customer gets:

**View Invoice**

**Download Invoice**

Invoices are stored in private InsForge Storage.

Only authorized users can access them.

---

# 26. Notifications

Use simple database-backed in-app notifications.

Important events:

- Shopkeeper application approved
- Shopkeeper application rejected
- New order
- Order accepted
- Order cancelled
- Order preparing
- Order out for delivery
- Order delivered
- Invoice ready

WebSockets are not required.

The frontend can poll/refresh order status for active orders.

---

# 27. Admin Dashboard

Admin can:

- View shopkeeper applications
- View applicant details
- View shop photo
- View registration/supporting document
- Approve application
- Reject application with reason
- View the four shops
- Activate/deactivate shops
- View users
- View orders
- View basic statistics

Admin does not normally place grocery orders.

Admin access must not be exposed through normal customer registration.

---

# 28. Storage

InsForge Storage is used for:

- Shop photos
- Shop registration/supporting documents
- Product images
- Invoice PDFs

Private documents and invoices must not be publicly exposed.

The backend must authorize access before serving protected files.

---

# 29. Core Database Tables

Start with:

```text
users
shops
shopkeeper_applications
products
addresses
carts
cart_items
orders
order_items
payments
delivery_verifications
invoices
notifications
```

Add additional tables only when required by an actual feature.

Do not create unnecessary infrastructure or database structures for hypothetical future requirements.

---

# 30. API Architecture

Use REST APIs under:

```text
/api/v1
```

Example areas:

```text
/auth
/users
/shops
/products
/cart
/orders
/payments
/delivery
/invoices
/notifications
/admin
/shopkeeper
```

Backend responsibilities:

- Authentication verification
- Authorization
- Business rules
- Price calculation
- Stock validation/decrement
- Order creation
- Payment verification
- Delivery verification
- Invoice authorization

React must never be the source of truth for security-sensitive rules.

---

# 31. Security

The backend must:

- Validate authenticated identity
- Validate roles
- Validate resource ownership
- Validate prices
- Validate quantities
- Validate stock
- Prevent negative stock
- Prevent cross-shop order access
- Prevent shopkeepers accessing other shops
- Validate uploads
- Protect invoices/documents
- Keep Stripe secrets server-side
- Never trust payment success from only the browser
- Never trust customer-supplied role/shop ownership
- Never expose private shopkeeper information unnecessarily

Only the shop's configured business phone number is exposed to customers for the **Call Shop** feature.

---

# 32. Development Milestones

## M0 — Foundation

- React/Vite
- FastAPI
- InsForge connection
- PostgreSQL connection
- Environment configuration
- Health endpoint
- Git repository

## M1 — Authentication & Customer Profile

- Email/password
- Google OAuth
- User synchronization
- Customer role
- Profile page/sidebar
- Edit name
- Edit email
- Edit phone
- Edit address

## M2 — Shopkeeper Application & Admin

- Shopkeeper application
- Shop photo upload
- Registration/supporting document upload
- Admin dashboard
- Approve/reject
- Shop creation
- Role transition

## M3 — Shops & Products

- Four shops
- Shop pages
- Product management
- Product images
- Product availability
- Stock management
- Shop business phone

## M4 — Customer Shopping & Cart

- Browse shops
- Browse products
- Add to cart
- Quantity +/-
- Remove item
- Cart totals
- One-shop-per-cart
- Alternative shop/product search
- Call Shop button

## M5 — Orders & Inventory

- Delivery address
- Checkout
- COD
- Order creation
- Transactional stock decrement
- Insufficient-stock handling
- Shopkeeper order dashboard
- Customer order history

## M6 — Stripe Test Mode

- Stripe Checkout
- Payment verification/webhook
- Payment status
- Failed payment handling
- Stock restoration for failed online orders

## M7 — Shopkeeper Fulfillment

- Accept order
- Cancel order
- Preparing
- Out for delivery
- Customer status tracking

## M8 — Delivery

- Delivery method
- 6-digit OTP
- OTP expiration/attempt protection
- Hand-to-customer verification
- Leave-at-door delivery
- Delivered status

## M9 — Invoice

- Generate PDF invoice
- Private InsForge Storage
- View invoice
- Download invoice
- Invoice authorization

## M10 — Final Polish & Deployment

- Responsive UI
- Error handling
- Security tests
- Integration tests
- Demo data
- Deployment
- README
- Portfolio screenshots/demo

---

# 33. Antigravity Development Rules

Antigravity must:

1. Read this specification before implementation.
2. Implement one milestone at a time.
3. Not redesign the architecture without approval.
4. Not introduce unnecessary technologies.
5. Run the application after implementation.
6. Run automated tests.
7. Perform relevant manual tests.
8. Verify database changes.
9. Fix errors before declaring a milestone complete.
10. Update documentation when required.
11. Create a Git checkpoint after each verified milestone.
12. Use MCP only for required infrastructure/database operations and inspection.
13. Never perform destructive infrastructure/database operations without explicit approval.
14. Never mark a feature complete merely because source code exists.

---

# 34. Definition of Done

A milestone/feature is complete only when:

- Backend works
- Frontend works
- Database behaviour is correct
- Authorization works
- Important error cases work
- Automated tests pass
- Important user flow is manually verified
- Existing features still work
- Documentation is updated
- Git checkpoint is created

---

# 35. Final End-to-End Demonstration

The complete portfolio demonstration should work as follows:

```text
CUSTOMER
   ↓
Email Login / Google OAuth
   ↓
Customer Dashboard
   ├── Profile
   ├── Shops
   ├── Cart
   ├── Orders
   └── Notifications
   ↓
View 4 Approved Shops
   ↓
Select FreshMart
   ↓
Browse Products
   ↓
Wheat × 2
   ↓
Stock: 100 → 98
   ↓
Milk × 1
   ↓
Checkout
   ↓
Select Address
   ↓
Choose Payment
   ├── COD
   └── Stripe Test Mode
   ↓
Choose Delivery
   ├── Hand to Customer
   └── Leave at Door
   ↓
Confirm Order
   ↓
Invoice Available
   ↓
SHOPKEEPER DASHBOARD
   ↓
New Order Appears
   ↓
Wheat × 2
Milk × 1
   ↓
Current Wheat Stock = 98
   ↓
ACCEPT ORDER
   ↓
CUSTOMER:
"Order Accepted"
   ↓
PREPARING
   ↓
OUT FOR DELIVERY
   ↓
Delivery
   ├── Hand to Customer → OTP → Delivered
   └── Leave at Door → Delivered
   ↓
Invoice remains available for download
```

---

# 36. Alternative Product / Shop Flow

If a customer wants a product that is unavailable:

```text
Customer selects product
        ↓
Product unavailable
        ↓
┌───────────────────────┐
│ Contact Shop           │
│ Find at Other Shops   │
└───────────────────────┘
```

### Contact Shop

Customer taps **Call Shop** and uses the shop's public business phone number to contact the shopkeeper.

### Find at Other Shops

The application shows the same/similar available product from the other approved shops.

The customer can select another shop and start a new cart/order there.

A single order must never contain products from multiple shops.

---

# 37. Explicit Non-Goals

The following are NOT part of V1:

- Google Maps
- Live GPS
- Nearest-shop algorithm
- Delivery partner marketplace
- SMS OTP service
- Microservices
- Kubernetes
- Redis
- Kafka
- WebSockets
- AI chatbot
- Product replacement workflow
- Complex product substitution system
- Complex logistics optimization
- Real-money Stripe payments
- Complex tax engine
- Multi-role accounts
- Real-time driver tracking
- Customer-to-shop internal chat/calling system

The customer may use the device's normal phone-call capability to contact a shop's configured business phone number.

---

# 38. Final Product Principle

The project should always prioritize this experience:

**Customer logs in → selects an approved shop → chooses groceries → manages quantities → checks out → chooses payment and delivery method → receives an invoice → shopkeeper receives the order → inventory decreases correctly → shopkeeper accepts/prepares/delivers → OTP or leave-at-door completes delivery → customer tracks the order.**

Any new feature must be checked against this core flow before being added.

If a feature does not materially improve this grocery-ordering experience or demonstrate an important full-stack engineering skill, it should not be added to V1.
