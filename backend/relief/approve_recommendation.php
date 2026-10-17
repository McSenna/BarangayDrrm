<?php
// Retired by the relief allocation workflow (docs/superpowers/specs/2026-10-17-relief-allocation-workflow-design.md):
// relief now goes through a field visit, automatic Ready for Distribution and Relief Personnel completion.
require_once __DIR__ . '/../config/cors.php';
http_response_code(410);
echo json_encode(['success' => false, 'message' => 'This action was replaced by the new allocation workflow.']);
