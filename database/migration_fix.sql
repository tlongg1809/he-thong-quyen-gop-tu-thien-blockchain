-- ====================================================================================
-- CharityChain DApp - Database Migration & Fix Script
-- File: database/migration_fix.sql
-- Mục đích: Đồng bộ và khắc phục toàn diện cơ sở dữ liệu `charity_db` trên XAMPP MySQL
-- ====================================================================================

-- 1. Đảm bảo Database `charity_db` chuẩn được tạo với mã hóa UTF-8 đầy đủ (utf8mb4)
CREATE DATABASE IF NOT EXISTS `charity_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `charity_db`;

-- ------------------------------------------------------------------------------------
-- 2. Bảng `disbursement_proofs`: Lưu trữ bằng chứng giải ngân Off-chain & IPFS CID
-- ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `disbursement_proofs` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `tx_hash` VARCHAR(66) NOT NULL COMMENT 'Mã giao dịch giải ngân trên Sepolia Testnet (0x + 64 hex)',
  `campaign_id` INT(11) NOT NULL COMMENT 'ID chiến dịch khớp với Smart Contract',
  `supplier_name` VARCHAR(255) DEFAULT NULL COMMENT 'Đơn vị cung cấp hàng hóa/dịch vụ',
  `invoice_number` VARCHAR(50) DEFAULT NULL COMMENT 'Số hóa đơn chứng từ thực tế',
  `description` TEXT NOT NULL COMMENT 'Chi tiết nội dung chi tiêu',
  `ipfs_hash` VARCHAR(100) NOT NULL COMMENT 'Mã CID file chứng từ trên Pinata IPFS (Qm... hoặc bafy...)',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tx_hash` (`tx_hash`),
  KEY `idx_campaign` (`campaign_id`),
  KEY `idx_tx_hash` (`tx_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------------
-- 3. Bảng `campaigns_metadata`: Lưu trữ ảnh đại diện Off-chain & Mã băm SHA-256 On-chain
-- ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `campaigns_metadata` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `campaign_id` INT(11) DEFAULT NULL COMMENT 'ID chiến dịch khớp với Smart Contract',
  `tx_hash` VARCHAR(66) DEFAULT NULL COMMENT 'Mã giao dịch tạo chiến dịch trên Sepolia Testnet (0x + 64 hex)',
  `title` VARCHAR(255) NOT NULL COMMENT 'Tên chiến dịch',
  `image_path` VARCHAR(255) NOT NULL COMMENT 'Đường dẫn file ảnh lưu trên server (uploads/campaigns/...)',
  `image_sha256` VARCHAR(64) NOT NULL COMMENT 'Mã băm SHA-256 (64 hex) của file ảnh để đối soát On-chain',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (`id`),
  KEY `idx_campaign_id` (`campaign_id`),
  KEY `idx_tx_hash` (`tx_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------------
-- 4. Đồng bộ dữ liệu mẫu / dữ liệu hiện có từ `charity_db.sql` sang `charity_db`
-- ------------------------------------------------------------------------------------
-- Chèn dữ liệu mẫu cho `disbursement_proofs` nếu bảng đang trống
INSERT INTO `charity_db`.`disbursement_proofs` (`id`, `tx_hash`, `campaign_id`, `supplier_name`, `invoice_number`, `description`, `ipfs_hash`, `created_at`)
VALUES (1, '0x0000000000000000000000000000000000000000000000000000000000000001', 0, 'Hợp Tác Xã Tiêu Dùng & Nông Sản An Bình', 'HD-2026-001', 'Mua 500 thùng mì ăn liền và 200 bao gạo tẻ (10kg) cứu trợ đồng bào', 'bafybeidrka73ahngpdnnm2ckgweyqt4f5zsc5dsyezm5pknboq52rbe4fe', '2026-11-14 16:44:54')
ON DUPLICATE KEY UPDATE `id` = `id`;

-- Nếu database `charity_db.sql` đang có dữ liệu trong `campaigns_metadata`, đồng bộ sang `charity_db`
INSERT IGNORE INTO `charity_db`.`campaigns_metadata` 
SELECT * FROM `charity_db.sql`.`campaigns_metadata`
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'charity_db.sql' AND table_name = 'campaigns_metadata');

-- Đảm bảo database `charity_db.sql` cũng có đầy đủ cấu trúc đồng nhất
CREATE TABLE IF NOT EXISTS `charity_db.sql`.`disbursement_proofs` LIKE `charity_db`.`disbursement_proofs`;
CREATE TABLE IF NOT EXISTS `charity_db.sql`.`campaigns_metadata` LIKE `charity_db`.`campaigns_metadata`;
