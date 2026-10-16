<?php
/**
 * Database connection (PDO) for barangay_disaster_db.
 *
 * Credentials now come from central configuration (config/app_config.php,
 * Phase 19). Local XAMPP defaults are unchanged (localhost / root / empty
 * password); production values go in config/app_config.local.php or
 * environment variables — never in this file or in frontend code.
 */
require_once __DIR__ . '/app_config.php';

class Database
{
    public $conn;

    public function connect()
    {
        $this->conn = null;
        try {
            $this->conn = new PDO(
                "mysql:host=" . app_config('DB_HOST') . ";dbname=" . app_config('DB_NAME') . ";charset=utf8mb4",
                app_config('DB_USER'),
                app_config('DB_PASS')
            );
            $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            // Phase 19: session time zone from configuration (Philippine time by default).
            $tz = app_config('DB_TIME_ZONE');
            if ($tz && preg_match('/^[+-]\d{2}:\d{2}$/', $tz)) {
                $this->conn->exec("SET time_zone = '$tz'");
            }
        } catch (PDOException $e) {
            http_response_code(500);
            error_log("Database connection failed: " . $e->getMessage());
            echo json_encode(["success" => false, "message" => "The system is temporarily unavailable. Please try again later."]);
            exit();
        }
        return $this->conn;
    }
}
