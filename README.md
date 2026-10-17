# Barangay Binitayan — Web-Based Post Disaster Monitoring and Relief Allocation with Decision Support System

**User Management updates:** after importing an older database snapshot, apply migrations 26 (registration requests), 27 (Field Officer role), and 28 (assigned Purok) before running the current application. Existing field officers need an administrator to assign a Purok. See [User Management setup and verification](docs/USER_MANAGEMENT.md). Report photos require the supplied Apache rewrite; when using PHP's built-in server from this project root, run `php -S 127.0.0.1:8080 -t . backend/dev_router.php`.

A student capstone system for post-disaster monitoring and relief allocation:
disaster reporting and assessment (recorded by authorized personnel), household
profiling, relief requests (recorded by the Administrator), an explainable
rule-based Decision Support System, inventory, allocation, "Ready for
Distribution" with an automated SMS, distribution planning, evacuation centers,
SMS and in-app notifications, and reporting. Residents only view their own
household and relief status. The DSS recommends; the Administrator decides.

> **Phase 19 (capstone redesign)** is summarized in section 24 below and documented in
> `REDESIGN_IMPLEMENTATION_REPORT.md`, `WORKFLOW.md`, `API_ENDPOINTS.md`,
> `database/MIGRATION_PHASE19.md` and `TESTING_SUMMARY.md`.
>
> **Phase 21 (resident role revision, Ready for Distribution SMS)** is summarized in
> section 24b and documented in `PHASE21_RESIDENT_SCOPE_REVISION.md`. It supersedes the
> resident features described in the older phase sections below (resident report
> submission, relief requests, feedback, Weather & Hazards and Evacuation Centers pages).

> **Phase 23 (six core modules)** is the current structure of the system. See section 24c and
> `PHASE23_CORE_MODULES_REPORT.md`. The navigation is organised around Automation of Reporting,
> the DSS, Hazard Monitoring, the Geographic Coordinates System (map), Relief Allocation and SMS
> Notification. Older phase sections below describe pages that were later merged or retired from the
> navigation (household statistics, weather monitoring, low stock, donations, relief packages,
> distribution schedules, beneficiary verification, analytics dashboards, relief feedback). Their
> data and secured backend endpoints are kept.

**Stack:** React (Vite, JSX, React Router, Axios) + PHP REST API + MySQL/MariaDB (XAMPP)

---

## 1. Project Structure

```
barangay-disaster/
├── backend/          <-- PHP REST API (place inside XAMPP htdocs)
├── frontend/          <-- React + Vite app
└── database/
    ├── barangay_disaster_db_FINAL.sql      <-- fresh install: import THIS (Phases 1–23, no accounts/data)
    ├── barangay_disaster_db_COMPLETE_PHASE25.sql <-- one-file demo install: DB + structure + admin + defense data
    ├── barangay_disaster_db_complete.sql   <-- older Phase 17 consolidation (needs Phase 18 + 19 migrations)
    ├── barangay_disaster_db.sql            <-- older base dump (without Phase 16)
    └── migration_phase*.sql                <-- only for upgrading an older database (latest: phase19)
```

---

## 2. Backend Setup (XAMPP)

1. Install and start **XAMPP**, then start **Apache** and **MySQL** from the XAMPP
   Control Panel.
2. Copy the `backend` folder into your XAMPP `htdocs` directory so the path looks like:
   ```
   C:\xampp\htdocs\barangay-disaster\backend
   ```
3. Open **phpMyAdmin** (`http://localhost/phpmyadmin`), create nothing manually —
   create an empty database named `barangay_disaster_db`, select it, click **Import**,
   choose `database/barangay_disaster_db_FINAL.sql`, and click **Go**.
   This creates the complete final structure (Phases 1–19, 31 tables — no
   migrations needed) and the default settings/categories/disaster types.
   No user accounts and no relief items are included.
   *Upgrading an existing database instead?* Back it up, then import
   `database/migration_phase18_recommendation_rejections.sql` (if not yet applied)
   and `database/migration_phase19_redesign.sql`.
4. Open **XAMPP Shell** (XAMPP Control Panel → **Shell**), go to the project
   folder and run the admin setup script **from the command line**:
   ```
   cd C:\xampp\htdocs\barangay-disaster
   php backend/setup_admin.php
   ```
   This creates the first Admin account:
   - **Email:** `admin@binitayan.gov.ph`
   - **Password:** a random one-time password, printed once in the terminal

   Log in and change it right away under **My Profile → Change Password**.
   The setup scripts only run from the command line — opening them in a
   browser returns "Not found" (Phase 17 Security Fix 2).
5. Database credentials, allowed CORS origins and the httpSMS keys are read from
   `backend/config/app_config.php` (local XAMPP defaults: localhost / root / no password).
   To change them, copy `backend/config/app_config.local.example.php` to
   `app_config.local.php` and edit that file (never commit or share it).
6. Test the API is running by visiting:
   ```
   http://localhost/barangay-disaster/backend/auth/session.php
   ```
   You should see `{"success":true,"authenticated":false}`.

---

## 3. Frontend Setup (React + Vite)

1. Make sure **Node.js** (v18+) is installed.
2. Open a terminal in the `frontend` folder:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   `npm install` will pull in Tailwind CSS along with the other frontend
   dependencies — no extra setup needed. The design system (buttons, cards, badges,
   forms, etc.) is built with Tailwind utility classes composed via
   `@layer components` in `src/index.css`, using custom design tokens (colors,
   fonts) defined in `tailwind.config.js`.
3. Open the app at:
   ```
   http://localhost:5173
   ```

The frontend calls the backend at `VITE_API_BASE_URL`, defaulting to:
```
http://localhost/barangay-disaster/backend/
```
If your XAMPP project folder has a different name, copy `frontend/.env.example` to
`frontend/.env.local` and set `VITE_API_BASE_URL` there.

---

## 4. Logging In

| Role             | How to get an account                                   |
|------------------|-----------------------------------------------------------|
| Admin            | Created via `php backend/setup_admin.php` (see step 4 above) |
| Resident         | Register on the public **Register** page                  |
| Relief Personnel | Created by an Admin (User Management → Relief Personnel)   |

After an admin logs in, they should add **Household** records (Household Management
page) and link a resident's account to a household by setting the household's
`user_id` — this is required for residents to see their household and the relief
allocated to them (a new account sees nothing until it is linked). Since Phase 21,
residents do not submit reports; staff record reports for a selected household. (For the simplified scope, linking is done by
an admin directly; a full "claim my household" flow was left out of the 30% scope.)

---

## 5. Testing the CRUD Flow End-to-End

