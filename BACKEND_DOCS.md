# Backend Documentation — Multi-Tenant Restaurant SaaS

## Introduction
Multi-tenant backend API for a Restaurant Management SaaS platform. Each restaurant gets **complete database isolation** — a dedicated MongoDB database per tenant. Built with Node.js, Express, Mongoose, and Socket.io.

## Tech Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB (Mongoose) — **Separate DB per restaurant**
- **Authentication:** JWT (JSON Web Tokens) + bcryptjs
- **Real-Time:** Socket.io (room-scoped per restaurant)
- **Cloud:** Cloudinary (image uploads), Nodemailer (emails)
- **Cron:** node-cron (subscription expiry, HR auto-processing)

---

## Multi-Tenant Architecture

### Database Strategy: One Database Per Restaurant
```
Platform DB:  aktech           → Users, Restaurants, SubscriptionPlans, SuperAdmins
Tenant DB:    aktech_RESTO001  → Products, Orders, Bills, Tables, HR, Accounting
Tenant DB:    aktech_RESTO002  → Products, Orders, Bills, Tables, HR, Accounting
...up to N restaurants
```

### How It Works

#### 1. Connection Manager (`utils/database/dbConnection.js` — import via `utils/dbConnection.js` stub)
- Caches one Mongoose **connection per tenant** database (`aktech_<RESTAURANT_ID>`), bounded by **`TENANT_DB_MAX_CONNECTIONS`** (default **128**).
- When the cache is full, the **least recently used** tenant connection is closed and removed — **not** arbitrary insertion order (important when many restaurants are active).
- Per-tenant driver pool size: **`TENANT_DB_POOL_MAX`** (default **5**). Tune both env vars if you run many concurrent tenants on one API instance.
- **`getTenantConnectionStats()`** can be used for monitoring (counts only; safe for dashboards).
```js
const conn = await getConnection('RESTO001');
// → mongoose.Connection bound to mongodb://…/aktech_RESTO001
```

#### 2. Dynamic Model Registry (`utils/database/getModel.js` — import via `utils/getModel.js` stub)
- **Every** tenant-scoped query goes through `getModel()`. This is the single most critical function.
- Returns a Mongoose model bound to the restaurant's own database.
```js
const Product = await getModel('Product', ProductModel.schema, req.restaurantId);
const products = await Product.find();
// → queries aktech_RESTO001.products (never another restaurant's)
```
- Collection name mapping (e.g., `'Product'` → `products` collection, `'AccLedgerEntry'` → `acc_ledger`).
- Throws an error if `restaurantId` is missing — **prevents silent leaks**.

#### 3. Tenant Middleware (`middleware/tenantMiddleware.js`)
Applied to tenant-scoped routers mounted from **`http/mounts/`** (see `catalogRoutes.js`, `operationsRoutes.js`, `reservationRoutesMount.js`, `hrRoutesMount.js`). Platform routes (`/api/restaurants`, `/api/plans`, `/api/superadmin`, `/api/auth`, `/api/accounting`, etc.) mount **without** this middleware at the router level — see `platformRoutesMount.js` and `authSupportRoutesMount.js`.

What it does:
1. Extracts `restaurantId` from: `req.restaurantId` → `req.user.restaurantId` → `?restaurantId=` query → `X-Restaurant-Id` header
2. Validates the restaurant exists and is active
3. **Blocks cross-tenant access**: if the JWT says RESTO001 but request says RESTO002, returns `403`
4. Sets `req.restaurant` (full doc) and `req.restaurantId` (string) for downstream controllers

