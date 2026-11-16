<?php
error_reporting(0);
ini_set('display_errors', 0);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 1. Nạp cấu hình từ .env
$envPath = dirname(__DIR__) . '/.env';
$paths = [
    $envPath,
    dirname(dirname(__DIR__)) . '/.env',
    __DIR__ . '/.env'
];

$env = [];
foreach ($paths as $p) {
    if (file_exists($p)) {
        $lines = file($p, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (strpos(trim($line), '#') === 0 || strpos($line, '=') === false) continue;
            list($key, $val) = explode('=', $line, 2);
            $env[trim($key)] = trim($val, " \t\n\r\0\x0B\"'");
        }
        break;
    }
}

$host = $env['DB_HOST'] ?? 'localhost';
$user = $env['DB_USER'] ?? 'root';
$pass = $env['DB_PASSWORD'] ?? '';
$db   = $env['DB_NAME'] ?? 'charity_db';

// 2. Kết nối MySQL
$conn = @new mysqli($host, $user, $pass, $db);
if ($conn->connect_error) {
    echo json_encode([
        "status"  => "warning",
        "data"    => [],
        "message" => "Lỗi kết nối cơ sở dữ liệu MySQL Off-chain."
    ]);
    exit;
}
$conn->set_charset("utf8mb4");

// Kiểm tra bảng campaigns_metadata tồn tại
$check = $conn->query("SHOW TABLES LIKE 'campaigns_metadata'");
if ($check->num_rows === 0) {
    echo json_encode(["status" => "success", "data" => []]);
    $conn->close();
    exit;
}

$campaignId = isset($_GET['campaign_id']) ? intval($_GET['campaign_id']) : null;

if ($campaignId !== null && $campaignId >= 0) {
    // Lấy metadata theo campaign_id cụ thể
    $stmt = $conn->prepare("SELECT * FROM campaigns_metadata WHERE campaign_id = ? ORDER BY id DESC LIMIT 1");
    if ($stmt) {
        $stmt->bind_param("i", $campaignId);
        $stmt->execute();
        $res = $stmt->get_result();
        $row = $res->fetch_assoc();
        $stmt->close();
        echo json_encode(["status" => "success", "data" => $row]);
    } else {
        echo json_encode(["status" => "error", "message" => $conn->error]);
    }
} else {
    // Lấy toàn bộ danh sách metadata chiến dịch
    $sql = "SELECT * FROM campaigns_metadata ORDER BY id DESC";
    $res = $conn->query($sql);
    $list = [];
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $list[] = $row;
        }
    }
    echo json_encode(["status" => "success", "data" => $list]);
}

$conn->close();
exit;
