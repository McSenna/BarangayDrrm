<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$data = json_decode(file_get_contents("php://input"), true);

$donor_name = trim($data['donor_name'] ?? '');
$donor_contact = trim($data['donor_contact'] ?? '');
$item_id = intval($data['item_id'] ?? 0);
$quantity = intval($data['quantity'] ?? 0);
$donation_date = $data['donation_date'] ?? date('Y-m-d');
$remarks = trim($data['remarks'] ?? '');

if ($donor_name === '' || $item_id <= 0 || $quantity <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter the donor name, select an item, and enter a quantity greater than 0."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

try {
    $conn->beginTransaction();

    $check = $conn->prepare("SELECT quantity FROM relief_items WHERE item_id = :item_id FOR UPDATE");
    $check->execute([':item_id' => $item_id]);
    $item = $check->fetch(PDO::FETCH_ASSOC);

    if (!$item) {
        $conn->rollBack();
        http_response_code(404);
        echo json_encode(["success" => false, "message" => "Relief item not found."]);
        exit();
    }

    // Record the donation
    $donation_stmt = $conn->prepare(
        "INSERT INTO donations (donor_name, donor_contact, item_id, quantity, donation_date, remarks, recorded_by)
         VALUES (:donor_name, :donor_contact, :item_id, :quantity, :donation_date, :remarks, :recorded_by)"
    );
    $donation_stmt->execute([
        ':donor_name' => $donor_name,
        ':donor_contact' => $donor_contact,
        ':item_id' => $item_id,
        ':quantity' => $quantity,
        ':donation_date' => $donation_date,
        ':remarks' => $remarks,
        ':recorded_by' => $_SESSION['user_id'],
    ]);
    $donation_id = $conn->lastInsertId();

    // Add the donated quantity into inventory
    $update_stmt = $conn->prepare("UPDATE relief_items SET quantity = quantity + :quantity WHERE item_id = :item_id");
    $update_stmt->execute([':quantity' => $quantity, ':item_id' => $item_id]);

    $resulting_quantity = intval($item['quantity']) + $quantity;

    // Log the transaction
    $log = $conn->prepare(
        "INSERT INTO inventory_logs (item_id, log_type, quantity_change, resulting_quantity, reference, performed_by)
         VALUES (:item_id, 'Donation', :qty, :resulting_quantity, :reference, :performed_by)"
    );
    $log->execute([
        ':item_id' => $item_id,
        ':qty' => $quantity,
        ':resulting_quantity' => $resulting_quantity,
        ':reference' => "Donor: $donor_name",
        ':performed_by' => $_SESSION['user_id'],
    ]);

    $conn->commit();

    log_action($conn, "Donation recorded", "donor: $donor_name, item_id: $item_id, qty: $quantity");

    http_response_code(201);
    echo json_encode(["success" => true, "message" => "Donation recorded and added to inventory.", "donation_id" => $donation_id]);
} catch (Exception $e) {
    $conn->rollBack();
    http_response_code(500);
    error_log("inventory/donations/add_donation.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't record the donation. Please try again."]);
}
