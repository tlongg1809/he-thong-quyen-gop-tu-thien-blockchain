// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CharityDonation
 * @dev He thong quan ly va theo doi quyen gop tu thien minh bach bang Smart Contract
 */
contract CharityDonation {
    // 1. Cau truc mot khoan quyen gop (Luu vet lich su tren chuoi)
    struct DonationRecord {
        address donor;          // Dia chi vi nguoi dong gop
        uint256 amount;         // So tien quyen gop (tinh bang Wei)
        uint256 timestamp;      // Thoi diem dong gop
        string message;         // Loi nhan dong vien
    }

    // 2. Cau truc mot yeu cau giai ngan (Minh bach dau ra cua dong tien)
    struct DisbursementRequest {
        uint256 id;
        string purpose;         // Muc dich su dung tien (vi du: Mua gao, sua chua truong hoc)
        uint256 amount;         // So tien yeu cau rut
        address payable recipient; // Dia chi vi nguoi / don vi thu huong thuc te
        string proofHash;       // Ma hash hoa don / chung tu (IPFS hash hoac SHA-256)
        bool isExecuted;        // Trang thai da duoc giai ngan chua
        uint256 executedAt;     // Thoi gian thuc hien chuyen tien
    }

    // 3. Cau truc mot chien dich tu thien
    struct Campaign {
        uint256 id;
        string title;           // Ten chien dich
        string description;     // Mo ta hoan canh
        address payable manager;// Nguoi quan ly / to chuc chu tri chien dich
        uint256 targetAmount;   // Muc tieu quyen gop (Wei)
        uint256 raisedAmount;   // So tien da van dong duoc
        uint256 disbursedAmount;// So tien da giai ngan thuc te
        uint256 deadline;       // Thoi han ket thuc chien dich
        bool isClosed;          // Trang thai dong / mo chien dich
    }

    address public systemAdmin;
    uint256 public campaignCount;

    // Mapping luu tru du lieu
    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => DonationRecord[]) private campaignDonations;
    mapping(uint256 => DisbursementRequest[]) private campaignDisbursements;
    mapping(uint256 => mapping(address => uint256)) public donorTotalContributions;

    // Cac su kien (Events) giup Frontend lang nghe va lap so cai kiem toan minh bach
    event CampaignCreated(uint256 indexed campaignId, string title, address indexed manager, uint256 targetAmount, uint256 deadline);
    event DonationReceived(uint256 indexed campaignId, address indexed donor, uint256 amount, bytes32 indexed txProof, uint256 timestamp);
    event DisbursementRequested(uint256 indexed campaignId, uint256 indexed requestId, uint256 amount, string purpose, address recipient);
    event FundsDisbursed(uint256 indexed campaignId, uint256 indexed requestId, uint256 amount, address recipient, string proofHash, uint256 timestamp);
    event CampaignStatusUpdated(uint256 indexed campaignId, bool isClosed);

    modifier onlyAdmin() {
        require(msg.sender == systemAdmin, "Loi: Chi Admin he thong moi co quyen");
        _;
    }

    modifier onlyManager(uint256 _campaignId) {
        require(msg.sender == campaigns[_campaignId].manager, "Loi: Chi quan ly chien dich moi co quyen");
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
     * @dev 1. Tao mot chien dich tu thien moi
     */
    function createCampaign(
        string memory _title,
        string memory _description,
        address payable _manager,
        uint256 _targetAmount,
        uint256 _durationInDays
    ) external onlyAdmin returns (uint256) {
        require(_targetAmount > 0, "Muc tieu quyen gop phai lon hon 0");
        require(_durationInDays > 0, "Thoi han quyen gop phai lon hon 0");
        require(_manager != address(0), "Dia chi quan ly khong hop le");

        uint256 newId = campaignCount;
        uint256 deadline = block.timestamp + (_durationInDays * 1 days);

        campaigns[newId] = Campaign({
            id: newId,
            title: _title,
            description: _description,
            manager: _manager,
            targetAmount: _targetAmount,
            raisedAmount: 0,
            disbursedAmount: 0,
            deadline: deadline,
            isClosed: false
        });

        campaignCount++;
        emit CampaignCreated(newId, _title, _manager, _targetAmount, deadline);
        return newId;
    }

    /**
     * @dev 2. Quyen gop tien vao chien dich (Co the gui kem coin goc ETH/MATIC)
     */
    function donate(uint256 _campaignId, string memory _message) external payable campaignExists(_campaignId) {
        Campaign storage c = campaigns[_campaignId];
        require(!c.isClosed, "Chien dich da dong tiep nhan");
        require(block.timestamp <= c.deadline, "Chien dich da het han quyen gop");
        require(msg.value > 0, "So tien quyen gop phai lon hon 0");

        c.raisedAmount += msg.value;
        donorTotalContributions[_campaignId][msg.sender] += msg.value;

        // Ghi nhan lich su quyen gop
        campaignDonations[_campaignId].push(DonationRecord({
            donor: msg.sender,
            amount: msg.value,
            timestamp: block.timestamp,
            message: _message
        }));

        // Sinh ma bam chung thuc (proof hash) cho giao dich quyen gop
        bytes32 txProof = keccak256(abi.encodePacked(msg.sender, _campaignId, msg.value, block.timestamp));
        emit DonationReceived(_campaignId, msg.sender, msg.value, txProof, block.timestamp);
    }

    /**
     * @dev 3. Nguoi quan ly tao de xuat giai ngan kem chung tu minh bach
     */
    function requestDisbursement(
        uint256 _campaignId,
        string memory _purpose,
        uint256 _amount,
        address payable _recipient,
        string memory _proofHash
    ) external campaignExists(_campaignId) onlyManager(_campaignId) returns (uint256) {
        Campaign storage c = campaigns[_campaignId];
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
     * @dev 4. Phe duyet va thuc hien chuyen tien giai ngan
     */
    function executeDisbursement(
        uint256 _campaignId,
        uint256 _requestId
    ) external campaignExists(_campaignId) onlyAdmin {
        Campaign storage c = campaigns[_campaignId];
        require(_requestId < campaignDisbursements[_campaignId].length, "Yeu cau khong ton tai");

        DisbursementRequest storage req = campaignDisbursements[_campaignId][_requestId];
        require(!req.isExecuted, "Yeu cau da duoc thuc hien truoc do");
        require((c.raisedAmount - c.disbursedAmount) >= req.amount, "So du quy khong du");

        req.isExecuted = true;
        req.executedAt = block.timestamp;
        c.disbursedAmount += req.amount;

        // Chuyen tien truc tiep den nguoi/don vi thu huong
        (bool success, ) = req.recipient.call{value: req.amount}("");
        require(success, "Giao dich chuyen tien that bai");

        emit FundsDisbursed(_campaignId, _requestId, req.amount, req.recipient, req.proofHash, block.timestamp);
    }

    /**
     * @dev 5. Dong hoac mo lai chien dich
     */
    function toggleCampaignStatus(uint256 _campaignId, bool _isClosed) external campaignExists(_campaignId) onlyAdmin {
        campaigns[_campaignId].isClosed = _isClosed;
        emit CampaignStatusUpdated(_campaignId, _isClosed);
    }

    /**
     * @dev 6. Lay danh sach toan bo lich su quyen gop phuc vu sao ke thoi gian thuc
     */
    function getDonationHistory(uint256 _campaignId) external view campaignExists(_campaignId) returns (DonationRecord[] memory) {
        return campaignDonations[_campaignId];
    }

    /**
     * @dev 7. Lay toan bo danh sach cac dot giai ngan kem hash chung tu
     */
    function getDisbursementHistory(uint256 _campaignId) external view campaignExists(_campaignId) returns (DisbursementRequest[] memory) {
        return campaignDisbursements[_campaignId];
    }

    /**
     * @dev 8. Lay so du con lai cua mot chien dich
     */
    function getRemainingFunds(uint256 _campaignId) external view campaignExists(_campaignId) returns (uint256) {
        return campaigns[_campaignId].raisedAmount - campaigns[_campaignId].disbursedAmount;
    }
}