# TMS Visa CRM — Project Rules & Architecture Guide

> **This file is the single source of truth for every AI agent working on this codebase.**
> Read it before making any code change.

---

## 1. Project Overview

**Name:** `crm-tms` (TMS Visa CRM)
**Purpose:** Internal Customer Relationship Management system for **The Migration School (TMS Visa)** — an Australian migration/visa consultancy based in India. The CRM manages the full candidate lifecycle: lead creation → telecalling → meetings → sales conversion → case manager assignment → CV marketing to employers → billing & invoicing.

**Tech Stack:**
| Layer | Technology |
|---|---|
| Framework | **Next.js 16** (App Router, `src/app/`) |
| Language | **TypeScript 5** (strict) |
| UI | **React 19** + **Tailwind CSS 4** |
| Database | **MongoDB 5** (single `MongoClient` connection cached in `src/lib/mongodb.ts`) |
| Auth | **JWT** (HttpOnly cookie `token`, 7-day expiry) stored via `bcryptjs` + `jsonwebtoken` |
| Email | **Nodemailer** (Hostinger SMTP, per-mailbox credentials) |
| File Storage | **MongoDB GridFS** (bucket: `chatFiles`) |
| PDF | **jspdf** + **pdf-lib** (invoice/receipt generation) |
| Rich Text | **Lexical** (email template editor) |
| Toast | **react-hot-toast** |
| Hosting | **Vercel** (analytics + speed insights enabled) |
| Fonts | **Geist Sans** + **Geist Mono** (Google Fonts) |

---

## 2. User Roles & Access Control

The system has **7 distinct roles**. Every API route and page checks `payload.role` from the JWT. The roles are:

| Role | Slug | Description |
|---|---|---|
| **Admin** | `admin` | Full access. Manages users, views all leads, all analytics, email system, BD leads, case leads, billing, vacancies, announcements. Can add/edit candidate occupations directly on case leads. |
| **Telecaller** | `telecaller` | Creates leads (auto-assigned to self), manages own leads, data entry module (25/day quota, 4 sequential phases), views own analytics. |
| **Employee** | `employee` | Same as telecaller — legacy name, functionally identical. |
| **Meeting** | `meeting` | Creates leads (auto-assigned to self), manages own leads, data entry, meeting booking/scheduling module. |
| **Business Development** | `business_development` | BD Pipeline page — self-assigns own leads, pipeline stages, no daily quota. Does NOT use Data Entry module. |
| **Billing** | `billing` | Creates/manages invoices and billing for candidates. |
| **Case Manager** | `case_manager` | Receives converted "Sales" leads. Manages CV Marketing Workspace (4-phase employer outreach). Stores email/password credentials for marketing emails. Reads occupations added by admin/sales. |
| **Supervisor** | `supervisor` | Same functionality as telecaller (auto-assign on create, status updates, lead notes, convert to sales, data entry, personal analytics, attendance). |
| **WM (WFH Meeting)** | `wm` | Work-from-home meeting role (same functionality as meeting). |
| **WCM (WFH Case Manager)** | `wcm` | Work-from-home case manager role (same functionality as case manager). |
| **WTC (WFH Telecaller)** | `wtc` | Work-from-home telecaller role (same functionality as telecaller). |

### Role Groupings Used in Code

```typescript
// Data Entry (daily quota lead submission)
DATA_ENTRY_ROLES = ["telecaller", "employee", "meeting", "wtc", "wm", "supervisor"]

// Lead creation access (general leads)
["admin", "telecaller", "employee", "meeting", "wtc", "wm", "supervisor"]

// Billing access
BILLING_ROLES = ["admin", "billing"]

// Case lead access
["admin", "case_manager"]

// BD pipeline access
["admin", "business_development"]
```

---

## 3. Database Architecture

**Connection:** Single cached `MongoClient` in `src/lib/mongodb.ts`. Indexes are ensured once per warm instance (fire-and-forget).

### 3.1 MongoDB Collections

