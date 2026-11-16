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

// 1. Kiểm tra file upload
$fileField = null;
if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
    $fileField = 'image';
} elseif (isset($_FILES['campaign_image']) && $_FILES['campaign_image']['error'] === UPLOAD_ERR_OK) {
    $fileField = 'campaign_image';
}

if (!$fileField) {
    http_response_code(400);
    echo json_encode([
        "status" => "error",
        "message" => "Không tìm thấy file ảnh tải lên hoặc file bị lỗi. Vui lòng chọn file ảnh hợp lệ."
    ]);
    exit;
}

$file = $_FILES[$fileField];
$maxSize = 5 * 1024 * 1024; // 5MB

if ($file['size'] > $maxSize) {
    http_response_code(400);
    echo json_encode([
        "status" => "error",
        "message" => "Dung lượng ảnh vượt quá giới hạn cho phép (tối đa 5MB)."
    ]);
    exit;
}

// Kiểm tra đuôi file
$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$allowedExts = ['jpg', 'jpeg', 'png', 'webp'];
if (!in_array($ext, $allowedExts)) {
    http_response_code(400);
    echo json_encode([
        "status" => "error",
        "message" => "Định dạng file không hợp lệ. Chỉ chấp nhận JPG, JPEG, PNG, WEBP."
    ]);
    exit;
}

// Kiểm tra MIME type thực tế của file ảnh
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mimeType = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

$allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
if (!in_array($mimeType, $allowedMimes)) {
    http_response_code(400);
    echo json_encode([
        "status" => "error",
        "message" => "Nội dung file không phải là ảnh hợp lệ."
    ]);
    exit;
}

// 2. Thư mục lưu trữ ảnh
$rootDir = dirname(dirname(__DIR__));
$uploadDir = $rootDir . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'campaigns';

if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}
$gitkeepFile = $uploadDir . DIRECTORY_SEPARATOR . '.gitkeep';
if (!file_exists($gitkeepFile)) {
    touch($gitkeepFile);
}

// Đặt tên file duy nhất chống trùng lặp
$fileName = 'campaign_' . time() . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
$targetPath = $uploadDir . DIRECTORY_SEPARATOR . $fileName;

if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
    http_response_code(500);
    echo json_encode([
        "status" => "error",
        "message" => "Không thể lưu file ảnh vào thư mục máy chủ uploads/campaigns/."
    ]);
    exit;
}

// 3. Tính mã băm SHA-256 của file ảnh để đối soát On-chain với Smart Contract
$imageSha256 = hash_file('sha256', $targetPath);
$relImagePath = 'uploads/campaigns/' . $fileName;
$title = isset($_POST['title']) ? trim($_POST['title']) : 'Chiến dịch từ thiện';

// 4. Kết nối CSDL MySQL và lưu vào bảng campaigns_metadata
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

$recordId = null;
$dbConnected = false;

$conn = @new mysqli($host, $user, $pass, $db);
if (!$conn->connect_error) {
    $dbConnected = true;
    $conn->set_charset("utf8mb4");

    // Tạo bảng nếu chưa có
    $createTableSql = "CREATE TABLE IF NOT EXISTS `campaigns_metadata` (
        `id` int(11) NOT NULL AUTO_INCREMENT,
        `campaign_id` int(11) DEFAULT NULL COMMENT 'ID chiến dịch khớp với Smart Contract',
        `tx_hash` varchar(66) DEFAULT NULL COMMENT 'Mã giao dịch tạo chiến dịch trên Sepolia Testnet',
        `title` varchar(255) NOT NULL COMMENT 'Tên chiến dịch',
        `image_path` varchar(255) NOT NULL COMMENT 'Đường dẫn file ảnh lưu trên server',
        `image_sha256` varchar(64) NOT NULL COMMENT 'Mã băm SHA-256 của file ảnh để đối soát On-chain',
        `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (`id`),
        KEY `idx_campaign_id` (`campaign_id`),
        KEY `idx_tx_hash` (`tx_hash`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $conn->query($createTableSql);

    $stmt = $conn->prepare("INSERT INTO campaigns_metadata (title, image_path, image_sha256) VALUES (?, ?, ?)");
    if ($stmt) {
        $stmt->bind_param("sss", $title, $relImagePath, $imageSha256);
        if ($stmt->execute()) {
            $recordId = $stmt->insert_id;
        }
        $stmt->close();
    }
    $conn->close();
}

echo json_encode([
    "status"        => "success",
    "success"       => true,
    "record_id"     => $recordId,
    "image_path"    => $relImagePath,
    "image_sha256"  => $imageSha256,
    "db_connected"  => $dbConnected,
    "message"       => "Tải ảnh lên thành công và đã tạo mã băm SHA-256."
]);
exit;