#### 4. Auth Middleware (`middleware/authMiddleware.js`)
- Verifies JWT, loads user from DB, attaches `req.user`
- Overrides `req.restaurantId` with the JWT-embedded value (authoritative — can't be spoofed)
- Role checks: `admin`, `adminOrKitchen`, `adminOrKitchenOrWaiter`

#### 5. Global restaurantId extraction (`middleware/restaurantContext.js`)
Registered from **`http/applyGlobalMiddleware.js`** before routes. Sets `req.restaurantId` from query, `X-Restaurant-Id`, or a non-throwing JWT decode (invalid tokens are ignored).

### Cross-Tenant Security
```
[Client Request]
  ↓
[Global middleware] → extracts restaurantId from URL/header/JWT
  ↓
[tenantMiddleware] → validates restaurant exists + is active
                   → BLOCKS if JWT.restaurantId ≠ requested restaurantId
  ↓
[authMiddleware]   → verifies JWT, overrides restaurantId from token
  ↓
[Controller]       → uses getModel(name, schema, req.restaurantId)
                   → queries ONLY that restaurant's database
```

---

## Project Structure
```
backend-res/
├── server.js                   # Process entry: DB, HTTP listen, cron, shutdown
├── createApp.js                # Thin Express composer
├── http/                       # Middleware + grouped route mounts (`mounts/`)
├── attachSocket.js             # Socket.IO (rooms, ordersSnapshot)
├── config/
│   └── db.js                   # MongoDB connection (platform DB)
├── controllers/                # Root `*Controller.js` files are thin re-exports (stable route imports)
│   ├── platform/             # Main DB: auth, superAdmin, restaurant, subscriptionPlan, supportTicket, saNotification
│   └── tenant/               # Tenant DB logic (mirrors `models/tenant/`)
│       ├── menu/             # product, category, subItem, banner, offer
│       ├── orders/           # order, bill, kitchenBill
│       ├── ops/              # table
│       ├── hr/               # hrStaff, attendance, leave, shift, payroll
│       └── accounting/       # accAccount (ledger + transactions)
├── middleware/
│   ├── authMiddleware.js       # JWT verification, role checks
│   ├── tenantMiddleware.js     # Restaurant validation + cross-tenant blocking
│   ├── featureMiddleware.js    # Feature flag enforcement (hr, accounting, etc.)
│   ├── hrAuthMiddleware.js     # HR-specific auth
│   └── errorMiddleware.js      # 404 + error handler
├── models/                     # Root `*.js` files are thin re-exports (backward-compatible imports)
│   ├── platform/               # [PLATFORM] Main DB — User, Restaurant, SubscriptionPlan, SuperAdmin, SuperAdminNotification, SupportTicket
│   └── tenant/                 # [TENANT] Schema templates for each aktech_RESTOxxx DB
│       ├── menu/               # Product, Category, SubItem, Banner, Offer
│       ├── orders/             # Order, Bill, KitchenBill
│       ├── ops/                # Table, Settings, Notification, Reservation
│       ├── hr/                 # HRStaff, HRAttendance, HRLeave, HRShift, HRPayroll
│       └── accounting/         # AccLedger, AccTransaction
├── routes/                     # Root `*Routes.js` re-exports; real routers under `platform/` + `tenant/` (menu, orders, ops, hr, accounting)
├── services/                   # Root service files re-export `cron/`, `email/`, `pdf/`
│   ├── cron/cronService.js     # HR + subscription scheduled jobs
│   ├── email/emailService.js   # Nodemailer
│   └── pdf/payslipService.js   # Payslip PDF
├── utils/                      # Root util files re-export `database/`, `socket/`, `schema/`
│   ├── database/               # dbConnection + getModel (multi-tenant core)
│   ├── socket/socketUtils.js   # Room-scoped Socket.io emit helper
│   └── schema/tenantPlugin.js  # Mongoose tenant plugin helpers
└── uploads/                    # Local file storage (attendance selfies)
```

---

## Models — Platform vs Tenant

### Platform Models (shared `aktech` DB)
| Model | Collection | Description |
|:---|:---|:---|
| `User` | `users` | All staff accounts (admin, kitchen, waiter). Contains `restaurantId` field. |
| `Restaurant` | `restaurants` | Restaurant metadata, branding, features, subscription status. |
| `SubscriptionPlan` | `subscriptionplans` | SaaS plan tiers (Free, Pro, Enterprise). |
| `SuperAdmin` | `superadmins` | Platform super admin accounts. |

### Tenant Models (per-restaurant DB, e.g. `aktech_RESTO001`)
| Model | Collection | Description |
|:---|:---|:---|
| `Product` | `products` | Menu items with pricing, images, portions, add-on groups |
| `Order` | `orders` | Customer orders with items, status, billing details |
| `Bill` | `bills` | Generated invoices with payment sessions |
| `KitchenBill` | `kitchenbills` | Kitchen display tickets |
| `Category` | `categories` | Product categories |
| `SubItem` | `subitems` | Add-ons and toppings library |
| `Table` | `tables` | Restaurant tables |
| `Banner` | `banners` | Promotional banner images |
| `Offer` | `offers` | Deals and offers |
| `Settings` | `settings` | Restaurant-specific settings |
| `Notification` | `notifications` | Real-time admin alerts |
| `Reservation` | `reservations` | Table reservations |
| `HRStaff` | `staff` | Employee profiles |
| `HRAttendance` | `attendance` | Attendance logs with selfie/GPS |
| `HRLeave` | `leaves` | Leave applications |
| `HRShift` | `shifts` | Shift scheduling |
| `HRPayroll` | `payroll` | Monthly payroll records |
| `AccAccount` | `acc_accounts` | Chart of Accounts |
| `AccExpense` | `acc_expenses` | Expense records |
| `AccLedgerEntry` | `acc_ledger` | Double-entry ledger |
| `AccLoan` | `acc_loans` | Loan tracking |
| `AccOrder` | `acc_orders` | Accounting orders |
| `AccParty` | `acc_parties` | Vendors and customers |
| `AccPayment` | `acc_payments` | Payment records |
| `AccPurchase` | `acc_purchases` | Purchase orders |

---

## API Endpoints

### Authentication (No tenant middleware — platform-level)
| Method | Route | Auth | Description |
|:---|:---|:---|:---|
| POST | `/api/auth/login` | Public | Login → returns JWT with `restaurantId` |
| POST | `/api/auth/register` | Public | Register (disabled after first user) |
| GET | `/api/auth/users` | Admin | List users for **own** restaurant only |
| PUT | `/api/auth/users/:id` | Admin | Update user (scoped by JWT restaurantId) |
| DELETE | `/api/auth/users/:id` | Admin | Delete user (scoped by JWT restaurantId) |

### Products (tenant-isolated)
| Method | Route | Auth | Description |
|:---|:---|:---|:---|
| GET | `/api/products` | Public | Get all products for restaurant |
| GET | `/api/products/:id` | Public | Get single product |
| POST | `/api/products` | Admin | Create product |
| PUT | `/api/products/:id` | Admin | Update product |
| DELETE | `/api/products/:id` | Admin | Delete product |

### Orders (tenant-isolated)
| Method | Route | Auth | Description |
|:---|:---|:---|:---|
| POST | `/api/orders` | Public | Create order (customer QR scan) |
| GET | `/api/orders` | Staff | List active orders |
| POST | `/api/orders/manual` | Admin | Create manual order |
| GET | `/api/orders/table/:tableNum` | Public | Get orders for a table |
| PUT | `/api/orders/:id/status` | Staff | Update order status |
| GET | `/api/orders/tokens` | Staff | Get token numbers |
| POST | `/api/orders/reset-tokens` | Admin | Reset daily tokens |
| GET | `/api/orders/stats` | Admin | Dashboard stats |

### Bills (tenant-isolated)
| Method | Route | Auth | Description |
|:---|:---|:---|:---|
| POST | `/api/bills` | Public | Create bill |
| GET | `/api/bills` | Admin | List bills (with date filters) |
| PUT | `/api/bills/:id/pay` | Admin | Mark bill as paid |
| PUT | `/api/bills/:id/close` | Admin | Close bill |

### Kitchen Bills (tenant-isolated)
| Method | Route | Auth | Description |
|:---|:---|:---|:---|
| GET | `/api/kitchen-bills` | Staff | List kitchen bills |
| GET | `/api/kitchen-bills/active` | Staff | Active (non-served) kitchen bills |
| PUT | `/api/kitchen-bills/:id/status` | Staff | Update kitchen bill status |

### Categories, Tables, Banners, Offers, Sub-Items (tenant-isolated)
Standard CRUD endpoints. All require `restaurantId` via middleware.

### Notifications & Reservations (tenant-isolated)
| Method | Route | Auth | Description |
|:---|:---|:---|:---|
| GET | `/api/notifications` | Admin | List notifications |
| PUT | `/api/notifications/:id` | Admin | Mark as read |
| GET | `/api/reservations` | Admin | List reservations |
| POST | `/api/reservations` | Public | Create reservation |

### HR Module (tenant-isolated, feature-gated)
| Route Prefix | Description |
|:---|:---|
| `/api/hr/staff` | Staff profiles, onboarding, termination |
| `/api/hr/attendance` | Check-in/out with selfie + GPS |
| `/api/hr/leaves` | Leave applications and approvals |
| `/api/hr/shifts` | Shift creation and staff assignment |
| `/api/hr/payroll` | Monthly payroll generation |

### Accounting Module (tenant-isolated, feature-gated)
| Route Prefix | Description |
|:---|:---|
| `/api/acc/accounts` | Chart of Accounts CRUD |
| `/api/acc/parties` | Vendor/customer management |
| `/api/acc/orders` | Accounting order tracking |
| `/api/acc/purchases` | Purchase orders |
| `/api/acc/expenses` | Expense management |
| `/api/acc/loans` | Loan tracking |
| `/api/acc/payments` | Payment recording |
| `/api/acc/ledger` | Double-entry ledger |
| `/api/acc/reports` | P&L, Trial Balance, Aging reports |

### Restaurant & Subscription (platform-level, Super Admin)
| Method | Route | Auth | Description |
|:---|:---|:---|:---|
| GET | `/api/restaurants` | SuperAdmin | List all restaurants |
| POST | `/api/restaurants` | SuperAdmin | Create restaurant + admin user |
| GET | `/api/restaurants/:id/branding` | Public | Get branding (filtered for customers) |
| PUT | `/api/restaurants/:id/branding` | Admin | Update branding |
| PUT | `/api/restaurants/:id/features` | SuperAdmin | Toggle feature flags |

### Payments (Razorpay)

Two separate Razorpay accounts:

| Flow | Credentials | Routes |
|:---|:---|:---|
| SaaS subscription (restaurant owner → platform) | `.env` `RAZORPAY_PLATFORM_KEY_ID` / `RAZORPAY_PLATFORM_KEY_SECRET` | `POST /api/subscriptions/create-order`, `/verify`, `/activate` |
| Customer online checkout (guest → restaurant) | `Restaurant.paymentSettings` (encrypted secrets) | `GET/PUT /api/payments/config`, `POST /api/payments/create-order`, `/verify` |

**Per-restaurant payment settings** (stored on `Restaurant` in platform DB):

```js
paymentSettings: {
  razorpayEnabled: Boolean,
  razorpayKeyId: String,
  razorpayKeySecret: String,      // AES-256-GCM encrypted (ENCRYPTION_KEY)
  razorpayWebhookSecret: String,  // encrypted
}
```

**Webhook URL** (each restaurant configures in Razorpay dashboard):

```
POST {API_PUBLIC_URL}/api/payments/webhook?restaurantId=RESTO001
```

The `restaurantId` query param is required so `tenantMiddleware` can load the correct restaurant webhook secret. Register the webhook route **before** `express.json()` (see `http/webhookRawBody.js`).

---

## Socket.io — Real-Time Events

### Architecture
- Each client joins a **room** named after their `restaurantId` (e.g., `RESTO001`).
- All server emissions use `io.to(restaurantId).emit()` — **never** global `io.emit()`.
- Staff clients send their JWT token during `joinRoom` for authentication.

### Server-Side (in `attachSocket.js`; HTTP API composed in `http/`)
```js
socket.on('joinRoom', async ({ restaurantId, token }) => {
  socket.join(restaurantId);
  // If token is valid and user is staff → send ordersSnapshot
});
```

### Events Emitted
| Event | Emitter | Description |
|:---|:---|:---|
| `orderCreated` | orderController | New order placed |
| `orderUpdated` | orderController, billController | Order status changed |
| `orderItemsAdded` | orderController | Items merged into existing order |
| `billCreated` | orderController, billController | New bill generated |
| `billUpdated` | orderController, billController | Bill payment status changed |
| `kitchenBillCreated` | orderController | New kitchen ticket |
| `kitchenBillUpdated` | kitchenBillController | Kitchen bill status changed |
| `productUpdated` | productController | Single product changed |
| `productsUpdated` | productController, subItemController | Bulk product refresh needed |
| `productDeleted` | productController | Product removed |
| `subItemUpdated` | subItemController | Sub-item changed |
| `subItemDeleted` | subItemController | Sub-item removed |
| `subItemsUpdated` | subItemController | Bulk sub-item refresh |
| `tokenReset` | orderController | Daily token counter reset |
| `newNotification` | notificationRoutes | Alert for admin |
| `newReservation` | reservationRoutes | New table reservation |
| `attendanceUpdate` | hrAttendanceController | Attendance check-in/out |
| `ordersSnapshot` | attachSocket.js (joinRoom) | Initial orders state for staff |

---

## Feature Flags
Each restaurant has toggleable features controlled by Super Admin:
```js
features: {
  hr:           Boolean,  // HR module
  accounting:   Boolean,  // Accounting module
  inventory:    Boolean,  // Inventory tracking
  reports:      Boolean,  // Analytics & reports
  qrMenu:       Boolean,  // Customer QR scanning
  onlineOrders: Boolean,  // Online ordering
  kitchenPanel: Boolean,  // Kitchen display system
  waiterPanel:  Boolean,  // Waiter panel
}
```
- Admin dashboard navigation items are hidden/shown based on these flags.
- Public customer API returns ONLY `qrMenu` and `onlineOrders` flags.
- Full flag set is returned only to authenticated staff.

---

## Environment Variables
```env
MONGO_URI=mongodb+srv://...       # MongoDB connection string
JWT_SECRET=your_jwt_secret        # JWT signing key
PORT=5000                         # Server port
CLOUDINARY_CLOUD_NAME=...         # Cloudinary credentials
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
EMAIL_USER=...                    # Nodemailer sender
EMAIL_PASS=...                    # App password
```

## Setup & Installation
1. `cd backend-res`
2. `npm install`
3. Create `.env` file with variables above
4. `npm run dev` (development with nodemon)
5. `node seeder.js` (optional: seed test data)

## Scripts
- `npm start` — Production server
- `npm run dev` — Development with hot reload
- `npm run data:import` — Seed data
- `npm run data:destroy` — Purge all data