| Collection | Purpose | Key Fields |
|---|---|---|
| `users` | All user accounts | `id`, `username`, `password_hash`, `name`, `email`, `role` |
| `leads` | Main candidate leads (telecaller/meeting pipeline) | `id`, `name`, `phone`, `email`, `status`, `assignedTo`, `history[]`, `notes[]`, `meetingDetails`, `salesDocument`, `occupations[]`, `caseManagerAssignedAt`, `caseManagerEmail`, `caseManagerPassword` |
| `counters` | Auto-increment ID sequences | `_id` (collection name), `seq` |
| `notifications` | In-app notification system | `id`, `userId`, `title`, `message`, `type`, `link`, `read` |
| `bdleads` | Business Development pipeline leads | `id`, `industry`, `companyName`, `website`, `leadSource`, `pipelineStage`, `status`, `assignedTo`, `priority`, `workingDate` |
| `bdpipelinehistory` | BD lead pipeline stage transitions | `leadId`, `fromStage`, `toStage`, `changedBy` |
| `bdleadnotes` | BD lead notes | `leadId`, `note`, `createdBy` |
| `bdactivitylogs` | BD audit trail | `leadId`, `action`, `userId`, `previousValue`, `newValue` |
| `dailyleadtargets` | Daily quota tracking for Data Entry | `userId`, `date`, `totalCreated`, `targetCompleted` |
| `bdconfig` | BD round-robin pointer + config | `_id: "bd_round_robin"`, `assignSeq` |
| `lead_workflows` | Email workflow state per lead | `leadId`, `currentStage`, `followupCount`, `nextFollowupAt` |
| `email_history` | All sent/simulated/failed emails | `leadId`, `stage`, `mailbox`, `subject`, `status`, `isFollowup` |
| `email_templates` | Rich-text email templates | `stage`, `mailbox`, `subject`, `html`, `attachments[]` |
| `email_workflows` | Named email workflow definitions | `name`, `stages[]` |
| `email_mailboxes` | SMTP mailbox config | `email` (unique) |
| `billinginvoices` | Billing invoices & payments | `leadId`, `invoiceNumber` (unique), `amount`, `paidAmount`, `payments[]` |
| `invoices` | Legacy invoice records | `leadId`, `invoiceNumber` |
| `case_marketing_sources` | Case Marketing — sources per phase | `leadId`, `phase`, `order`, `name` |
| `case_marketing_employers` | Case Marketing — employers researched | `leadId`, `sourceId`, `companyName`, `email`, `emailSentAt`, `status`, `followupCount` |
| `announcements` | Admin announcements | `title`, `body`, `pinned`, `createdBy` |
| `conversations` | Chat DMs metadata | `participants[]`, `lastMessage` |
| `messages` | Chat messages (DM + global) | `conversationId`, `senderId`, `text`, `files[]`, `reactions[]` |
| `global_messages` | Global chat channel messages | `senderId`, `text` |
| `chatFiles.files` / `chatFiles.chunks` | GridFS file storage | Binary file uploads |
| `activity` | Check-in/out + break tracking | `userId`, `date`, `checkInTime`, `checkOutTime`, `breaks[]` |
| `vacancies` | Job vacancy listings | `id`, `title`, `company`, `location` |

### 3.2 Auto-Increment IDs

**All entities use integer IDs** (not MongoDB ObjectIds for the primary key). The `getNextId(db, collectionName)` function in `src/lib/auth.ts` atomically increments a counter in the `counters` collection:

```typescript
// Usage: const id = await getNextId(db, "leads");
```

> **IMPORTANT:** Never use `_id` as the primary lookup key in application code. Always use the integer `id` field.

---

## 4. Lead Statuses & Lifecycle

### 4.1 General Lead Statuses (Main Leads)

The general lead pipeline in `leads` collection uses these statuses:

```
new-lead → call-back → not-answering → meeting-scheduled → 
not-interested → wrong-number → document-pending → payment-pending → sales → follow-up
```

**Key lifecycle transitions:**
1. **Telecaller creates lead** → auto-assigned to self, status = `new-lead`
2. **Admin creates lead** → can assign to any telecaller/employee/meeting user
3. **Telecaller updates status** → tracks in `history[]` array
4. **`call-back`** → requires `callbackDate`, sets `callbackSeen: false`
5. **`meeting-scheduled`** → meeting details stored in `meetingDetails`
6. **`sales`** → lead becomes a "Sale". Can be sent to Case Manager with occupations + resume upload
7. **Case Manager receives sale** → `caseManagerAssignedAt` date is fixed and does NOT change unless admin reassigns

