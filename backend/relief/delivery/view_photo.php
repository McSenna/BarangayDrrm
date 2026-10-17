<?php
require_once __DIR__ . '/../../config/cors.php';
require_login(['admin', 'relief_personnel']);
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); exit(); }
$path = $_GET['path'] ?? '';
if (!is_string($path) || !preg_match('#^uploads/delivery/[0-9]+/[a-zA-Z0-9_.-]+$#D', $path)) { http_response_code(404); exit(); }
$conn = (new Database())->connect();
$stmt = $conn->prepare('SELECT report_id FROM delivery_report_photos WHERE file_path = ?');
$stmt->execute([$path]);
$reportId = $stmt->fetchColumn();
if (!$reportId) { http_response_code(404); exit(); }
staff_require_delivery($conn, $reportId);
$root = realpath(__DIR__ . '/../../uploads/delivery');
$file = realpath(__DIR__ . '/../../' . $path);
if (!$root || !$file || !str_starts_with($file, $root . DIRECTORY_SEPARATOR) || !is_file($file)) { http_response_code(404); exit(); }
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
header('Content-Type: ' . (new finfo(FILEINFO_MIME_TYPE))->file($file));
header('Content-Disposition: inline; filename="' . basename($file) . '"');
readfile($file);
