<?php
error_reporting(0);
ini_set('display_errors', 0);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Phương thức không được hỗ trợ. Vui lòng dùng POST."]);
    exit;
}

// 1. Nhận dữ liệu JSON hoặc Form POST
$input = json_decode(file_get_contents("php://input"), true);
if (!$input) {
    $input = $_POST;
}

$recordId    = isset($input['record_id']) ? intval($input['record_id']) : null;
$campaignId  = isset($input['campaign_id']) ? intval($input['campaign_id']) : null;
$txHash      = isset($input['tx_hash']) ? trim($input['tx_hash']) : null;
$imageSha256 = isset($input['image_sha256']) ? trim($input['image_sha256']) : null;

if ($campaignId === null || empty($txHash)) {
    http_response_code(400);
    echo json_encode([
        "status" => "error",
        "message" => "Thiếu thông tin campaign_id hoặc tx_hash để đồng bộ."
    ]);
    exit;
}

// 2. Kết nối CSDL MySQL
$envPath = dirname(__DIR__) . '/.env';
$env = [];
if (file_exists($envPath)) {
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0 || strpos($line, '=') === false) continue;
        list($key, $val) = explode('=', $line, 2);
        $env[trim($key)] = trim($val, " \t\n\r\0\x0B\"'");
    }
}

$host = $env['DB_HOST'] ?? 'localhost';
$user = $env['DB_USER'] ?? 'root';
$pass = $env['DB_PASSWORD'] ?? '';
$db   = $env['DB_NAME'] ?? 'charity_db';

$conn = @new mysqli($host, $user, $pass, $db);
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode([
        "status" => "error",
        "message" => "Lỗi kết nối cơ sở dữ liệu MySQL: " . $conn->connect_error
    ]);
    exit;
}
$conn->set_charset("utf8mb4");

$updated = false;

// Cập nhật theo record_id nếu có
if ($recordId && $recordId > 0) {
    $stmt = $conn->prepare("UPDATE campaigns_metadata SET campaign_id = ?, tx_hash = ? WHERE id = ?");
    if ($stmt) {
        $stmt->bind_param("isi", $campaignId, $txHash, $recordId);
        $updated = $stmt->execute();
        $stmt->close();
    }
} elseif (!empty($imageSha256)) {
    // Fallback cập nhật theo image_sha256
    $stmt = $conn->prepare("UPDATE campaigns_metadata SET campaign_id = ?, tx_hash = ? WHERE image_sha256 = ? ORDER BY id DESC LIMIT 1");
    if ($stmt) {
        $stmt->bind_param("iss", $campaignId, $txHash, $imageSha256);
        $updated = $stmt->execute();
        $stmt->close();
    }
} else {
    // Cập nhật bản ghi mới nhất chưa có campaign_id
    $stmt = $conn->prepare("UPDATE campaigns_metadata SET campaign_id = ?, tx_hash = ? WHERE campaign_id IS NULL ORDER BY id DESC LIMIT 1");
    if ($stmt) {
        $stmt->bind_param("is", $campaignId, $txHash);
        $updated = $stmt->execute();
        $stmt->close();
    }
}

$conn->close();

if ($updated) {
    echo json_encode([
        "status"      => "success",
        "success"     => true,
        "campaign_id" => $campaignId,
        "tx_hash"     => $txHash,
        "message"     => "Đã đồng bộ thành công thông tin chiến dịch On-chain vào MySQL."
    ]);
} else {
    echo json_encode([
        "status"  => "warning",
        "message" => "Không tìm thấy bản ghi phù hợp để cập nhật hoặc dữ liệu không thay đổi."
    ]);
}
exit;
