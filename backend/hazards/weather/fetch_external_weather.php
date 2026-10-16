<?php
/**
 * Pulls current conditions from an external weather API (OpenWeatherMap by
 * default) and saves them as a weather_logs entry with source = 'API'.
 *
 * This is entirely optional. If backend/config/weather_api_config.php still
 * has API_ENABLED set to false (the default), this endpoint returns a clear
 * message explaining how to turn it on instead of failing silently.
 */

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';

require_login(['admin']);

$config = require __DIR__ . '/../../config/weather_api_config.php';

if (empty($config['API_ENABLED'])) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "Weather data syncing is not set up. Weather observations can still be recorded manually. " .
                      "Please contact the system administrator to enable this feature."
    ]);
    exit();
}

if (empty($config['API_KEY'])) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "Weather syncing is not fully set up. Please contact the system administrator."
    ]);
    exit();
}

if (!function_exists('curl_init')) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Weather syncing is currently unavailable on this server. Please contact the system administrator."
    ]);
    exit();
}

$url = $config['API_URL'] . '?' . http_build_query([
    'lat' => $config['LATITUDE'],
    'lon' => $config['LONGITUDE'],
    'appid' => $config['API_KEY'],
    'units' => 'metric',
]);

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curl_error = curl_error($ch);
curl_close($ch);

if ($response === false || $http_code !== 200) {
    error_log("Weather API error: " . ($curl_error ?: "HTTP $http_code"));
    http_response_code(502);
    echo json_encode([
        "success" => false,
        "message" => "We couldn't connect to the weather service. Please check the internet connection and try again later."
    ]);
    exit();
}

$weather = json_decode($response, true);

// ---- Map the external API's response shape onto our own schema. ----
// If you switch providers, this is the only section you should need to change.
$temperature = $weather['main']['temp'] ?? null;
$rainfall_mm = $weather['rain']['1h'] ?? 0;
$wind_speed_kph = isset($weather['wind']['speed']) ? round($weather['wind']['speed'] * 3.6, 1) : null; // m/s -> kph
$wind_deg = $weather['wind']['deg'] ?? null;
$compass = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
$wind_direction = $wind_deg !== null ? $compass[round($wind_deg / 22.5) % 16] : null;

$condition_map = [
    'Clear' => 'Sunny', 'Clouds' => 'Cloudy', 'Rain' => 'Rainy', 'Drizzle' => 'Rainy',
    'Thunderstorm' => 'Stormy', 'Mist' => 'Foggy', 'Fog' => 'Foggy', 'Haze' => 'Foggy', 'Smoke' => 'Foggy',
];
$owm_main = $weather['weather'][0]['main'] ?? '';
$weather_condition = $condition_map[$owm_main] ?? 'Other';

$database = new Database();
$conn = $database->connect();

$stmt = $conn->prepare(
    "INSERT INTO weather_logs (log_date, log_time, temperature, rainfall_mm, weather_condition, wind_speed_kph, wind_direction, source, remarks, recorded_by)
     VALUES (CURDATE(), CURTIME(), :temperature, :rainfall_mm, :weather_condition, :wind_speed_kph, :wind_direction, 'API', :remarks, :recorded_by)"
);
$stmt->execute([
    ':temperature' => $temperature,
    ':rainfall_mm' => $rainfall_mm,
    ':weather_condition' => $weather_condition,
    ':wind_speed_kph' => $wind_speed_kph,
    ':wind_direction' => $wind_direction,
    ':remarks' => 'Auto-synced from external weather API',
    ':recorded_by' => $_SESSION['user_id'],
]);

log_action($conn, "Weather synced from external API", "temp: $temperature, condition: $weather_condition");

http_response_code(201);
echo json_encode([
    "success" => true,
    "message" => "Weather synced from external API.",
    "weather_id" => $conn->lastInsertId(),
    "data" => [
        'temperature' => $temperature,
        'rainfall_mm' => $rainfall_mm,
        'weather_condition' => $weather_condition,
        'wind_speed_kph' => $wind_speed_kph,
        'wind_direction' => $wind_direction,
    ]
]);
