<?php
/** Phase 20 — create (no event_id) or update (event_id) a disaster event. Admin only. */
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/affected_areas.php';

require_login(['admin']);

if (!in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT'], true)) {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}
$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];

$conn = (new Database())->connect();
phase20_require_tables($conn);

$bad = function ($m, $code = 400) { http_response_code($code); echo json_encode(["success" => false, "message" => $m]); exit(); };
$text = fn($k, $max) => is_string($data[$k] ?? null) ? mb_substr(trim($data[$k]), 0, $max) : '';
$event_id = isset($data['event_id']) ? input_positive_int($data['event_id']) : 0;
$name = $text('event_name', 150);
$type = $text('disaster_type', 50);
$start = $text('start_date', 10);
$end = $text('end_date', 10);
$description = $text('description', 5000);

$valid_date = function ($d) { $x = DateTime::createFromFormat('Y-m-d', $d); return $x && $x->format('Y-m-d') === $d; };
if ($name === '') $bad("Please enter the event name.");
if ($type === '') $bad("Please select the disaster type.");
$t = $conn->prepare("SELECT 1 FROM disaster_types WHERE type_name = :t AND is_active = 1");
$t->execute([':t' => $type]);
if (!$t->fetch()) $bad("Please select an active disaster type.");
if (!$valid_date($start)) $bad("Please enter a valid start date.");
if ($end !== '' && !$valid_date($end)) $bad("Please enter a valid end date, or leave it blank if the event is ongoing.");
if ($end !== '' && $end < $start) $bad("The end date cannot be before the start date.");

$dup = $conn->prepare("SELECT event_id FROM disaster_events WHERE event_name = :n AND event_id <> :id");
$dup->execute([':n' => $name, ':id' => $event_id]);
if ($dup->fetch()) $bad("An event with this name already exists.", 409);

$params = [':n' => $name, ':t' => $type, ':s' => $start, ':e' => $end === '' ? null : $end, ':d' => $description === '' ? null : $description];
if ($event_id) {
    $params[':id'] = $event_id;
    $u = $conn->prepare("UPDATE disaster_events SET event_name = :n, disaster_type = :t, start_date = :s, end_date = :e, description = :d WHERE event_id = :id");
    $u->execute($params);
    $chk = $conn->prepare("SELECT 1 FROM disaster_events WHERE event_id = :id");
    $chk->execute([':id' => $event_id]);
    if (!$chk->fetch()) $bad("The event could not be found. Please refresh the page.", 404);
    log_action($conn, "Disaster event updated", "event_id: $event_id ($name)");
    echo json_encode(["success" => true, "message" => "Disaster event updated.", "event_id" => $event_id]);
} else {
    $params[':by'] = $_SESSION['user_id'];
    $i = $conn->prepare("INSERT INTO disaster_events (event_name, disaster_type, start_date, end_date, description, created_by) VALUES (:n, :t, :s, :e, :d, :by)");
    $i->execute($params);
    $new_id = intval($conn->lastInsertId());
    log_action($conn, "Disaster event created", "event_id: $new_id ($name)");
    http_response_code(201);
    echo json_encode(["success" => true, "message" => "Disaster event created.", "event_id" => $new_id]);
}
