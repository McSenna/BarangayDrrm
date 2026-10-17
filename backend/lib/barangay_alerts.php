<?php
/**
 * Barangay alerts (Phase 33) — the ONLY code that creates, edits or changes the status of hazard_alerts rows.
 *
 *   Draft  -> Active    ba_activate()    (Administrator; appears on the public map)
 *   Active -> Inactive  ba_deactivate()  (Administrator "Turn off", optional resolution note)
 *   Inactive is final: the record and its history are kept, never edited, reactivated or deleted.
 *
 * Status actions change only the status columns and the acting administrator; ba_update() changes only the
 * content fields and refuses any status field. Every change writes hazard_alert_history and audit_logs in the
 * same transaction. Activation sends no SMS, email or push notification, and nothing expires on its own.
 * Schema: database/migration_phase33_barangay_alerts.sql.
 */
require_once __DIR__ . '/../config/app_config.php';
require_once __DIR__ . '/puroks.php';

class BarangayAlertError extends RuntimeException {}

const BA_TYPES = ['Flood', 'Typhoon', 'Fire', 'Landslide', 'Earthquake', 'Other'];
const BA_LEGACY_TYPES = ['General Emergency'];      // older rows only; kept when an edit leaves the type unchanged
const BA_SEVERITIES = ['Advisory', 'Warning', 'Critical'];
// Older rows may still hold Alert / Normal; they rank and display as Advisory.
const BA_SEVERITY_RANK = ['Critical' => 4, 'Warning' => 3, 'Advisory' => 2, 'Alert' => 2, 'Normal' => 1];
const BA_STATES = ['Draft', 'Active', 'Inactive'];
const BA_SCOPES = ['barangay', 'puroks'];
const BA_CONTENT_FIELDS = ['title', 'hazard_type', 'severity', 'description', 'instructions', 'scope', 'puroks'];
const BA_STATUS_FIELDS = ['status', 'alert_status', 'is_active', 'issued_at', 'issued_by', 'resolved_at', 'resolved_by',
                          'resolution_note', 'created_by', 'created_at', 'updated_by', 'updated_at'];
const BA_TITLE_MAX = 150;
const BA_TEXT_MAX = 2000;
const BA_NOTE_MAX = 500;

function ba_fail(string $message, int $code = 400): void { throw new BarangayAlertError($message, $code); }

/** Runs $fn inside the caller's transaction, or in its own (committed or rolled back here). */
function ba_tx(PDO $db, callable $fn) {
    if ($db->inTransaction()) return $fn();
    $db->beginTransaction();
    try { $result = $fn(); $db->commit(); return $result; }
    catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
}

/** Stored severity -> the severity residents see (older Alert / Normal rows read as Advisory). */
function ba_public_severity(?string $status): string {
    return in_array($status, BA_SEVERITIES, true) ? $status : 'Advisory';
}

/** DB TIMESTAMP text (session zone, +08:00 by default) -> ISO 8601 with offset, or null. */
function ba_iso(?string $ts): ?string {
    if ($ts === null || $ts === '') return null;
    $tz = app_config('DB_TIME_ZONE');
    $zone = new DateTimeZone(is_string($tz) && preg_match('/^[+-]\d{2}:\d{2}$/', $tz) ? $tz : '+08:00');
    return (new DateTime($ts, $zone))->format('Y-m-d\TH:i:sP');
}

function ba_text($value, string $label, int $max, bool $required): ?string {
    if ($value === null) $value = '';
    if (!is_string($value)) ba_fail("$label must be text.");
    $value = trim($value);
    if ($required && $value === '') ba_fail("Please enter the $label.");
    if (mb_strlen($value) > $max) ba_fail("The $label can be at most $max characters.");
    return $value === '' ? null : $value;
}

/**
 * Validates create/edit input. Only the content fields (plus alert_id and version on edit) are accepted; any
 * status field is refused so status can change only through Activate / Turn off.
 * Returns the clean content: {title, hazard_type, severity, description, instructions, scope, puroks[]}.
 */
