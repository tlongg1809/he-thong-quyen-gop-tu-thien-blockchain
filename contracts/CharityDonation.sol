// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CharityDonation
 * @dev Hệ thống quản lý và theo dõi quyên góp từ thiện minh bạch bằng Smart Contract.
 * Kiến trúc: Phi tập trung có ký quỹ linh hoạt theo tỷ lệ (Dynamic Stake: max(0.05 ETH, 2% target))
 * kết hợp dấu vân tay ảnh On-chain (SHA-256) và cơ chế Hoàn tiền (Refund) / Tịch thu cọc (Slashing).
 */
contract CharityDonation {
    // 1. Cấu trúc một khoản quyên góp (Lưu vết lịch sử trên chuỗi)
    struct DonationRecord {
        address donor;          // Địa chỉ ví người đóng góp
        uint256 amount;         // Số tiền quyên góp (tính bằng Wei)
        uint256 timestamp;      // Thời điểm đóng góp
        string message;         // Lời nhắn động viên
    }

    // 2. Cấu trúc một yêu cầu giải ngân (Minh bạch đầu ra của dòng tiền)
    struct DisbursementRequest {
        uint256 id;
        string purpose;         // Mục đích sử dụng tiền (mua gạo, vật tư cứu trợ)
        uint256 amount;         // Số tiền yêu cầu rút
        address payable recipient; // Địa chỉ ví người / đơn vị thụ hưởng thực tế
        string proofHash;       // Mã hash hóa đơn / chứng từ (IPFS CID)
        bool isExecuted;        // Trạng thái đã được giải ngân chưa
        uint256 executedAt;     // Thời gian thực hiện chuyển tiền
    }

    // 3. Cấu trúc một chiến dịch từ thiện
    struct Campaign {
        uint256 id;
        string title;           // Tên chiến dịch
        string description;     // Mô tả hoàn cảnh
        address payable manager;// Người quản lý / tổ chức chủ trì chiến dịch
        uint256 targetAmount;   // Mục tiêu quyên góp (Wei)
        uint256 raisedAmount;   // Số tiền đã vận động được
        uint256 disbursedAmount;// Số tiền đã giải ngân thực tế
        uint256 deadline;       // Thời hạn kết thúc chiến dịch
        bool isClosed;          // Trạng thái đóng / mở chiến dịch
        address payable creator;// Người tạo chiến dịch / người nộp tiền ký quỹ
        uint256 stakeAmount;    // Số tiền ký quỹ cam kết (Dynamic Stake)
        bool stakeRefunded;     // Trạng thái đã hoàn trả ký quỹ hay chưa
        bool stakeSlashed;      // Trạng thái bị tịch thu ký quỹ do vi phạm
        string imageHash;       // Mã băm SHA-256 của ảnh đại diện lưu Off-chain
        bool isCancelled;       // Trạng thái chiến dịch bị hủy bỏ hoặc vi phạm
    }

    address public systemAdmin;
    uint256 public campaignCount;

    // Mức ký quỹ tối thiểu: 0.05 ETH
    uint256 public constant MIN_STAKE_FEE = 0.05 ether;
    // Tỷ lệ ký quỹ theo mục tiêu kêu gọi: 2%
    uint256 public constant STAKE_PERCENTAGE = 2;

    // Tổng số tiền ký quỹ bị tịch thu (slashed) giữ trong quỹ chung
    uint256 public totalSlashedFunds;

    // Mapping lưu trữ dữ liệu chiến dịch (Đặt private để tránh Stack too deep khi sinh tự động getter cho struct 15 trường)
    mapping(uint256 => Campaign) private allCampaigns;

    /**
     * @dev Getter đọc dữ liệu chiến dịch theo ID (Trả về struct Campaign memory, tương thích 100% với Frontend)
     */
    function campaigns(uint256 _campaignId) external view returns (Campaign memory) {
        return allCampaigns[_campaignId];
    }

    mapping(uint256 => DonationRecord[]) private campaignDonations;
    mapping(uint256 => DisbursementRequest[]) private campaignDisbursements;
    
    // Ánh xạ lưu số tiền từng nhà hảo tâm đã đóng góp cho từng chiến dịch
    mapping(uint256 => mapping(address => uint256)) public donations;
    mapping(uint256 => mapping(address => uint256)) public donorTotalContributions;

    // Các sự kiện (Events)
    event CampaignCreated(
        uint256 indexed campaignId,
        string title,
        address indexed manager,
        uint256 targetAmount,
        uint256 deadline,
        address indexed creator,
        uint256 stakeAmount,
        string imageHash
    );
    event DonationReceived(
        uint256 indexed campaignId,
        address indexed donor,
        uint256 amount,
        bytes32 indexed txProof,
        uint256 timestamp
    );
    event DisbursementRequested(
        uint256 indexed campaignId,
        uint256 indexed requestId,
        uint256 amount,
        string purpose,
        address recipient
    );
    event FundsDisbursed(
        uint256 indexed campaignId,
        uint256 indexed requestId,
        uint256 amount,
        address recipient,
        string proofHash,
        uint256 timestamp
    );
    event CampaignStatusUpdated(uint256 indexed campaignId, bool isClosed);
    event CampaignCancelled(uint256 indexed campaignId, string reason);
    event DonationRefunded(uint256 indexed campaignId, address indexed donor, uint256 amount);

    // Events dành cho cơ chế Ký quỹ & Xử phạt
    event StakeRefunded(uint256 indexed campaignId, address indexed creator, uint256 amount);
    event StakeSlashed(uint256 indexed campaignId, address indexed creator, uint256 amount, string reason);
    event SlashedFundsWithdrawn(address indexed admin, uint256 amount);

    modifier onlyAdmin() {
        require(msg.sender == systemAdmin, "Loi: Chi Admin he thong moi co quyen");
        _;
    }

    modifier onlyManager(uint256 _campaignId) {
        require(msg.sender == allCampaigns[_campaignId].manager, "Loi: Chi quan ly chien dich moi co quyen");
        _;
    }

    modifier campaignExists(uint256 _campaignId) {
        require(_campaignId < campaignCount, "Loi: Chien dich khong ton tai");
        _;
    }

    constructor() {
        systemAdmin = msg.sender;
    }

    /**
     * @dev Tính toán mức ký quỹ bắt buộc (Dynamic Stake):
     * max(0.05 ether, 2% của _targetAmount).
     */
    function calculateRequiredStake(uint256 _targetAmount) public pure returns (uint256) {
        uint256 percentStake = (_targetAmount * STAKE_PERCENTAGE) / 100;
        return percentStake > MIN_STAKE_FEE ? percentStake : MIN_STAKE_FEE;
    }

    /**
     * @dev 1. Khởi tạo chiến dịch mới (Permissionless có ký quỹ theo tỷ lệ & lưu mã băm ảnh)
     * Gỡ bỏ hoàn toàn `onlyAdmin`: Bất kỳ ai cũng có thể tạo chiến dịch,
     * bắt buộc đặt cọc tối thiểu max(0.05 ETH, 2% target) và cung cấp _imageHash.
     */
    function createCampaign(
        string memory _title,
        string memory _description,
        address payable _manager,
        uint256 _targetAmount,
        uint256 _durationInDays,
        string memory _imageHash
    ) external payable returns (uint256) {
        require(_targetAmount > 0, "Loi: Muc tieu quyen gop phai lon hon 0");
        require(_durationInDays > 0, "Loi: Thoi han quyen gop phai lon hon 0");
        require(_manager != address(0), "Loi: Dia chi quan ly khong hop le");
        require(bytes(_title).length > 0, "Loi: Ten chien dich khong duoc de trong");
        require(msg.value >= calculateRequiredStake(_targetAmount), "Loi: Tien ky quy khong du (Toi thieu 0.05 ETH hoac 2% muc tieu)");

        uint256 newId = campaignCount;
        Campaign storage c = allCampaigns[newId];
        c.id = newId;
        c.title = _title;
        c.description = _description;
        c.manager = _manager;
        c.targetAmount = _targetAmount;
        c.deadline = block.timestamp + (_durationInDays * 1 days);
        c.creator = payable(msg.sender);
        c.stakeAmount = msg.value;
        c.imageHash = _imageHash;

        campaignCount = newId + 1;

        emit CampaignCreated(
            newId,
            _title,
            _manager,
            _targetAmount,
            c.deadline,
            msg.sender,
            msg.value,
            _imageHash
        );

        return newId;
    }

    /**
     * @dev 2. Quyên góp tiền vào chiến dịch (ETH)
     * Toàn bộ ETH được khóa an toàn tại hợp đồng, ghi nhận số tiền từng donor.
     */
    function donate(uint256 _campaignId, string memory _message) external payable campaignExists(_campaignId) {
        Campaign storage c = allCampaigns[_campaignId];
        require(!c.isClosed, "Chien dich da dong tiep nhan");
        require(!c.isCancelled, "Chien dich da bi huy bo do vi pham");
        require(block.timestamp <= c.deadline, "Chien dich da het han quyen gop");
        require(msg.value > 0, "So tien quyen gop phai lon hon 0");
        require(!c.stakeSlashed, "Chien dich da bi khoa do vi pham ky quy");

        c.raisedAmount += msg.value;
        donations[_campaignId][msg.sender] += msg.value;
        donorTotalContributions[_campaignId][msg.sender] += msg.value;

        // Ghi nhận lịch sử quyên góp
        campaignDonations[_campaignId].push(DonationRecord({
            donor: msg.sender,
            amount: msg.value,
            timestamp: block.timestamp,
            message: _message
        }));

        bytes32 txProof = keccak256(abi.encodePacked(msg.sender, _campaignId, msg.value, block.timestamp));
        emit DonationReceived(_campaignId, msg.sender, msg.value, txProof, block.timestamp);
    }

    /**
     * @dev 3. Người quản lý tạo đề xuất giải ngân kèm chứng từ minh bạch (IPFS CID)
     */
    function requestDisbursement(
        uint256 _campaignId,
        string memory _purpose,
        uint256 _amount,
        address payable _recipient,
        string memory _proofHash
    ) external campaignExists(_campaignId) onlyManager(_campaignId) returns (uint256) {
        Campaign storage c = allCampaigns[_campaignId];
        require(!c.isCancelled, "Chien dich da bi huy");
        require(!c.stakeSlashed, "Chien dich da bi dinh chi do vi pham gian lan");
        require(_recipient != address(0), "Dia chi nguoi thu huong khong hop le");
        require(_amount > 0, "So tien giai ngan phai lon hon 0");
        require((c.raisedAmount - c.disbursedAmount) >= _amount, "So du quy khong du de giai ngan");

        uint256 requestId = campaignDisbursements[_campaignId].length;
        campaignDisbursements[_campaignId].push(DisbursementRequest({
            id: requestId,
            purpose: _purpose,
            amount: _amount,
            recipient: _recipient,
            proofHash: _proofHash,
            isExecuted: false,
            executedAt: 0
        }));

        emit DisbursementRequested(_campaignId, requestId, _amount, _purpose, _recipient);
        return requestId;
    }

    /**
     * @dev 4. Phê duyệt và thực hiện chuyển tiền giải ngân On-chain.
     * Tiền chỉ chuyển trực tiếp tới đơn vị thụ hưởng (recipient).
     * Khi có đợt giải ngân hợp lệ đầu tiên, tiền ký quỹ (stakeAmount) tự động hoàn lại cho creator.
     */
    function executeDisbursement(
        uint256 _campaignId,
        uint256 _requestId
    ) external campaignExists(_campaignId) onlyAdmin {
        Campaign storage c = allCampaigns[_campaignId];
        require(!c.isCancelled, "Chien dich da bi huy");
        require(!c.stakeSlashed, "Chien dich da bi khoa do vi pham ky quy");
        require(_requestId < campaignDisbursements[_campaignId].length, "Yeu cau khong ton tai");

        DisbursementRequest storage req = campaignDisbursements[_campaignId][_requestId];
        require(!req.isExecuted, "Yeu cau da duoc thuc hien truoc do");
        require((c.raisedAmount - c.disbursedAmount) >= req.amount, "So du quy khong du");

        req.isExecuted = true;
        req.executedAt = block.timestamp;
        c.disbursedAmount += req.amount;

        // Chuyển tiền trực tiếp đến người/đơn vị thụ hưởng
        (bool success, ) = req.recipient.call{value: req.amount}("");
        require(success, "Giao dich chuyen tien that bai");

        emit FundsDisbursed(_campaignId, _requestId, req.amount, req.recipient, req.proofHash, block.timestamp);

        // Tự động hoàn trả tiền ký quỹ cho Creator ngay khi có đợt giải ngân minh bạch đầu tiên
        if (c.stakeAmount > 0 && !c.stakeRefunded && !c.stakeSlashed) {
            c.stakeRefunded = true;
            uint256 refundVal = c.stakeAmount;
            (bool refundSuccess, ) = c.creator.call{value: refundVal}("");
            if (refundSuccess) {
                emit StakeRefunded(_campaignId, c.creator, refundVal);
            }
        }
    }

    /**
     * @dev 5. Cơ chế Đánh dấu vi phạm / Hủy bỏ chiến dịch & Tịch thu cọc (cancelOrSlashCampaign)
     * Admin phát hiện gian lận hoặc vi phạm nghiêm trọng:
     * - Tịch thu toàn bộ tiền ký quỹ (stakeAmount) vào quỹ chung.
     * - Khóa chiến dịch và mở cờ isCancelled = true.
     * - Cho phép các donor gọi claimRefund rút lại 100% tiền đã ủng hộ.
     */
    function cancelOrSlashCampaign(uint256 _campaignId, string memory _reason) external campaignExists(_campaignId) onlyAdmin {
        Campaign storage c = allCampaigns[_campaignId];
        require(!c.isCancelled, "Chien dich da bi huy truoc do");

        c.isCancelled = true;
        c.isClosed = true;

        // Tịch thu tiền ký quỹ nếu chưa được hoàn trả
        if (c.stakeAmount > 0 && !c.stakeRefunded && !c.stakeSlashed) {
            c.stakeSlashed = true;
            totalSlashedFunds += c.stakeAmount;
            emit StakeSlashed(_campaignId, c.creator, c.stakeAmount, _reason);
        }

        emit CampaignCancelled(_campaignId, _reason);
        emit CampaignStatusUpdated(_campaignId, true);
    }

    /**
     * @dev 6. Cơ chế Hoàn tiền cho Nhà hảo tâm (claimRefund)
     * Được kích hoạt khi:
     * (1) Chiến dịch bị hủy bỏ/vi phạm (isCancelled == true)
     * HOẶC
     * (2) Chiến dịch quá hạn (block.timestamp > deadline) mà chưa đạt mục tiêu (raisedAmount < targetAmount).
     * Áp dụng mô hình Checks-Effects-Interactions bảo vệ chống Reentrancy.
     */
    function claimRefund(uint256 _campaignId) external campaignExists(_campaignId) {
        Campaign storage c = allCampaigns[_campaignId];
        
        bool eligibleForRefund = c.isCancelled || (block.timestamp > c.deadline && c.raisedAmount < c.targetAmount);
        require(eligibleForRefund, "Chien dich chua du dieu kien hoan tra tien cho nha hao tam");

        uint256 contributed = donations[_campaignId][msg.sender];
        require(contributed > 0, "Ban khong co so du quyen gop de rut lai trong chien dich nay");

        // Effects
        donations[_campaignId][msg.sender] = 0;
        if (c.raisedAmount >= contributed) {
            c.raisedAmount -= contributed;
        } else {
            c.raisedAmount = 0;
        }

        // Interactions
        (bool success, ) = payable(msg.sender).call{value: contributed}("");
        require(success, "Giao dich rut lai tien quyen gop that bai");

        emit DonationRefunded(_campaignId, msg.sender, contributed);
    }

    /**
     * @dev 7. Rút lại tiền ký quỹ độc lập cho Creator (refundStake)
     */
    function refundStake(uint256 _campaignId) external campaignExists(_campaignId) {
        Campaign storage c = allCampaigns[_campaignId];
        require(msg.sender == c.creator || msg.sender == systemAdmin, "Loi: Khong co quyen yeu cau hoan ky quy");
        require(!c.stakeRefunded, "Loi: Tien ky quy da duoc hoan tra");
        require(!c.stakeSlashed, "Loi: Tien ky quy da bi tich thu do vi pham");
        require(!c.isCancelled, "Loi: Chien dich da bi huy do vi pham");
        require(c.stakeAmount > 0, "Loi: Khong co khoan ky quy kha dung");
        require(c.disbursedAmount > 0, "Loi: Chien dich chua co dot giai ngan minh bach nao");

        c.stakeRefunded = true;
        uint256 refundVal = c.stakeAmount;

        (bool success, ) = c.creator.call{value: refundVal}("");
        require(success, "Loi: Chuyen tien hoan ky quy that bai");

        emit StakeRefunded(_campaignId, c.creator, refundVal);
    }

    /**
     * @dev 8. Rút số tiền ký quỹ đã bị tịch thu để đưa vào quỹ cộng đồng / hỗ trợ nạn nhân
     */
    function withdrawSlashedFunds(address payable _to) external onlyAdmin {
        require(_to != address(0), "Dia chi nhan khong hop le");
        require(totalSlashedFunds > 0, "Khong co quy tich thu de rut");

        uint256 amount = totalSlashedFunds;
        totalSlashedFunds = 0;

        (bool success, ) = _to.call{value: amount}("");
        require(success, "Rut quy that bai");

        emit SlashedFundsWithdrawn(_to, amount);
    }

    /**
     * @dev 9. Đóng hoặc mở lại chiến dịch
     */
    function toggleCampaignStatus(uint256 _campaignId, bool _isClosed) external campaignExists(_campaignId) onlyAdmin {
        allCampaigns[_campaignId].isClosed = _isClosed;
        emit CampaignStatusUpdated(_campaignId, _isClosed);
    }

    /**
     * @dev 10. Lấy danh sách toàn bộ lịch sử quyên góp phục vụ sao kê thời gian thực
     */
    function getDonationHistory(uint256 _campaignId) external view campaignExists(_campaignId) returns (DonationRecord[] memory) {
        return campaignDonations[_campaignId];
    }

    /**
     * @dev 11. Lấy toàn bộ danh sách các đợt giải ngân kèm hash chứng từ
     */
    function getDisbursementHistory(uint256 _campaignId) external view campaignExists(_campaignId) returns (DisbursementRequest[] memory) {
        return campaignDisbursements[_campaignId];
    }

    /**
     * @dev 12. Lấy số dư còn lại của một chiến dịch
     */
    function getRemainingFunds(uint256 _campaignId) external view campaignExists(_campaignId) returns (uint256) {
        return allCampaigns[_campaignId].raisedAmount - allCampaigns[_campaignId].disbursedAmount;
    }
}
