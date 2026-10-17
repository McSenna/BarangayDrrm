# Provisional Relief Scoring Implementation Plan

**Goal:** Apply the requested flood/member/vulnerability subtotal and assigned field visits without inventing damage points or rewriting history.

**Architecture:** The existing PHP DSS remains the shared scoring source. Verified person records and the existing map classifier supply the three automatic criteria. Household visit assignments are a separate, audited workflow. React consumes server breakdowns and exports those same values.

**Tech stack:** Existing PHP/PDO, MariaDB, React/Vite; no new dependencies.

## Constraints and decisions

- Automatic subtotal maximum is 80; no normalization to 100 and no damage contribution.
- Exact priority bands: 0–40 Low, 41–60 Moderate, 61–80 High, 81–100 Critical. Invalid values rejected.
- Pending or incomplete verification yields null component/subtotal, never zero or outside-zone defaults.
- Verify one roster with one head and distinct people; OR vulnerability flags per person. Changes invalidate verification.
- Flood classification reuses the map geometry. Administrator confirmation is tied to saved coordinates and boundary/designation fingerprint; changed sources require verification again. Candidate boundary limitations remain visible.
- Complete scores rank independently of visit status; existing disaster-report allocation eligibility is retained. Ties share a rank; stable household-ID ordering is presentation only. Obsolete severity/damage tie factors are removed with their old scoring model.
- Existing distribution snapshots and assessment evidence remain unchanged; new snapshots carry the new model version and full breakdown.

## Tasks

- [x] Add failing automatic-score examples, edge/boundary and missing-data tests; replace DSS calculation and method output.
- [x] Add verified-person roster migration, validation, admin verification and member UI (independent member task).
- [x] Add household assignment/visit migration, backend authorization/evidence/revisions and admin/officer UI (independent assessment tasks).
- [x] Add flood-confirmation migration/action, shared household breakdown, priority list/CSV and current-versus-historical allocation display.
- [x] Update scoring consumers, reports, map, recommendations and dashboard counts; preserve quantities and explicit approval controls.
- [x] Run isolated integration, authorization, history and browser checks plus PHP syntax/build; document executed tests and remaining policy questions.

## Review focus

Roster edits after verification, changed coordinates or polygons after flood confirmation, a person with overlapping vulnerability categories, assessment reassignment while a form is open, and old distribution snapshots must not silently produce trusted or rewritten scores.