1. **Log in as Admin** → go to **Households** → Add a household (use a Resident's
   name so it's easy to identify) and link it to the resident's account.
2. **Log in as Relief Personnel** (or Admin) → **Disaster Reports** →
   **+ Record Disaster Report** → choose the household → fill out → **Record Report**.
3. **Log in as Admin** → **Disaster Reports** → View the new report → **Verify** it
   (only the Admin can verify).
4. **Log in as Admin** → **Priority Assessment** → confirm the household now shows a
   priority score/level.
5. **Log in as Admin** → **Relief Allocation** → **New Allocation** → select the
   household + a relief item + quantity → Create → **Approve** it.
6. **Log in as Relief Personnel** → **Approved Allocations** → select the row →
   **Mark Ready for Distribution** → enter the verified date, optional time,
   location and optional instructions → tick the confirmation → **Mark Ready and
   Notify**. One SMS per household is sent (or logged "Not Configured" while
   httpSMS is off).
7. **Log in as Resident** → **Relief Allocation Status** → confirm the item shows
   "Ready for Distribution" with the schedule and location.
8. **Log in as Relief Personnel** → **Approved Allocations** → **Mark as Distributed**.
   Inventory quantity automatically decreases.
9. **Log in as Resident** → **Relief Allocation Status** → confirm the item now shows as
   "Distributed".
10. **Log in as Admin** → **Relief Inventory** → confirm quantity was reduced, and
   that a "Low Stock" badge appears if quantity falls at/below the minimum level.

---

## 6. Notes

- Passwords are hashed with PHP's `password_hash()` (bcrypt).
- All backend endpoints use PDO prepared statements (SQL-injection safe).
- Sessions (PHP `$_SESSION`) are used for authentication; the frontend sends
  `withCredentials: true` so the session cookie is included in every request.
- Advanced GIS, AI/ML prediction, disaster forecasting and GPS tracking are not part
  of this system. Notifications are in-app plus SMS through httpSMS (Phase 10/19).
  Data refreshes by controlled polling, not WebSockets.

---

## 7. Phase 1 — User Management Improvements

If you already imported the original `barangay_disaster_db.sql`, run
`database/migration_phase1_user_management.sql` in phpMyAdmin's SQL tab to add the
new `is_active` column to the `users` table. (Fresh imports of the updated
`barangay_disaster_db.sql` already include it — no migration needed.)

**What's new:**

- **Administrators page** (`/admin/administrators`) — add, edit, deactivate/activate,
  and delete admin accounts. You can't deactivate or delete your own account while
  logged in.
- **Residents page** (`/admin/residents`) — search by name/email, filter by status
  or household-link state, view a resident's full profile (including their linked
  household and report count), and link/unlink a household to a resident account.
- **Relief Personnel page** (`/admin/personnel`) — add, edit, and activate/deactivate
  personnel accounts, and view each person's distribution history.
- **Deactivated accounts can't log in.** If an admin deactivates someone while
  they're logged in, their session is invalidated the next time the app checks
  (e.g. on refresh or navigation).
- **Role-based permissions:** every backend endpoint already checks both that the
  requester is logged in and that their role is allowed to call it
  (`require_login(['admin'])`, etc. — see `backend/config/cors.php`), and the React
  side mirrors this with `ProtectedRoute` so unauthorized users are redirected before
  a restricted page even renders.

---

## 8. Phase 2 — Complete Household Profiling

If you already imported the database (from the original schema or after Phase 1),
run `database/migration_phase2_household_profiling.sql` in phpMyAdmin's SQL tab.
It adds:
- Six vulnerability breakdown columns on `households` (`children_count`,
  `seniors_count`, `pwd_count`, `pregnant_count`, `medical_needs_count`,
  `other_vulnerable_count`). The existing `vulnerable_members` column is now
  automatically recalculated as the sum of these whenever a household is saved —
  the priority scoring system keeps working exactly as before, just with more
  detail underneath.
- A new `household_members` table for listing named individuals within a household
  (name, relationship, age).

(Fresh imports of the updated `barangay_disaster_db.sql` already include all of
this — no migration needed.)

**What's new:**

- **Household form** (Households page) now captures the full profile: head of
  family, purok, address, contact number, number of members, latitude/longitude,
  and a detailed vulnerability breakdown (children, senior citizens, PWD, pregnant
  members, medical needs, other) instead of a single combined number.
- **Household members** — open a household's **View** modal to add, list, and
  remove named members (name, relationship to head, age).
- **Search & filtering** on the Households page: search by household head name or
  address, filter by purok, household size range, vulnerability category, and
  computed priority level (Low/Medium/High/Critical, pulled live from the
  decision-support scoring endpoint).
- **Household Statistics page** (`/admin/household-stats`): total households, total
  population, vulnerable population, average household size, a population-per-purok
  breakdown table, and a barangay-wide vulnerability breakdown.
- The **resident's Household Profile** page now also shows their household's
  vulnerability badges and household members list (read-only — residents can view
  but not edit; only admins can add/edit household data).

---

## 9. Phase 3 — Advanced Disaster Reporting

If you already have the database from a previous phase, run
`database/migration_phase3_advanced_reporting.sql` in phpMyAdmin's SQL tab. It adds:
- `report_time`, `verified_by`, `verified_at`, and `verification_remarks` columns to
  `disaster_reports`
- A new `report_photos` table (multiple photos per report)
- A new `damage_assessments` table (one assessment per report, completed by an admin)

(Fresh imports of the updated `barangay_disaster_db.sql` already include all of this.)

**File uploads — one-time setup:**
- Make sure `backend/uploads/reports/` is writable by the web server (this is the
  default on XAMPP for Windows/macOS; on Linux you may need
  `chmod -R 775 backend/uploads`).
- Default XAMPP PHP settings (`upload_max_filesize`, `post_max_size`) are large
  enough for the 5-photos-per-report / 5MB-per-photo limits built into this system,
  so no `php.ini` changes should be needed.
- A `.htaccess` in `backend/uploads/` blocks any uploaded file from being executed
  as PHP, as a security precaution.

**What's new:**

> *Phase 21 note:* residents no longer submit or view disaster reports. Reports are
> recorded by Relief Personnel or the Administrator (**+ Record Disaster Report**),
> and photos are staff-only. See section 24b.

- **Submit Disaster Report** (resident) now also captures a report **time** (in
  addition to date) and lets residents attach up to 5 photos per report.
- **Report Verification** (admin) — verifying or rejecting a report now opens a
  remarks dialog; the barangay admin's name and the verification timestamp are
  recorded automatically and shown to both the admin and the reporting resident.
- **Damage Assessment** — from a report's detail view, an admin can record damage
  levels (None/Minor/Major/Totally Damaged) for house, infrastructure, property, and
  agricultural damage, plus an overall **estimated severity** and remarks. This is
  saved per report (one assessment per report, editable any time).
  - The **priority scoring system** (Phase 1) now prefers this assessed severity
    over the resident's initially reported severity whenever an assessment exists —
    giving a more accurate, barangay-verified score without changing how the
    algorithm itself works.
- **Report photos** — residents and admins can view an uploaded photo gallery per
  report; admins can delete any photo, residents can delete their own photos while
  the report is still Pending.
- **Report history & filtering** (admin Disaster Reports page): filter the full
  report list by status, disaster type, purok, resident, or household — covering
  resident report history, household disaster history, disaster-type history, and
  purok disaster history from a single interface.

---

## 10. Phase 4 — Hazard Monitoring

This module works entirely on **manually entered data by default** — no external
weather API is required to use it, per the project's original scope. It's built to
be *optionally* connected to a real weather API later without any code changes
(see section 11 below).

If you already have the database from a previous phase, run
`database/migration_phase4_hazard_monitoring.sql` in phpMyAdmin's SQL tab. It adds:
- A `weather_logs` table (temperature, rainfall, condition, wind, and a `source`
  column marking each entry as `Manual` or `API`)
- A `hazard_alerts` table (hazard type, escalation status, affected area, issued/
  resolved tracking)

(Fresh imports of the updated `barangay_disaster_db.sql` already include both.)

**What's new:**

- **Weather Monitoring** (admin, `/admin/weather`): log temperature, rainfall,
  condition, and wind manually; filter by date range; delete entries.