function ba_validate_input(array $data, bool $is_edit, ?array $current = null): array {
    foreach (array_keys($data) as $key) {
        if (in_array($key, BA_STATUS_FIELDS, true)) ba_fail('Status can only be changed with Activate or Turn off.');
        if (!in_array($key, BA_CONTENT_FIELDS, true) && !($is_edit && in_array($key, ['alert_id', 'version'], true))) {
            ba_fail('Unexpected field: ' . substr((string)$key, 0, 40) . '.');
        }
    }
    $title = ba_text($data['title'] ?? null, 'alert title', BA_TITLE_MAX, true);
    $type = $data['hazard_type'] ?? null;
    $type_ok = in_array($type, BA_TYPES, true) || ($current && in_array($type, BA_LEGACY_TYPES, true) && $type === $current['hazard_type']);
    if (!$type_ok) ba_fail('Please choose an alert type: ' . implode(', ', BA_TYPES) . '.');
    $severity = $data['severity'] ?? null;
    if (!in_array($severity, BA_SEVERITIES, true)) ba_fail('Please choose a severity: Advisory, Warning or Critical.');
    $scope = $data['scope'] ?? null;
    if (!in_array($scope, BA_SCOPES, true)) ba_fail('Please choose the affected area: the entire barangay or selected puroks.');
    $raw = $data['puroks'] ?? [];
    if (!is_array($raw) || !array_is_list($raw)) ba_fail('Puroks must be a list.');
    foreach ($raw as $p) {
        if (!is_string($p) || !in_array($p, BINITAYAN_PUROKS, true)) ba_fail('Puroks must be from Purok 1 to Purok 7 (' . implode(', ', BINITAYAN_PUROKS) . ').');
    }
    $puroks = array_values(array_intersect(BINITAYAN_PUROKS, $raw)); // standard order, no duplicates
    if ($scope === 'puroks' && !$puroks) ba_fail('Select at least one purok, or choose the entire barangay.');
    if ($scope === 'barangay' && $puroks) ba_fail('An alert for the entire barangay cannot also list puroks.');
    return [
        'title' => $title,
        'hazard_type' => $type,
        'severity' => $severity,
        'description' => ba_text($data['description'] ?? null, 'description', BA_TEXT_MAX, false),
        'instructions' => ba_text($data['instructions'] ?? null, 'resident instructions', BA_TEXT_MAX, false),
        'scope' => $scope,
        'puroks' => $puroks,
    ];
}

/** Readable area kept in affected_purok for older readers: NULL = barangay-wide. */
function ba_area_text(string $scope, array $puroks): ?string {
    return $scope === 'barangay' ? null : implode(', ', $puroks);
}

function ba_audit(PDO $db, int $actor, string $action, string $details): void {
    $db->prepare("INSERT INTO audit_logs (user_id, action, details) VALUES (:u, :a, :d)")
       ->execute([':u' => $actor, ':a' => $action, ':d' => $details]);
}

