<?php
/**
 * Shared SMS-sending logic, used by every endpoint that sends a message.
 * Every recipient gets its own row in sms_logs, regardless of outcome, so
 * SMS Logs (#43) always has a complete record: recipient, message, date/time,
 * and status.
 *
 * Phase 19 additions (backward compatible — the manual Send SMS page calls
 * this exactly as before):
 *   - recipients are validated as Philippine mobile numbers; an invalid number
 *     is logged as Failed and never sent to the gateway
 *   - optional $options['event_key'] tags automatic (event-triggered) SMS;
 *     sms_logs has UNIQUE (event_key, recipient_number), so the same event is
 *     never texted to the same number twice
 *   - optional $options['timeout'] (seconds) for the gateway call
 *
 * Phase 20 additions (backward compatible):
 *   - optional $options['event_type'|'allocation_id'|'request_id'] and a
 *     per-recipient 'household_id' are stored in the new sms_logs columns,
 *     together with a short provider response (never the API key)
 *   - the Semaphore call is one function (semaphore_send) shared with sms/retry.php
 *   - if the Phase 20 migration has not been run yet, logging falls back to
 *     the Phase 19 columns, so SMS keeps working
 *   - clear wording when SMS is switched off: "SMS notifications are currently disabled."
 */

const SMS_DISABLED_MESSAGE = 'SMS notifications are currently disabled.';

/** True for 09XXXXXXXXX, +639XXXXXXXXX or 639XXXXXXXXX (spaces/dashes ignored). */
function sms_is_valid_ph_mobile($number): bool
{
    $digits = preg_replace('/[\s\-().]/', '', (string) $number);
    return (bool) preg_match('/^(\+?63|0)9\d{9}$/', $digits);
}

/** True if this (event_key, number) pair has already been logged. */
function sms_event_already_logged(PDO $conn, ?string $event_key, string $number): bool
{
    if ($event_key === null || $event_key === '') return false;
    $stmt = $conn->prepare("SELECT 1 FROM sms_logs WHERE event_key = :event_key AND recipient_number = :number LIMIT 1");
    $stmt->execute([':event_key' => $event_key, ':number' => $number]);
    return (bool) $stmt->fetchColumn();
}

/** True when the Phase 20 sms_logs columns exist (cached per request). */
function sms_logs_has_phase20_columns(PDO $conn): bool
{
    static $has = null;
    if ($has === null) {
        try {
            $has = (bool) $conn->query("SHOW COLUMNS FROM sms_logs LIKE 'event_type'")->fetch();
        } catch (Throwable $e) {
            $has = false;
        }
    }
    return $has;
}

/** The SMS configuration with values cleaned, and whether sending is possible. */
function sms_config_state(): array
{
    $config = require __DIR__ . '/../config/sms_api_config.php';
    // Defensively clean config values — a stray trailing newline or space from
    // copy-pasting an API key/device ID is a very common mistake and produces a
    // cryptic "Malformed input to a URL function" cURL error if left in.
    $state = [
        'enabled' => !empty($config['SMS_ENABLED']),
        'api_key' => trim((string) ($config['API_KEY'] ?? '')),
        'sender_name' => trim((string) ($config['SENDER_NAME'] ?? '')),
        'base_url' => trim((string) ($config['API_BASE_URL'] ?? '')),
    ];
    $state['ready'] = $state['enabled'] && $state['api_key'] !== '';
    return $state;
}

/** Short, safe provider response text for the log (never contains the API key). */
function sms_short_response($text): ?string
{
    if ($text === null || $text === false || $text === '') return null;
    return mb_substr(preg_replace('/\s+/', ' ', (string) $text), 0, 300);
}

function semaphore_send(array $state, array $numbers, string $message, int $timeout): array
{
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'http_code' => 0, 'error' => "PHP's curl extension is not enabled.", 'response' => null];
    }
    $url = $state['base_url'];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, min(5, $timeout));
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/x-www-form-urlencoded',
    ]);
    $parameters = [
        'apikey' => $state['api_key'],
        'number' => implode(',', array_map('semaphore_number', $numbers)),
        'message' => $message,
    ];
    if ($state['sender_name'] !== '') $parameters['sendername'] = $state['sender_name'];
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($parameters));

    $response = curl_exec($ch);
    $http_code = intval(curl_getinfo($ch, CURLINFO_HTTP_CODE));
    $curl_error = curl_error($ch);
    curl_close($ch);

    return semaphore_parse_response($http_code, $response, $curl_error, $state['api_key']);
}

/** Semaphore accepts Philippine numbers in international digits-only format. */
function semaphore_number(string $number): string
{
    $digits = preg_replace('/[^0-9]/', '', $number);
    return str_starts_with($digits, '09') ? '63' . substr($digits, 1) : $digits;
}