- **Hazard Alerts** (admin, `/admin/hazard-alerts`): issue Flood / Typhoon /
  Landslide / General Emergency alerts, each with its own escalation
  status — **Normal → Alert → Warning → Critical**. Update the status as a
  situation evolves, or Resolve an alert once it's passed (resolved alerts stay in
  the list as history, filterable by type, status, and date).
- **Barangay Hazard Status banner**: a shared component that shows the current
  overall status (the highest severity among active alerts) plus a summary of
  active alerts and the latest weather reading. It appears on the **public Home
  page** (visible even to people who aren't logged in — like a barangay bulletin
  board), and on the Admin, Resident, and Relief Personnel dashboards.
- **Weather & Hazards** page for Residents and Relief Personnel (read-only): the
  same status banner plus a browsable weather log and alert history, so everyone
  can stay informed without needing admin access.
  *(Phase 21: removed from the resident portal; Relief Personnel keep it. The new
  resident dashboard has no hazard banner.)*

---

## 11. Connecting a Real Weather API (Optional)

The Weather Monitoring page includes a **"Sync from Weather API"** button. By
default, clicking it just explains how to turn this on — it does nothing harmful
and nothing is required to keep using the system with manual entries only.

To connect a real provider (example uses [OpenWeatherMap](https://openweathermap.org/api),
which has a free tier with no credit card required):

1. Create a free account at openweathermap.org and generate an API key (**Sign Up →
   API keys tab** — new keys can take up to an hour to activate).
2. Open `backend/config/weather_api_config.php` and update it:
   ```php
   return [
       'API_ENABLED' => true,                 // was false
       'API_KEY' => 'paste-your-key-here',
       'LATITUDE' => 13.1391,                 // Barangay Binitayan's actual coordinates
       'LONGITUDE' => 123.7438,
       'API_URL' => 'https://api.openweathermap.org/data/2.5/weather',
   ];
   ```
3. Make sure PHP's `curl` extension is enabled: open `php.ini` (in
   `C:\xampp\php\`), find the line `;extension=curl`, remove the leading
   semicolon, save, and restart Apache. (On most XAMPP installs this is already
   enabled by default.)
4. Log in as admin, go to **Weather Monitoring**, and click **Sync from Weather
   API**. A new log entry should appear, tagged with a blue **API** badge in the
   Source column (manual entries show a green **Manual** badge).
5. *(Optional — automation)* To fetch weather automatically instead of clicking the
   button every time, set up a scheduled task that calls the endpoint periodically:
   - **Windows Task Scheduler**: create a task that runs, e.g. every hour:
     ```
     curl.exe "http://localhost/barangay-disaster/backend/hazards/weather/fetch_external_weather.php"
     ```
     Note: this specific endpoint requires an authenticated admin session
     (`require_login(['admin'])`), so for unattended automation you'd need to either
     relax that check for this one endpoint, or have the scheduled task log in first
     and reuse the session cookie. For a capstone demo, clicking "Sync" manually
     during a demo is simpler and avoids that complexity entirely.

**If you want to use a different provider** (e.g. PAGASA's public advisories, or
another weather API), the only file you need to change is
`backend/hazards/weather/fetch_external_weather.php` — specifically the section
marked `Map the external API's response shape onto our own schema`. Everything else
(the database table, the frontend button, the Weather Monitoring page) stays the
same regardless of which provider you use.

---

## 12. Phase 5 — GIS and Map Features

This is intentionally a **basic** map, per the project's scope — it visualizes data
you already have (household latitude/longitude from Phase 2, and priority scores
from the decision-support module) using **Leaflet**, a free open-source mapping
library. No backend changes were needed for this phase — the map is purely a new
way of looking at existing data — and no API key or account sign-up is required:
map tiles are pulled from OpenStreetMap, a free public service.

**Setup:** just run `npm install` again in `frontend/` — Leaflet and React-Leaflet
were added to `package.json` and will install automatically.

**Important — update your barangay's real coordinates.** Open
`frontend/src/config/mapConfig.js` and change `BARANGAY_CENTER` to Barangay
Binitayan's actual coordinates (ideally the same values you used in
`backend/config/weather_api_config.php`, so the map and weather module agree on
where "here" is). Household markers only appear on the map for households that
already have latitude/longitude filled in on their household record (Households
page, Phase 2) — households without coordinates are listed separately under
"Missing Coordinates" instead of being silently dropped.

**What's included:**

- **Barangay Map** (`/admin/map` for admins, `/personnel/map` for relief
  personnel): pan and zoom (built into Leaflet — scroll to zoom, drag to pan,
  +/- buttons), with a marker for every household that has coordinates.
- **Household markers**: click any marker to see a popup with the household's
  head of family, purok, address, member count, vulnerable count, priority
  level/score, and exact coordinates.
- **Puroks**: no fake boundary polygons are drawn (the system doesn't have real
  purok boundary survey data, and fabricating one would be misleading) — instead,
  switch the "Color Markers By" control to **Purok** to color-code every household
  by its purok, or filter the map down to a single purok at a time.
- **Basic heat overlay**: a "Show priority heat overlay" checkbox draws a
  translucent colored circle under each marker, sized and colored by that
  household's priority level. Where multiple high-priority households cluster
  together, their circles overlap and visually intensify — a simple, honest
  approximation of a heat map using plain colored circles, not real kernel-density
  spatial analysis (per the "keep GIS basic" requirement).
- **Location search**: search by household name/address, filter by purok, and
  click **Locate** on any result to fly the map to that household and open its
  popup. Coordinates are shown directly in the results table.

**On the roadmap, not built (would count as "advanced" GIS):** real purok boundary
polygons (would need actual survey/GeoJSON data), marker clustering for very large
datasets, true spatial density heatmaps, and route/distance calculations for relief
delivery — all deliberately deferred per the phase's scope note.

---

## 13. Phase 6 — Decision Support System

If you already have the database from a previous phase, run
`database/migration_phase6_decision_support.sql` in phpMyAdmin's SQL tab. It adds
`approved_by`, `approved_at`, and `recommendation_reason` columns to
`relief_allocations`, so every approval — manual or recommendation-driven — records
who approved it and when. (Fresh imports of the updated `barangay_disaster_db.sql`
already include this.)

This phase upgrades the Phase 1 priority-scoring algorithm and adds a genuine (but
still simple, rule-based, non-AI) relief recommendation engine — matching the
project's consistent "keep it explainable" requirement.

### Improved Priority Scoring

The Priority Score now factors in seven things instead of four (see
`backend/dashboard/priority_list.php` for the full commented algorithm):

1. **Disaster Severity** — resident-reported, Low=1 to Critical=4
2. **Household Size** — +1 per 5 members, capped at +3
3. **Vulnerable Members** — +1 each, capped at +4
4. **Report Status** — Verified=+2, Pending=+1
5. **Damage Assessment** *(new)* — Major=+1, Totally Damaged=+2 per damage
   category (house/infrastructure/property/agricultural), capped at +4
6. **Household Location** *(new)* — +2 if an active hazard alert specifically
   targets this household's purok, +1 if there's an active barangay-wide alert,
   else 0 — this connects Phase 4's hazard alerts directly into the scoring
7. **Current Relief Status** *(new)* — −2 if the household has already received
   fully distributed relief, 0 if relief is pending/approved, +1 if they've never
   received any — this connects the relief allocation history back into scoring,
   so already-helped households don't keep dominating the top of the list