### 4.2 BD Pipeline Stages

Business Development leads (`bdleads` collection) use a separate pipeline:

```
New Lead → Research Started → Priority Set → Initial Contact → 
Response Received → Meeting Scheduled → Follow Up → Deal Done
```

**BD Lead Statuses:** `active` | `deal_done` | `lost`

**BD Priorities:** `High` | `Medium` | `Low`

### 4.3 Case Marketing Phases (CV Marketing Workspace)

Case Managers work through **4 phases** of employer outreach for each candidate:

| Phase | Key | Label | Source Unit |
|---|---|---|---|
| 1 | `job_boards` | Job Boards | Job Board (incl. LinkedIn) |
| 2 | `google_search` | Google Search | Keyword |
| 3 | `core_employers` | Core Employers | Category |
| 4 | `industry_directories` | Industry Directories | Directory |

Each phase: Add sources → Research employers per source → Send initial email → Auto follow-up cycle (10 days × 6 = 60 days max) → Record employer response status.

**Employer Response Statuses:**
- Terminal: `Interested`, `Interview Scheduled`, `Need Updated CV`, `Future Requirement`, `Position Filled`, `Not Interested`, `Invalid Email`, `Wrong Contact`, `No Response`
- Non-terminal (follow-ups continue): `Need More Information`, `Not Hiring Overseas`, `Other`

### 4.4 Data Entry Sequential Phase System

Data Entry module (`/dashboard/data-entry`) uses **4 sequential phases** corresponding to lead sources:

| Phase | Lead Source | Tab UI Color |
|---|---|---|
| Phase 1 | Google Maps | **RED** when active, **GREEN** when completed |
| Phase 2 | Search Engines | **RED** when active, **GREEN** when completed, **GREY** when locked |
| Phase 3 | Business Directories | **RED** when active, **GREEN** when completed, **GREY** when locked |
| Phase 4 | Job Portals | **RED** when active, **GREEN** when completed, **GREY** when locked |

**Rules & Flow:**
- **Sequential Progression:** Must complete current phase before moving to next. Clicking **`✓ Complete Phase`** marks current phase completed and unlocks the next phase.
- **Tab Color Coding:**
  - Active phase tab: **RED** (`bg-red-600`)
  - Completed phase tabs: **GREEN** (`bg-emerald-600`)
  - Locked future phases: **GREY** (`bg-gray-100 dark:bg-gray-800 cursor-not-allowed`)
- **Daily target:** **25 leads/day** (`DAILY_LEAD_TARGET = 25`)
- **Date Header:** Read-only today date label (`Today: 5 August 2026`).
- **Phase Persistence:** Completed phases are saved in `localStorage` per day (`bd_completed_phases_${workingDate}`).
- **Automated Lead Source:** `leadSource` is set programmatically from active phase tab. No dropdown select input.
- **Job Portals:** Phase 4 displays required `Job Portal Name *` input field (`leadSourceOther`).
- **History Table:** Includes a **Phase / Lead Source** column.

---

## 5. Email System

### 5.1 Email Pipeline Stages

```
info → agreement → invoice → payment_confirmation → case_manager
```

| Stage | Mailbox | Purpose |
|---|---|---|
| `info` | `info@tmsvisa.com` | Initial information emails |
| `agreement` | `compliance@tmsvisa.com` | Agreement/compliance docs |
| `invoice` | `sales@tmsvisa.com` | Invoice delivery |
| `payment_confirmation` | `sales@tmsvisa.com` | Payment confirmations |
| `case_manager` | `sumit.recruiter@tmsvisa.com` | Case manager introduction |

### 5.2 SMTP Configuration

Each mailbox has separate Hostinger SMTP credentials:
- `SMTP_HOST` (default: `smtp.hostinger.com`)
- `SMTP_PORT` (default: `587`)
- `SMTP_USER_INFO` / `SMTP_PASS_INFO`
- `SMTP_USER_COMPLIANCE` / `SMTP_PASS_COMPLIANCE`
- `SMTP_USER_SALES` / `SMTP_PASS_SALES`
- `SMTP_USER_CASE` / `SMTP_PASS_CASE`
- Fallback: `SMTP_USER` / `SMTP_PASS`

