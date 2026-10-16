# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Barangay Administrator** (primary). Works mostly at a desktop or laptop in the Barangay Binitayan hall, and sometimes on a phone in the field during a response. Verifies disaster reports, reviews Decision Support System (DSS) priorities, approves relief allocations, raises hazard alerts, manages evacuation centers and sends SMS. Admins receive no in-app notifications; the dashboard is where they see what needs them.
- **Relief Personnel.** Record disaster reports and damage assessments (field or paper form) and carry out assigned relief distributions.
- **Residents.** View only their own household and relief status. They do not submit reports or requests.

## Product Purpose

Web-based post-disaster monitoring and relief allocation with a Decision Support System for Barangay Binitayan (student capstone). Success means affected households are found, verified, ranked and given relief quickly and fairly, with every decision traceable.

## Positioning

The DSS recommends and the Administrator decides. Priorities come from an explainable, rule-based weighted model built on household vulnerability and verified damage, never a black box. Every figure the system shows is a direct count from the database; nothing is estimated.

## Operating Context

- Disaster workflow: report recorded by personnel → admin verifies → damage assessment → DSS priority → recommendation → allocation (Pending → Approved → Ready for Distribution with automated SMS → Distributed).
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

1. Recommend, never decide: the Administrator makes and owns each decision.
2. Show what needs action first; quiet when everything is clear.
3. Every number is a real count with a path to the page that resolves it.
4. Status colour means one thing everywhere: red critical, orange needs action, green done/available.

## Accessibility & Inclusion

WCAG 2.1 AA: contrast rules in DESIGN.md, 44px touch targets, keyboard and screen-reader support, reduced-motion respected. Must work on a phone in the field as well as a desktop.
