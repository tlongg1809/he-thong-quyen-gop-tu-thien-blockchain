-- File: database/update_campaigns_metadata.sql
-- Bổ sung bảng campaigns_metadata cho database charity_db
-- Dùng để lưu trữ Metadata và đường dẫn ảnh Off-chain của chiến dịch từ thiện
-- Mã băm SHA-256 được lưu trữ On-chain để đối soát tính toàn vẹn (Tamper-evidence)

CREATE TABLE IF NOT EXISTS `campaigns_metadata` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `campaign_id` INT(11) DEFAULT NULL COMMENT 'ID chiến dịch khớp với Smart Contract',
  `tx_hash` VARCHAR(66) DEFAULT NULL COMMENT 'Mã giao dịch tạo chiến dịch trên Sepolia Testnet',
  `title` VARCHAR(255) NOT NULL COMMENT 'Tên chiến dịch',
  `image_path` VARCHAR(255) NOT NULL COMMENT 'Đường dẫn file ảnh lưu trên server',
  `image_sha256` VARCHAR(64) NOT NULL COMMENT 'Mã băm SHA-256 của file ảnh để đối soát On-chain',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (`id`),
  KEY `idx_campaign_id` (`campaign_id`),
  KEY `idx_tx_hash` (`tx_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