New thresholds (score is clamped to a minimum of 0): **15+ Critical, 10–14 High,
5–9 Medium, 0–4 Low.** Every household row on the Priority List page has a
**"View Breakdown"** button showing exactly how its score was built, factor by
factor — full transparency, no black box.

### Vulnerability Score (new, independent of any disaster report)

A second, separate score that reflects a household's *baseline* vulnerability
regardless of whether a disaster has been reported: sum of children, senior
citizens, PWD, pregnant, medical-needs, and other vulnerable member counts, plus
+1 per 5 household members (capped at +2). Levels: **7+ Critical, 4–6 High, 2–3
Medium, 0–1 Low.** Shown as its own column on the Priority List page — useful for
preparedness planning even before any disaster strikes.

### Relief Recommendation Engine

New page: **Relief Recommendations** (`/admin/recommendations`). For every
household at Medium priority or above, and every relief item currently in stock,
it computes a suggested quantity using simple, fixed ratios:

| Category | Rule |
|---|---|
| Food | 1 unit per 2 household members |
| Water | 3 units per household member |
| Hygiene | 1 unit per household |
| Shelter | 1 unit per 3 household members |
| Medical | 1 unit, only if the household has any vulnerable members |
| (other/uncategorized) | 1 unit per household |

The recommended quantity is capped at whatever is actually in stock, and the
displayed reason says so when stock was the limiting factor. Households that
already have a Pending or Approved allocation for a given item aren't
re-recommended for that same item.

### Allocation Result (Approve / Reject)

Each recommendation row has **Approve** and **Reject** buttons:
- **Approve** creates the relief allocation immediately with status **Approved**
  (skipping a redundant separate approval click, since reviewing the
  recommendation *is* the approval step), recording who approved it, when, and
  the system's reason for the suggestion (visible later in Relief Allocation
  history).
- **Reject** dismisses the suggestion without creating anything, logged to the
  audit trail for accountability.
- The existing manual "New Allocation" flow (Relief Allocation page) is
  unchanged and still goes through the original Pending → Approve → Distribute
  pipeline — the recommendation engine is a faster path for the specific case of
  acting on the system's own suggestions, not a replacement for manual
  allocation.

---

## 14. Phase 7 — Advanced Inventory Management

If you already have the database from a previous phase, run
`database/migration_phase7_advanced_inventory.sql` in phpMyAdmin's SQL tab. It:
- Normalizes any existing item categories to the fixed set below, then converts
  `relief_items.category` from free text to a proper `ENUM`
- Adds an `inventory_logs` table (a unified transaction history)
- Adds a `donations` table

(Fresh imports of the updated `barangay_disaster_db.sql` already include all of
this — and the seed relief items already use the correct category names, so
nothing breaks on a fresh install.)

### Inventory Categories

Categories are now a fixed set instead of free text — **Food, Water, Hygiene,
Medical, Shelter, Other** — selected from a dropdown everywhere an item's category
is set. This also matches the categories the Phase 6 recommendation engine already
used, so recommendations and inventory management now speak the same language.

### Stock Management

- **Stock In / Stock Out** (existing, now enhanced): both accept an optional
  reference/note (e.g. "Restocked from municipal supply", "Distributed to flood
  victims") and every change is now written to the inventory log automatically.
- **Adjust Quantity** *(new)*: for correcting the recorded quantity after a
  physical stock count — sets the quantity directly rather than adding/removing,
  and requires a reason (this is different from Stock In/Out, which should be used
  for normal restocking/distribution so the history stays meaningful).
- **View Current Stock**: the Relief Inventory page, as before.
- **View Stock History** *(new)*: the **Inventory Logs** page shows every
  stock-in, stock-out, adjustment, and donation, filterable by item, type, and
  date range.

### Low Stock Monitoring

- **Set Minimum Stock** (existing): per-item `minimum_level` field.
- **Detect Low Stock / Display Warning** (existing): the low-stock badge on the
  Relief Inventory page.
- **Low Stock Dashboard** *(new)*: a dedicated page (`/admin/inventory/low-stock`)
  listing every low-stock item, sorted most-critical-first, each with a one-click
  **Restock** action. The main Admin Dashboard also now shows a compact preview of
  the same list.

### Donation Management *(new)*

A dedicated **Donations** page (`/admin/inventory/donations`) records donor name,
optional contact, donation date, item, quantity, and remarks. Recording a donation
**automatically adds the donated quantity to inventory** and logs it — donors don't
need a separate "add stock" step.

### Inventory Logs *(new)*

One unified, filterable history table covering all four transaction types —
Stock In, Stock Out, Adjustment, and Donation — each showing the quantity change,
the resulting quantity, a reference note, who performed it, and when.

---

## 15. Phase 8 — Advanced Relief Allocation

If you already have the database from a previous phase, run
`database/migration_phase8_advanced_relief_allocation.sql` in phpMyAdmin's SQL
tab. It adds `relief_packages`, `relief_package_items`, `distribution_schedules`,
and `distribution_beneficiaries` tables, plus a `schedule_id` column on
`relief_allocations` linking distributions back to the schedule that produced
them. (Fresh imports of the updated `barangay_disaster_db.sql` already include
all of this.)

This phase reuses the existing `relief_allocations` table as the single source of
truth for "what relief was actually given out" — a distribution schedule doesn't
create a parallel record-keeping system. When a beneficiary is marked
**Delivered**, that's the exact moment real `relief_allocations` rows are created
(status `Distributed`, linked to the schedule) and inventory is reduced — same as
the existing manual distribution flow, just triggered from the scheduling
workflow instead.

### Relief Package Management (`/admin/packages`)

Create reusable bundles of items (e.g. "Standard Family Pack" = 1 sack rice + 3
liters water + 1 hygiene kit). Editing a package replaces its full item list in
one save (simpler and safer than diffing individual add/remove operations).
Packages already used by a schedule can't be deleted — deactivate them instead
(`is_active` toggle), which just hides them from new schedule creation.

### Beneficiary Management

Built into the **Create Distribution Schedule** page (`/admin/schedules/new`)
rather than a separate screen, since selecting beneficiaries is naturally part of
creating a schedule: a searchable, filterable household picker shows every
household with its live **priority level** (reusing the Phase 6 scoring engine),
sorted highest-priority-first, with "Select All Shown" for quickly grabbing every
household matching a priority filter. **Verifying** a beneficiary happens later,
from the schedule's detail page, once relief personnel or an admin has confirmed
the household's eligibility in person — a beneficiary can't be marked Delivered
until verified.

### Distribution Scheduling

A schedule captures: relief package, date, time, location, and an assigned relief
personnel account — all set on the creation page, editable afterward from the
schedule detail view (admin only).

### Distribution Tracking

Each beneficiary within a schedule moves through its own status pipeline, shown
on the schedule's detail page (`/admin/schedules/:id` for admins,
`/personnel/schedules/:id` for relief personnel — personnel only see schedules
assigned to them):

**Pending → Prepared → Dispatched → Delivered**, with **Cancelled** available at
any point before Delivered. Reaching Delivered requires the beneficiary to
already be verified, and requires enough stock on hand for every item in the
package — checked at that exact moment (not reserved in advance), matching how
stock checks already work everywhere else in the system.

### Distribution History

The existing Relief Allocation history (and the relief personnel's Distribution
History page) now also shows, for allocations that came from a schedule: the
distribution date, location, and assigned personnel — alongside the item and
quantity actually received. Since schedule-driven allocations land in the same
`relief_allocations` table as manual and recommendation-driven ones, a
household's full relief history is always in one place regardless of which
workflow produced it.