### 5.3 Follow-Up Engine

- **Auto follow-up schedule:** Day 3, Day 7, Day 14, Day 30 (4 total)
- Driven by `lead_workflows.nextFollowupAt` — cron endpoint at `/api/email/cron`
- Template variable replacement: `{{CandidateName}}`, `{{Program}}`, `{{CompanyName}}`
- Intro text varies by follow-up number (1st, 2nd, 3rd, 4th = progressively more urgent)

### 5.4 Case Marketing Follow-Up Engine

- **Interval:** Every 10 days (`FOLLOWUP_INTERVAL_DAYS = 10`)
- **Max cycles:** 6 (day 10, 20, 30, 40, 50, 60)
- After 60 days with no terminal status → auto-closed as `"No Response"`

---

## 6. Billing & Invoicing

- **Collection:** `billinginvoices`
- **Roles:** `admin` and `billing`
- **Invoice template org:** `"THE MIGRATION SCHOOL"` (HDFC bank details, UPI ID)
- **Status derivation:** Always computed from `amount` vs `paidAmount`:
  - `paid` = remaining ≤ 0.01
  - `partial` = some paid but remaining > 0.01
  - `unpaid` = nothing paid
- **PDF generation:**
  - `src/lib/billing/generateInvoicePdf.ts` — invoice PDF
  - `src/lib/billing/generateReceiptPdf.ts` — receipt PDF

---

