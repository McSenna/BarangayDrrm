<?php
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin', 'relief_personnel']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$report_id = intval($_POST['report_id'] ?? 0);
if ($report_id <= 0) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The delivery report could not be found. Please refresh the page and try again."]);
    exit();
}

$database = new Database();
$conn = $database->connect();

// Confirm the report exists and, for relief personnel, that they're the ones who submitted it
$stmt = $conn->prepare("SELECT submitted_by FROM delivery_reports WHERE report_id = :report_id");
$stmt->execute([':report_id' => $report_id]);
$report = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$report) {
    http_response_code(404);
    echo json_encode(["success" => false, "message" => "Delivery report not found."]);
    exit();
}

if ($_SESSION['role'] === 'relief_personnel' && intval($report['submitted_by']) !== intval($_SESSION['user_id'])) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "You can only attach photos to your own delivery reports."]);
    exit();
}

if (empty($_FILES['photos'])) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "No photos were uploaded."]);
    exit();
}

$allowed_ext = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
$max_size = 5 * 1024 * 1024; // 5MB per photo
$max_photos = 5;

/**
 * Phase 17 Security Fix 5 — same content validation as Security Fix 4
 * (backend/disasters/upload_photos.php), applied to delivery photos.
 * The filename extension and the browser-supplied MIME type are NOT trusted;
 * the uploaded temp file itself is inspected before it is stored.
 * Allowed real image types => [stored extension, MIME, GD decoder].
 */
$allowed_image_types = [
    IMAGETYPE_JPEG => ['ext' => 'jpg',  'mime' => 'image/jpeg', 'decoder' => 'imagecreatefromjpeg'],
    IMAGETYPE_PNG  => ['ext' => 'png',  'mime' => 'image/png',  'decoder' => 'imagecreatefrompng'],
    IMAGETYPE_WEBP => ['ext' => 'webp', 'mime' => 'image/webp', 'decoder' => 'imagecreatefromwebp'],
    IMAGETYPE_GIF  => ['ext' => 'gif',  'mime' => 'image/gif',  'decoder' => 'imagecreatefromgif'], // was already allowed
];

/**
 * Returns the matching $allowed_image_types entry if $path is genuinely an
 * allowed, readable image; otherwise null.
 *   1. finfo magic-byte MIME must be an allowed image MIME (when fileinfo is available)
 *   2. getimagesize() must parse a real image header with valid dimensions,
 *      of an allowed type that agrees with finfo
 *   3. the image must fully decode with GD (catches corrupted/truncated files and
 *      "valid header + junk" files). Skipped only if GD is unavailable or the
 *      image is too large to decode within PHP's memory_limit.
 */
function inspect_uploaded_image($path, $allowed_image_types)
{
    $allowed_mimes = array_column($allowed_image_types, 'mime');

    $finfo_mime = null;
    if (class_exists('finfo')) {
        $finfo_mime = (new finfo(FILEINFO_MIME_TYPE))->file($path);
        if (!in_array($finfo_mime, $allowed_mimes, true)) {
            return null;
        }
    }

    $info = @getimagesize($path);
    if ($info === false || !isset($allowed_image_types[$info[2]]) || $info[0] <= 0 || $info[1] <= 0) {
        return null;
    }
    $type = $allowed_image_types[$info[2]];
    if ($finfo_mime !== null && $finfo_mime !== $type['mime']) {
        return null;
    }

    if (function_exists($type['decoder'])) {
        $limit = ini_get('memory_limit');
        $limit_bytes = ($limit === '' || $limit === '-1') ? PHP_INT_MAX : memory_limit_to_bytes($limit);
        $needed = $info[0] * $info[1] * 5 + 16 * 1024 * 1024; // ~4-5 bytes/pixel + headroom
        if (memory_get_usage() + $needed < $limit_bytes) {
            // Strict decoding: GD normally pads truncated/corrupt JPEG data and only
            // raises a warning (gd.jpeg_ignore_warning=1). Turn that off for this
            // check (bundled GD, e.g. XAMPP) AND treat any decoder warning as a
            // failure (system libgd ignores the ini setting).
            $previous = ini_set('gd.jpeg_ignore_warning', '0');
            $decode_warning = false;
            set_error_handler(function () use (&$decode_warning) {
                $decode_warning = true;
                return true; // swallow it; nothing is printed into the JSON response
            });
            $img = $type['decoder']($path);
            restore_error_handler();
            if ($previous !== false) {
                ini_set('gd.jpeg_ignore_warning', $previous);
            }
            if ($img === false || $decode_warning) {
                return null;
            }
            unset($img); // imagedestroy() is a no-op since PHP 8.0 (deprecated in 8.5)
        }
    }

    return $type;
}

