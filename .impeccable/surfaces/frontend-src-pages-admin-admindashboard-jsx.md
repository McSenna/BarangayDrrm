---
version: 1
slug: "frontend-src-pages-admin-admindashboard-jsx"
primary_target: "frontend/src/pages/admin/AdminDashboard.jsx"
related_targets: ["backend/dashboard/overview.php"]
---

# Admin dashboard (/admin)

Scope: the Administrator's home screen. Mode: Operate.
Audience and job: the Barangay Administrator, at the hall on a desktop and sometimes on a phone in the field, deciding what to verify, prioritise, approve or announce next.
Constraints: inherits DESIGN.md unchanged; every figure is a direct database count; filters (period, Purok, disaster event) scope the overview cards, charts and work queue; table-level filters (search, severity/status) apply inside the queue. Key actions: Record disaster report, Issue hazard alert, Send SMS.

## Direction contract

THESIS: A work queue with the situation always in view. Filters scope everything, a tabbed queue of what needs a decision owns two thirds of the screen, and a live rail beside it holds hazard, evacuation, stock and activity. Refuses the category default of a KPI grid over a pile of equal chart cards.
OWN-WORLD: DESIGN.md as built: navy shell, slate ground, white 16px cards with 4px tone bands, red/orange/green only for meaning, Plus Jakarta Sans with tabular numerals, hazard tape only on the active-hazard rail card.
STORY: The admin sees what needs a decision now, narrows it by period, Purok or event, opens the record from its row, and reaches the three key actions from the header.
FIRST VIEWPORT: Page header: title, description, DRRM phase; three actions top-right (Send SMS ghost, Issue hazard alert red, Record disaster report navy). Filter bar: period segmented control, Purok select, event select, reset, with a "Showing …" scope line. Four overview cards. Main column: tabbed work queue (Reports to verify / Priority households / Allocations) first, then the reports-over-time chart with hazard onsets marked and the relief pipeline. Rail, 320px, not sticky (it is taller than the viewport): hazard status, evacuation centers, stock to watch, recent activity. Below 1040px of page width the rail drops under the main column.
FORM: structure 1 of 3 dealt (Work queue + live rail, position 7 on the ordered list); signature move: rows new since the last visit carry an orange marker until opened (raised from the boarding-pass/gate-board challenger). seed:fe2a00eabc310cf6
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
