<?php
/**
 * Shared bootstrap: CORS headers, JSON response type, and session start.
 * Every API file should require_once this FIRST, before any output.
 */

require_once __DIR__ . '/app_config.php';

// Never send PHP errors, file paths or stack traces to the browser, even when
// php.ini has display_errors=On (the XAMPP default). Errors still go to the
// PHP error log. An unexpected exception becomes a short JSON message:
// wrong-type input (e.g. an array where text is expected) -> 400, else 500.
ini_set('display_errors', '0');
ini_set('log_errors', '1');
set_exception_handler(function (Throwable $e) {
    error_log('Unhandled ' . get_class($e) . ': ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    $bad_input = $e instanceof TypeError || $e instanceof ValueError;
    if (!headers_sent()) {
        http_response_code($bad_input ? 400 : 500);
        header("Content-Type: application/json; charset=UTF-8");
    }
    echo json_encode([
        "success" => false,
        "message" => $bad_input
            ? "Some of the information sent is not in the expected format. Please refresh the page and try again."
            : "Something went wrong while processing your request. Please try again.",
    ]);
});

// Allowed browser origins come from central configuration (Phase 19) instead
// of a hard-coded localhost URL. Only an origin on the list is echoed back, so
// credentials (the session cookie) are never shared with an unknown site.
// Same-origin requests (production build served from the same domain) need no
// CORS header at all and keep working whether or not they send an Origin.
$request_origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($request_origin !== '' && in_array($request_origin, app_config('CORS_ALLOWED_ORIGINS'), true)) {
    header("Access-Control-Allow-Origin: " . $request_origin);
    header("Vary: Origin");
}
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json; charset=UTF-8");

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Phase 25 (audit F-SEC-02): a state-changing request from a browser page on
// another site is refused. Requests from the configured frontend origins, from
// the same host (production build), and without an Origin header (scripts,
// curl, same-origin GET) are unaffected.
if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT', 'PATCH', 'DELETE'], true) && $request_origin !== '') {
    $origin_host = parse_url($request_origin, PHP_URL_HOST);
    $origin_port = parse_url($request_origin, PHP_URL_PORT);
    $origin_hostport = $origin_host . ($origin_port ? ":$origin_port" : '');
    $same_host = $origin_host !== null && in_array($_SERVER['HTTP_HOST'] ?? '', [$origin_host, $origin_hostport], true);
    if (!$same_host && !in_array($request_origin, app_config('CORS_ALLOWED_ORIGINS'), true)) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "This request came from a page that is not allowed to change data in this system."]);
        exit();
    }
}

session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'samesite' => 'Lax',
    'httponly' => true,                           // prevents JavaScript from reading the session cookie (XSS mitigation)
    // only require HTTPS if actually running over HTTPS (directly, or behind Hostinger's proxy)
    'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'),
]);
session_start();

// Phase 25 (audit F-SEC-03): server-side idle timeout. A session unused for
// SESSION_IDLE_MINUTES (default 30) is ended on the server, even if the
// browser tab was left open and never ran its own idle logout.
if (isset($_SESSION['user_id'])) {
    $idle_limit = max(5, intval(app_config('SESSION_IDLE_MINUTES') ?: 30)) * 60;
    if (isset($_SESSION['last_activity']) && (time() - intval($_SESSION['last_activity'])) > $idle_limit) {
        $_SESSION = [];
        session_destroy();
        session_start();
        $_SESSION['idle_expired'] = true;
    } else {
        $_SESSION['last_activity'] = time();
    }
}

/**
 * Reject the request unless a session user exists.
 * Optionally restrict to a list of allowed roles.
 */
function require_login($allowed_roles = [])
{
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(["success" => false, "message" => "Your session has expired. Please log in again."]);
        exit();
    }
    // Re-check the account on every protected request: a session created before
    // an Administrator deactivated (or deleted) the account must stop working
    // immediately, and the role used for authorization comes from the database,
    // not from what the session remembered at login time.
    require_once __DIR__ . '/database.php';
    require_once __DIR__ . '/../users/registration.php';
    $auth_conn = (new Database())->connect();
    $account = $auth_conn->prepare("SELECT role, is_active FROM users WHERE user_id = :user_id");
    $account->execute([':user_id' => $_SESSION['user_id']]);
    $row = $account->fetch(PDO::FETCH_ASSOC);
    if (!$row || intval($row['is_active']) === 0 || registration_status($auth_conn, $_SESSION['user_id']) !== 'approved') {
        $_SESSION = [];
        session_destroy();
        http_response_code(401);
        echo json_encode(["success" => false, "message" => "Your account does not currently have access. Please contact the barangay office for assistance."]);
        exit();
    }
    $_SESSION['role'] = $row['role'];
    require_once __DIR__ . '/../lib/field_scope.php';
    if (staff_has_purok_scope()) $_SESSION['assigned_purok'] = field_assigned_purok($auth_conn);
    else unset($_SESSION['assigned_purok']);
    if (!empty($allowed_roles) && !in_array($_SESSION['role'], $allowed_roles)) {
        http_response_code(403);
        echo json_encode(["success" => false, "message" => "You do not have permission to view this page."]);
        exit();
    }
}

/**
 * Phase 21 — resident scope revision. Residents no longer submit disaster
 * reports, relief requests or relief feedback through the portal. The old
 * resident-only endpoints stay in place (nothing is deleted) but refuse every
 * call with 403, so the function cannot be used even by calling the API
 * directly. Existing records remain available to authorized personnel.
 */
function resident_function_disabled(string $what)
{
    require_login();
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "$what is not available to resident accounts. Please contact the barangay office or authorized personnel."]);
    exit();
}

/** Small helper to record an audit log entry. */
function log_action($conn, $action, $details = "")
{
    $user_id = $_SESSION['user_id'] ?? null;
    $stmt = $conn->prepare("INSERT INTO audit_logs (user_id, action, details) VALUES (:user_id, :action, :details)");
    $stmt->execute([
        ':user_id' => $user_id,
        ':action' => $action,
        ':details' => $details,
    ]);
}
