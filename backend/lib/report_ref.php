<?php
/**
 * Phase 23 — disaster report reference number, generated automatically from
 * the report's own ID and the year it was recorded (no extra column, so it can
 * never collide or drift): RPT-<year>-<5-digit id>, e.g. RPT-2026-00009.
 */
function report_reference_no(array $row): string
{
    $when = !empty($row['created_at']) ? $row['created_at'] : ($row['report_date'] ?? null);
    $year = $when ? substr((string) $when, 0, 4) : date('Y');
    return sprintf('RPT-%s-%05d', $year, intval($row['report_id'] ?? 0));
}

/** Adds reference_no to every report row. */
function with_report_reference(array $rows): array
{
    foreach ($rows as &$r) $r['reference_no'] = report_reference_no($r);
    unset($r);
    return $rows;
}
