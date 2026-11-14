// Biến lưu cấu hình được nạp động từ server/config/config_api.php (đọc từ .env)
let APP_CONFIG = {
    contractAddress: (typeof CHARITY_CONTRACT_ADDRESS !== "undefined" && CHARITY_CONTRACT_ADDRESS)
        ? CHARITY_CONTRACT_ADDRESS
        : "0x05d4FFAB7ec39122EE18BEEA4304D50d61191b45",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    pinataGateway: "https://gateway.pinata.cloud/ipfs/",
    sampleIpfsCid: "bafybeidrka73ahngpdnnm2ckgweyqt4f5zsc5dsyezm5pknboq52rbe4fe"
};

// ABI khớp 100% với CharityDonation.sol (tự động dùng CONTRACT_ABI từ js/config.js nếu đã có)
const AUDIT_ABI = (typeof CONTRACT_ABI !== "undefined") ? CONTRACT_ABI : [
    "function campaignCount() view returns (uint256)",
    "function campaigns(uint256) view returns (uint256 id, string title, string description, address manager, uint256 targetAmount, uint256 raisedAmount, uint256 disbursedAmount, uint256 deadline, bool isClosed)",
    "function getDonationHistory(uint256 _campaignId) view returns (tuple(address donor, uint256 amount, uint256 timestamp, string message)[])",
    "function getDisbursementHistory(uint256 _campaignId) view returns (tuple(uint256 id, string purpose, uint256 amount, address recipient, string proofHash, bool isExecuted, uint256 executedAt)[])",
    "event DonationReceived(uint256 indexed campaignId, address indexed donor, uint256 amount, bytes32 indexed txProof, uint256 timestamp)",
    "event FundsDisbursed(uint256 indexed campaignId, uint256 indexed requestId, uint256 amount, address recipient, string proofHash, uint256 timestamp)"
];

let readContract = null;
let currentCampaignId = null;

// 1. Nạp cấu hình từ Backend PHP (không lộ thông tin nhạy cảm trong code JS)
async function loadServerConfig() {
    try {
        const response = await fetch("../server/config/config_api.php");
        if (response.ok) {
            const data = await response.json();
            if (data.contractAddress) APP_CONFIG.contractAddress = data.contractAddress;
            if (data.rpcUrl) APP_CONFIG.rpcUrl = data.rpcUrl;
            if (data.pinataGateway) APP_CONFIG.pinataGateway = data.pinataGateway;
            if (data.sampleIpfsCid) APP_CONFIG.sampleIpfsCid = data.sampleIpfsCid;
        }
    } catch (err) {
        console.warn("Dùng cấu hình mặc định do không gọi được config_api.php:", err);
    }
}

// 2. Các hàm tiện ích định dạng hiển thị
function formatTimestamp(unixSeconds) {
    if (!unixSeconds || Number(unixSeconds) === 0) return "--";
    return new Date(Number(unixSeconds) * 1000).toLocaleString("vi-VN");
}

