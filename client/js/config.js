// client/js/config.js

// Khởi tạo biến rỗng, giá trị sẽ lấy hoàn toàn từ file .env qua server
let CHARITY_CONTRACT_ADDRESS = null;

// Hàm đọc biến môi trường từ server/.env
async function loadContractConfig() {
    try {
        const response = await fetch("../server/config_api.php");
        if (!response.ok) {
            throw new Error("Không thể kết nối đến API config");
        }
        const data = await response.json();
        if (data.contractAddress && data.contractAddress.startsWith("0x")) {
            CHARITY_CONTRACT_ADDRESS = data.contractAddress;
            console.log("Đã tải CONTRACT_ADDRESS từ .env:", CHARITY_CONTRACT_ADDRESS);
        } else {
            console.error("Biến CONTRACT_ADDRESS trong .env không hợp lệ!");
        }
    } catch (e) {
        console.error("Lỗi khi đọc file .env từ backend:", e);
    }
}

// ABI của Smart Contract CharityDonation
const CHARITY_CONTRACT_ABI = [
  { "inputs": [], "stateMutability": "nonpayable", "type": "constructor" },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "campaignId", "type": "uint256" },
      { "indexed": false, "internalType": "string", "name": "title", "type": "string" },
      { "indexed": true, "internalType": "address", "name": "manager", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "targetAmount", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "deadline", "type": "uint256" }
    ],
    "name": "CampaignCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "campaignId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "donor", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "indexed": true, "internalType": "bytes32", "name": "txProof", "type": "bytes32" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "DonationReceived",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "campaignId", "type": "uint256" },
      { "indexed": true, "internalType": "uint256", "name": "requestId", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "indexed": false, "internalType": "address", "name": "recipient", "type": "address" },
      { "indexed": false, "internalType": "string", "name": "proofHash", "type": "string" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "FundsDisbursed",
    "type": "event"
  },
  {
    "inputs": [
      { "internalType": "string", "name": "_title", "type": "string" },
      { "internalType": "string", "name": "_description", "type": "string" },
      { "internalType": "address payable", "name": "_manager", "type": "address" },
      { "internalType": "uint256", "name": "_targetAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "_durationInDays", "type": "uint256" }
    ],
    "name": "createCampaign",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "_campaignId", "type": "uint256" },
      { "internalType": "string", "name": "_message", "type": "string" }
    ],
    "name": "donate",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "_campaignId", "type": "uint256" },
      { "internalType": "string", "name": "_purpose", "type": "string" },
      { "internalType": "uint256", "name": "_amount", "type": "uint256" },
      { "internalType": "address payable", "name": "_recipient", "type": "address" },
      { "internalType": "string", "name": "_proofHash", "type": "string" }
    ],
    "name": "requestDisbursement",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "_campaignId", "type": "uint256" },
      { "internalType": "uint256", "name": "_requestId", "type": "uint256" }
    ],
    "name": "executeDisbursement",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "_campaignId", "type": "uint256" }],
    "name": "getDonationHistory",
    "outputs": [
      {
        "components": [
          { "internalType": "address", "name": "donor", "type": "address" },
          { "internalType": "uint256", "name": "amount", "type": "uint256" },
          { "internalType": "uint256", "name": "timestamp", "type": "uint256" },
          { "internalType": "string", "name": "message", "type": "string" }
        ],
        "internalType": "struct CharityDonation.DonationRecord[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "_campaignId", "type": "uint256" }],
    "name": "getDisbursementHistory",
    "outputs": [
      {
        "components": [
          { "internalType": "uint256", "name": "id", "type": "uint256" },
          { "internalType": "string", "name": "purpose", "type": "string" },
          { "internalType": "uint256", "name": "amount", "type": "uint256" },
          { "internalType": "address payable", "name": "recipient", "type": "address" },
          { "internalType": "string", "name": "proofHash", "type": "string" },
          { "internalType": "bool", "name": "isExecuted", "type": "bool" },
          { "internalType": "uint256", "name": "executedAt", "type": "uint256" }
        ],
        "internalType": "struct CharityDonation.DisbursementRequest[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "_campaignId", "type": "uint256" }],
    "name": "campaigns",
    "outputs": [
      { "internalType": "uint256", "name": "id", "type": "uint256" },
      { "internalType": "string", "name": "title", "type": "string" },
      { "internalType": "string", "name": "description", "type": "string" },
      { "internalType": "address payable", "name": "manager", "type": "address" },
      { "internalType": "uint256", "name": "targetAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "raisedAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "disbursedAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "deadline", "type": "uint256" },
      { "internalType": "bool", "name": "isClosed", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "campaignCount",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
];