## 7. File & Directory Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root layout (ThemeProvider, ChatProvider, Toaster, FloatingChat)
│   ├── page.tsx                      # Login page (/)
│   ├── globals.css                   # Global styles
│   ├── register/                     # Registration page
│   ├── api/
│   │   ├── auth/                     # login, logout, register, me, change-password, users
│   │   ├── leads/                    # [id], analytics, assign, create, list (General Leads)
│   │   ├── triloknath/leads/         # [id], assign, create, list (Triloknath-specific leads)
│   │   ├── bd/                       # leads (CRUD, check-duplicate, countries), analytics, targets, activity-logs
│   │   ├── case-manager/leads/       # Dedicated Case Manager APIs:
│   │   │   └── [id]/                 # GET lead details + occupations PUT endpoint
│   │   ├── case-marketing/           # [leadId] (sources, employers, credentials, summary), analytics, todo
│   │   ├── email/                    # lead, templates, workflows, workflows-list, mailboxes, analytics, cron
│   │   ├── billing/                  # [id], create, list, analytics, summary
│   │   ├── meetings/                 # book, cancel, complete, reschedule, available-slots, my-meetings
│   │   ├── chat/                     # conversations, messages, global-chat, lead-chat, files, reactions, etc.
│   │   ├── notifications/            # In-app notifications CRUD
│   │   ├── activity/                 # checkin, checkout, break, current, list, training
│   │   ├── announcements/            # CRUD + pin, read
│   │   ├── users/                    # User management
│   │   ├── vacancies/                # [id], create, list
│   │   ├── dashboard/                # Dashboard stats API
│   │   ├── admin/                    # Admin-specific APIs
│   │   └── my-analytics/             # Personal analytics
│   └── dashboard/
│       ├── page.tsx                   # Main dashboard (role-specific cards, 1413 lines)
│       ├── leads/                     # Lead list page
│       ├── leads/[id]/                # Lead detail page
│       ├── triloknath-leads/          # Triloknath-specific lead pages
│       ├── case-leads/                # Case Manager lead list
│       ├── case-leads/[id]/           # Case Manager lead detail + CV Marketing Workspace + Credentials + Admin Occupations Editor
│       ├── data-entry/                # Data Entry module (4-phase sequential tabs, 25/day target)
│       ├── bd-pipeline/               # BD Pipeline page (personal pipeline view)
│       ├── bd-pipeline/[id]/          # BD Lead detail
│       ├── bd-leads/                  # Admin: all BD leads
│       ├── bd-analytics/              # BD analytics dashboard
│       ├── billing/                   # Billing list page
│       ├── billing-analytics/         # Billing analytics
│       ├── meetings/                  # Meeting scheduling page
│       ├── email/                     # Email management (templates, workflows, mailboxes)
│       ├── email-analytics/           # Email analytics
│       ├── lead-analytics/            # Lead analytics dashboard
│       ├── case-lead-analytics/       # Case Lead analytics
│       ├── my-analytics/              # Personal performance analytics
│       ├── chat/                      # Chat page
│       ├── activity/                  # Activity tracking (check-in/out/breaks)
│       ├── announcements/             # Announcements page
│       ├── todo/                      # Case Manager to-do list
│       ├── users/                     # User management page
│       └── vacancies/                 # Vacancies page
├── components/
│   ├── DashboardNavbar.tsx            # Role-based navigation bar
│   ├── CreateLeadModal.tsx            # Lead creation form modal
│   ├── CreateTriloknathLeadModal.tsx   # Triloknath lead creation modal
│   ├── AssignLeadModal.tsx            # Lead assignment modal (includes sales→case manager conversion)
│   ├── AssignTriloknathLeadModal.tsx   # Triloknath lead assignment
│   ├── BDCreateLeadModal.tsx          # BD lead creation modal
│   ├── BDReassignModal.tsx            # BD lead reassignment
│   ├── CaseLeadEditModal.tsx          # Case lead editing
│   ├── CaseLeadReassignModal.tsx      # Case lead reassignment
│   ├── CaseMarketingWorkspace.tsx     # CV Marketing Workspace (4 phases, employer management)
│   ├── CheckInOutCard.tsx             # Employee check-in/out card
│   ├── CreateVacancyModal.tsx         # Vacancy creation modal
│   ├── LexicalEditor.tsx             # Rich text editor for email templates
│   ├── ToolbarPlugin.tsx             # Lexical editor toolbar
│   └── chat/                         # 24 chat-related components (conversations, messages, reactions, etc.)
├── contexts/
│   ├── ThemeContext.tsx               # Light/dark theme toggle (default: dark)
│   └── ChatContext.tsx                # Chat state provider
└── lib/
    ├── auth.ts                        # JWT sign/verify, bcrypt hash/verify, getNextId()
    ├── mongodb.ts                     # Singleton MongoDB connection + index creation
    ├── notifications.ts               # createNotification() helper
    ├── email.ts                       # Full email engine (SMTP, templates, workflow, follow-ups, cron)
    ├── gridfs.ts                      # GridFS bucket accessor (chatFiles)
    ├── caseMarketing.ts               # Case Marketing phases config, status options, follow-up engine
    ├── caseMarketingAuth.ts           # Auth + authorization for case marketing APIs
    ├── bd/
    │   ├── constants.ts               # BD constants (stages, 11 industries, 4 lead sources, phases, collections)
    │   ├── helpers.ts                 # BD helpers (round-robin, admin lookup, activity logging)
    │   └── useDuplicateCheck.ts       # React hook for live duplicate detection (company/website)
    └── billing/
        ├── constants.ts               # Billing constants (template, status computation)
        ├── generateInvoicePdf.ts      # Invoice PDF generator
        └── generateReceiptPdf.ts      # Receipt PDF generator
