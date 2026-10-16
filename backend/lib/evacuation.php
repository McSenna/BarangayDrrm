<?php
/**
 * Evacuation center helpers (Phase 19).
 *
 * Rules:
 *   - current_occupancy is a whole number from 0 to capacity (also a CHECK
 *     constraint in the database)
 *   - an Open center that reaches capacity becomes Full automatically; a Full
 *     center whose occupancy drops below capacity becomes Open again
 *   - a center can be Closed only when its occupancy is 0
 *   - every occupancy or status change is written to evacuation_center_logs
 * This module counts people; it does not track individual evacuees.
 */

const EVAC_STATUSES = ['Open', 'Closed', 'Full'];

function evac_effective_status(string $status, int $occupancy, int $capacity): string
{
    if ($status === 'Open' && $occupancy >= $capacity) return 'Full';
    if ($status === 'Full' && $occupancy < $capacity) return 'Open';
    return $status;
}

function evac_log_change(PDO $conn, int $center_id, ?int $prev_occ, int $new_occ, ?string $prev_status, string $new_status, ?string $remarks): int
{
    $stmt = $conn->prepare(
        "INSERT INTO evacuation_center_logs (center_id, previous_occupancy, new_occupancy, previous_status, new_status, remarks, changed_by)
         VALUES (:center_id, :prev_occ, :new_occ, :prev_status, :new_status, :remarks, :changed_by)"
    );
    $stmt->execute([
        ':center_id' => $center_id, ':prev_occ' => $prev_occ, ':new_occ' => $new_occ,
        ':prev_status' => $prev_status, ':new_status' => $new_status,
        ':remarks' => $remarks !== null && $remarks !== '' ? mb_substr($remarks, 0, 255) : null,
        ':changed_by' => $_SESSION['user_id'] ?? null,
    ]);
    return intval($conn->lastInsertId());
}

/** Validates the editable fields; returns [array $clean, ?string $error]. */
function evac_validate_fields(array $data): array
{
    require_once __DIR__ . '/puroks.php';
    require_once __DIR__ . '/../utils/boundary_validator.php';

    $name = trim((string) ($data['name'] ?? ''));
    $address = trim((string) ($data['address'] ?? ''));
    $purok = validate_purok_input($data['purok'] ?? '');
    $capacity = $data['capacity'] ?? null;
    $facilities = trim((string) ($data['facilities'] ?? ''));
    $contact_person = trim((string) ($data['contact_person'] ?? ''));
    $contact_number = trim((string) ($data['contact_number'] ?? ''));

    if ($name === '' || mb_strlen($name) > 150) return [null, "Please enter the evacuation center's name (up to 150 characters)."];
    if ($address === '' || mb_strlen($address) > 255) return [null, "Please enter the address or location (up to 255 characters)."];
    if ($purok === null) return [null, "Please select a valid purok."];
    if (!is_numeric($capacity) || intval($capacity) != $capacity || intval($capacity) < 1 || intval($capacity) > 100000) {
        return [null, "Capacity must be a whole number of at least 1."];
    }
    if (mb_strlen($facilities) > 2000) return [null, "Facilities must be 2,000 characters or fewer."];
    if (mb_strlen($contact_person) > 150) return [null, "Contact person must be 150 characters or fewer."];
    if ($contact_number !== '' && !preg_match('/^[0-9+\-\s()]{7,20}$/', $contact_number)) {
        return [null, "Please enter a valid contact number."];
    }
    $coord = validate_household_coordinates($data['latitude'] ?? null, $data['longitude'] ?? null);
    if (!$coord['valid']) return [null, $coord['message']];

    $lat = ($data['latitude'] ?? '') === '' || $data['latitude'] === null ? null : floatval($data['latitude']);
    $lng = ($data['longitude'] ?? '') === '' || $data['longitude'] === null ? null : floatval($data['longitude']);

    return [[
        'name' => $name, 'address' => $address, 'purok' => $purok, 'capacity' => intval($capacity),
        'facilities' => $facilities !== '' ? $facilities : null,
        'contact_person' => $contact_person !== '' ? $contact_person : null,
        'contact_number' => $contact_number !== '' ? $contact_number : null,
        'latitude' => $lat, 'longitude' => $lng,
    ], null];
}
