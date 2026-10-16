<?php
/**
 * CORS check against the running local backend: every allowed dev origin must
 * get Access-Control-Allow-Origin (echoed exactly, never "*") plus
 * Allow-Credentials on GET and on the login preflight; an unknown origin must not.
 *
 * Usage: php tests/cors_dev_origins_test.php [backend_base_url]
 */
$base = rtrim($argv[1] ?? 'http://localhost/barangay-disaster/backend', '/');
$pass = 0; $fail = 0;
$ok = function ($cond, $msg) use (&$pass, &$fail) { $cond ? $pass++ : $fail++; echo ($cond ? 'PASS ' : 'FAIL ') . "$msg\n"; };

function request(string $method, string $url, array $headers): array
{
    $ctx = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'ignore_errors' => true, 'timeout' => 10]]);
    $body = @file_get_contents($url, false, $ctx);
    $out = ['status' => 0, 'headers' => [], 'body' => $body];
    foreach ($http_response_header ?? [] as $h) {
        if (preg_match('#^HTTP/\S+ (\d+)#', $h, $m)) { $out['status'] = intval($m[1]); continue; }
        [$k, $v] = array_map('trim', explode(':', $h, 2) + [1 => '']);
        $out['headers'][strtolower($k)] = $v;
    }
    return $out;
}

$allowed = ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5174'];
$gets = ['hazards/get_public_status.php', 'settings/get_settings.php', 'auth/session.php'];

foreach ($allowed as $origin) {
    foreach ($gets as $ep) {
        $r = request('GET', "$base/$ep", ["Origin: $origin"]);
        $ok($r['status'] === 200 && json_decode((string) $r['body']) !== null, "$origin GET $ep -> 200 with JSON");
        $ok(($r['headers']['access-control-allow-origin'] ?? null) === $origin, "$origin GET $ep -> Allow-Origin echoes the origin");
        $ok(($r['headers']['access-control-allow-credentials'] ?? null) === 'true', "$origin GET $ep -> Allow-Credentials: true");
    }
    $p = request('OPTIONS', "$base/auth/login.php", ["Origin: $origin", 'Access-Control-Request-Method: POST', 'Access-Control-Request-Headers: content-type']);
    $ok($p['status'] >= 200 && $p['status'] < 300, "$origin OPTIONS auth/login.php -> 2xx");
    $ok(($p['headers']['access-control-allow-origin'] ?? null) === $origin, "$origin preflight login -> Allow-Origin echoes the origin");
    $ok(stripos($p['headers']['access-control-allow-methods'] ?? '', 'POST') !== false, "$origin preflight login -> POST allowed");
    $ok(stripos($p['headers']['access-control-allow-headers'] ?? '', 'content-type') !== false, "$origin preflight login -> Content-Type allowed");
}

// An origin that is not on the list must never be granted access, and "*" must never appear.
$r = request('GET', "$base/settings/get_settings.php", ['Origin: http://evil.example']);
$ok(!isset($r['headers']['access-control-allow-origin']), "unknown origin gets no Allow-Origin");
$r = request('GET', "$base/settings/get_settings.php", ['Origin: http://localhost:5174']);
$ok(($r['headers']['access-control-allow-origin'] ?? '') !== '*', "never a wildcard Allow-Origin");

echo "\nCORS DEV ORIGINS TEST: $pass/" . ($pass + $fail) . " passed\n";
exit($fail ? 1 : 0);
