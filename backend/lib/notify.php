<?php

require_once __DIR__ . '/../sms/sms_helper.php';
require_once __DIR__ . '/../config/app_config.php';

function dispatch_notification(PDO $conn, array $targets, string $event_key, string $title, string $message, array $options = []): array
{
    $summary = ['in_app_created' => 0, 'sms' => null];
    try {
        $link = $options['link'] ?? null;
        $send_sms = !empty($options['sms']);
        $category = $options['sms_category'] ?? 'General';
        $sent_by = isset($options['sent_by']) ? intval($options['sent_by']) : ($_SESSION['user_id'] ?? null);

        $insert = $conn->prepare(
            "INSERT IGNORE INTO notifications (user_id, event_key, title, message, link)
             VALUES (:user_id, :event_key, :title, :message, :link)"
        );
        $user_stmt = $conn->prepare("SELECT user_id, full_name, contact_number FROM users WHERE user_id = :id");
        $household_stmt = $conn->prepare(
            "SELECT h.household_id, h.head_of_family, h.contact_number AS household_contact, h.user_id,
                    u.full_name, u.contact_number AS user_contact
             FROM households h LEFT JOIN users u ON u.user_id = h.user_id
             WHERE h.household_id = :id"
        );

        $sms_recipients = [];
        $seen_users = [];
        $seen_numbers = [];

        foreach ($targets as $t) {
            $user_id = isset($t['user_id']) ? intval($t['user_id']) : null;
            $household_id = isset($t['household_id']) ? intval($t['household_id']) : null;
            $name = null;
            $number = null;
            $type = 'Resident';
            $recipient_household = $household_id ?: null;

            if ($household_id) {
                $household_stmt->execute([':id' => $household_id]);
                $h = $household_stmt->fetch(PDO::FETCH_ASSOC);
                if (!$h) continue;
                $user_id = $user_id ?: ($h['user_id'] ? intval($h['user_id']) : null);
                $name = $h['full_name'] ?: $h['head_of_family'];
                // Phase 25 (audit F-SMS-04): the household's recorded contact (kept by barangay
                // staff) comes first; the linked resident account's own number is the fallback.
                $number = trim((string) ($h['household_contact'] ?: $h['user_contact']));
                $type = $h['user_id'] ? 'Resident' : 'Household';
            } elseif ($user_id) {
                $user_stmt->execute([':id' => $user_id]);
                $u = $user_stmt->fetch(PDO::FETCH_ASSOC);
                if (!$u) continue;
                $name = $u['full_name'];
                $number = trim((string) $u['contact_number']);
            } else {
                continue;
            }

            if ($user_id) {
                if (isset($seen_users[$user_id])) continue;
                $seen_users[$user_id] = true;
                $insert->execute([
                    ':user_id' => $user_id,
                    ':event_key' => $event_key,
                    ':title' => mb_substr($title, 0, 150),
                    ':message' => $message,
                    ':link' => $link,
                ]);
                $created = $insert->rowCount();
                $summary['in_app_created'] += $created;
                // This user was already notified about this event: no second SMS.
                if ($created === 0) continue;
            }

            if ($send_sms && $number !== '' && !isset($seen_numbers[$number])) {
                $seen_numbers[$number] = true;
                $sms_recipients[] = ['type' => $type, 'name' => $name, 'number' => $number, 'household_id' => $recipient_household];
            }
        }

        if ($send_sms && !empty($sms_recipients)) {
            $sms_text = mb_substr("Brgy. Binitayan: $title. $message", 0, 459);
            $summary['sms'] = send_sms_batch($conn, $sms_recipients, $sms_text, $category, $sent_by, [
                'event_key' => $event_key,
                'timeout' => app_config('SMS_AUTO_TIMEOUT_SECONDS') ?: 8,
                'event_type' => $options['event_type'] ?? notification_event_type($event_key),
                'allocation_id' => $options['allocation_id'] ?? null,
                'request_id' => $options['request_id'] ?? null,
                'defer' => !empty($options['sms_defer']), // Phase 25: queue only; the caller sends the queue
            ]);
        }
    } catch (Throwable $e) {
        error_log("notify.php ($event_key): " . $e->getMessage());
        $summary['error'] = true;
    }
    return $summary;
}

/**
 * Phase 25 (audit F-SMS-01): relief SMS are sent only when an allocation is
 * marked Ready for Distribution. Approval, request decisions and distribution
 * notify in-app only, unless the barangay explicitly turns this setting on.
 */
function sms_on_approval_and_distribution(): bool
{
    return app_config('SMS_ON_APPROVAL_AND_DISTRIBUTION') === true;
}

/** Notify every active resident account (in-app, and SMS if requested). */
function dispatch_to_all_residents(PDO $conn, string $event_key, string $title, string $message, array $options = []): array
{
    try {
        $ids = $conn->query("SELECT user_id FROM users WHERE role = 'resident' AND is_active = 1")->fetchAll(PDO::FETCH_COLUMN);
    } catch (Throwable $e) {
        error_log("notify.php (all residents): " . $e->getMessage());
        return ['in_app_created' => 0, 'sms' => null, 'error' => true];
    }
    $targets = array_map(fn($id) => ['user_id' => intval($id)], $ids);
    return dispatch_notification($conn, $targets, $event_key, $title, $message, $options);
}

/**
 * Phase 20 — event type for an event key, e.g. "allocation:12:approved" -> ALLOCATION_APPROVED,
 * "request:4:decision:partially_approved" -> REQUEST_DECISION, "report:8:verified" -> REPORT_VERIFIED.
 */
function notification_event_type(string $event_key): string
{
    $parts = explode(':', $event_key);
    $entity = strtoupper(preg_replace('/[^a-z_]/i', '', $parts[0] ?? 'event'));
    $action = strtoupper(preg_replace('/[^a-z_]/i', '', $parts[2] ?? 'event'));
    return mb_substr(trim("{$entity}_{$action}", '_'), 0, 50);
}

/** A short, user-facing description of an automatic SMS result, for API responses. */
function describe_sms_result($summary): ?string
{
    $sms = $summary['sms'] ?? null;
    if (!$sms) return null;
    switch ($sms['status'] ?? '') {
        case 'Sent':
        case 'Accepted by Gateway': return 'SMS accepted by the gateway (delivery to the phone is not confirmed).';
        case 'Queued': return 'SMS queued (see SMS Logs).';
        case 'Not Configured': return SMS_DISABLED_MESSAGE . ' The notification was saved in-app and logged in SMS Logs as "Not Configured".';
        case 'Duplicate Skipped': return null;
        default: return 'The SMS notification could not be sent (see SMS Logs). The in-app notification was saved.';
    }
}
