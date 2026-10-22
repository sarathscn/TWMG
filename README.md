# TWMG — The Way Money Goes · പണം പോകുന്ന വഴി

A private, multi-profile personal finance web app. Track accounts, credit cards, everyday income and spending, transfers, debts with individual people, shared group expenses, recurring bills, budgets and savings goals — in one calm workspace.

Built with **Next.js 16**, **React 19**, **TypeScript** and **Supabase** (Postgres, Auth, Row Level Security and one Edge Function). Designed to deploy on **Vercel**.

---

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [Deployment guide (Supabase + Vercel)](#deployment-guide-supabase--vercel)
  - [1. Create the Supabase project](#1-create-the-supabase-project)
  - [2. Create the database](#2-create-the-database)
  - [3. Deploy the `twmg-auth` Edge Function](#3-deploy-the-twmg-auth-edge-function)
  - [4. Configure Supabase Auth](#4-configure-supabase-auth)
  - [5. Deploy to Vercel](#5-deploy-to-vercel)
  - [6. Finish the Auth redirect setup](#6-finish-the-auth-redirect-setup)
  - [7. Check the deployment](#7-check-the-deployment)
- [Local development](#local-development)
- [Security model](#security-model)
- [Keys and secrets](#keys-and-secrets)
- [Scripts and tests](#scripts-and-tests)
- [Troubleshooting](#troubleshooting)

---

## Features

**Money tracking**
- Accounts: bank, savings, cash, wallet, digital wallet and credit cards (limit, due date, card network, last four digits).
- Income, expenses and transfers, including cross-currency transfers with the exact amount received.
- Every account, party, shared group and recurring bill has its own transaction history.
- Debt parties: lend, borrow, receive repayments and repay — balances move, but income/spending totals stay clean.
- Shared expense groups with named members, payer, chosen split members and exact remainder-safe splits.
- Recurring bills with linked payment history, budgets per category and savings goals.
- Pick a **color and emoji** for accounts, parties, groups, bills, budgets and goals; they appear on cards, ledgers, tables and pickers.

**Workspace**
- One sign-in, up to **three independent profiles** (each with its own country, base currency and records).
- Dashboard with net worth, income, expenses, savings rate, cash-flow chart, spending breakdown and an event calendar.
- Categories with colors and country-aware payment methods (UPI, BenefitPay and more).
- Reports, CSV export of a period, and JSON backup/restore.
- Change history for every record (an append-only audit log).
- Five languages: English, Hindi, Arabic (right-to-left), Malayalam and German.
- Light/dark theme and adjustable text size; responsive from phones to wide desktops.

**Currencies:** INR, BHD (3 decimals), SAR, USD, EUR, AED and GBP. Money is stored as whole minor units (paise, cents, fils), so there are no rounding errors. No exchange rates are invented — different currencies are kept separate.

---

## How it works

```
Browser ──► Next.js on Vercel ──► Supabase Postgres (RLS + triggers)
   │            (API routes)              ▲
   │                                      │ service role (server-side only)
   └────────── Supabase Auth ◄──── twmg-auth Edge Function
                                   (username login, account deletion)
```

- The browser and Vercel only ever use the **publishable** Supabase key plus the signed-in user's session.
- All financial data lives in Postgres tables protected by **Row Level Security**: a user can only read or change rows of profiles they own.
- Database triggers enforce accounting rules atomically: records can't change identity, accounts and linked items with history can't be deleted, transfers need valid accounts, shared-group expenses stay in sync, and every change is written to an audit log.
- The `twmg-auth` Edge Function is the only code that uses the service-role key. It runs inside Supabase, resolves a login username to an email (rate-limited), and performs password-confirmed account deletion.

---

## Project structure

```
app/
  api/finance/route.ts     Records API: load, create, update, delete, import (validated with zod)
  api/account/route.ts     Display name, email, username, password, profile/account deletion
  api/auth/login/route.ts  Username sign-in via the Edge Function
  auth/callback/route.ts   Email confirmation / password-reset return URL
  auth/reset/              Set a new password after a reset email
  logout/route.ts          Sign out
  ui/                      React interface (dashboard, editors, ledgers, settings)
lib/
  finance.ts               Balances, totals, split maths, transaction validation
  record-schemas.ts        Server-side schemas for every record type
  countries.ts             Countries, currencies, minor units, amount parsing
  messages/*.json          Translations (en, hi, ar, ml, de)
  supabase/                Browser and server Supabase clients
supabase/
  migrations/              Database schema, RLS policies and triggers (apply in order)
  functions/twmg-auth/     Edge Function for username login and account deletion
tests/                     Unit tests and optional live API checks
next.config.ts             Security headers
```

---

## Deployment guide (Supabase + Vercel)

You need a free [GitHub](https://github.com), [Supabase](https://supabase.com) and [Vercel](https://vercel.com) account. Allow about 15 minutes.

### 1. Create the Supabase project

1. In the Supabase dashboard choose **New project**. Pick a name, a strong database password (store it in your password manager) and the region closest to your users.
2. When it's ready, open **Project Settings → API Keys** (or **Settings → API**) and note:
   - **Project URL** — `https://<project-ref>.supabase.co`
   - **Publishable key** — starts with `sb_publishable_…` (on older projects, use the **anon public** key).

   Never copy the **secret** / **service_role** key anywhere in this app — it isn't needed.

### 2. Create the database

Apply the four migrations **in this exact order**. The simplest way is the dashboard:

1. Open **SQL Editor → New query**.
2. Paste the full contents of each file and click **Run**, one file at a time:
   1. `supabase/migrations/20261021045259_twmg_initial_schema.sql`
   2. `supabase/migrations/20261021091442_preferences_and_account_management.sql`
   3. `supabase/migrations/20261021111402_linked_transaction_ledgers.sql`
   4. `supabase/migrations/20261021111851_linked_ledger_validation_fix.sql`
3. Each should finish with "Success. No rows returned".

<details>
<summary>Alternative: Supabase CLI</summary>

```bash
npx supabase login
npx supabase init          # only if supabase/config.toml doesn't exist yet; keep the existing migrations
npx supabase link --project-ref <project-ref>
npx supabase db push
```
</details>

### 3. Deploy the `twmg-auth` Edge Function

The app needs this function for username sign-in and account deletion.

**Dashboard:** open **Edge Functions → Deploy a new function → Via Editor**, name it exactly `twmg-auth`, replace the sample code with the contents of `supabase/functions/twmg-auth/index.ts`, and deploy. Then open the function's **Details / Settings** and turn **Verify JWT with legacy secret** (JWT verification) **off**, and save.

**CLI (alternative):**

```bash
npx supabase functions deploy twmg-auth --no-verify-jwt --project-ref <project-ref>
```

JWT verification must be off because sign-in happens before a user has a session. The function checks the password itself, and account deletion verifies the user's token and password inside the function. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions automatically by Supabase — you do not set them yourself.

### 4. Configure Supabase Auth

In **Authentication → Sign In / Providers → Email**:
- **Enable Email provider:** on.
- **Confirm email:** on (recommended for production).
- **Minimum password length:** 8 or more (the app asks for at least 8).
- **Leaked password protection:** on, if your plan offers it.

### 5. Deploy to Vercel

1. Push this repository to your GitHub account.
2. In Vercel choose **Add New → Project**, import the repository.
3. Settings:
   - **Framework preset:** Next.js (detected automatically)
   - **Root Directory:** leave as the repository root
   - **Build command:** `npm run build` · **Install command:** `npm ci`
   - **Node.js version:** 24.x (Project Settings → General; matches `engines` in `package.json`)
4. **Environment Variables** — add both for **Production** and **Preview**:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Project URL from step 1 |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your publishable (or anon) key from step 1 |

5. Click **Deploy** and note your production URL, e.g. `https://twmg.vercel.app`.

These two values are designed to be public (they ship to the browser). Your data stays protected by Row Level Security.

### 6. Finish the Auth redirect setup

Back in Supabase, open **Authentication → URL Configuration**:
- **Site URL:** your production URL, e.g. `https://twmg.vercel.app`
- **Redirect URLs:** add
  - `https://twmg.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback` (for local development)
  - optionally `https://*-<your-vercel-team>.vercel.app/auth/callback` for preview deployments

Without this, confirmation and password-reset emails will point to the wrong address.

### 7. Check the deployment

1. Open your Vercel URL → **New here? Create an account** → confirm the email → sign in.
2. Add an account, then a transaction — the dashboard should update.
3. In **Settings → Profiles**, set a login username, sign out, and sign in with the username to confirm the Edge Function works.

---

## Local development

Requires **Node.js 24** (Node 22.6+ also runs the app; tests need `--experimental-strip-types`).

```bash
npm ci
cp .env.example .env.local      # then fill in the two Supabase values
npm run dev                     # http://localhost:3000
```

Use a separate Supabase project for development if you don't want to touch real data.

**Dev preview:** under `npm run dev` only, the sign-in screen shows **Skip sign-in (dev preview)**. It opens an empty, in-browser workspace for checking layouts. Nothing is sent to Supabase, saving requires a real session, and the button is compiled out of production builds.

---

## Security model

- **Row Level Security** on every table; ownership is checked through the profile owner on each read and write.
- **Append-only audit history** written by a database trigger; users can read it but never edit it.
- **Integrity triggers:** record id/profile/type are immutable; accounts and linked parties/groups/bills with transactions can't be deleted; transfers and shared-expense links are validated inside the database.
- **API hardening:** all mutations require a same-site `Origin` (CSRF protection); request bodies are size-limited and validated with zod; amounts are bounded integers.
- **Re-authentication:** changing email or username, changing password, and deleting a profile or account all require the current password.
- **Login protection:** username sign-in is rate-limited (10 attempts per name per 15 minutes) and responds identically for unknown users.
- **Safe redirects:** the auth callback only redirects within the app's own origin.
- **Security headers** (`next.config.ts`): framing blocked, `nosniff`, strict referrer policy, HSTS and a restrictive permissions policy.
- **CSV export** neutralises spreadsheet formula injection.

To report a vulnerability, please open a private security advisory on the GitHub repository rather than a public issue.

---

## Keys and secrets

| Value | Where it goes | Public? |
|---|---|---|
| Supabase Project URL | Vercel env + `.env.local` | Yes |
| Supabase publishable / anon key | Vercel env + `.env.local` | Yes — protected by RLS |
| Supabase secret / service_role key | **Nowhere in this repo or Vercel.** Supabase injects it into the Edge Function automatically. | **No** |
| Database password | Your password manager only | **No** |

`.env*` files (except `.env.example`), `.vercel/` and build output are git-ignored. Never commit real keys, test-account passwords or exported backups.

---

## Scripts and tests

```bash
npm run dev         # development server
npm run build       # production build
npm run start       # serve the production build
npm run typecheck   # TypeScript
npm test            # unit tests (Node 22.6+ / 24)
```

Unit tests cover exact minor-unit maths, transfers, card repayments, shared splits, ledgers, profiles, preferences and translation completeness.

Optional live checks (`tests/*-api.mjs`, `tests/rls.sql`) run against a **dedicated test Supabase project** with a disposable test identity stored in the git-ignored `.vercel/` folder. Never point them at production.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Supabase is not configured." | The two `NEXT_PUBLIC_SUPABASE_*` variables are missing. Add them in Vercel and **redeploy**, or fill `.env.local` and restart `npm run dev`. |
| Stuck on "Getting your profiles ready…" | Wrong URL/key, or the migrations weren't applied. Re-check step 1 and run all four migrations in order. |
| Username sign-in fails, email sign-in works | The `twmg-auth` function isn't deployed, is named differently, or still has JWT verification on (step 3). |
| Confirmation email opens localhost or the wrong site | Update Site URL and Redirect URLs (step 6). |
| "Invalid request origin" | Requests must come from the app's own domain; open the app from its real URL rather than an embedded frame or proxy. |
| Vercel build warns about Node | Set Node.js 24.x in Vercel project settings. |

---

Made for a life well spent · പണം പോകുന്ന വഴി
