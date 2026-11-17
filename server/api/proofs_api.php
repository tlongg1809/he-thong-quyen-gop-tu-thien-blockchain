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
    if (!empty($input['tx_hash']) && isset($input['campaign_id'])) {
        $campaign_id    = intval($input['campaign_id']);
        $tx_hash        = trim($input['tx_hash']);
        $supplier_name  = trim($input['supplier_name'] ?? 'Đơn vị cung ứng thực tế');
        $invoice_number = trim($input['invoice_number'] ?? ('HD-' . date('Ymd') . '-' . substr($tx_hash, 2, 4)));
        $description    = trim($input['description'] ?? ('Giải ngân thực tế cho chiến dịch #' . $campaign_id));
        $ipfs_hash      = trim($input['ipfs_hash'] ?? ($env['SAMPLE_IPFS_CID'] ?? ''));

        // Chèn mới hoặc cập nhật nếu đã tồn tại tx_hash (tránh duplicate key error)
        $stmt = $conn->prepare("INSERT INTO disbursement_proofs (tx_hash, campaign_id, supplier_name, invoice_number, description, ipfs_hash) 
                                VALUES (?, ?, ?, ?, ?, ?)
                                ON DUPLICATE KEY UPDATE 
                                campaign_id = VALUES(campaign_id),
                                supplier_name = VALUES(supplier_name),
                                invoice_number = VALUES(invoice_number),
                                description = VALUES(description),
                                ipfs_hash = VALUES(ipfs_hash)");
        $stmt->bind_param(
            "sissss",
            $tx_hash,
            $campaign_id,
            $supplier_name,
            $invoice_number,
            $description,
            $ipfs_hash
        );
        if ($stmt->execute()) {
            echo json_encode(["status" => "success", "id" => $stmt->insert_id ?: true, "tx_hash" => $tx_hash]);
        } else {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => $stmt->error]);
        }
        $stmt->close();
    } else {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Thiếu tham số bắt buộc tx_hash hoặc campaign_id"]);
    }
}

$conn->close();
exit;