# Backend Documentation

## Introduction
This is the backend API for the Restaurant Management System, built with Node.js, Express, and MongoDB. It handles authentication, order management, billing, inventory, HR, and accounting.

## Tech Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB (via Mongoose)
- **Authentication:** JWT (JSON Web Tokens) & bcryptjs
- **Other:** Socket.io (Real-time updates), Cloudinary (Image uploads), Nodemailer (Emails).

## Project Structure
- `server.js`: Main entry point and server configuration.
- `config/`: Database connection and configuration.
- `controllers/`: Business logic for various modules.
- `models/`: Mongoose schemas and models.
- `routes/`: API endpoint definitions.
- `middleware/`: Authentication and error handling middleware.
- `services/`: External services (Email, Cron, Payslip).
- `utils/`: Helper functions and seeders.

## API Modules

### Core Modules
- **Authentication (`routes/authRoutes.js`):** User login, registration, and role management.
- **Products & Categories (`routes/productRoutes.js`, `routes/categoryRoutes.js`):** Menu item management.
- **Orders & Billing (`routes/orderRoutes.js`, `routes/billRoutes.js`):** Handling customer orders and generating bills.
- **Table Management (`routes/tableRoutes.js`):** Managing restaurant tables and reservations.

### HR Management
- **Staff (`routes/hrStaffRoutes.js`):** Employee profiles and information.
- **Attendance (`routes/hrAttendanceRoutes.js`):** Tracking staff attendance.
- **Payroll (`routes/hrPayrollRoutes.js`):** Managing salaries and payslips.
- **Leaves & Shifts (`routes/hrLeaveRoutes.js`, `routes/hrShiftRoutes.js`):** Leave requests and shift scheduling.

### Accounting
- **Ledger & Payments (`routes/accRoutes.js`):** Comprehensive accounting system including ledger entries, payments, purchases, and expenses.

## Setup & Installation
1. Navigate to the `backend-res` directory.
2. Install dependencies: `npm install`
3. Configure environment variables in `.env`.
4. Run in development mode: `npm run dev`
5. Seed initial data (optional): `npm run data:import`

## Scripts
- `npm start`: Start server in production.
- `npm run dev`: Start server with nodemon.
- `npm run data:import`: Import seeder data.
- `npm run data:destroy`: Remove all data from database.
