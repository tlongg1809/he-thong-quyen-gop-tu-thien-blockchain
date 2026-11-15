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

// Kết nối MySQL
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
    http_response_code(200); // Trả về 200 kèm mảng rỗng để không crash frontend
    echo json_encode([
        "status" => "warning",
        "data"   => [],
        "message" => "Không thể kết nối CSDL MySQL."
    ]);
    exit;
}
$conn->set_charset("utf8mb4");

// Kiểm tra bảng tồn tại
$checkTable = $conn->query("SHOW TABLES LIKE 'campaigns_metadata'");
if ($checkTable->num_rows === 0) {
    echo json_encode(["status" => "success", "data" => []]);
    $conn->close();
    exit;
}

$campaignId = isset($_GET['campaign_id']) ? intval($_GET['campaign_id']) : null;

if ($campaignId !== null && $campaignId >= 0) {
    $stmt = $conn->prepare("SELECT * FROM campaigns_metadata WHERE campaign_id = ? ORDER BY id DESC LIMIT 1");
    $stmt->bind_param("i", $campaignId);
    $stmt->execute();
    $result = $stmt->get_result();
    $data = $result->fetch_assoc();
    $stmt->close();
    echo json_encode(["status" => "success", "data" => $data]);
} else {
    // Lấy tất cả metadata chiến dịch
    $sql = "SELECT * FROM campaigns_metadata ORDER BY id DESC";
    $result = $conn->query($sql);
    $list = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $list[] = $row;
        }
    }
    echo json_encode(["status" => "success", "data" => $list]);
}

$conn->close();
exit;
