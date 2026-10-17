<?php
/**
 * Standard Purok list (Phase 19). Read-only; any logged-in user may read it
 * so every form uses the same dropdown values.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../lib/puroks.php';

require_login(['admin', 'relief_personnel', 'field_officer']); // Phase 21: staff only (residents no longer use this data)

echo json_encode(["success" => true, "data" => BINITAYAN_PUROKS]);