function shortenAddr(addr) {
    if (!addr) return "--";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// Tạo nút mở chứng từ hóa đơn trên IPFS Pinata
function renderProofLink(proofHash) {
    if (!proofHash || proofHash.trim() === "") {
        return `<span style="color: var(--text-muted);">Chưa đính kèm</span>`;
    }
    // Nhận diện mã CID chuẩn của IPFS (bắt đầu bằng Qm hoặc bafy)
    if (proofHash.startsWith("Qm") || proofHash.startsWith("bafy")) {
        return `<a href="${APP_CONFIG.pinataGateway}${proofHash}" target="_blank" 
                   style="color: #059669; font-weight: 600; text-decoration: underline;">
                   📄 Xem Hóa Đơn IPFS (${proofHash.slice(0, 8)}...) ↗
                </a>`;
    }
    // Fallback mở chứng từ mẫu trong .env nếu proofHash là chuỗi hash thường
    if (APP_CONFIG.sampleIpfsCid) {
        return `<a href="${APP_CONFIG.pinataGateway}${APP_CONFIG.sampleIpfsCid}" target="_blank" 
                   title="Mã gốc: ${proofHash}" style="color: #2563eb; text-decoration: underline;">
                   🔗 ${proofHash.slice(0, 12)}... (Xem chứng từ) ↗
                </a>`;
    }
    return `<span style="font-family: monospace;">${proofHash}</span>`;
}

// Kiểm tra hoặc tự động chuyển mạng Sepolia
async function checkOrSwitchSepolia() {
    if (!window.ethereum) return;
    try {
        const chainId = await window.ethereum.request({ method: "eth_chainId" });
        if (chainId !== "0xaa36a7") { // Sepolia chainId hex: 0xaa36a7 (11155111)
            try {
                await window.ethereum.request({
                    method: "wallet_switchEthereumChain",
                    params: [{ chainId: "0xaa36a7" }]
                });
            } catch (switchError) {
                if (switchError.code === 4902) {
                    await window.ethereum.request({
                        method: "wallet_addEthereumChain",
                        params: [{
                            chainId: "0xaa36a7",
                            chainName: "Sepolia Test Network",
                            nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
                            rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
                            blockExplorerUrls: ["https://sepolia.etherscan.io"]
                        }]
                    });
                }
            }
        }
    } catch (e) {
        console.warn("Không thể kiểm tra/chuyển mạng Sepolia:", e);
    }
}

// 3. Kết nối ví MetaMask (Tùy chọn trên thanh Navbar)
async function connectWallet() {
    if (!window.ethereum) {
        if (window.location.protocol === "file:") {
            alert("Lỗi: Bạn đang mở trang bằng đường dẫn file:// trực tiếp.\nMetaMask bị trình duyệt chặn không cho tương tác trên file://.\n\nVui lòng khởi động Apache trong XAMPP và truy cập qua đường dẫn:\nhttp://localhost/he-thong-quyen-gop-tu-thien-blockchain/client/audit.html");
        } else {
            alert("Không tìm thấy tiện ích MetaMask!\nVui lòng cài đặt tiện ích mở rộng MetaMask trên trình duyệt của bạn (https://metamask.io).");
        }
        return;
    }

    try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        if (!accounts || accounts.length === 0) {
            alert("Không tìm thấy tài khoản MetaMask nào!");
            return;
        }

        const walletBadge = document.getElementById("walletAddress");
        const btnConnect = document.getElementById("btnConnect");

        if (walletBadge && btnConnect) {
            walletBadge.innerText = shortenAddr(accounts[0]);
            walletBadge.style.display = "inline-block";
            btnConnect.style.display = "none";
        }

        await checkOrSwitchSepolia();
    } catch (err) {
        console.error("Lỗi kết nối ví:", err);
        if (err.code === 4001) {
            alert("Bạn đã hủy/từ chối yêu cầu kết nối với ví MetaMask.");
        } else if (err.code === -32002) {
            alert("Yêu cầu kết nối đang chờ xử lý!\n\nVui lòng bấm vào biểu tượng con cáo MetaMask ở góc trên bên phải trình duyệt để mở cửa sổ xác nhận.");
        } else {
            alert("Không thể kết nối ví MetaMask: " + (err.message || err));
        }
    }
}

// Kiểm tra xem ví đã được kết nối từ phiên trước chưa
async function checkExistingWalletConnection() {
    if (!window.ethereum) return;
    try {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (accounts && accounts.length > 0) {
            const walletBadge = document.getElementById("walletAddress");
            const btnConnect = document.getElementById("btnConnect");
            if (walletBadge && btnConnect) {
                walletBadge.innerText = shortenAddr(accounts[0]);
                walletBadge.style.display = "inline-block";
                btnConnect.style.display = "none";
            }
        }
    } catch (e) {
        console.warn("Lỗi kiểm tra ví đã kết nối:", e);
    }

    window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts && accounts.length > 0) {
            const walletBadge = document.getElementById("walletAddress");
            if (walletBadge) walletBadge.innerText = shortenAddr(accounts[0]);
        } else {
            location.reload();
        }
    });

    window.ethereum.on("chainChanged", () => {
        location.reload();
    });
}

// 4. Khởi tạo kết nối Sepolia và tải danh sách chiến dịch vào dropdown
async function loadCampaignList() {
    const selectEl = document.getElementById("selectCampaign");
    try {
        await loadServerConfig();

        const provider = new ethers.JsonRpcProvider(APP_CONFIG.rpcUrl);
        readContract = new ethers.Contract(APP_CONFIG.contractAddress, AUDIT_ABI, provider);

        const count = await readContract.campaignCount();
        const totalCampaigns = Number(count);

        selectEl.innerHTML = `<option value="">-- Chọn chiến dịch cần tra cứu (${totalCampaigns} chiến dịch) --</option>`;

        for (let i = 0; i < totalCampaigns; i++) {
            const c = await readContract.campaigns(i);
            const option = document.createElement("option");
            option.value = i;
            option.textContent = `#${i} - ${c.title} (Mục tiêu: ${ethers.formatEther(c.targetAmount)} ETH)`;
            selectEl.appendChild(option);
        }

        // Tự động hiển thị sao kê của chiến dịch đầu tiên nếu hợp đồng đã có dữ liệu
        if (totalCampaigns > 0) {
            selectEl.value = "0";
            await loadCampaignAuditData(0);
        } else {
            selectEl.innerHTML = `<option value="">-- Hiện chưa có chiến dịch nào trên Smart Contract --</option>`;
        }

        // Bật lắng nghe sự kiện thời gian thực từ Smart Contract
        listenRealtimeEvents();

    } catch (error) {
        console.error("Lỗi khởi tạo trang sao kê:", error);
        selectEl.innerHTML = `<option value="">Lỗi kết nối cấu hình hoặc mạng Sepolia</option>`;
    }
}

