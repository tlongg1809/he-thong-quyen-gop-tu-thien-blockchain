# 🌟 CharityChain — Hệ Thống Quyên Góp Từ Thiện Minh Bạch Bằng Smart Contract

[![Solidity](https://img.shields.io/badge/Solidity-%5E0.8.20-363636?logo=solidity)](https://soliditylang.org/)
[![Ethereum](https://img.shields.io/badge/Network-Ethereum%20Sepolia-3c3c3d?logo=ethereum)](https://sepolia.etherscan.io/)
[![Ethers.js](https://img.shields.io/badge/Ethers.js-v6.7.0-2535a0?logo=javascript)](https://docs.ethers.org/v6/)
[![PHP](https://img.shields.io/badge/Backend-PHP%208.x-777bb4?logo=php)](https://www.php.net/)
[![MySQL](https://img.shields.io/badge/Database-MySQL%208.x-4479a1?logo=mysql)](https://www.mysql.com/)
[![IPFS](https://img.shields.io/badge/Storage-Pinata%20IPFS-65c2cb?logo=ipfs)](https://www.pinata.cloud/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **CharityChain** là nền tảng quyên góp từ thiện phi tập trung (Decentralized Charity DApp) hoạt động trên mạng **Ethereum Sepolia Testnet**. Dự án ứng dụng công nghệ chuỗi khối (Blockchain) kết hợp giải pháp lưu trữ lai (Hybrid Storage) và cơ chế ký quỹ linh hoạt (Dynamic Stake) để giải quyết triệt để vấn đề minh bạch dòng tiền, phòng chống trục lợi và bảo vệ quyền lợi tối đa cho nhà hảo tâm.

---

## 📑 Mục Lục
1. [Vấn Đề & Giải Pháp Đột Phá](#-vấn-đề--giải-pháp-đột-phá)
2. [Kiến Trúc Kỹ Thuật (Architecture)](#-kiến-trúc-kỹ-thuật-architecture)
3. [Cấu Trúc Thư Mục Dự Án](#-cấu-trúc-thư-mục-dự-án)
4. [Hướng Dẫn Cài Đặt & Triển Khai](#-hướng-dẫn-cài-đặt--triển-khai)
5. [Hướng Dẫn Các Quy Trình Nghiệp Vụ](#-hướng-dẫn-các-quy-trình-nghiệp-vụ)
6. [Kịch Bản Kiểm Thử Toàn Diện (Test Cases)](#-kịch-bản-kiểm-thử-toàn-diện-test-cases)
7. [Các Sự Cố Kỹ Thuật Đã Tối Ưu](#-các-sự-cố-kỹ-thuật-đã-tối-ưu)
8. [Giấy Phép (License)](#-giấy-phép-license)

---

## 💡 Vấn Đề & Giải Pháp Đột Phá

### 1. Nghịch lý Tập trung & Nguy cơ "Bỏ Cọc Nhỏ Trục Lợi Lớn"
- **Nhược điểm cũ:** Việc chỉ cho phép `systemAdmin` tạo chiến dịch gây ra nút thắt cổ chai đơn điểm (Single Point of Failure). Ngược lại, nếu cho phép mọi người tự do tạo chiến dịch với mức cọc cố định (ví dụ phẳng `0.05 ETH`), kẻ gian sẵn sàng bỏ ra khoản tiền nhỏ để lừa đảo mục tiêu kêu gọi lên đến hàng trăm ETH.
- **Giải pháp:** Cơ chế **Ký Quỹ Linh Hoạt (Dynamic Stake)**:
  $$\text{requiredStake} = \max(0.05\text{ ETH}, 2\% \times \text{targetAmount})$$
  Kêu gọi mục tiêu càng lớn thì số tiền ký quỹ thế chấp On-chain càng cao. Khi có dấu hiệu gian lận, Admin hoặc cộng đồng có quyền kích hoạt **Slashing** (tịch thu tiền cọc vào quỹ chung), khiến kẻ xấu chịu thiệt hại kinh tế nặng nề.

### 2. Bảo Vệ Nhà Hảo Tâm (Donor Claim Refund)
- Khi chiến dịch bị hủy do vi phạm (`isCancelled == true`) **HOẶC** quá hạn quyên góp mà chưa đạt mục tiêu (`block.timestamp > deadline && raisedAmount < targetAmount`), toàn bộ các nhà hảo tâm có thể tự gọi hàm `claimRefund(campaignId)` trên Smart Contract để rút lại 100% số tiền đã đóng góp.

### 3. Lưu Trữ Ảnh Hybrid: Off-Chain File + On-Chain SHA-256 Fingerprint
- File ảnh đại diện chiến dịch được lưu trữ Off-chain tại máy chủ và database MySQL.
- Mã băm SHA-256 duy nhất (64 ký tự hex) được khóa bất biến trong Smart Contract (`createCampaign(..., _imageHash)`).
- **Lợi ích:** Tiết kiệm 99.9% phí gas so với lưu ảnh trên chuỗi. Frontend hỗ trợ nút **"🛡️ Khớp SHA-256 (Kiểm chứng)"** giúp người dùng đối soát ngay lập tức nếu máy chủ có dấu hiệu tráo đổi hình ảnh.

---

## 🏗 Kiến Trúc Kỹ Thuật (Architecture)

```
                           +------------------------------------+
                           |        Client (Browser / UI)       |
                           |  - index.html (Khám phá & Quyên góp)|
                           |  - audit.html (Sao kê minh bạch)   |
                           |  - admin.html (Quản trị & Tạo quỹ) |
                           +------------------+-----------------+
                                              |
                     +------------------------+------------------------+
                     | Ethers.js v6 (Web3)                             | Fetch API / Multipart
                     v                                                 v
    +---------------------------------+              +----------------------------------+
    |   Ethereum Sepolia Testnet      |              |          Apache PHP Server       |
    |  - CharityDonation.sol          |              |  - upload_campaign_image.php     |
    |    * Dynamic Stake Lock         |              |  - sync_campaign.php             |
    |    * SHA-256 Fingerprint        |              |  - proofs_api.php                |
    |    * Donor Claim Refund         |              +-----------------+----------------+
    |    * Slashing Mechanism         |                                |
    +----------------+----------------+                                v
                     |                               +----------------------------------+
                     | Proof Hash Link               |          MySQL Database          |
                     v                               |  - campaigns_metadata            |
    +---------------------------------+              |  - disbursement_proofs           |
    |           IPFS Pinata           |              +----------------------------------+
    |  (Lưu hóa đơn, chứng từ chi tiêu)|
    +---------------------------------+
```

---

## 📂 Cấu Trúc Thư Mục Dự Án

```
blockchain_bc/
├── client/                          # Giao diện người dùng Web3 (HTML5, CSS3, JS)
│   ├── css/
│   │   └── style.css                # Toàn bộ stylesheet hiện đại, responsive, toast cao cấp
│   ├── js/
│   │   ├── web3-common.js           # Module Web3 dùng chung (Toast, Format, Provider, Error Parser)
│   │   ├── config.js                # Địa chỉ hợp đồng và ABI 32 hàm/sự kiện
│   │   ├── donate.js                # Logic trang chủ: Thẻ chiến dịch, Quyên góp, Claim Refund
│   │   ├── audit.js                 # Logic sao kê: Lịch sử ủng hộ & Lịch sử giải ngân On-chain
│   │   └── admin.js                 # Logic quản trị: Ký quỹ, Upload ảnh, Đề xuất & Thực thi giải ngân
│   ├── database/
│   │   └── charity_db.sql           # Bản sao lưu cấu trúc database hoàn chỉnh
│   ├── index.html                   # Trang chủ dành cho nhà hảo tâm
│   ├── audit.html                   # Trang tra cứu sao kê & chứng từ giải ngân
│   └── admin.html                   # Bảng điều khiển quản trị viên & người tạo quỹ
│
├── contracts/                       # Smart Contract Solidity
│   ├── CharityDonation.sol          # Hợp đồng thông minh trung tâm (Solidity 0.8.20)
│   └── CharityDonationABI.json      # File JSON ABI chuẩn xuất từ Remix/solc
│
├── database/                        # Database Migration Scripts
│   ├── migration_fix.sql            # Script tự động đồng bộ cấu trúc bảng MySQL
│   └── update_campaigns_metadata.sql # DDL bảng lưu vết metadata ảnh
│
├── server/                          # Backend API (PHP)
│   ├── api/
│   │   ├── upload_campaign_image.php  # Upload ảnh, kiểm tra bảo mật và tính băm SHA-256
│   │   ├── sync_campaign.php          # Đồng bộ campaign_id và tx_hash từ chuỗi về MySQL
│   │   ├── get_campaigns_metadata.php # Lấy metadata ảnh đại diện cho Frontend
│   │   ├── campaigns_metadata_api.php # RESTful endpoint quản lý metadata
│   │   └── proofs_api.php             # Tiếp nhận và lưu thông tin chứng từ giải ngân
│   ├── config/
│   │   └── config_api.php             # Đọc file .env trả về địa chỉ Smart Contract
│   └── .env                           # Biến môi trường (DB Credentials, CONTRACT_ADDRESS)
│
├── uploads/                         # Thư mục lưu file Off-chain
│   └── campaigns/
│       └── .gitkeep                 # Thư mục chứa ảnh đại diện chiến dịch tải lên
│
├── ghichu.txt                       # Nhật ký kỹ thuật và chi tiết quá trình nâng cấp
├── giaithich.txt                    # Luận giải khoa học kiến trúc & kịch bản kiểm thử E2E
└── README.md                        # Tài liệu hướng dẫn tổng quan dự án
```

---

## 🚀 Hướng Dẫn Cài Đặt & Triển Khai

### 1. Chuẩn Bị Môi Trường
- **XAMPP**: Cài đặt phiên bản hỗ trợ PHP >= 8.0 và MySQL.
- **Ví Web3**: Tiện ích mở rộng **MetaMask** trên trình duyệt (Chrome, Brave, Edge).
- **SepoliaETH**: Chuẩn bị tối thiểu `0.1 SepoliaETH` trong ví để làm phí gas và đặt cọc ký quỹ (nhận từ [Google Cloud Web3 Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) hoặc [Sepolia PoW Faucet](https://sepolia-faucet.pk910.de/)).

### 2. Thiết Lập Cơ Sở Dữ Liệu MySQL
1. Khởi động **Apache** và **MySQL** trong bảng điều khiển XAMPP Control Panel.
2. Mở trình duyệt truy cập `http://localhost/phpmyadmin`.
3. Tạo mới database có tên: `charity_db` (bảng mã `utf8mb4_unicode_ci`).
4. Chọn tab **Import** và chọn file [client/database/charity_db.sql](client/database/charity_db.sql) (hoặc chạy script [database/migration_fix.sql](database/migration_fix.sql)) để tạo 2 bảng:
   - `campaigns_metadata`: Lưu vết ảnh đại diện, chuỗi băm SHA-256 và `tx_hash`.
   - `disbursement_proofs`: Lưu chứng từ giải ngân, hóa đơn và mã CID IPFS Pinata.

### 3. Biên Dịch & Triển Khai Smart Contract Lên Sepolia
1. Truy cập [Remix Ethereum IDE](https://remix.ethereum.org).
2. Tạo mới file `CharityDonation.sol` trong thư mục `contracts/` trên Remix và dán toàn bộ mã từ [contracts/CharityDonation.sol](contracts/CharityDonation.sol).
3. Tại tab **Solidity Compiler**:
   - Chọn compiler phiên bản **`0.8.20`**.
   - Bấm **Compile CharityDonation.sol** (Hợp đồng đã được tối ưu con trỏ `storage`, biên dịch thành công 100% không bị lỗi *Stack too deep*).
4. Tại tab **Deploy & Run Transactions**:
   - **Environment**: Chọn **`Injected Provider - MetaMask`** (Đảm bảo ví MetaMask đang kết nối mạng Sepolia).
   - Bấm nút cam **Deploy** và xác nhận giao dịch trên MetaMask.
5. Sau khi giao dịch hoàn tất, copy địa chỉ contract vừa tạo (ví dụ: `0x1234...abcd`).

### 4. Cấu Hình Ứng Dụng
1. Mở file [server/.env](server/.env), cập nhật địa chỉ contract mới:
   ```env
   CONTRACT_ADDRESS=0x_dia_chi_contract_moi_cua_ban
   ```
2. Mở file [client/js/config.js](client/js/config.js), đồng bộ địa chỉ dự phòng:
   ```javascript
   let CHARITY_CONTRACT_ADDRESS = "0x_dia_chi_contract_moi_cua_ban";
   ```
3. Đặt toàn bộ thư mục dự án vào `C:\xampp\htdocs\blockchain_bc`.
4. Truy cập DApp qua trình duyệt:
   - **Trang chủ:** `http://localhost/blockchain_bc/client/index.html`
   - **Tra cứu sao kê:** `http://localhost/blockchain_bc/client/audit.html`
   - **Trang quản trị:** `http://localhost/blockchain_bc/client/admin.html`

---

## 📖 Hướng Dẫn Các Quy Trình Nghiệp Vụ

### Quy Trình 1: Khởi Tạo Chiến Dịch Phi Tập Trung (Dynamic Stake + Băm Ảnh)
1. Mở `admin.html`, kết nối ví MetaMask bất kỳ.
2. Nhập tên, mô tả và chọn ảnh đại diện từ máy tính (khung xem trước ảnh hiển thị tức thì).
3. Nhập số tiền mục tiêu: Ô **"Tiền ký quỹ cam kết (Dynamic Stake)"** tự động tính toán mức cọc theo công thức $\max(0.05, \text{Target} \times 2\%)$.
4. Chọn ngày kết thúc chiến dịch trên lịch trực quan.
5. Bấm **[🔒 Đặt Ký Quỹ & Tạo Chiến Dịch]**:
   - Máy chủ PHP tải ảnh lên, kiểm tra định dạng và sinh mã SHA-256 duy nhất.
   - MetaMask yêu cầu ký nộp tiền ký quỹ (ví dụ: `0.05 ETH`).
   - Giao dịch được xác nhận trên Sepolia, thông tin tự động đồng bộ vào MySQL.

### Quy Trình 2: Quyên Góp & Kiểm Chứng Tính Toàn Vẹn Ảnh
1. Mở `index.html`, danh sách chiến dịch hiển thị ảnh bìa sắc nét kèm huy hiệu SHA-256.
2. Bấm nút **[🛡️ Khớp SHA-256 (Kiểm chứng)]**: Cửa sổ đối soát mở ra hiển thị mã băm thực tế của file ảnh và mã băm bất biến lưu trên Smart Contract để đối chiếu.
3. Chọn mức tiền ủng hộ (hoặc tự nhập) -> Bấm **[Quyên Góp Ngay]** -> Ký ví MetaMask.
4. Tiền quyên góp được chuyển thẳng vào Smart Contract, ghi nhận minh bạch vào số cái On-chain.

### Quy Trình 3: Đề Xuất, Phê Duyệt Giải Ngân & Hoàn Trả Tiền Cọc
1. **Đề xuất (Manager):** Quản lý chiến dịch mở Form 2 trên `admin.html`, nhập số tiền cần giải ngân, ví đơn vị cung ứng thực tế và mã băm IPFS của hóa đơn đỏ.
2. **Kiểm tra (Cộng đồng/Admin):** Mọi người xem chứng từ trực tiếp trên IPFS qua `audit.html`.
3. **Thực thi (Admin):** Admin mở Form 3 trên `admin.html` bấm **[✅ Xác Nhận & Thực Thi Chuyển Tiền]**:
   - Smart Contract tự động chuyển ETH trực tiếp cho nhà cung cấp.
   - **Đồng thời hoàn trả 100% tiền ký quỹ Dynamic Stake ban đầu về ví người tạo.**
   - Bản ghi `tx_hash` được tự động lưu vào MySQL bảng `disbursement_proofs`.

### Quy Trình 4: Xử Phạt Gian Lận (Slashing) & Rút Lại Tiền (Claim Refund)
1. Nếu phát hiện vi phạm, Admin vào Section 4 trên `admin.html`, nhập ID chiến dịch và lý do -> Bấm **[⚠️ Tịch Thu Ký Quỹ (Slash Stake)]**.
2. Smart Contract tịch thu tiền cọc vào quỹ chung và kích hoạt trạng thái `isCancelled = true`.
3. Trên trang chủ `index.html`, chiến dịch chuyển nhãn sang `❌ Đã Hủy / Đình Chỉ`, xuất hiện nút nổi bật **[💰 Rút Lại Tiền Quyên Góp (Claim Refund)]**.
4. Các nhà hảo tâm bấm nút này để rút lại 100% số tiền đã quyên góp về ví của mình.

---

## 🧪 Kịch Bản Kiểm Thử Toàn Diện (Test Cases)

| Mã Ca | Kịch Bản Kiểm Thử | Dữ Liệu Đầu Vào | Kết Quả Mong Đợi | Trạng Thái |
| :--- | :--- | :--- | :--- | :---: |
| **TC-01** | Tạo chiến dịch phi tập trung | Target: `2.5 ETH`, Cọc: `0.05 ETH`, File: `anh.jpg` | Ảnh upload thành công; băm SHA-256 On-chain; cọc 0.05 ETH khóa an toàn. | ✅ **Passed** |
| **TC-02** | Quyên góp & Đối soát ảnh SHA-256 | Quyên góp: `0.01 ETH` cho Campaign #0 | Hash MySQL khớp 100% Hash Smart Contract; quỹ tăng `0.01 ETH`; hiển thị trên Sao kê. | ✅ **Passed** |
| **TC-03** | Thực thi giải ngân & Tự động hoàn cọc | Giải ngân: `0.01 ETH` tới ví nhà cung cấp kèm CID IPFS | Nhà cung cấp nhận đủ ETH; Creator nhận lại 100% tiền cọc; `tx_hash` lưu vào MySQL. | ✅ **Passed** |
| **TC-04** | Xử phạt Slashing & Donor Claim Refund | Admin gọi `cancelOrSlashCampaign` | Cọc bị tịch thu; chiến dịch đóng; Donor bấm Claim Refund rút lại toàn bộ ETH đã góp. | ✅ **Passed** |

---

## 🛠 Các Sự Cố Kỹ Thuật Đã Tối Ưu

1. **Khắc phục triệt để lỗi `CompilerError: Stack too deep`**:
   - Chuyển việc gán biến cục bộ sang con trỏ `storage` (`Campaign storage c = allCampaigns[newId]`).
   - Tối ưu hóa hàm getter `campaigns(uint256)` chia tách dữ liệu đọc, biên dịch trực tiếp trên trình biên dịch mặc định mà không cần cờ `--via-ir`.
2. **Khắc phục triệt để lỗi Toast bị mất chữ và thông báo `require(false)`**:
   - Thiết kế lại hệ thống Toast trong [web3-common.js](client/js/web3-common.js) với nền sáng tương phản cao (`#ffffff`), tiêu đề đen đậm (`#0f172a`), mô tả (`#475569`) và icon FontAwesome 6.
   - Thêm bộ bóc tách lỗi thông minh [parseContractError()](client/js/web3-common.js): Tự động giải thích nguyên nhân revert rỗng của EVM bằng tiếng Việt thân thiện thay vì hiển thị chuỗi kỹ thuật thô.
3. **Thêm cơ chế Tiền kiểm tra (Pre-validation)**:
   - Kiểm tra số dư ví trước khi gửi cọc (`balance < stakeWei`).
   - Kiểm tra tương thích contract bằng hàm thuần túy `calculateRequiredStake` tránh tốn gas vô ích.
4. **Sửa lỗi hiển thị thống kê dấu `-` trên trang chủ**:
   - Viết lại [donate.js](client/js/donate.js) đọc chính xác `contract.campaignCount()`, cộng dồn tổng quỹ và số lượt đóng góp gán tức thì vào DOM.

---

## 📄 Giấy Phép (License)

Dự án được phát hành theo giấy phép **MIT License**. Bạn có thể tự do nghiên cứu, đóng góp hoặc phát triển mở rộng cho các mục đích học tập và cộng đồng.

---

⭐ **CharityChain Team** — *Chung tay xây dựng nền tảng từ thiện minh bạch, phi tập trung và văn minh trên Web3.*
