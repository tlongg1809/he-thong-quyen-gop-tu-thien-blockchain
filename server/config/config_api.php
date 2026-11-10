<?php
// server/config_api.php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

// Kiểm tra file .env trong thư mục server/ trước, nếu không có thì tìm ở thư mục gốc
$envPath = __DIR__ . '/.env';
if (!file_exists($envPath)) {
    $envPath = dirname(__DIR__) . '/.env';
}

$contractAddress = null;

if (file_exists($envPath)) {
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if (empty($line) || strpos($line, '#') === 0) continue;
        if (strpos($line, '=') !== false) {
            list($key, $value) = explode('=', $line, 2);
            if (trim($key) === 'CONTRACT_ADDRESS') {
                $contractAddress = trim($value, " \t\n\r\0\x0B\"'");
                break;
            }
        }
    }
}

echo json_encode([
    "contractAddress" => $contractAddress
]);