/** "128M" -> bytes (for memory_limit). */
function memory_limit_to_bytes($value)
{
    $value = trim($value);
    $unit = strtolower(substr($value, -1));
    $num = (float) $value;
    switch ($unit) {
        case 'g': return (int) ($num * 1024 * 1024 * 1024);
        case 'm': return (int) ($num * 1024 * 1024);
        case 'k': return (int) ($num * 1024);
        default:  return (int) $num;
    }
}

$upload_dir = __DIR__ . "/../../uploads/delivery/$report_id/";
if (!is_dir($upload_dir)) {
    mkdir($upload_dir, 0755, true);
}

$files = $_FILES['photos'];
$fileCount = is_array($files['name']) ? count($files['name']) : 1;

$existing = $conn->prepare("SELECT COUNT(*) FROM delivery_report_photos WHERE report_id = :report_id");
$existing->execute([':report_id' => $report_id]);
$existing_count = intval($existing->fetchColumn());

if ($existing_count + $fileCount > $max_photos) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "A delivery report can have at most $max_photos photos ($existing_count already uploaded)."]);
    exit();
}

$saved = [];
$errors = [];

for ($i = 0; $i < $fileCount; $i++) {
    $name = is_array($files['name']) ? $files['name'][$i] : $files['name'];
    $tmp_name = is_array($files['tmp_name']) ? $files['tmp_name'][$i] : $files['tmp_name'];
    $size = is_array($files['size']) ? $files['size'][$i] : $files['size'];
    $error = is_array($files['error']) ? $files['error'][$i] : $files['error'];

    if ($error !== UPLOAD_ERR_OK) {
        $errors[] = "$name: could not be uploaded. Please try again.";
        continue;
    }
    if ($size > $max_size) {
        $errors[] = "$name: file is larger than 5 MB. Please choose a smaller photo.";
        continue;
    }

    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!in_array($ext, $allowed_ext)) {
        $errors[] = "$name: file type not supported. Please use JPG, PNG, WebP or GIF.";
        continue;
    }

    // Inspect the actual uploaded content before storing anything.
    if (!is_uploaded_file($tmp_name)) {
        $errors[] = "$name: upload error.";
        continue;
    }
    $image_type = inspect_uploaded_image($tmp_name, $allowed_image_types);
    if ($image_type === null) {
        $errors[] = "$name: is not a valid JPEG, PNG, WebP or GIF image.";
        continue;
    }
    // Keep the original extension when it matches the real type (.jpeg stays .jpeg);
    // otherwise store with the extension of the detected type.
    $real_exts = $image_type['ext'] === 'jpg' ? ['jpg', 'jpeg'] : [$image_type['ext']];
    if (!in_array($ext, $real_exts, true)) {
        $ext = $image_type['ext'];
    }

    $safe_name = bin2hex(random_bytes(8)) . '.' . $ext;
    $destination = $upload_dir . $safe_name;

    if (move_uploaded_file($tmp_name, $destination)) {
        $relative_path = "uploads/delivery/$report_id/$safe_name";
        $insert = $conn->prepare("INSERT INTO delivery_report_photos (report_id, file_path) VALUES (:report_id, :file_path)");
        $insert->execute([':report_id' => $report_id, ':file_path' => $relative_path]);
        $saved[] = ['photo_id' => $conn->lastInsertId(), 'file_path' => $relative_path];
    } else {
        $errors[] = "$name: could not be saved.";
    }
}

echo json_encode(["success" => true, "message" => count($saved) . " photo(s) uploaded successfully.", "data" => $saved, "errors" => $errors]);