/** Validate the provider payload as well as HTTP status, and redact secrets. */
function semaphore_parse_response(int $http_code, $response, string $curl_error, string $api_key): array
{
    $decoded = json_decode((string) $response, true);
    $ok = $response !== false && $http_code >= 200 && $http_code < 300
        && is_array($decoded) && isset($decoded[0]);
    if ($ok) {
        foreach ($decoded as $row) {
            if (!is_array($row) || empty($row['message_id'])
                || !in_array(strtolower((string) ($row['status'] ?? '')), ['queued', 'pending', 'sent'], true)) {
                $ok = false;
                break;
            }
        }
    }
    $safe = $api_key !== '' ? str_replace($api_key, '[REDACTED]', (string) $response) : (string) $response;
    $safe_error = $api_key !== '' ? str_replace($api_key, '[REDACTED]', $curl_error) : $curl_error;
    return ['ok' => $ok, 'http_code' => $http_code,
        'error' => $ok ? null : ($safe_error ?: "Semaphore API returned HTTP $http_code: " . substr($safe, 0, 300)),
        'response' => sms_short_response($safe)];
}

/** Translate known setup failures without exposing raw gateway responses. */
function sms_failure_message(?string $error): string
{
    if (stripos((string) $error, 'No active sender name found') !== false) {
        return 'Semaphore could not send this SMS because your account has no approved sender name. '
            . 'Register a sender name in your Semaphore dashboard and wait for approval, then retry from SMS Logs. '
            . 'The failed attempt was recorded in SMS Logs.';
    }
    return 'The SMS could not be sent. The attempt was recorded in SMS Logs with the status "Failed". '
        . 'Please check the SMS service connection and retry from SMS Logs.';
}

/** Phase 25: sms_logs has the Queued / Accepted by Gateway / Delivered statuses and provider_message_id. */
function sms_logs_phase25(PDO $conn): bool
{
    static $ready = null;
    if ($ready === null) {
        try { $ready = (bool) $conn->query("SHOW COLUMNS FROM sms_logs LIKE 'provider_message_id'")->fetch(); }
        catch (Throwable $e) { $ready = false; }
    }
    return $ready;
}

/**
 * Status for "the gateway accepted the request". Semaphore answering HTTP 2xx
 * means the message was ACCEPTED for sending, not that the phone received it,
 * so it is never recorded as Delivered. Before Phase 25 the legacy word 'Sent'
 * is kept (the ENUM has no other value).
 */
function sms_accepted_status(PDO $conn): string
{
    return sms_logs_phase25($conn) ? 'Accepted by Gateway' : 'Sent';
}

/** Statuses that mean "handed to the gateway" — never retried, counted as sent in reports. */
const SMS_ACCEPTED_STATUSES = ['Sent', 'Accepted by Gateway', 'Delivered'];

/** The provider's message/batch ID from a Semaphore JSON response, if it gives one. */
function sms_provider_message_id(?string $response): ?string
{
    if (!$response) return null;
    $j = json_decode($response, true);
    if (!is_array($j)) return null;
    foreach ([[0, 'message_id'], ['data', 'smsBatchId'], ['data', '_id'], ['data', 'id'], ['smsBatchId'], ['_id'], ['id']] as $path) {
        $v = $j;
        foreach ($path as $k) { $v = is_array($v) && array_key_exists($k, $v) ? $v[$k] : null; }
        if (is_scalar($v) && $v !== '') return mb_substr((string) $v, 0, 100);
    }
    return null;
}

/**
 * Phase 25 — send every Queued row in $sms_ids (one Semaphore call per row) and
 * record the outcome on the same row. Used right after queueing, and safe to
 * call again: a row that is no longer Queued is skipped (locked + re-checked).
 * @return array ['accepted' => int, 'failed' => int, 'skipped' => int, 'failure_message' => ?string]
 */
