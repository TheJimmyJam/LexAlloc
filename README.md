# ⚖️ LexAlloc — Legal Invoice Apportionment Platform

Multi-tenant SaaS for apportioning legal invoices across parties and insurers using pro-rata time-on-risk analysis.

---

## Stack

| Layer     | Tech                   | Host        |
|-----------|------------------------|-------------|
| Frontend  | React + Vite + Tailwind | Netlify     |
| Backend   | Node.js + Express       | Railway     |
| Database  | PostgreSQL              | Supabase    |
| Auth      | Supabase Auth           | Supabase    |
| Storage   | Supabase Storage        | Supabase    |
| Email     | Resend                  | Resend      |
| DNS/CDN   | Cloudflare              | Cloudflare  |
| Version   | Git                     | GitHub      |

---

## Quick Start

### 1. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run both migration files in order:
   - `supabase/migrations/001_schema.sql`
   - `supabase/migrations/002_rls.sql`
3. Go to **Storage** → Create a new bucket named `invoices`, set to **Public**
4. Copy your **Project URL** and **Anon Key** from Settings → API

### 2. Frontend (Netlify)

```bash
cd frontend
cp .env.example .env
# Fill in your Supabase URL and Anon Key
npm install
npm run dev          # local dev
npm run build        # production build
```

**Netlify deploy:**
- Connect your GitHub repo to Netlify
- Set base directory: `frontend`
- Build command: `npm run build`
- Publish directory: `frontend/dist`
- Add environment variables in Netlify dashboard:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_API_URL` (your Railway backend URL)

### 3. Backend (Railway)

```bash
cd backend
cp .env.example .env
# Fill in all values
npm install
npm start            # local: http://localhost:8080
```

**Railway deploy:**
- Push backend folder to GitHub (or use Railway CLI)
- Create new Railway project → Deploy from GitHub
- Add environment variables in Railway dashboard (see `backend/.env.example`)
- Railway will auto-detect Node.js and run `npm start`

### 4. AI Invoice Parsing (OpenAI)

Set `OPENAI_API_KEY` in Railway environment. Uses GPT-4o for:
- PDF text extraction + structured parsing
- Vision fallback for scanned/image PDFs

> If not configured, the app falls back to manual data entry mode.

### 5. Email Notifications (Resend)

1. Sign up at [resend.com](https://resend.com)
2. Add and verify your domain
3. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in Railway

### 6. Cloudflare (DNS + CDN)

1. Add your custom domain to Netlify
2. Point domain to Netlify via Cloudflare DNS
3. Enable Cloudflare proxying for CDN + DDoS protection

---

## How Apportionment Works

### Party Shares
Each party (defendant, plaintiff, etc.) is assigned a **share percentage** that must total 100%.  
Each party's share of an invoice = `party_share% × invoice_total`.

### Time-on-Risk (Insurer Obligation)
For each party, one or more insurers have **policy periods** (start/end dates).  
The insurer's obligation is calculated as:

```
Days on Risk = overlap(policy_period, service_period)
TOR %        = Days on Risk ÷ Total Exposure Days × 100
Obligation   = TOR% × Party's Invoice Share
```

**Example:**
- Invoice service period: Jan 1 – Dec 31, 2023 (365 days)
- Insurer A: policy Jan 1 – Jun 30, 2023 → 181 days → **49.6%** of party's share
- Insurer B: policy Jul 1 – Dec 31, 2023 → 184 days → **50.4%** of party's share

### Uninsured Gaps
If no policy covers part of the service period, that portion is flagged as **uninsured** and remains with the party.

---

## User Roles

| Role   | Access                                                          |
|--------|-----------------------------------------------------------------|
| admin  | Full access + user management + admin panel                     |
| client | Matters, invoices, apportionments for their org                 |
| user   | Same as client (restrict further via custom RLS if needed)      |

---

## Project Structure

```
lexalloc/
├── frontend/              # React SPA → Netlify
│   ├── src/
│   │   ├── components/    # Layout, InvoiceUploadModal
│   │   ├── pages/         # Landing, Login, Register, Dashboard, Matters, ...
│   │   ├── hooks/         # useAuth
│   │   └── lib/           # supabase.js, api.js, calculations.js
│   └── netlify.toml
├── backend/               # Express API → Railway
│   └── src/
│       ├── routes/        # invoices, apportionments, notifications
│       └── services/      # pdfParser, aiExtractor, calculator, emailService
└── supabase/
    └── migrations/        # SQL schema + RLS policies
```

---

## License

MIT — built for legal professionals.
