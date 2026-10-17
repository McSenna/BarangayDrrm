# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Barangay Administrator** (primary). Works mostly at a desktop or laptop in the Barangay Binitayan hall, and sometimes on a phone in the field during a response. Verifies disaster reports, reviews Decision Support System (DSS) priorities, approves relief allocations, raises hazard alerts, manages evacuation centers and sends SMS. Admins receive no in-app notifications; the dashboard is where they see what needs them.
- **Relief Personnel.** Administrator-created staff assigned to one Purok. Record disaster reports and carry out relief distributions only for households in their assigned Purok. Actual household damage visits are recorded by assigned Field Officers. Administrators can change the assignment; staff cannot change their own.
- **Field Officers.** Administrator-created staff assigned to one Purok. They record disaster reports and view household records for that Purok. An administrator assigns each household visit; only the assigned officer can submit or edit that damage assessment. Hazard and map household data follow the assignment. They cannot manage accounts, verify reports, distribute relief, change their own assignment, or change household map locations.
- **Residents.** View only their own household and relief status. They do not submit reports or requests.

## Product Purpose

Web-based post-disaster monitoring and relief allocation with a Decision Support System for Barangay Binitayan (student capstone). Success means affected households are found, verified, ranked and given relief quickly and fairly, with every decision traceable.

## Positioning

Priorities come from an explainable, rule-based score, never a black box: flood zone from the recorded Purok (40/20), verified household size (5–20) and distinct vulnerable people (0–20) — the automatic subtotal out of 80 — plus the household damage the assigned Field Officer records at the actual visit (0–20), for a final score out of 100. A complete visit makes the household Ready for Distribution automatically; a high score never releases relief by itself — Relief Personnel do, and administrators oversee, re-open or cancel. Every figure the system shows is a direct count from the database; nothing is estimated.

## Operating Context

- Relief allocation workflow (one round per household at a time; an administrator starts later rounds): Pending Assessment → Assessment in Progress (field officer draft) → Ready for Distribution (automatic when the submitted visit completes the score and a standard relief package is set; planned items = the standard package; automated SMS) → Completed (Relief Personnel record released quantities; stock is deducted only here, all-or-nothing). Administrators may cancel or re-open a Ready allocation with a reason. The old per-item approval flow is history only.
- DRRM phase is derived, not stored: Response (any active hazard alert), Recovery (pending/approved allocations or evacuees in centers), Preparedness otherwise.
- Geography: Puroks of Barangay Binitayan; Puroks 1–4 are the designated flood-prone ones.
- Disaster events (e.g. a named typhoon) group reports and allocations.
- Pages refresh silently every 60 seconds.

## Capabilities and Constraints

- Stack: React (Vite, React Router, Recharts, lucide-react, Tailwind over CSS tokens) + PHP REST API + MySQL/MariaDB on XAMPP. Deployment to Hostinger is prepared, not performed.
- Six core modules (Phase 23): Automation of Reporting, Decision Support System, Hazard Monitoring, Geographic Coordinates (map), Relief Allocation, SMS Notification (TextBee).
- Relief stock counts are not published publicly.

## Evidence on Hand

Seeded demonstration datasets in `database/` (defense demo, 8-household test data). No real resident data is in the repository.

## Product Principles

1. Score and plan, never release by score alone: a complete field visit makes a household Ready; only Relief Personnel completion releases relief, and every step is logged.
2. Show what needs action first; quiet when everything is clear.
3. Every number is a real count with a path to the page that resolves it.
4. Status colour means one thing everywhere: red critical, orange needs action, green done/available.

## Accessibility & Inclusion

WCAG 2.1 AA: contrast rules in DESIGN.md, 44px touch targets, keyboard and screen-reader support, reduced-motion respected. Must work on a phone in the field as well as a desktop.