function sms_process_queued(PDO $conn, array $sms_ids, int $timeout = 8): array
{
    $out = ['accepted' => 0, 'failed' => 0, 'skipped' => 0, 'failure_message' => null];
    $state = sms_config_state();
    $accepted = sms_accepted_status($conn);
    foreach ($sms_ids as $id) {
        $id = intval($id);
        $own_tx = !$conn->inTransaction();
        if ($own_tx) $conn->beginTransaction();
        $st = $conn->prepare("SELECT sms_id, recipient_number, message, status FROM sms_logs WHERE sms_id = :id FOR UPDATE");
        $st->execute([':id' => $id]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        if (!$row || $row['status'] !== 'Queued') { if ($own_tx) $conn->rollBack(); $out['skipped']++; continue; }
        if (!$state['ready']) {
            $conn->prepare("UPDATE sms_logs SET status = 'Not Configured', error_message = :e, last_attempt_at = NOW() WHERE sms_id = :id")
                 ->execute([':e' => SMS_DISABLED_MESSAGE, ':id' => $id]);
            if ($own_tx) $conn->commit();
            $out['failed']++; continue;
        }
        if ($own_tx) $conn->commit(); // do not hold the row lock during the network call
        $r = semaphore_send($state, [$row['recipient_number']], $row['message'], $timeout);
        if (!$r['ok'] && $out['failure_message'] === null) {
            $out['failure_message'] = sms_failure_message($r['error']);
        }
        $conn->prepare("UPDATE sms_logs SET status = :s, error_message = :e, provider_response = :p, provider_message_id = :m, last_attempt_at = NOW()
                        WHERE sms_id = :id AND status = 'Queued'")
             ->execute([':s' => $r['ok'] ? $accepted : 'Failed', ':e' => $r['error'], ':p' => $r['response'],
                        ':m' => $r['ok'] ? sms_provider_message_id($r['response']) : null, ':id' => $id]);
        $r['ok'] ? $out['accepted']++ : $out['failed']++;
    }
    return $out;
}

/**
 * Send one message to a batch of recipients and log each one.
 *
 * @param PDO $conn
 * @param array $recipients Each item: ['type' => 'Resident'|'Relief Personnel'|'Household'|'Custom', 'name' => string|null, 'number' => string, 'household_id' => int|null]
 * @param string $message
 * @param string $category One of the sms_logs.category ENUM values
 * @param int|null $sent_by user_id of the user whose action sent this
 * @param array $options ['event_key' => string|null, 'timeout' => int, 'event_type' => string|null, 'allocation_id' => int|null, 'request_id' => int|null]
 * @return array ['success' => bool, 'message' => string, 'sent_count' => int, 'failed_count' => int, 'status' => string]
 */
function send_sms_batch(PDO $conn, array $recipients, string $message, string $category, ?int $sent_by, array $options = []): array
{
    $event_key = $options['event_key'] ?? null;
    $timeout = max(3, intval($options['timeout'] ?? 15));
    $event_type = isset($options['event_type']) ? mb_substr((string) $options['event_type'], 0, 50) : null;
    $allocation_id = !empty($options['allocation_id']) ? intval($options['allocation_id']) : null;
    $request_id = !empty($options['request_id']) ? intval($options['request_id']) : null;

    $recipients = array_values(array_filter($recipients, fn($r) => !empty($r['number'])));

    if (empty($recipients)) {
        return ['success' => false, 'message' => 'None of the selected recipients has a valid contact number.', 'sent_count' => 0, 'failed_count' => 0, 'status' => 'No Recipients'];
    }

    $state = sms_config_state();
    $phase20 = sms_logs_has_phase20_columns($conn);
    // Before the Phase 20 migration the category ENUM has no 'Relief Allocation Update'.
    if (!$phase20 && $category === 'Relief Allocation Update') $category = 'Relief Request Update';

    $log_stmt = $conn->prepare($phase20
        ? "INSERT INTO sms_logs (recipient_type, recipient_name, recipient_number, message, category, event_key, event_type, household_id, allocation_id, request_id,
                                 status, error_message, provider_response, attempts, sent_by, last_attempt_at)
           VALUES (:recipient_type, :recipient_name, :recipient_number, :message, :category, :event_key, :event_type, :household_id, :allocation_id, :request_id,
                   :status, :error_message, :provider_response, 1, :sent_by, NOW())"
        : "INSERT INTO sms_logs (recipient_type, recipient_name, recipient_number, message, category, event_key, status, error_message, sent_by)
           VALUES (:recipient_type, :recipient_name, :recipient_number, :message, :category, :event_key, :status, :error_message, :sent_by)"
    );
    $log = function (array $r, string $status, ?string $error, ?string $provider_response = null) use ($conn, $log_stmt, $message, $category, $event_key, $sent_by, $phase20, $event_type, $allocation_id, $request_id): ?int {
        $params = [
            ':recipient_type' => $r['type'],
            ':recipient_name' => $r['name'] ?? null,
            ':recipient_number' => $r['number'],
            ':message' => $message,
            ':category' => $category,
            ':event_key' => $event_key,
            ':status' => $status,
            ':error_message' => $error,
            ':sent_by' => $sent_by,
        ];
        if ($phase20) {
            $params += [
                ':event_type' => $event_type,
                ':household_id' => !empty($r['household_id']) ? intval($r['household_id']) : null,
                ':allocation_id' => $allocation_id,
                ':request_id' => $request_id,
                ':provider_response' => $provider_response,
            ];
        }
        try {
            $log_stmt->execute($params);
            return intval($conn->lastInsertId());
        } catch (PDOException $e) {
            // Duplicate (event_key, recipient_number) — this event was already
            // logged for this number by a concurrent request; nothing to add.
            if ($e->getCode() !== '23000') throw $e;
            return null;
        }
    };

    // --- Duplicate protection for automatic SMS ---
    $recipients = array_values(array_filter($recipients, fn($r) => !sms_event_already_logged($conn, $event_key, $r['number'])));
    if (empty($recipients)) {
        return ['success' => true, 'message' => 'This notification was already sent to these recipients.', 'sent_count' => 0, 'failed_count' => 0, 'status' => 'Duplicate Skipped'];
    }

    // --- Recipient validation: invalid numbers are logged as Failed, never sent ---
    $valid = [];
    $invalid_count = 0;
    foreach ($recipients as $r) {
        if (sms_is_valid_ph_mobile($r['number'])) {
            $valid[] = $r;
        } else {
            $log($r, 'Failed', 'Invalid mobile number. Use the format 09XXXXXXXXX or +639XXXXXXXXX.');
            $invalid_count++;
        }
    }
    if (empty($valid)) {
        return ['success' => false, 'message' => 'None of the selected recipients has a valid mobile number (09XXXXXXXXX). The attempt was recorded in SMS Logs as "Failed".', 'sent_count' => 0, 'failed_count' => $invalid_count, 'status' => 'Failed'];
    }
    $recipients = $valid;

    // --- Switched off / not configured: log every recipient as such ---
    if (!$state['ready']) {
        foreach ($recipients as $r) {
            $log($r, 'Not Configured', SMS_DISABLED_MESSAGE . ' Set SEMAPHORE_SMS_ENABLED and SEMAPHORE_API_KEY in backend/config/app_config.local.php.');
        }
        return [
            'success' => false,
            'message' => SMS_DISABLED_MESSAGE . ' The message was saved in SMS Logs with the status "Not Configured". Nothing was sent.',
            'sent_count' => 0,
            'failed_count' => count($recipients) + $invalid_count,
            'status' => 'Not Configured',
        ];
    }

    // --- Phase 25: queue first (a row per recipient BEFORE anything is sent), then send.
    // If the request dies mid-way, every recipient still has a Queued row that
    // SMS Logs can send/retry. With 'defer' => true nothing is sent here; the
    // caller sends later with sms_process_queued() (large batches).
    if (sms_logs_phase25($conn)) {
        $ids = [];
        foreach ($recipients as $r) {
            $id = $log($r, 'Queued', null);
            if ($id) $ids[] = $id;
        }
        if (!empty($options['defer'])) {
            return ['success' => true, 'message' => count($ids) . ' SMS queued.', 'sent_count' => 0, 'failed_count' => $invalid_count,
                    'status' => 'Queued', 'queued_ids' => $ids];
        }
        $p = sms_process_queued($conn, $ids, $timeout);
        $ok = $p['accepted'] > 0 && $p['failed'] === 0;
        return [
            'success' => $ok,
            'message' => $ok
                ? 'SMS accepted by the gateway for ' . $p['accepted'] . ' recipient(s) (delivery to the phone is not confirmed by the provider).' . ($invalid_count ? " $invalid_count invalid number(s) were skipped." : '')
                : ($p['failure_message'] ?? sms_failure_message(null)),
            'sent_count' => $p['accepted'],
            'failed_count' => $p['failed'] + $invalid_count,
            'status' => $ok ? sms_accepted_status($conn) : 'Failed',
            'queued_ids' => $ids,
        ];
    }

    // --- Send via Semaphore (one call, all numbers in the recipients array) ---
    $result = semaphore_send($state, array_map(fn($r) => $r['number'], $recipients), $message, $timeout);
    $status = $result['ok'] ? 'Sent' : 'Failed';

    foreach ($recipients as $r) {
        $log($r, $status, $result['error'], $result['response']);
    }

    if (!$result['ok'] && !function_exists('curl_init')) {
        return ['success' => false, 'message' => "SMS sending is currently unavailable. The message was saved in SMS Logs with the status \"Failed\". Please contact the system administrator.", 'sent_count' => 0, 'failed_count' => count($recipients) + $invalid_count, 'status' => 'Failed'];
    }

    return [
        'success' => $result['ok'],
        'message' => $result['ok']
            ? 'SMS sent to ' . count($recipients) . ' recipient(s).' . ($invalid_count ? " $invalid_count invalid number(s) were skipped." : '')
            : sms_failure_message($result['error']),
        'sent_count' => $result['ok'] ? count($recipients) : 0,
        'failed_count' => ($result['ok'] ? 0 : count($recipients)) + $invalid_count,
        'status' => $status,
    ];
}