```

---

## 8. Authentication & Authorization Patterns

### 8.1 Token Extraction Pattern

All API routes use the same pattern to extract the JWT:

```typescript
const cookie = req.headers.get("cookie") || "";
const matches = cookie.match(/(^|; )token=([^;]+)/);
const token = matches ? matches[2] : null;
const payload = verifyToken(token);
```

**Helper wrappers:**
- `getAuthPayload(req)` in `src/lib/bd/helpers.ts` — for BD routes
- `getTokenPayload(req)` in `src/lib/caseMarketingAuth.ts` — for Case Marketing routes

### 8.2 Authorization

- **Telecaller/Employee/Meeting:** Can only access leads assigned to them (`lead.assignedTo === payload.id`)
- **Case Manager:** Can only access case leads assigned to them; read-only on general leads
- **Business Development:** Can only access BD leads assigned to them
- **Admin:** Full access to everything. Only Admin can edit/add candidate occupations on Case Lead detail page.
- **Billing:** Only billing-related routes

---

## 9. Key Business Rules

### 9.1 Lead Assignment

- **Telecaller/Employee/Meeting** creating a general lead → **auto-assigned to themselves** (`finalAssignedTo = payload.id`)
- **Admin** creating a general lead → can assign to any user
- **BD Data Entry leads** → **round-robin** across all `business_development` users (atomic sequence counter in `bdconfig`)
- **BD self-created leads** → self-assigned (no round-robin)

### 9.2 Case Manager Assignment Date

- `caseManagerAssignedAt` is set when a sale lead is sent to a Case Manager
- This date **MUST NOT change** when the case lead is updated/edited
- It only changes if an admin **reassigns** the lead to a different Case Manager

### 9.3 Case Manager Credentials

- Case Managers store `caseManagerEmail` and `caseManagerPassword` per lead
- These are the email credentials the Case Manager uses to send marketing emails for that candidate
- Admin can view these credentials to know which email/password the Case Manager is using
- Stored directly on the lead document (`caseManagerEmail`, `caseManagerPassword`)
- API endpoint: `PATCH /api/case-marketing/[leadId]/credentials`
- Rendered on `/dashboard/case-leads/[id]` below Occupations with 👁️ password toggle

### 9.4 Candidate Occupations & Admin Editing

- When converting a lead to "Sales" and sending to Case Manager, occupations are mandatory
- Multiple occupations can be added
- Stored as `occupations[]` array on the lead document
- Rendered **EXCLUSIVELY on `/dashboard/case-leads/[id]`** (removed from case leads list table)
- **Admin Only Editing:** Admin can add or update occupations directly from `/dashboard/case-leads/[id]` if missed during conversion:
  - API endpoint: `PUT /api/case-manager/leads/[id]/occupations`
  - Restrictive permission: Returns `403 Forbidden` if invoked by non-admin.

### 9.5 Phone Number Uniqueness

- Phone number is the unique identifier for general leads — duplicate phone numbers are rejected
- BD leads use website as the primary duplicate check (+ company name)

### 9.6 Triloknath Leads

- Separate lead pipeline with its own API routes (`/api/triloknath/leads/`)
- Separate UI pages (`/dashboard/triloknath-leads/`)
- Same collection (`leads`) but filtered/namespaced differently
- Same roles can access as general leads

---

## 10. Chat System

Full-featured chat with:
- **Direct Messages** (1:1 conversations between users)
- **Global Chat** (company-wide channel)
- **Lead Chat** (per-lead discussion threads)
- **File Uploads** (stored in GridFS, bucket `chatFiles`)
- **Emoji Reactions** on messages
- **Message Actions** (edit, delete, pin, star)
- **Typing Indicators** (polling-based)
- **Online Users** tracking
- **Search** across messages
- **Unread Count** badges (refreshed every 5 seconds)
- **New Message Popup** (center-screen alert for incoming messages)
- **Broadcast Panel** (admin-only announcements)
- **Floating Chat** button + window on all pages

---

## 11. Activity Tracking

- **Check-in/Check-out** system for employees
- **Break tracking** (start/stop breaks during shift)
- **Training sessions** tracking
- Work hours calculated: today, this week
- Dashboard displays `CheckInOutCard` component

---

## 12. Analytics Pages

| Page | Route | Access |
|---|---|---|
| Lead Analytics | `/dashboard/lead-analytics` | Admin |
| Case Lead Analytics | `/dashboard/case-lead-analytics` | Admin |
| BD Analytics | `/dashboard/bd-analytics` | Admin |
| Email Analytics | `/dashboard/email-analytics` | Admin |
| Billing Analytics | `/dashboard/billing-analytics` | Admin |
| My Analytics | `/dashboard/my-analytics` | All non-admin roles |

---

## 13. Critical Conventions — MUST Follow

### 13.1 Code Style

- **TypeScript strict mode** — all files must typecheck with `npx tsc --noEmit`
- **"use client"** directive on all client components
- **Preserve existing comments** — never remove comments/docstrings unless explicitly asked
- **Dark mode support** — every UI element must include `dark:` Tailwind variants
- **Indian timezone** — dates use `Asia/Kolkata` timezone (`toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })`)

### 13.2 API Route Patterns

- All API routes are Next.js App Router Route Handlers (`route.ts` files)
- Dynamic routes use `context: { params: Promise<{ id: string }> }` pattern (Next.js 16)
- Always `await context.params` before using params
- Return `NextResponse.json()` for all responses
- Error handling: catch block → `console.error(err)` → return 500 with error message

### 13.3 Database Patterns

- Always use `connectToDatabase()` for DB access
- Always use `getNextId(db, collectionName)` for new entity IDs
- MongoDB aggregation pipelines with `$lookup` for joins
- Use `$project` to limit returned fields
- Use `$push` for array updates (history, notes)
- Use `$set` for field updates

### 13.4 File Isolation Rules

When modifying features:
- **Never modify general lead routes** (`/api/leads/`) when working on case manager features
- **Never modify general lead pages** when working on case lead pages
- Case manager features use dedicated endpoints: `/api/case-manager/leads/[id]`, `/api/case-marketing/`
- BD features are fully isolated in `src/lib/bd/` and `/api/bd/`
- Billing features are isolated in `src/lib/billing/` and `/api/billing/`

### 13.5 Form Draft Persistence

Data Entry forms persist drafts in `localStorage` (`bd_data_entry_form_draft`) to survive accidental page refreshes. Drafts are cleared on successful submit only.

### 13.6 Notification Pattern

```typescript
import { createNotification } from "@/lib/notifications";

