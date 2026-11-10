<?php
// Tắt toàn bộ cảnh báo PHP in ra màn hình gây hỏng JSON
error_reporting(0);
ini_set('display_errors', 0);

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

$contractAddress = null;

// Tìm file .env
$paths = [
    dirname(__DIR__) . '/.env',
    dirname(dirname(__DIR__)) . '/.env',
    __DIR__ . '/.env'
];

foreach ($paths as $p) {
    if (file_exists($p)) {
        $content = file_get_contents($p);
        if (preg_match('/^CONTRACT_ADDRESS\s*=\s*["\']?(0x[a-fA-F0-9]{40})/m', $content, $m)) {
            $contractAddress = $m[1];
        }
        break;
    }
}

// Chỉ in ra đúng chuỗi JSON, không có ký tự HTML hay BOM nào khác
echo json_encode(["contractAddress" => $contractAddress]);
exit;