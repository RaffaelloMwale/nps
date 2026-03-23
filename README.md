# National Pension System (NPS) — Government of Malawi

A full-stack pension management system built with **Node.js + Express + TypeScript** (backend) and **React 18 + TypeScript + Vite** (frontend), using **PostgreSQL 15** as the database.

## Quick Start (Windows + PostgreSQL)

See **NPS_Setup_Guide.docx** for the complete illustrated setup guide.

### Prerequisites
- Node.js 20 LTS — https://nodejs.org
- PostgreSQL 15 — https://www.postgresql.org/download/windows/
- Git — https://git-scm.com

### 1. Database Setup
```bash
# Create database
psql -U postgres -c "CREATE DATABASE nps_db;"

# Run schema (creates all tables, views, triggers, procedures)
psql -U postgres -d nps_db -f backend/database/schema.sql

# Load seed data (users + sample pensioners)
psql -U postgres -d nps_db -f backend/database/seed.sql
```

### 2. Backend Setup
```bash
cd backend
cp .env.example .env          # Edit .env with your DB password and JWT secrets
npm install
npm run dev                   # Starts on http://localhost:5000
```

### 3. Frontend Setup (new terminal window)
```bash
cd frontend
npm install
npm run dev                   # Starts on http://localhost:5173
```

### 4. Open Browser
Navigate to **http://localhost:5173**

Login: `admin` / `Admin@123456`

---

## Default Test Accounts

| Username    | Password     | Role        | Must Change? |
|-------------|--------------|-------------|--------------|
| admin       | Admin@123456 | Admin       | No           |
| creator1    | Temp@12345   | Creator     | Yes          |
| approver1a  | Temp@12345   | Approver 1  | Yes          |
| approver2a  | Temp@12345   | Approver 2  | Yes          |

---

## Project Structure
```
nps/
├── backend/                  Node.js + Express + TypeScript API
│   ├── src/
│   │   ├── config/           DB pool, JWT, logger
│   │   ├── middlewares/      Auth, RBAC, error handling
│   │   ├── modules/          Feature modules (auth, pensioners, payments…)
│   │   └── routes/           Route aggregator
│   └── database/
│       ├── schema.sql        Full PostgreSQL DDL
│       └── seed.sql          Initial data
└── frontend/                 React 18 + Vite + Tailwind CSS
    └── src/
        ├── components/       Reusable UI, layout, charts
        ├── pages/            Page components (Dashboard, Pensioners…)
        ├── store/            Zustand auth state
        ├── config/           Axios API client
        └── utils/            Formatters (MWK currency, dates)
```

## Key Features
- ✅ Pensioner registration with direct entry of monthly pension & total gratuity amounts
- ✅ Automatic monthly payment run on the 14th (node-cron scheduler)
- ✅ Two-level approval workflow for payments, gratuity, and arrears
- ✅ Full & partial gratuity tracking with overpayment guard
- ✅ Death notification and benefit processing
- ✅ Excel (.xlsx) report downloads (8 report types)
- ✅ Live dashboard with KPI cards and charts
- ✅ Role-based access control (Admin, Creator, Approver 1, Approver 2)
- ✅ Full audit trail for all workflow transitions
