<?php
// PHP built-in server equivalent of the report-photo Apache rewrite.
// From the project root: php -S 127.0.0.1:8080 -t . backend/dev_router.php
if (PHP_SAPI !== 'cli-server') { http_response_code(403); exit(); }
$route = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '');
if (preg_match('#^/backend/uploads/reports/(.+)$#', $route, $match)) {
    $_GET['path'] = 'uploads/reports/' . $match[1];
    require __DIR__ . '/disasters/view_photo.php';
    return true;
}
if (preg_match('#^/backend/uploads/delivery/(.+)$#', $route, $match)) {
    $_GET['path'] = 'uploads/delivery/' . $match[1];
    require __DIR__ . '/relief/delivery/view_photo.php';
    return true;
}
return false;
