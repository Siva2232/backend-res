# Backend layout (production-oriented)

```
backend-res/
├── server.js                 # Entry: env validation → MongoDB → HTTP server → cron → graceful shutdown
├── package.json
├── .env / .env.example
│
├── createApp.js              # Thin composer: trust proxy → middleware → routes → error handlers
├── attachSocket.js           # Socket.IO + app.set('io') for realtime
├── http/                     # Express HTTP stack (Helmet, CORS, mounts/, …)
│   └── mounts/               # Route groups (catalog, ops, HR, platform, …)
├── config/
│   ├── db.js                 # Platform MongoDB connection
│   ├── env.js                # Production checks, CORS_ORIGINS helper
│   ├── paths.js              # Repo ROOT_DIR for static uploads
│   ├── httpLimits.js         # JSON / urlencoded size caps
│   └── apiRateLimit.js       # `/api/` rate limit factory
├── middleware/
│   └── restaurantContext.js  # JWT/query restaurantId (wired from http/applyGlobalMiddleware)
│
├── routes/                   # Thin routers; implementations under subfolders — root `*Routes.js` stubs re-export
│   ├── platform/             # auth, restaurants, plans, superadmin, support tickets, SA notifications
│   └── tenant/               # Per-tenant API wiring (same grouping as controllers/models)
│       ├── menu/             # products, categories, sub-items, banners, offers
│       ├── orders/           # orders, bills, kitchen bills
│       ├── ops/              # tables, notifications, Stripe payments, reservations
│       ├── hr/               # staff, attendance, leave, shift, payroll
│       └── accounting/       # accounting routes
├── controllers/              # HTTP handlers; implementations live in subfolders — root `*Controller.js` stubs re-export
│   ├── platform/             # Auth, super admin, restaurants, plans, support tickets, SA notifications
│   └── tenant/               # Per-restaurant business logic (same DB routing as models)
│       ├── menu/             # Products, categories, sub-items, banners, offers
│       ├── orders/           # Orders, bills, kitchen bills
│       ├── ops/              # Tables (floor)
│       ├── hr/               # Staff, attendance, leave, shift, payroll
│       └── accounting/       # Ledger & transactions
├── models/                   # Mongoose schemas; real files live in subfolders — root `*.js` stubs re-export for stable imports
│   ├── platform/             # Main DB (aktech): User, Restaurant, SubscriptionPlan, SuperAdmin, …
│   └── tenant/               # Schema templates cloned onto each `aktech_RESTOxxx` via getModel()
│       ├── menu/             # Product, Category, SubItem, Banner, Offer
│       ├── orders/           # Order, Bill, KitchenBill
│       ├── ops/              # Table, Settings, Notification, Reservation
│       ├── hr/               # HRStaff, attendance, leave, shift, payroll
│       └── accounting/       # AccLedger, AccTransaction
├── middleware/               # auth, tenant isolation, feature flags, errors
├── services/                 # Root `*.js` stubs — implementations grouped below
│   ├── cron/                 # Scheduled jobs (`cronService`: HR payroll, subscription reminders)
│   ├── email/                # SMTP (`emailService`)
│   └── pdf/                  # Payslip PDF (`payslipService`)
├── utils/                    # Root `*.js` stubs — shared runtime helpers
│   ├── database/             # `dbConnection` (LRU tenant pools), `getModel` (tenant model registry)
│   ├── socket/               # `socketUtils` (room-scoped emits)
│   └── schema/               # `tenantPlugin` (Mongoose helpers)
├── constants/                # Shared literals (if used)
└── uploads/                  # Static files served under /uploads
```

## Request flow

1. **`server.js`** creates `http.Server`, runs **`createApp()`**, attaches Socket.IO.
2. **`createApp()`** applies global middleware via **`http/`** (Helmet, CORS, compression, JSON limits, **per-IP rate limit** on `/api/*`).
3. Tenant routes use **`tenantMiddleware`** → **`getModel()`** routes queries to the correct restaurant database.
4. Platform routes (`/api/restaurants`, `/api/superadmin`, `/api/auth`, …) skip tenant DB or use the platform connection.

## Production checklist

- Set `NODE_ENV=production`, `MONGO_URI`, strong `JWT_SECRET`.
- Set `CORS_ORIGINS` to your real frontend URLs (comma-separated).
- Behind a reverse proxy (Render, nginx): `TRUST_PROXY_HOPS=1` (default in code when `NODE_ENV=production`).
- Optional: tune rate limits in `config/apiRateLimit.js` (`createApiLimiter`).

## Scripts & tooling

- One-off scripts (`seeder.js`, `migrate-bills.js`, …) stay at repo root; they keep requiring `./config/db`.
