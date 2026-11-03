// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title HeThongBinhChon
 * @dev He thong bo phieu & bieu quyet truc tuyen ung dung Smart Contract
 */
contract VotingSystem {
    // Cau truc thong tin mot ung vien / phuong an
    struct Candidate {
        uint256 id;
        string name;
        string description;
        uint256 voteCount;
    }

    // Cac thuoc tinh he thong
    address public admin;
    string public electionTitle;
    bool public votingOpen;
    uint256 public votingStartTime;
    uint256 public votingEndTime;

    // Danh sach ung vien
    Candidate[] public candidates;

    // Mapping luu tru danh sach cu tri hop le (Whitelist)
    mapping(address => bool) public isWhitelisted;

    // Mapping ghi nhan cu tri da bo phieu (chong double-voting)
    mapping(address => bool) public hasVoted;

    // Su kien ghi nhan transaction minh bach tren Blockchain
    event CandidateAdded(uint256 indexed candidateId, string name);
    event VoterAddedToWhitelist(address indexed voter);
    event VoteCast(address indexed voter, uint256 indexed candidateId, bytes32 proofHash, uint256 timestamp);
    event ElectionStatusChanged(bool isOpen);

    // Kiem tra quyen Admin
    modifier onlyAdmin() {
        require(msg.sender == admin, "Loi: Chi Admin moi co quyen thuc thi");
        _;
    }

    // Kiem tra thoi gian va trang thai cuoc bau chon
    modifier onlyDuringVoting() {
        require(votingOpen, "Loi: Cuoc bau chon dang dong");
        require(block.timestamp >= votingStartTime, "Loi: Cuoc bau chon chua bat dau");
        require(block.timestamp <= votingEndTime, "Loi: Cuoc bau chon da het thoi gian");
        _;
    }

    constructor(
        string memory _title,
        uint256 _durationInMinutes
    ) {
        admin = msg.sender;
        electionTitle = _title;
        votingOpen = true;
        votingStartTime = block.timestamp;
        votingEndTime = block.timestamp + (_durationInMinutes * 1 minutes);
    }

    // 1. Admin them ung vien (hoac phuong an lay y kien)
    function addCandidate(string memory _name, string memory _description) external onlyAdmin {
        uint256 newId = candidates.length;
        candidates.push(Candidate({
            id: newId,
            name: _name,
            description: _description,
            voteCount: 0
        }));
        emit CandidateAdded(newId, _name);
    }

    // 2. Admin nap danh sach cu tri hop le (Whitelist) theo batch
    function addWhitelistBatch(address[] memory _voters) external onlyAdmin {
        for (uint256 i = 0; i < _voters.length; i++) {
            isWhitelisted[_voters[i]] = true;
            emit VoterAddedToWhitelist(_voters[i]);
        }
    }

    // 3. Cu tri bo phieu
    function vote(uint256 _candidateId) external onlyDuringVoting {
        require(isWhitelisted[msg.sender], "Loi: Dia chi vi khong thuoc Whitelist hop le");
        require(!hasVoted[msg.sender], "Loi: Vi da bo phieu roi (Khong duoc Double-voting)");
        require(_candidateId < candidates.length, "Loi: Ung vien khong ton tai");

        hasVoted[msg.sender] = true;
        candidates[_candidateId].voteCount += 1;

        // Sinh ma bam chung thuc (proof hash) ghi vao log su kien
        bytes32 proofHash = keccak256(abi.encodePacked(msg.sender, _candidateId, block.timestamp));
        emit VoteCast(msg.sender, _candidateId, proofHash, block.timestamp);
    }

    // 4. Admin chu dong dong / mo lai cuoc bau chon
    function toggleVoting(bool _status) external onlyAdmin {
        votingOpen = _status;
        emit ElectionStatusChanged(_status);
    }

    // 5. Lay toan bo danh sach ung vien de Frontend hien thi
    function getAllCandidates() external view returns (Candidate[] memory) {
        return candidates;
    }

    // 6. Lay tong so luong ung vien
    function getCandidatesCount() external view returns (uint256) {
        return candidates.length;
    }
}