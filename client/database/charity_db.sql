-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Máy chủ: 127.0.0.1
-- Thời gian đã tạo: Th10 14, 2026 lúc 05:56 PM
-- Phiên bản máy phục vụ: 10.4.32-MariaDB
-- Phiên bản PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Cơ sở dữ liệu: `charity_db`
--

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `disbursement_proofs`
--

CREATE TABLE `disbursement_proofs` (
  `id` int(11) NOT NULL,
  `tx_hash` varchar(66) NOT NULL COMMENT 'Mã giao dịch giải ngân trên Sepolia Testnet',
  `campaign_id` int(11) NOT NULL COMMENT 'ID chiến dịch khớp với Smart Contract',
  `supplier_name` varchar(255) DEFAULT NULL COMMENT 'Đơn vị cung cấp hàng hóa/dịch vụ',
  `invoice_number` varchar(50) DEFAULT NULL COMMENT 'Số hóa đơn chứng từ thực tế',
  `description` text NOT NULL COMMENT 'Chi tiết nội dung chi tiêu',
  `ipfs_hash` varchar(100) NOT NULL COMMENT 'Mã CID file chứng từ trên Pinata IPFS',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `disbursement_proofs`
--

INSERT INTO `disbursement_proofs` (`id`, `tx_hash`, `campaign_id`, `supplier_name`, `invoice_number`, `description`, `ipfs_hash`, `created_at`) VALUES
(1, '0x0000000000000000000000000000000000000000000000000000000000000001', 0, 'Hợp Tác Xã Tiêu Dùng & Nông Sản An Bình', 'HD-2026-001', 'Mua 500 thùng mì ăn liền và 200 bao gạo tẻ (10kg) cứu trợ đồng bào', 'bafybeidrka73ahngpdnnm2ckgweyqt4f5zsc5dsyezm5pknboq52rbe4fe', '2026-11-14 16:44:54');

--
-- Chỉ mục cho các bảng đã đổ
--

--
-- Chỉ mục cho bảng `disbursement_proofs`
--
ALTER TABLE `disbursement_proofs`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `tx_hash` (`tx_hash`),
  ADD KEY `idx_campaign` (`campaign_id`),
  ADD KEY `idx_tx_hash` (`tx_hash`);

--
-- AUTO_INCREMENT cho các bảng đã đổ
--

--
-- AUTO_INCREMENT cho bảng `disbursement_proofs`
--
ALTER TABLE `disbursement_proofs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