---

## 16. Phase 9 — Relief Personnel Features

If you already have the database from a previous phase, run
`database/migration_phase9_relief_personnel_features.sql` in phpMyAdmin's SQL
tab. It adds `delivery_reports` and `delivery_report_photos` tables. (Fresh
imports of the updated `barangay_disaster_db.sql` already include both.)

This phase is entirely about the relief personnel side of the Phase 8 workflow —
proper dashboard visibility, a dedicated verification tool, and a real delivery
confirmation + reporting flow with photo evidence, mirroring the pattern already
used for disaster report photos (Phase 3).

### Personnel Dashboard (`/personnel`)

Now shows real counts instead of the old generic allocation stats: **Assigned
Schedules**, **Pending Deliveries** (beneficiaries still in Pending/Prepared/
Dispatched across all their schedules), **Completed Deliveries**, and **Today's
Schedules** — plus a table of exactly what's scheduled for today, with a
delivered-so-far progress count per schedule.

### Beneficiary Verification (`/personnel/beneficiary-verification`)

A dedicated search tool across every beneficiary in schedules assigned to that
personnel — search by household name, filter by verification status, and verify
directly from the list without drilling into each schedule individually.
(Verifying was already possible from a schedule's detail page since Phase 8; this
adds a faster, searchable way to do the same thing across all assignments at
once.)

### Distribution Confirmation

