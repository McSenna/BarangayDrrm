# Household field assessments (Phase 29)

> **Updated (2026-10-17, phase 32).** Visits are now one per allocation round, can be saved as drafts, and are locked on submission (administrators re-open with a reason). The officer records a damage classification (Destroyed / uninhabitable, Severely, Partially, Minor, No damage), which the server maps to 20/15/10/5/0 points; a complete submission makes the household Ready for Distribution in the same transaction. See `docs/superpowers/specs/2026-10-17-relief-allocation-workflow-design.md`.

Apply `database/migration_phase29_household_assessments.sql` after Phase 27. Application endpoints never create tables; unavailable migration returns HTTP 503 with the filename. Existing report-linked assessments and report photos are retained. Legacy assessment timestamps do not establish that a field visit occurred.

All endpoints use the authenticated session; client actor IDs and roles are ignored. Only administrators assign visits. Assignment requires an active field officer whose normalized assigned Purok matches the household. Only that officer, while active and still assigned to the same Purok, may submit or edit actual findings or append photos. Relief staff have scoped read access. Residents have no access.

- `GET disasters/list_household_assessments.php[?household_id=ID]` returns `{success,data:[...]}`. Officers receive only their assignments; administrators receive all households. Unassigned households have `status: pending_assignment` and `version: 0`. Rows include identity/address/Purok, assignment, status, assessment fields, provenance timestamps, version, and a separate `legacy_assessment` object or null.
- `POST disasters/assign_household_assessment.php` accepts `{household_id,assigned_field_officer_id,version}`. New assignment uses version 0. Reassignments use the displayed version and set status `assigned`; prior findings and evidence remain in the row and revisions until the next actual submission.
- `POST disasters/submit_household_assessment.php` accepts `{household_id,version,field_visit_date,house_damage,findings,remarks,infrastructure_damage,property_damage,agricultural_damage,estimated_severity}`. Date must be a real YYYY-MM-DD date no later than today in Asia/Manila. House damage and nonblank findings are required. Remarks are optional. Damage values are exactly `None`, `Minor`, `Major`, `Totally Damaged`; omitted other categories default to `None`. Severity values are `Low`, `Medium`, `High`, `Critical`, defaulting to `Low`. Text fields allow at most 20,000 bytes. Mutations return the saved row as `data`.
- The compatibility `POST disasters/save_damage_assessment.php` resolves `report_id` to its household and applies the exact submission workflow and required fields. It never rewrites legacy damage assessments. The legacy read endpoint continues to expose the original report assessment.
- `GET disasters/household_assessment_photos.php?household_id=ID` returns metadata with `photo_id,assessment_id,mime_type,original_name,uploaded_by,uploaded_at,url`.
- `POST disasters/household_assessment_photos.php` accepts multipart `household_id` and a single `photo`. Evidence is append-only, at most 20 photos per assessment, 5 MB each, JPEG/PNG/WebP, maximum 25 megapixels. Upload metadata is audited. Photo bytes are stored in the database and can only be read through the authenticated `GET disasters/download_household_assessment_photo.php?id=ID`. No public filesystem URL exists.

IDs and versions accept only integer values or decimal integer strings; booleans, arrays and floating point numbers are rejected. Extra actor or role fields do not override the authenticated session. Historical report assessment evidence also prevents household deletion, preserving its household association. Officer account rows are locked during assignment/submission/photo writes so role, active status or assigned Purok changes serialize with visit authorization. Assignments and submissions are serialized per household and use optimistic concurrency: stale/missing versions return HTTP 409. Authorization failures return 403, malformed data 400, absent households 404. Full before/after snapshots record assignment and submission history in `household_assessment_revisions`; rows contain created/updated actors and submission timestamps. A new visit record has status `assessed` only after an assigned officer submits an actual visit date and findings.

Safe verification:

```
C:/xampp/php/php.exe tests/household_assessments_unit_test.php
C:/xampp/php/php.exe tests/household_assessments_required_damage_test.php
C:/xampp/php/php.exe tests/household_assessments_identity_test.php
C:/xampp/php/php.exe tests/household_assessments_null_categories_test.php
C:/xampp/php/php.exe tests/household_assessments_integration_test.php
```

The integration test creates a uniquely named disposable database and removes only that database. Do not run `tests/run_all.sh` against application data: its legacy setup resets fixed database names and requires Linux-specific infrastructure.

