# binitayanBoundary.json — sync note (Step 5)

This file is an **exact, byte-for-byte copy** of the authoritative Barangay
Binitayan boundary created in Step 2:

    frontend/src/data/binitayanBoundary.json

It exists here only because the PHP backend (deployed under XAMPP's
`backend/` folder) cannot read files from the React frontend's `src/`
tree at runtime. The geometry, properties, and provenance metadata
(PSA PSGC source, source URL, retrieval date) are unchanged — nothing
was re-derived, simplified, or re-estimated.

**Do not hand-edit this file.** If the Step 2 boundary is ever updated,
re-copy `frontend/src/data/binitayanBoundary.json` over this file so the
two stay identical. `backend/utils/boundary_validator.php` loads this
copy and is the only backend code that reads it.

Verified identical via `diff` at the time this file was created
(2026-09-23).