// 5. Truy vấn dữ liệu sao kê chi tiết (Tiền vào & Tiền ra) của 1 chiến dịch
async function loadCampaignAuditData(campaignId) {
    currentCampaignId = Number(campaignId);
    const overviewSection = document.getElementById("campaignOverview");
    const donationTbody = document.getElementById("donationTableBody");
    const disburseTbody = document.getElementById("disburseTableBody");

    donationTbody.innerHTML = `<tr><td colspan="4" style="padding: 16px; text-align: center;">Đang truy xuất dữ liệu On-chain...</td></tr>`;
    disburseTbody.innerHTML = `<tr><td colspan="6" style="padding: 16px; text-align: center;">Đang truy xuất lịch sử giải ngân...</td></tr>`;

    try {
        // Lấy thông tin tổng quan chiến dịch
        const c = await readContract.campaigns(currentCampaignId);
        overviewSection.style.display = "block";
        document.getElementById("infoTitle").innerText = `#${c.id} - ${c.title}`;
        document.getElementById("infoDesc").innerText = c.description;
        document.getElementById("infoRaised").innerText = `${ethers.formatEther(c.raisedAmount)} ETH`;
        document.getElementById("infoTarget").innerText = `${ethers.formatEther(c.targetAmount)} ETH`;
        document.getElementById("infoDisbursed").innerText = `${ethers.formatEther(c.disbursedAmount)} ETH`;

        const statusEl = document.getElementById("infoStatus");
        if (c.isClosed) {
            statusEl.innerText = "Đã đóng";
            statusEl.style.color = "#dc2626";
        } else {
            statusEl.innerText = "Đang tiếp nhận";
            statusEl.style.color = "#059669";
        }

        // Đổ dữ liệu Bảng 1: Danh sách mạnh thường quân đóng góp
        const donations = await readContract.getDonationHistory(currentCampaignId);
        if (donations.length === 0) {
            donationTbody.innerHTML = `<tr><td colspan="4" style="padding: 16px; text-align: center; color: var(--text-muted);">Chưa có lượt quyên góp nào cho chiến dịch này.</td></tr>`;
        } else {
            donationTbody.innerHTML = "";
            [...donations].reverse().forEach(d => {
                const tr = document.createElement("tr");
                tr.style.borderBottom = "1px solid var(--border)";
                tr.innerHTML = `
                    <td style="padding: 10px; font-family: monospace;" title="${d.donor}">
                        <a href="https://sepolia.etherscan.io/address/${d.donor}" target="_blank" style="color: inherit; text-decoration: underline;">
                            ${shortenAddr(d.donor)}
                        </a>
                    </td>
                    <td style="padding: 10px; font-weight: bold; color: #059669;">+${ethers.formatEther(d.amount)} ETH</td>
                    <td style="padding: 10px;">${d.message || "Ủng hộ chiến dịch"}</td>
                    <td style="padding: 10px; color: var(--text-muted);">${formatTimestamp(d.timestamp)}</td>
                `;
                donationTbody.appendChild(tr);
            });
        }

        let offchainProofs = [];
        try {
            const proofRes = await fetch(`../server/api/proofs_api.php?campaign_id=${currentCampaignId}`);
            const proofJson = await proofRes.json();
            if (proofJson.status === "success") {
                offchainProofs = proofJson.data;
            }
        } catch (e) {
            console.warn("Không tải được dữ liệu Off-chain:", e);
        }

        // Đổ dữ liệu Bảng 2: Đối soát Giải ngân On-chain & Chứng từ Off-chain
        const disbursements = await readContract.getDisbursementHistory(currentCampaignId);
        if (disbursements.length === 0 && offchainProofs.length === 0) {
            disburseTbody.innerHTML = `<tr><td colspan="6" style="padding: 16px; text-align: center; color: var(--text-muted);">Chưa có đề xuất giải ngân nào.</td></tr>`;
        } else if (disbursements.length > 0) {
            disburseTbody.innerHTML = "";
            disbursements.forEach(req => {
                // Tìm thông tin hóa đơn chi tiết trong MySQL khớp với mã ipfsHash trên Smart Contract
                const matchedOffchain = offchainProofs.find(p => p.ipfs_hash === req.proofHash);
                const extraInfo = matchedOffchain
                    ? `<div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">
                         🧾 Số HĐ: <strong>${matchedOffchain.invoice_number}</strong> - ${matchedOffchain.supplier_name}
                       </div>`
                    : "";

                const statusBadge = req.isExecuted
                    ? `<span style="background: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">✅ Đã giải ngân (${formatTimestamp(req.executedAt)})</span>`
                    : `<span style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">⏳ Chờ Admin duyệt</span>`;

                const tr = document.createElement("tr");
                tr.style.borderBottom = "1px solid var(--border)";
                tr.innerHTML = `
                    <td style="padding: 10px;">#${req.id}</td>
                    <td style="padding: 10px; font-weight: 500;">${req.purpose}${extraInfo}</td>
                    <td style="padding: 10px; font-weight: bold; color: #d97706;">${ethers.formatEther(req.amount)} ETH</td>
                    <td style="padding: 10px; font-family: monospace;" title="${req.recipient}">
                        <a href="https://sepolia.etherscan.io/address/${req.recipient}" target="_blank" style="color: inherit; text-decoration: underline;">
                            ${shortenAddr(req.recipient)}
                        </a>
                    </td>
                    <td style="padding: 10px;">${renderProofLink(req.proofHash)}</td>
                    <td style="padding: 10px;">${statusBadge}</td>
                `;
                disburseTbody.appendChild(tr);
            });
        } else {
            // Hiển thị hồ sơ chứng từ Off-chain đang chờ đối soát On-chain
            disburseTbody.innerHTML = "";
            offchainProofs.forEach(item => {
                const tr = document.createElement("tr");
                tr.style.borderBottom = "1px solid var(--border)";
                tr.innerHTML = `
                    <td style="padding: 10px;">#${item.id}</td>
                    <td style="padding: 10px; font-weight: 500;">
                        ${item.description}
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">
                            🧾 Số HĐ: <strong>${item.invoice_number}</strong> - ${item.supplier_name}
                        </div>
                    </td>
                    <td style="padding: 10px; color: var(--text-muted);">--</td>
                    <td style="padding: 10px; color: var(--text-muted);">--</td>
                    <td style="padding: 10px;">${renderProofLink(item.ipfs_hash)}</td>
                    <td style="padding: 10px;"><span style="background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">📂 Hồ sơ Off-chain</span></td>
                `;
                disburseTbody.appendChild(tr);
            });
        }

    } catch (error) {
        console.error("Lỗi khi tải sao kê chiến dịch:", error);
        donationTbody.innerHTML = `<tr><td colspan="4" style="padding: 16px; text-align: center; color: #dc2626;">Lỗi truy xuất dữ liệu từ Smart Contract.</td></tr>`;
    }
}

// 6. Lắng nghe sự kiện Real-time (Tự cập nhật giao diện khi có giao dịch mới trên Sepolia)
function listenRealtimeEvents() {
    if (!readContract) return;

    readContract.on("DonationReceived", (campaignId) => {
        if (currentCampaignId !== null && Number(campaignId) === currentCampaignId) {
            loadCampaignAuditData(currentCampaignId);
        }
    });

    readContract.on("FundsDisbursed", (campaignId) => {
        if (currentCampaignId !== null && Number(campaignId) === currentCampaignId) {
            loadCampaignAuditData(currentCampaignId);
        }
    });
}

// Khởi chạy các sự kiện DOM
window.connectWallet = connectWallet;

function initAuditEvents() {
    const btnConnect = document.getElementById("btnConnect");
    if (btnConnect) {
        btnConnect.onclick = connectWallet;
    }

    document.getElementById("btnLoadAudit")?.addEventListener("click", () => {
        const selectedId = document.getElementById("selectCampaign").value;
        if (selectedId === "") {
            alert("Vui lòng chọn một chiến dịch!");
            return;
        }
        loadCampaignAuditData(selectedId);
    });

    checkExistingWalletConnection();
    loadCampaignList();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAuditEvents);
} else {
    initAuditEvents();
}