await createNotification({
  userId: targetUser.id,
  title: "Notification Title",
  message: "Notification body text",
  type: "notification_type",
  link: "/dashboard/path-to-resource",
});
```

---

## 14. Environment Variables

```env
# MongoDB
MONGODB_URI=mongodb+srv://...

# JWT
JWT_SECRET=your_jwt_secret

# SMTP (Hostinger)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
SMTP_SECURE=false

# Per-mailbox SMTP credentials
SMTP_USER_INFO=info@tmsvisa.com
SMTP_PASS_INFO=...
SMTP_USER_COMPLIANCE=compliance@tmsvisa.com
SMTP_PASS_COMPLIANCE=...
SMTP_USER_SALES=sales@tmsvisa.com
SMTP_PASS_SALES=...
SMTP_USER_CASE=sumit.recruiter@tmsvisa.com
SMTP_PASS_CASE=...

# Fallback SMTP (used if per-mailbox env vars missing)
SMTP_USER=...
SMTP_PASS=...
```

---

## 15. Running Locally

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Type check (run before committing)
npx tsc --noEmit

# Production build
npm run build

# Start production
npm start
```

---

## 16. Common Pitfalls & Gotchas

1. **`getNextId` result shape** — The function accesses `result.value.seq`. If MongoDB driver version changes, this path may break.
2. **Phone uniqueness** — General leads use phone as the unique key. BD leads use website. Don't confuse them.
3. **`caseManagerAssignedAt` immutability** — This date must NEVER change on normal lead updates. Only admin reassignment resets it.
4. **Working date lock** — Data Entry's `workingDate` is locked to today server-side (`todayISO()` check in create route). UI also enforces this.
5. **Email simulation** — If SMTP is not configured, emails are "simulated" (logged but not sent). Check `sendEmail()` return value for `simulated: true`.
6. **Round-robin atomicity** — BD lead assignment uses `$inc` on `bdconfig.assignSeq` to prevent race conditions. Never use read-then-write.
7. **Data Entry phase persistence** — Completed phases are stored in `localStorage` per date (`bd_completed_phases_${workingDate}`). A different browser/device starts fresh.
8. **Industries list** — `"Job Portals"` was removed from `INDUSTRIES` (it's now a lead source phase only). Existing BD leads with `industry: "Job Portals"` remain as historical data.
9. **Admin-only Occupation Editing Security** — `PUT /api/case-manager/leads/[id]/occupations` rejects any non-admin call with 403 Forbidden.
10. **Case Lead file isolation** — `/dashboard/case-leads/[id]` uses `/api/case-manager/leads/[id]` to fetch lead data, ensuring non-case lead endpoints (`/api/leads/[id]`) remain clean and untouched.
