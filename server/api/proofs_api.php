<?php
error_reporting(0);
ini_set('display_errors', 0);

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

// 1. Nạp cấu hình từ file .env
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

// 2. Kết nối MySQL
$conn = new mysqli($host, $user, $pass, $db);
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Lỗi kết nối CSDL Off-chain"]);
    exit;
}
$conn->set_charset("utf8mb4");

// 3. Xử lý lấy danh sách chứng từ theo campaign_id (GET)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $campaignId = isset($_GET['campaign_id']) ? intval($_GET['campaign_id']) : -1;

    if ($campaignId >= 0) {
        $stmt = $conn->prepare("SELECT * FROM disbursement_proofs WHERE campaign_id = ? ORDER BY created_at DESC");
        $stmt->bind_param("i", $campaignId);
    } else {
        $stmt = $conn->prepare("SELECT * FROM disbursement_proofs ORDER BY created_at DESC");
    }

    $stmt->execute();
    $result = $stmt->get_result();
    $proofs = [];
    while ($row = $result->fetch_assoc()) {
        $proofs[] = $row;
    }

    echo json_encode(["status" => "success", "data" => $proofs]);
    $stmt->close();
}

// 4. Xử lý lưu chứng từ mới khi giải ngân (POST)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents("php://input"), true);
    if (!empty($input['tx_hash']) && isset($input['campaign_id']) && !empty($input['ipfs_hash'])) {
        $stmt = $conn->prepare("INSERT INTO disbursement_proofs (tx_hash, campaign_id, supplier_name, invoice_number, description, ipfs_hash) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->bind_param(
            "sissss",
            $input['tx_hash'],
            $input['campaign_id'],
            $input['supplier_name'],
            $input['invoice_number'],
            $input['description'],
            $input['ipfs_hash']
        );
        if ($stmt->execute()) {
            echo json_encode(["status" => "success", "id" => $stmt->insert_id]);
        } else {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => $stmt->error]);
        }
        $stmt->close();
    }
}

$conn->close();
exit;