Marking a beneficiary as **Delivered** (from either the schedule detail page or
Beneficiary Verification) now opens a proper confirmation dialog instead of a
plain "are you sure?" — requiring a **recipient name** (the person who actually
received the relief, which isn't always the household head), with an optional
remarks field and up to 5 photos. This is still the same moment real
`relief_allocations` rows get created and inventory gets reduced (unchanged from
Phase 8) — Phase 9 just makes that confirmation richer and properly documented.

### Delivery Reports

Confirming a delivery creates a `delivery_reports` record (recipient, remarks,
who submitted it, when) linked 1-to-1 with that beneficiary, with photos uploaded
separately right after (since file uploads need their own multipart request,
just like Phase 3's report photos). The new **Completed Deliveries** page
(`/personnel/completed-deliveries`) lists every delivery a personnel has
confirmed, searchable by household or recipient name and filterable by date,
with a detail view showing the full report and photo gallery.

---

## 17. Phase 10 — SMS Notification System (httpSMS)

If you already have the database from a previous phase, run
`database/migration_phase10_sms_notifications.sql` in phpMyAdmin's SQL tab. It
adds an `sms_logs` table. (Fresh imports of the updated `barangay_disaster_db.sql`
already include it.)

Like the weather module in Phase 4, **SMS is fully optional and disabled by
default** — every send attempt is still logged (with status `Not Configured`),
so you can build and test the entire flow (recipient selection, message
templates, logs) before connecting a real phone.

### Setting up httpSMS

Follow [httpSMS setup](docs/httpsms-sms.md). Configure HTTPSMS_SMS_ENABLED, HTTPSMS_API_KEY and HTTPSMS_FROM in the private local settings. Sending, retries and queued notifications use the shared httpSMS transport. Each recipient has a separate request and log entry; gateway acceptance does not confirm delivery.

### SMS Notification Module (`/admin/send-sms`)

One flexible page instead of several separate ones, since sending, targeting,
and templating are really the same feature with different presets:

- **Send to Residents** or **Relief Personnel** — a searchable picker (reusing
  each account's `contact_number`); accounts without a phone number on file are
  shown but can't be selected, so nothing silently fails.
- **Send to Selected Households** — the same priority-aware household picker
  used for Phase 8 beneficiary selection, targeting each household's own
  `contact_number`.
- **Custom Numbers** — for anyone not in the system (e.g. a barangay tanod, a
  neighboring barangay contact).

### Emergency & Relief Notifications

Rather than separate pages, these are **categories** on the same Send SMS page —
picking one fills in an editable starting message template:

**Emergency Warning · Disaster Alert · Evacuation Warning · Relief Distribution
Announcement · Distribution Schedule · Beneficiary Notification · Relief
Availability · General**

Two places in the app can jump straight into Send SMS with everything
pre-filled:
- **Hazard Alerts** page → **"Notify via SMS"** on any active alert, pre-filling
  the category and a message built from the alert's type/status/title/description
  (you still choose which households to notify, since the system doesn't
  automatically assume every household in a purok needs the same message).
- A distribution schedule's detail page → **"Notify Beneficiaries via SMS"**,
  pre-filling the category, a distribution-details message, and every
  non-cancelled beneficiary household on that schedule.

### SMS Logs (`/admin/sms-logs`)

Every attempt — successful, failed, or not-yet-configured — is logged with
**recipient** (name, number, and type), **message**, **date/time**, and
**status**, filterable by recipient type, category, status, and date range.
Since one "send" can target many recipients at once, each recipient gets its own
log row, so you can see exactly who received what and when, not just an
aggregate send count.

---

## 18. Design Theme & Barangay Logo

The design system now uses a **white/gray** color palette instead of the earlier
teal/orange scheme — navbar, sidebar, buttons, and cards are all grayscale
(`frontend/tailwind.config.js` → `theme.extend.colors`). Status badges (priority
levels, low stock, report status, etc.) intentionally kept their original
red/amber/green/orange coding, since removing that would make it harder to tell
statuses apart at a glance — everything *around* those badges is what changed.

**Adding your barangay's real logo:** drop a file named exactly `logo.png` into
`frontend/public/` (see `frontend/public/ADD_LOGO_HERE.txt` for details — square
image, transparent PNG background recommended). It'll automatically appear in
the top-left of the public site and at the top of the sidebar once logged in —
no code changes needed. Until you add it, the system shows a plain "B" letter
mark instead, so nothing looks broken in the meantime.

---

## 19. Phase 11 — Reports and Analytics

No database migration needed for this phase — every report is computed from
data that already exists across the previous phases (disaster reports,
households, inventory, relief allocations). This phase adds a new **Recharts**
dependency for actual charts/graphs — run `npm install` in `frontend/` again to
pull it in.

All five pages are admin-only, under a new **Analytics Dashboard** section in
the sidebar:

- **Analytics Dashboard** (`/admin/analytics`) — summary cards (households,
  residents, reports this month, items distributed, beneficiaries, low stock,
  active hazard alerts), a 12-month disaster reports trend line, a 12-month
  relief-distributed bar chart, and pie/bar breakdowns of reports by type,
  severity, and status, plus inventory by category.
- **Disaster Reports Analytics** (`/admin/analytics/disasters`) — total
  reports with filters (date range, purok, disaster type, severity) and
  breakdowns by type, severity, purok, and a monthly trend line.
- **Household Reports** (`/admin/analytics/households`) — totals, population
  per purok (chart), the full vulnerability breakdown, and a live list of
  every High/Critical priority household (reusing the Phase 6 scoring engine
  — same technique as the Phase 6 recommendation endpoint: one shared
  algorithm, not duplicated logic).
- **Inventory Reports** (`/admin/analytics/inventory`) — current inventory,
  stock-in and stock-out reports (chart + table, date-filterable), a donation
  report grouped by item with donor names, and the low-stock list.
- **Relief Reports** (`/admin/analytics/relief`) — total beneficiary
  households, total items distributed, a monthly distribution trend,
  breakdowns by purok and by item, and the full distribution history
  (household, item, quantity, date, personnel — filterable by date range and
  purok).

**Note on the URL path:** these live under `/admin/analytics/...` rather than
`/admin/reports/...` — the latter was already taken by the Phase 3 Disaster
Reports **verification** page (a different feature: reviewing and
verifying/rejecting individual reports, not analytics on top of them). Both
exist side by side without conflict.

---

## 20. Demo/Presentation Tools

Two files exist purely to help you present this system, and should be **deleted
after your presentation**:

- `backend/setup_demo_data.php` — a one-time script (run it from XAMPP Shell with
  `php backend/setup_demo_data.php`; it cannot be opened in a browser) that seeds realistic demo
  accounts, households, disaster reports at different verification stages, a
  low-stock item, a relief package, a distribution schedule with beneficiaries
  at different pipeline stages, an active hazard alert, and a weather log — so
  you can demo every completed feature without creating test data live.
- `PRESENTATION_GUIDE.md` — a full walkthrough script covering every phase in
  a suggested demo order, organized by role (Admin, Resident, Relief
  Personnel), with demo login credentials and talking points for common
  questions about scope decisions.

---

## 21. Phase 12 — PDF and Data Export

No database or backend changes for this phase — everything exports data that's
already being fetched and displayed on screen. Both PDF and CSV generation
happen entirely in the browser (via the new `jspdf` / `jspdf-autotable`
dependencies — run `npm install` again in `frontend/`), so there's nothing to
configure on the PHP side.

### PDF Reports (item 49)

Each of the four Phase 11 analytics pages now has an **Export PDF** button:

- **Disaster Reports Analytics** → Disaster Report PDF (totals, by type,
  severity, purok, and month — respects whatever filters are currently applied)
- **Household Reports** → Household Report PDF (totals, population per purok,
  vulnerability breakdown, high-priority households list)
- **Inventory Reports** → Inventory Report PDF (current inventory, stock-in,
  stock-out, donations, low stock — respects the date range filter)
- **Relief Reports** → Relief Distribution PDF (totals, by purok, by item, full
  distribution history — respects date range and purok filters)

Every PDF shares the same header: "Barangay Binitayan," the report title, and
either the active filters or a generated timestamp. If you've added
`frontend/public/logo.png` (see section 18), it's automatically embedded in the
header — if not, the header just omits it, no broken-image placeholder.

### Export Data (item 50)

Four of the core admin management pages now have an **Export CSV** button,
exporting exactly what's currently on screen (i.e. respecting your active
search/filters — export the filtered view, not always the entire table):

- **Households** → all profile fields, vulnerability breakdown, and coordinates
- **Disaster Reports** → full report details including verification remarks
- **Relief Inventory** → current stock, category, minimum level, low-stock flag
- **Relief Allocation** → allocation details, approver, distributor, and
  recommendation reason (if it came from the Phase 6 recommendation engine)

CSV files are written with a UTF-8 byte-order mark so they open correctly in
Excel (special characters like "ñ" won't get mangled).

---

## 22. Phase 13 — Audit and System Security

If you already have the database from a previous phase, run
`database/migration_phase13_audit_security.sql` in phpMyAdmin's SQL tab. It
adds a `login_history` table. (Fresh imports of the updated
`barangay_disaster_db.sql` already include it.)

**Important:** this phase includes actual security hardening, not just new
pages — read the "What changed under the hood" section below even if you skip
straight to the demo.

### Audit Logs (`/admin/audit-logs`)

The `audit_logs` table has existed since the very first version of this system
— every household edit, disaster report verification, allocation approval,
inventory adjustment, user account change, hazard alert, and SMS send has
already been recording itself here via a shared `log_action()` helper. What
was missing was a way to actually **see** it. This page finally provides that:
searchable by action/details text, filterable by date range, showing who did
what and when.

### Login History (`/admin/login-history`)

A new, dedicated table (separate from the general audit log, since login
activity has its own shape — session start/end times and success/failure
status). Every login attempt is recorded, **including failed ones** — this did
not exist before Phase 13. Each row shows the user (if the email matched an
account), the email that was typed, login and logout timestamps, status
(Success/Failed), the failure reason when applicable ("Incorrect password,"
"Unknown email," or "Account deactivated" — note that *incorrect password* and
*unknown email* both show the same generic "Invalid email or password" message
to the person logging in, to avoid revealing which accounts exist; the real
reason is only visible here, to admins), and the IP address the attempt came
from.

### What Changed Under the Hood (Security Improvements)

Most of items 51–53 were **already true** of this system since Phase 1 — this
phase is partly about finally surfacing that (the two pages above) and partly
about a real audit that found and fixed a few genuine gaps:

**Already in place since early phases (verified, not just claimed):**
- **Password hashing** — bcrypt via PHP's `password_hash()`/`password_verify()`, everywhere, no exceptions.
- **Prepared SQL statements** — every one of the 59 dynamic query builders across the backend uses bound `:parameters`; a full grep audit for this phase found zero instances of user input concatenated directly into SQL.
- **Input validation** — required fields, enum whitelisting (roles, statuses, categories, disaster types, etc.), and type coercion (`intval`/`floatval`) on every endpoint that accepts input.
- **API authentication** — every endpoint except the small, deliberate set that must be public (login, register, session-check, the public hazard-status banner) calls `require_login()`.
- **Role authorization** — `require_login($roles)` restricts by role on top of authentication; ownership checks (e.g. a relief personnel can only act on their own assigned schedules) are layered on top where relevant.
- **Protected routes** — the React frontend mirrors every backend restriction via `ProtectedRoute` + role checks, so a restricted page never even attempts to render for the wrong role.
- **Session security** — PHP sessions (not custom tokens), destroyed server-side on logout.

**Fixed as part of this phase's audit:**
- **Session cookies now explicitly set `httponly`** (JavaScript can no longer read the session cookie — mitigates XSS-based session theft) **and conditionally `secure`** (auto-enforces HTTPS-only cookies if the app is ever deployed behind HTTPS, without breaking local HTTP development).
- **Session ID regeneration on every successful login** (`session_regenerate_id(true)`) — mitigates session fixation attacks.
- **`backend/sms/debug_config.php`** (a temporary SMS diagnostic that returned the httpSMS device ID and part of the API key) has been **removed** before production deployment. Normal SMS sending does not depend on it.
- **`backend/setup_admin.php`** used to silently reset the admin password every time it was run — meaning if this file were ever forgotten on a live server, anyone who found the URL could take over the admin account at any time. It now refuses to touch an existing admin account's password at all; you'd need to reset it directly in the database if genuinely locked out.
- **Failed login attempts are now recorded** (previously, only successful logins were logged anywhere) — visible in the new Login History page.
- **Logout events are now recorded** (previously not logged at all) — both the logout timestamp on the matching `login_history` row, and an audit log entry.

## 23. Phase 14 — System Settings

If you already have the database from a previous phase, run
`database/migration_phase14_system_settings.sql` in phpMyAdmin's SQL tab. It
adds `system_settings`, `inventory_categories`, and `disaster_types` tables,
seeds them with the same defaults the system used before, and converts
`relief_items.category` / `disaster_reports.disaster_type` from a fixed ENUM
to a plain VARCHAR validated against the new tables. (Fresh imports of the
updated `barangay_disaster_db.sql` already include all of this.)

### My Profile (`/admin/my-profile`, `/resident/my-profile`, `/personnel/my-profile`)

Every role gets a "My Profile" page (one shared component, three thin
role-specific routes) where they can view and edit their own name, email, and
contact number, and change their own password. *(Phase 21: residents can change
only their contact number and password; name and email are read-only for them.)* Changing a password requires
re-entering the current one first — the backend verifies it with
`password_verify()` before allowing the change, so a stolen/left-open session
alone isn't enough to take over the account. Editing a profile keeps the
session (and therefore the navbar/sidebar display name) in sync immediately,
without requiring a re-login.

### System Settings (`/admin/system-settings`) — admin only

Barangay name, system name, address, office hours, contact email/phone, and
emergency hotline, stored in a new key-value `system_settings` table instead
of being hardcoded in the frontend. The barangay name now drives the navbar
and sidebar branding (via a new `SettingsContext` fetched once at app load).
Reading settings (`settings/get_settings.php`) is **intentionally public** —
no login required — because the barangay name/contact info needs to show on
the public Home/About/Contact pages and the navbar before anyone logs in;
writing settings (`settings/update_settings.php`) still requires an admin
session, and only a fixed whitelist of keys can be written.

### Inventory Settings (`/admin/inventory-settings`) — admin only

Relief item categories (Food, Water, Hygiene, Medical, Shelter, Other, and
whatever an admin adds) used to be a hardcoded ENUM on `relief_items` and a
hardcoded array in the React "Add Item" form. Both are now driven by a new
`inventory_categories` table: add a category, rename one (renaming cascades
into every existing relief item using the old name, so nothing goes orphaned),
deactivate one (hides it from the dropdown without touching existing items),
or delete one (blocked with a clear error if any relief item still uses it —
deactivate instead). This page also holds the default low-stock threshold and
default unit used to pre-fill new items.

### Disaster Settings (`/admin/disaster-settings`) — admin only

Same pattern as Inventory Settings, but for disaster types (Flood, Typhoon,
Landslide, Earthquake, Fire, Other, and whatever an admin adds), backed by a
new `disaster_types` table with the same add/rename-cascades/deactivate/
delete-if-unused behavior. **Severity levels and report statuses are shown
below the types table as a read-only reference, deliberately not editable
here** — severity scores feed directly into the Phase 6 Decision Support
priority-scoring formula, and statuses drive the Phase 3 verification
workflow; making either admin-editable would silently change scores or break
the workflow everywhere else in the system that depends on their exact
spelling.

### What Changed Under the Hood

- `relief_items.category` and `disaster_reports.disaster_type` are now
  `VARCHAR(50)`, validated at the application layer against the new
  `inventory_categories` / `disaster_types` tables (must be active) instead of
  a fixed ENUM.
- `inventory/add_item.php` and `inventory/update_item.php` now check the
  submitted category against `inventory_categories` instead of a hardcoded array.
- `disasters/create_report.php` now checks the submitted disaster type against
  `disaster_types` instead of a hardcoded array. Severity stays a fixed array
  on purpose (see above).
- `disasters/get_reports.php` and `reports/disaster_reports.php` had their
  disaster-type **filter** whitelists removed — a fixed whitelist would have
  silently rejected filtering by any new type an admin adds through this
  phase's settings page, which would have been a confusing regression.
- Verified end-to-end in this session against a real MySQL/MariaDB + PHP
  server (not just read through): schema import, every new endpoint's normal
  and error paths, permission enforcement (a resident account gets a 403 from
  every admin-only settings endpoint but can still view categories/types and
  manage their own profile), the rename-cascade and delete-while-in-use
  behaviors, and non-regression on dashboard statistics, report verification,
  priority scoring, inventory listing, and audit logging.

---

## 24. Phase 19 — Capstone Redesign

Extends the existing system (nothing removed, same stack). Full details: `REDESIGN_IMPLEMENTATION_REPORT.md`.

| Area | Where |
|---|---|
| Relief Requests (admin review with DSS → allocations; recorded by the Admin since Phase 21) | Admin: **Relief and Inventory → Relief Requests** |
| Evacuation Centers (capacity, occupancy, open/close, map) | Admin: **Disaster Management → Evacuation Centers** · Personnel: **Evacuation Centers** (resident page removed in Phase 21) |
| Relief Feedback (existing records; resident submission retired in Phase 21) | Admin: **Reports and Analytics → Relief Feedback** |
| In-app notifications | Resident/Personnel: **Notifications** (unread badge in the sidebar) |
| Automatic SMS (httpSMS) | Sent after request decisions, allocation approval, Ready for Distribution (Phase 21), scheduling, schedule changes and deliveries; see **SMS Logs**. Report verification no longer sends SMS (Phase 21). |
| Map layers | **Barangay Map** → Layers: affected households, hazard puroks, evacuation centers, distribution sites |
| Rule-Based Summary | Every analytics page and PDF export |
| Purok Cleanup | Admin: **Settings → Purok Cleanup** |

**Database:** new installs import `barangay_disaster_db_FINAL.sql`; existing databases run
`database/migration_phase19_redesign.sql` (additive, safe to re-run).

**httpSMS SMS** is off until configured. See [httpSMS setup and verification](docs/httpsms-sms.md) for Android phone registration, SIM requirements, and troubleshooting. Put these in `backend/config/app_config.local.php`:
```php
'HTTPSMS_SMS_ENABLED' => true,
'HTTPSMS_API_KEY'     => 'your-key',
'HTTPSMS_FROM'   => '+639XXXXXXXXX',
```
Until then, every automatic or manual SMS is logged as "Not Configured" and the action still succeeds.

**Idle logout:** users are signed out after 30 minutes without activity (`VITE_IDLE_TIMEOUT_MINUTES`).

**Tests:** `tests/full_test.py` (API suite, needs a fresh database and the admin password):
`python3 tests/full_test.py <admin-password>`.

## 24b. Phase 21 — Resident Role Revision and "Ready for Distribution" SMS

Same stack; nothing rebuilt; the DSS criteria and scores are unchanged. Full details:
`PHASE21_RESIDENT_SCOPE_REVISION.md`.

| Area | Where |
|---|---|
| Resident portal (view only) | Resident: **Dashboard · Relief Allocation Status · Notifications · My Household · My Profile**. Residents change only their contact number and password. Submit Disaster Report, My Disaster Reports, Relief Requests, Relief Feedback, Weather & Hazards and Evacuation Centers were removed (old links redirect to the dashboard); direct API calls by residents return 403. |
| Record a disaster report for a household | Admin / Personnel: **Disaster Reports → + Record Disaster Report** (personnel page `/personnel/reports`). Staff can add photos, record the field damage assessment and **Update Details** (audit-logged). Only the Admin verifies / rejects; no resident notification or SMS is sent for that. |
| Record a relief request for a household | Admin: **Relief Requests → + Record Relief Request**; then the same review → approve → allocate workflow |
| Mark Ready for Distribution | Admin: **Relief Allocation** (per-row button) · Personnel: **Approved Allocations** (select rows). Enter the verified date, optional time, location, optional instructions and tick the confirmation. One SMS per household (`ALLOCATION_READY_FOR_DISTRIBUTION`, category "Relief Allocation Update") + in-app notification. Repeat → 409. Stored status stays Approved (stock stays reserved; DSS unchanged). Recommended, not forced: personnel can still distribute an Approved allocation directly. |
| Delivery SMS text | Now ends with "For concerns, please contact the barangay office." (no longer asks for feedback) |

**Statuses shown:** Pending → Approved → **Ready for Distribution** → Distributed.

**Database:** existing databases run `database/migration_phase21_resident_scope.sql`
(additive, safe to re-run); new installs import `barangay_disaster_db_FINAL.sql`.

**Tests:** `tests/phase21_resident_scope_test.py` — 56/56 passed
(`docs/test-results/phase21_resident_scope_test.txt`). Real httpSMS delivery and the live
Hostinger site were not tested. "Sent" in SMS Logs means httpSMS accepted the message.

## 24d. Phase 24 — Purok Boundaries (candidate)

The Barangay Map shows the eight Purok areas from `binitayan_purok_boundaries_candidate.geojson`, which was built unchanged from the coordinates the project team supplied. Purok 1 currently fails validation (self-intersection) and is drawn as an outline only. The map also has a Purok filter with the selected Purok highlighted, a legend, and a read-only **Purok Location Review** (stored Purok compared with location; nothing is changed automatically). These are candidate boundaries, not an official survey. See `PHASE24_PUROK_BOUNDARIES_REPORT.md`.

## 24c. Phase 23 — Six Core Modules

**One-file demo install:** `database/barangay_disaster_db_COMPLETE_PHASE25.sql` (Phase 25; replaces the Phase 23 file) creates `barangay_disaster_db`, the full Phase 25 structure, the default settings, an Administrator (`admin.binitayan.test@gmail.com`) and the synthetic defense data. Import it in phpMyAdmin → Import without selecting a database. It contains no DROP or DELETE statements, and it stops if the tables already exist. The test password is `BinitayanTest2026!`; change it after the first login. For a production install use `barangay_disaster_db_FINAL.sql`.

Full details are in `PHASE23_CORE_MODULES_REPORT.md`, `database/MIGRATION_PHASE23.md` and `API_ENDPOINTS.md`.

| Module | Administrator | Relief Personnel |
|---|---|---|
| 1. Automation of Reporting | **Disaster Reports** (record, verify, update; automatic `RPT-year-number` reference and timestamp; needs and incident coordinates), **Disaster Events**, **Situation Report** | Disaster Reports (record, update, field assessment) |
| 2. Decision Support System | **Priority Assessment** (weighted 0–100 score, rank, explanation, review flag), **Relief Recommendations** | Priority Assessment (view) |
| 3. Hazard Monitoring | **Hazard Monitoring** (incidents with type, severity, purok and status filters; critical incidents highlighted; affected households, needs and DSS priority), **Hazard Alerts**, **Evacuation Centers** | Hazard Monitoring |
| 4. Geographic Coordinates | **Barangay Map** (boundary, households, incidents by severity and status, recorded affected areas vs flood-prone zones, missing-coordinate warning, Edit/Set location), **Flood & Affected Areas** | Barangay Map (incl. setting household locations) |
| 5. Relief Allocation | **Relief Allocations**, **Relief Requests**, **Inventory** (in stock / reserved / available, low-stock filter, stock history) | Relief Allocations (Ready for Distribution, Distributed, history filter) |
| 6. SMS Notification | **SMS Logs** (automatic Ready-for-Distribution SMS via httpSMS, status, retry; manual notice linked from here) | — |
| Administration | Households, Residents, Relief Personnel, Administrators, Audit Log (→ Login History), System Settings (→ Disaster / Inventory Settings, Purok Cleanup), My Profile | My Profile, Notifications |

Residents keep only five items: Dashboard, Relief Allocation Status, Notifications, My Household and My Profile.

**Database:** existing databases run `database/migration_phase23_core_modules.sql`. This adds optional report coordinates and needs, and the affected-area type. The change is additive only. New installs import `barangay_disaster_db_FINAL.sql`.

## 24e. Phase 25 — Official-Led Assessment, DSS Accountability, Relief Corrections

Residents are **not** required to submit reports. Barangay officials, relief personnel and purok leaders collect the information through field visits, interviews, barangay records or a **printable paper form**. The system does not work offline. When there is no power, signal or internet, staff use the paper form (**Paper Assessment Form** in the sidebar, with the outage procedure) and encode it later. The original assessment date and the encoding time are kept separately.

**Reports**
- Collection method, paper form number, field assessor and displacement status are recorded.
- A paper form number can be encoded only once.
- A second report for the same household, type and date needs the official to confirm that it is a different assessment.

**DSS**
- The criteria, weights, thresholds and formula are **unchanged**.
- When an allocation is approved, the household's score, category, rank, ratings and model version are frozen on it.
- **Emergency Override** (Administrator only) handles life-saving cases outside the recommendation:
  - a reason is required;
  - it is labelled "Override" everywhere and audit-logged;
  - stock and duplicate checks still apply.

**Relief allocation**
- No two active allocations of the same item for the same household (409).
- **Cancel** releases reserved stock, with a reason; the record is kept.
- **Partial receipt**: only what was received is deducted.
- Low-priority households are recommended last instead of being excluded. Households without an assessment are listed under *Assess first*.
- An optional **minimum-share-first** preview shows how many households each sharing method reaches. The default is still full need in rank order; switching needs barangay (DRRM / social welfare) approval.
- **Inventory → Inventory Reconciliation** compares stock, the stock ledger and allocations.

**SMS**
- By default, SMS goes out only when relief is marked **Ready for Distribution**. Approval and distribution notify in-app. `SMS_ON_APPROVAL_AND_DISTRIBUTION` re-enables texting at those steps only if the barangay approves.
- Messages are logged as `Queued` before sending, then **Accepted by Gateway** (httpSMS accepted them).
- `Delivered` is never set without a provider delivery receipt, which the current integration does not receive. Delivery to the phone is therefore not confirmed.
- The household's own contact number is preferred.

**Security**
- Login lock-out after 8 failed attempts in 15 minutes.
- 30-minute server-side idle timeout.
- State-changing requests from a foreign Origin are refused.

**Database**
- Existing databases run `database/migration_phase25_official_assessment_dss_allocation.sql`. It is additive and re-runnable; see `database/MIGRATION_PHASE25.md` for rollback.
- New installs use `barangay_disaster_db_FINAL.sql` or `barangay_disaster_db_COMPLETE_PHASE25.sql`.

Full details: `PHASE25_IMPLEMENTATION_REPORT.md`. This is a capstone prototype tested on synthetic data only. It is **not** production-ready.

---

## 25. Deploying to Hostinger (prepared, not yet performed)

1. **Database:** hPanel → Databases → create the database and user; phpMyAdmin → Import `database/barangay_disaster_db_FINAL.sql`.
2. **Backend:** upload the `backend/` folder to `public_html/backend/`. Create `backend/config/app_config.local.php` from the example, with the Hostinger DB name/user/password, your HTTPS domain in `CORS_ALLOWED_ORIGINS`, and the httpSMS keys.
3. **First admin:** run `php backend/setup_admin.php` over SSH (hPanel → Advanced → SSH). The setup scripts refuse web requests.
4. **Frontend:** on your computer, create `frontend/.env.production.local` with `VITE_API_BASE_URL=/backend/`, then run `npm run build`. Upload the **contents** of `frontend/dist/` (including `.htaccess`) to `public_html/`.
5. **Security:** enable HTTPS (SSL) in hPanel; the session cookie is then marked Secure automatically. Do **not** upload `setup_demo_data.php` or run it against the production database.
6. **Check:** open `https://your-domain/backend/auth/session.php`; it should return `{"success":true,"authenticated":false}`.


Current provisional relief scoring and household visits require migrations 29–31. See [setup, verification and unresolved damage policy](docs/PROVISIONAL_RELIEF_SCORING.md). Existing rosters and flood locations require explicit administrator verification.


