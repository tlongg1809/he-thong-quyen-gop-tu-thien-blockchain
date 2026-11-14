<?php
// Tắt toàn bộ cảnh báo PHP in ra màn hình gây hỏng JSON
error_reporting(0);
ini_set('display_errors', 0);

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

$contractAddress = null;
$rpcUrl = null;
$pinataGateway = null;
$sampleIpfsCid = null;

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
        if (preg_match('/^SEPOLIA_RPC_URL\s*=\s*["\']?([^\r\n"\']+)/m', $content, $m)) {
            $rpcUrl = trim($m[1]);
        }
        if (preg_match('/^PINATA_GATEWAY\s*=\s*["\']?([^\r\n"\']+)/m', $content, $m)) {
            $pinataGateway = trim($m[1]);
        }
        if (preg_match('/^SAMPLE_IPFS_CID\s*=\s*["\']?([^\r\n"\']+)/m', $content, $m)) {
            $sampleIpfsCid = trim($m[1]);
        }
        break;
    }
}

// Chỉ in ra đúng chuỗi JSON công khai, giữ nguyên key "contractAddress" để không lỗi code TV2
echo json_encode([
    "contractAddress" => $contractAddress,
    "rpcUrl"          => $rpcUrl,
    "pinataGateway"   => $pinataGateway,
    "sampleIpfsCid"   => $sampleIpfsCid
]);
exit;