function ba_log(PDO $db, int $id, string $action, ?string $from, ?string $to, int $actor, ?string $note = null, ?array $changes = null): void {
    $db->prepare("INSERT INTO hazard_alert_history (alert_id, action, from_status, to_status, acted_by, note, changes)
                  VALUES (:id, :action, :from, :to, :by, :note, :changes)")
       ->execute([':id' => $id, ':action' => $action, ':from' => $from, ':to' => $to, ':by' => $actor, ':note' => $note,
                  ':changes' => $changes === null ? null : json_encode($changes)]);
}

function ba_save_puroks(PDO $db, int $id, array $puroks): void {
    $db->prepare("DELETE FROM hazard_alert_puroks WHERE alert_id = :id")->execute([':id' => $id]);
    $ins = $db->prepare("INSERT INTO hazard_alert_puroks (alert_id, purok) VALUES (:id, :p)");
    foreach ($puroks as $p) $ins->execute([':id' => $id, ':p' => $p]);
}

/** Locks one alert row for the current transaction; 404 when it does not exist. */
function ba_lock(PDO $db, int $id): array {
    $s = $db->prepare("SELECT * FROM hazard_alerts WHERE alert_id = :id FOR UPDATE");
    $s->execute([':id' => $id]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) ba_fail('The alert could not be found. It may have been removed.', 404);
    return $row;
}

/** Adds severity, puroks[] (standard order) and unmapped_area to alert rows. */
function ba_attach_puroks(PDO $db, array $rows): array {
    if (!$rows) return [];
    $ids = array_map(fn($r) => (int)$r['alert_id'], $rows);
    $in = implode(',', array_fill(0, count($ids), '?'));
    $s = $db->prepare("SELECT alert_id, purok FROM hazard_alert_puroks WHERE alert_id IN ($in)");
    $s->execute($ids);
    $by = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) $by[(int)$r['alert_id']][] = $r['purok'];
    foreach ($rows as &$r) {
        $id = (int)$r['alert_id'];
        $r['alert_id'] = $id;
        $r['severity'] = ba_public_severity($r['status'] ?? null);
        $r['puroks'] = [];
        $r['unmapped_area'] = null;
        if (($r['scope'] ?? 'barangay') === 'puroks') {
            if (!empty($by[$id])) {
                $r['puroks'] = array_values(array_intersect(BINITAYAN_PUROKS, $by[$id]));
            } else {
                // Older row with one value in affected_purok ("7", "Purok 7"); anything else stays text only.
                $std = normalize_purok($r['affected_purok'] ?? null);
                if ($std !== null) $r['puroks'] = [$std];
                else $r['unmapped_area'] = trim((string)($r['affected_purok'] ?? '')) ?: null;
            }
        }
    }
    unset($r);
    return $rows;
}

const BA_ADMIN_SELECT = "SELECT ha.*, cu.full_name AS created_by_name, uu.full_name AS updated_by_name,
        iu.full_name AS issued_by_name, ru.full_name AS resolved_by_name
    FROM hazard_alerts ha
    LEFT JOIN users cu ON cu.user_id = ha.created_by
    LEFT JOIN users uu ON uu.user_id = ha.updated_by
    LEFT JOIN users iu ON iu.user_id = ha.issued_by
    LEFT JOIN users ru ON ru.user_id = ha.resolved_by";

/** Full admin record with ISO times (activated_at / deactivated_at / created_at / updated_at). */
function ba_admin_rows(PDO $db, array $rows): array {
    $rows = ba_attach_puroks($db, $rows);
    foreach ($rows as &$r) {
        $r['version'] = (int)$r['version'];
        $r['is_active'] = (int)$r['is_active'];
        $r['activated_at'] = ba_iso($r['issued_at']);
        $r['deactivated_at'] = ba_iso($r['resolved_at']);
        $r['created_at'] = ba_iso($r['created_at']);
        $r['updated_at'] = ba_iso($r['updated_at']);
    }
    unset($r);
    return $rows;
}

function ba_get(PDO $db, int $id): ?array {
    $s = $db->prepare(BA_ADMIN_SELECT . " WHERE ha.alert_id = :id");
    $s->execute([':id' => $id]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    return $row ? ba_admin_rows($db, [$row])[0] : null;
}

/**
 * Alert records for staff. Filters: state (Draft|Active|Inactive), active_only ('1'|'0', older callers),
 * hazard_type, severity, date_from / date_to (activation date, or creation date for drafts).
 * Drafts are listed only when $include_drafts (administrators).
 */
function ba_list(PDO $db, array $filters, bool $include_drafts): array {
    $sql = BA_ADMIN_SELECT . " WHERE 1=1";
    $p = [];
    if (!$include_drafts) $sql .= " AND ha.alert_status <> 'Draft'";
    $state = $filters['state'] ?? '';
    if (($filters['active_only'] ?? '') === '1') $state = 'Active';
    if (($filters['active_only'] ?? '') === '0') $state = 'Inactive';
    if (in_array($state, BA_STATES, true)) { $sql .= " AND ha.alert_status = :state"; $p[':state'] = $state; }
    $type = $filters['hazard_type'] ?? '';
    if (in_array($type, [...BA_TYPES, ...BA_LEGACY_TYPES], true)) { $sql .= " AND ha.hazard_type = :type"; $p[':type'] = $type; }
    $sev = $filters['severity'] ?? '';
    if (in_array($sev, BA_SEVERITIES, true)) {
        $sql .= $sev === 'Advisory' ? " AND ha.status IN ('Advisory','Alert','Normal')" : " AND ha.status = :sev";
        if ($sev !== 'Advisory') $p[':sev'] = $sev;
    }
    foreach (['date_from' => '>=', 'date_to' => '<='] as $key => $op) {
        $d = $filters[$key] ?? '';
        if (is_string($d) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) { $sql .= " AND DATE(COALESCE(ha.issued_at, ha.created_at)) $op :$key"; $p[":$key"] = $d; }
    }
    $sql .= " ORDER BY FIELD(ha.alert_status, 'Active', 'Draft', 'Inactive'), FIELD(ha.status, 'Critical', 'Warning', 'Advisory', 'Alert', 'Normal'),
              COALESCE(ha.resolved_at, ha.issued_at, ha.created_at) DESC, ha.alert_id DESC";
    $s = $db->prepare($sql);
    $s->execute($p);
    return ba_admin_rows($db, $s->fetchAll(PDO::FETCH_ASSOC));
}

/** Audit trail of one alert, oldest first; changes = names of the fields an edit changed. */
function ba_history(PDO $db, int $id): array {
    $s = $db->prepare("SELECT h.history_id, h.action, h.from_status, h.to_status, h.acted_by, u.full_name AS acted_by_name,
                              h.acted_at, h.note, h.changes
                       FROM hazard_alert_history h LEFT JOIN users u ON u.user_id = h.acted_by
                       WHERE h.alert_id = :id ORDER BY h.acted_at ASC, h.history_id ASC");
    $s->execute([':id' => $id]);
    return array_map(function ($h) {
        $h['history_id'] = (int)$h['history_id'];
        $h['acted_at'] = ba_iso($h['acted_at']);
        $h['changes'] = $h['changes'] === null ? [] : (json_decode($h['changes'], true) ?: []);
        return $h;
    }, $s->fetchAll(PDO::FETCH_ASSOC));
}

/** Active alerts with resident-facing fields only, highest severity first. */
function ba_public_active(PDO $db): array {
    $rows = $db->query(
        "SELECT alert_id, title, hazard_type, status, description, instructions, scope, affected_purok, issued_at, updated_at
         FROM hazard_alerts WHERE alert_status = 'Active'
         ORDER BY FIELD(status, 'Critical', 'Warning', 'Advisory', 'Alert', 'Normal'), issued_at DESC, alert_id DESC"
    )->fetchAll(PDO::FETCH_ASSOC);
    return array_map(fn($r) => [
        'alert_id' => $r['alert_id'],
        'title' => $r['title'],
        'hazard_type' => $r['hazard_type'],
        'severity' => $r['severity'],
        'description' => $r['description'],
        'instructions' => $r['instructions'],
        'scope' => $r['scope'],
        'puroks' => $r['puroks'],
        'unmapped_area' => $r['unmapped_area'],
        'activated_at' => ba_iso($r['issued_at']),
        'updated_at' => ba_iso($r['updated_at']),
    ], ba_attach_puroks($db, $rows));
}

/** Highest severity among public alerts, or null when none are active. */
function ba_highest_severity(array $alerts): ?string {
    $best = null;
    foreach ($alerts as $a) if ($best === null || BA_SEVERITY_RANK[$a['severity']] > BA_SEVERITY_RANK[$best]) $best = $a['severity'];
    return $best;
}

/** Creates a Draft. Returns the new alert_id. */
function ba_create(PDO $db, array $data, int $actor): int {
    $c = ba_validate_input($data, false);
    return ba_tx($db, function () use ($db, $c, $actor) {
        $db->prepare("INSERT INTO hazard_alerts (hazard_type, status, title, description, instructions, affected_purok, scope,
                          is_active, alert_status, issued_at, created_by, created_at, updated_by, updated_at, version)
                      VALUES (:type, :sev, :title, :descr, :instr, :area, :scope, 0, 'Draft', NULL, :by, NOW(), :by2, NOW(), 1)")
           ->execute([':type' => $c['hazard_type'], ':sev' => $c['severity'], ':title' => $c['title'], ':descr' => $c['description'],
                      ':instr' => $c['instructions'], ':area' => ba_area_text($c['scope'], $c['puroks']), ':scope' => $c['scope'],
                      ':by' => $actor, ':by2' => $actor]);
        $id = (int)$db->lastInsertId();
        ba_save_puroks($db, $id, $c['puroks']);
        ba_log($db, $id, 'created', null, 'Draft', $actor);
        ba_audit($db, $actor, 'Barangay alert created', "alert_id: $id, {$c['hazard_type']} - {$c['title']} ({$c['severity']}, draft)");
        return $id;
    });
}

/** Edits the content of a Draft or Active alert. `version` must match the stored one. */
function ba_update(PDO $db, int $id, array $data, int $actor): array {
    return ba_tx($db, function () use ($db, $id, $data, $actor) {
        $row = ba_lock($db, $id);
        if ($row['alert_status'] === 'Inactive') ba_fail('This alert has been turned off. Turned-off alerts are kept as history and cannot be edited.', 409);
        $version = $data['version'] ?? null;
        if (!is_int($version) && !(is_string($version) && ctype_digit($version))) ba_fail('The alert version is missing. Please reload and try again.');
        if ((int)$version !== (int)$row['version']) ba_fail('Someone else changed this alert after you opened it. Reload to see the latest version, then try again.', 409);
        $c = ba_validate_input($data, true, $row);
        $current = ba_attach_puroks($db, [$row])[0];
        $before = ['title' => $row['title'], 'hazard_type' => $row['hazard_type'], 'severity' => $row['status'], 'description' => $row['description'],
                   'instructions' => $row['instructions'], 'scope' => $row['scope'], 'puroks' => $current['puroks']];
        $changed = array_keys(array_filter($c, fn($v, $k) => $v !== $before[$k], ARRAY_FILTER_USE_BOTH));
        if (!$changed) return ba_get($db, $id);
        $db->prepare("UPDATE hazard_alerts SET hazard_type = :type, status = :sev, title = :title, description = :descr,
                          instructions = :instr, affected_purok = :area, scope = :scope, updated_by = :by, updated_at = NOW(),
                          version = version + 1
                      WHERE alert_id = :id")
           ->execute([':type' => $c['hazard_type'], ':sev' => $c['severity'], ':title' => $c['title'], ':descr' => $c['description'],
                      ':instr' => $c['instructions'], ':area' => ba_area_text($c['scope'], $c['puroks']), ':scope' => $c['scope'],
                      ':by' => $actor, ':id' => $id]);
        ba_save_puroks($db, $id, $c['puroks']);
        ba_log($db, $id, 'updated', $row['alert_status'], $row['alert_status'], $actor, null, $changed);
        ba_audit($db, $actor, 'Barangay alert edited', "alert_id: $id, changed: " . implode(', ', $changed));
        return ba_get($db, $id);
    });
}

/** Draft -> Active. Activating an Active alert again changes nothing (`already` = true). */
function ba_activate(PDO $db, int $id, int $actor): array {
    return ba_tx($db, function () use ($db, $id, $actor) {
        $row = ba_lock($db, $id);
        if ($row['alert_status'] === 'Active') return ['alert' => ba_get($db, $id), 'already' => true];
        if ($row['alert_status'] === 'Inactive') ba_fail('This alert has been turned off and cannot be activated again. Create a new alert instead.', 409);
        $db->prepare("UPDATE hazard_alerts SET alert_status = 'Active', is_active = 1, issued_at = NOW(), issued_by = :by,
                          updated_by = :by2, updated_at = NOW(), version = version + 1
                      WHERE alert_id = :id AND alert_status = 'Draft'")
           ->execute([':by' => $actor, ':by2' => $actor, ':id' => $id]);
        ba_log($db, $id, 'activated', 'Draft', 'Active', $actor);
        ba_audit($db, $actor, 'Barangay alert activated', "alert_id: $id, {$row['title']}");
        return ['alert' => ba_get($db, $id), 'already' => false];
    });
}

/** Active -> Inactive ("Turn off"). A repeated request changes nothing and adds no history (`already` = true). */
function ba_deactivate(PDO $db, int $id, int $actor, $note): array {
    $note = ba_text($note, 'resolution note', BA_NOTE_MAX, false);
    return ba_tx($db, function () use ($db, $id, $actor, $note) {
        $row = ba_lock($db, $id);
        if ($row['alert_status'] === 'Inactive') return ['alert' => ba_get($db, $id), 'already' => true];
        if ($row['alert_status'] === 'Draft') ba_fail('This alert is still a draft and was never active, so there is nothing to turn off.', 409);
        $db->prepare("UPDATE hazard_alerts SET alert_status = 'Inactive', is_active = 0, resolved_at = NOW(), resolved_by = :by,
                          resolution_note = :note, updated_by = :by2, updated_at = NOW(), version = version + 1
                      WHERE alert_id = :id AND alert_status = 'Active'")
           ->execute([':by' => $actor, ':note' => $note, ':by2' => $actor, ':id' => $id]);
        ba_log($db, $id, 'deactivated', 'Active', 'Inactive', $actor, $note);
        ba_audit($db, $actor, 'Barangay alert turned off', "alert_id: $id, {$row['title']}" . ($note ? " — $note" : ''));
        return ['alert' => ba_get($db, $id), 'already' => false];
    });
}

// ---- endpoint helpers (backend/hazards/alerts/*.php)

/** Refuses any method other than $methods with 405. */
function ba_require_method(array $methods): void {
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', $methods, true)) ba_fail('Method not allowed.', 405);
}

/** JSON request body as an array, accepting only $allowed keys when given (status actions). */
function ba_json_body(?array $allowed = null): array {
    $data = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($data)) ba_fail('The request is empty or not valid JSON.');
    if ($allowed !== null) {
        $extra = array_diff(array_keys($data), $allowed);
        if ($extra) ba_fail('This action changes only the alert status. Unexpected field: ' . substr((string)reset($extra), 0, 40) . '.');
    }
    return $data;
}

function ba_alert_id($value): int {
    $id = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($id === false) ba_fail('Please choose a valid alert.');
    return $id;
}

/** Runs an endpoint body; a BarangayAlertError becomes its HTTP status and message. */
function ba_respond(callable $fn): void {
    try {
        [$code, $payload] = $fn();
        http_response_code($code);
        echo json_encode(['success' => true] + $payload);
    } catch (BarangayAlertError $e) {
        http_response_code($e->getCode() ?: 400);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}

/** Deletes a Draft that was never published. Active and turned-off alerts are records and are never deleted. */
function ba_delete_draft(PDO $db, int $id, int $actor): void {
    ba_tx($db, function () use ($db, $id, $actor) {
        $row = ba_lock($db, $id);
        if ($row['alert_status'] !== 'Draft') ba_fail('Only drafts can be deleted. Active and turned-off alerts are kept as records.', 409);
        $db->prepare("DELETE FROM hazard_alert_history WHERE alert_id = :id")->execute([':id' => $id]);
        $db->prepare("DELETE FROM hazard_alerts WHERE alert_id = :id")->execute([':id' => $id]);
        ba_audit($db, $actor, 'Barangay alert draft deleted', "alert_id: $id, {$row['title']}");
    });
}
