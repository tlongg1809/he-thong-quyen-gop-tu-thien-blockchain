// client/js/audit.js
/**
 * Logic Tra Cứu Sao Kê & Minh Bạch Dòng Tiền On-chain & Off-chain
 * Dự án: CharityChain - Quyên Góp Từ Thiện Minh Bạch Trên Ethereum Sepolia
 */

// Biến lưu cấu hình được nạp động 100% từ server/config/config_api.php (đọc bảo mật từ server/.env)
let APP_CONFIG = {
    contractAddress: (typeof CHARITY_CONTRACT_ADDRESS !== "undefined" && CHARITY_CONTRACT_ADDRESS)
        ? CHARITY_CONTRACT_ADDRESS
        : "",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    pinataGateway: "https://gateway.pinata.cloud/ipfs/",
    sampleIpfsCid: ""
};

let readContract = null;
let currentCampaignId = null;

// Lấy ABI chuẩn từ config.js
function getAuditAbi() {
    if (typeof CHARITY_CONTRACT_ABI !== "undefined" && Array.isArray(CHARITY_CONTRACT_ABI)) {
        return CHARITY_CONTRACT_ABI;
    }
    if (typeof CONTRACT_ABI !== "undefined" && Array.isArray(CONTRACT_ABI)) {
        return CONTRACT_ABI;
    }
    return [
        "function campaignCount() view returns (uint256)",
        "function campaigns(uint256) view returns (tuple(uint256 id, string title, string description, address manager, uint256 targetAmount, uint256 raisedAmount, uint256 disbursedAmount, uint256 deadline, bool isClosed, address creator, uint256 stakeAmount, bool stakeRefunded, bool stakeSlashed, string imageHash, bool isCancelled))",
        "function getDonationHistory(uint256 _campaignId) view returns (tuple(address donor, uint256 amount, uint256 timestamp, string message)[])",
        "function getDisbursementHistory(uint256 _campaignId) view returns (tuple(uint256 id, string purpose, uint256 amount, address recipient, string proofHash, bool isExecuted, uint256 executedAt)[])",
        "event DonationReceived(uint256 indexed campaignId, address indexed donor, uint256 amount, bytes32 indexed txProof, uint256 timestamp)",
        "event FundsDisbursed(uint256 indexed campaignId, uint256 indexed requestId, uint256 amount, address recipient, string proofHash, uint256 timestamp)"
    ];
}

// 1. Nạp cấu hình từ Backend PHP & config.js
async function loadServerConfig() {
    await initContractConfig();

    try {
        const response = await fetch("../server/config/config_api.php");
        if (response.ok) {
            const data = await response.json();
            if (data.contractAddress && data.contractAddress.startsWith("0x")) {
                APP_CONFIG.contractAddress = data.contractAddress;
            }
            if (data.rpcUrl) APP_CONFIG.rpcUrl = data.rpcUrl;
            if (data.pinataGateway) APP_CONFIG.pinataGateway = data.pinataGateway;
            if (data.sampleIpfsCid) APP_CONFIG.sampleIpfsCid = data.sampleIpfsCid;
        }
    } catch (err) {
        console.warn("Dùng cấu hình mặc định do không gọi được config_api.php:", err);
    }

    if (typeof CHARITY_CONTRACT_ADDRESS !== "undefined" && CHARITY_CONTRACT_ADDRESS.startsWith("0x")) {
        APP_CONFIG.contractAddress = CHARITY_CONTRACT_ADDRESS;
    }
}

// Tạo nút mở chứng từ hóa đơn trên IPFS Pinata
function renderProofLink(proofHash) {
    if (!proofHash || proofHash.trim() === "") {
        return `<span style="color: #94a3b8;"><i class="fa-regular fa-file"></i> Chưa có chứng từ</span>`;
    }
    const cleanHash = proofHash.trim();
    if (cleanHash.startsWith("Qm") || cleanHash.startsWith("bafy")) {
        return `<a href="${APP_CONFIG.pinataGateway}${cleanHash}" target="_blank" 
                   style="color: #059669; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: #ecfdf5; border-radius: 6px; border: 1px solid #a7f3d0;">
                   <i class="fa-solid fa-file-invoice"></i> IPFS: ${cleanHash.slice(0, 8)}... <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.75rem;"></i>
                </a>`;
    }
    if (APP_CONFIG.sampleIpfsCid) {
        return `<a href="${APP_CONFIG.pinataGateway}${APP_CONFIG.sampleIpfsCid}" target="_blank" 
                   title="Mã gốc: ${cleanHash}" style="color: #2563eb; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: #eff6ff; border-radius: 6px; border: 1px solid #bfdbfe;">
                   <i class="fa-solid fa-receipt"></i> ${cleanHash.slice(0, 10)}... <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.75rem;"></i>
                </a>`;
    }
    return `<span style="font-family: monospace;">${cleanHash}</span>`;
}

// 2. Kết nối ví MetaMask (Tùy chọn trên thanh Navbar)
async function connectWallet() {
    if (!window.ethereum) {
        showToast("warning", "Chưa Cài MetaMask", "Vui lòng cài đặt tiện ích mở rộng MetaMask trên trình duyệt (https://metamask.io)!");
        return;
    }

    try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        if (!accounts || accounts.length === 0) {
            showToast("warning", "Không Tìm Thấy Tài Khoản", "Không tìm thấy tài khoản MetaMask nào!");
            return;
        }

        const walletBadge = document.getElementById("walletAddress");
        const btnConnect = document.getElementById("btnConnect");

        if (walletBadge && btnConnect) {
            walletBadge.innerHTML = `<i class="fa-solid fa-wallet"></i> ${shortenAddress(accounts[0])}`;
            walletBadge.style.display = "inline-flex";
            btnConnect.style.display = "none";
        }

        await checkOrSwitchSepolia();
        showToast("success", "Đã Kết Nối Ví", `Địa chỉ: ${shortenAddress(accounts[0])}`);
    } catch (err) {
        console.error("Lỗi kết nối ví:", err);
        if (err.code === 4001) {
            showToast("info", "Đã Hủy", "Bạn đã từ chối yêu cầu kết nối với ví MetaMask.");
        } else {
            showToast("error", "Lỗi Kết Nối", err.message || String(err));
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
                walletBadge.innerHTML = `<i class="fa-solid fa-wallet"></i> ${shortenAddress(accounts[0])}`;
                walletBadge.style.display = "inline-flex";
                btnConnect.style.display = "none";
            }
        }
    } catch (e) {
        console.warn("Lỗi kiểm tra ví đã kết nối:", e);
    }

    window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts && accounts.length > 0) {
            const walletBadge = document.getElementById("walletAddress");
            if (walletBadge) walletBadge.innerHTML = `<i class="fa-solid fa-wallet"></i> ${shortenAddress(accounts[0])}`;
        } else {
            location.reload();
        }
    });

    window.ethereum.on("chainChanged", () => {
        location.reload();
    });
}

// 3. Khởi tạo kết nối Sepolia và tải danh sách chiến dịch vào dropdown
async function loadCampaignList() {
    const selectEl = document.getElementById("selectCampaign");
    try {
        await loadServerConfig();

        if (!APP_CONFIG.contractAddress || !APP_CONFIG.contractAddress.startsWith("0x")) {
            selectEl.innerHTML = `<option value="">Lỗi: Chưa cấu hình CONTRACT_ADDRESS trong server/.env</option>`;
            if (typeof showToast === "function") {
                showToast("error", "Lỗi Cấu Hình", "Không tìm thấy CONTRACT_ADDRESS trong file server/.env. Vui lòng kiểm tra lại cấu hình!");
            }
            return;
        }

        const provider = await getWeb3Provider();
        const abi = getAuditAbi();

        console.log("=== Khởi tạo Sao Kê Contract ===");
        console.log("Contract Address:", APP_CONFIG.contractAddress);

        readContract = new ethers.Contract(APP_CONFIG.contractAddress, abi, provider);

        const count = await readContract.campaignCount();
        const totalCampaigns = Number(count);
        console.log("Tổng số chiến dịch tìm thấy trên Smart Contract:", totalCampaigns);

        selectEl.innerHTML = `<option value="">-- Chọn chiến dịch cần tra cứu (${totalCampaigns} chiến dịch) --</option>`;

        if (totalCampaigns === 0) {
            selectEl.innerHTML = `<option value="">-- Hiện chưa có chiến dịch nào trên Smart Contract --</option>`;
            return;
        }

        for (let i = 0; i < totalCampaigns; i++) {
            try {
                const c = await readContract.campaigns(i);
                const option = document.createElement("option");
                option.value = i;
                const cTitle = c.title || `Chiến dịch #${i}`;
                const targetEth = c.targetAmount ? ethers.formatEther(c.targetAmount) : "0";
                option.textContent = `#${i} - ${cTitle} (Mục tiêu: ${targetEth} ETH)`;
                selectEl.appendChild(option);
            } catch (errItem) {
                console.error(`Lỗi đọc chiến dịch #${i}:`, errItem);
                const option = document.createElement("option");
                option.value = i;
                option.textContent = `#${i} - Chiến dịch #${i}`;
                selectEl.appendChild(option);
            }
        }

        // Tự động chọn và tải dữ liệu chiến dịch đầu tiên nếu có
        selectEl.value = "0";
        await loadCampaignAuditData(0);

        // Bật lắng nghe sự kiện thời gian thực
        listenRealtimeEvents();

    } catch (error) {
        console.error("Lỗi khởi tạo trang sao kê (loadCampaignList):", error);
        const errMsg = parseContractError(error);
        selectEl.innerHTML = `<option value="">Lỗi kết nối cấu hình hoặc mạng Sepolia (${errMsg.substring(0, 50)}...)</option>`;
    }
}

// 4. Truy vấn dữ liệu sao kê chi tiết (Tiền vào & Tiền ra) của 1 chiến dịch
async function loadCampaignAuditData(campaignId) {
    currentCampaignId = Number(campaignId);
    const overviewSection = document.getElementById("campaignOverview");
    const donationTbody = document.getElementById("donationTableBody");
    const disburseTbody = document.getElementById("disburseTableBody");

    donationTbody.innerHTML = `<tr><td colspan="5" style="padding: 24px; text-align: center; color: #64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Đang truy xuất danh sách mạnh thường quân On-chain...</td></tr>`;
    disburseTbody.innerHTML = `<tr><td colspan="7" style="padding: 24px; text-align: center; color: #64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Đang truy xuất lịch sử giải ngân & đối soát chứng từ...</td></tr>`;

    try {
        if (!readContract) {
            await loadServerConfig();
            const provider = await getWeb3Provider();
            const abi = getAuditAbi();
            readContract = new ethers.Contract(APP_CONFIG.contractAddress, abi, provider);
        }

        // Lấy thông tin tổng quan chiến dịch (Struct Campaign 15 trường)
        const c = await readContract.campaigns(currentCampaignId);
        overviewSection.style.display = "block";
        
        const cId = (c.id !== undefined && c.id !== null) ? c.id : currentCampaignId;
        const cTitle = c.title || `Chiến dịch #${currentCampaignId}`;
        document.getElementById("infoTitle").innerText = `#${cId} - ${cTitle}`;
        document.getElementById("infoDesc").innerText = c.description || "";

        const raisedEth = ethers.formatEther(c.raisedAmount || 0);
        const targetEth = ethers.formatEther(c.targetAmount || 0);
        const disbursedEth = ethers.formatEther(c.disbursedAmount || 0);
        const balanceEth = (parseFloat(raisedEth) - parseFloat(disbursedEth)).toFixed(4);

        document.getElementById("infoRaised").innerText = `${raisedEth} ETH`;
        document.getElementById("infoTarget").innerText = `${targetEth} ETH`;
        document.getElementById("infoDisbursed").innerText = `${disbursedEth} ETH`;

        const infoBalanceEl = document.getElementById("infoBalance");
        if (infoBalanceEl) infoBalanceEl.innerText = `${balanceEth} ETH`;

        // Trạng thái chiến dịch (Phản ánh đúng c.isCancelled, c.stakeSlashed, c.isClosed, deadline)
        const statusEl = document.getElementById("infoStatus");
        const isCancelled = Boolean(c.isCancelled);
        const isSlashed = Boolean(c.stakeSlashed);
        const isClosed = Boolean(c.isClosed);
        const isExpired = c.deadline ? (Date.now() > Number(c.deadline) * 1000) : false;
        const isUnfunded = Number(c.raisedAmount || 0) < Number(c.targetAmount || 0);

        if (isCancelled || isSlashed) {
            statusEl.innerHTML = `<i class="fa-solid fa-ban"></i> Đã Đình Chỉ (Tịch thu ký quỹ do vi phạm)`;
            statusEl.className = "badge-status badge-closed";
        } else if (isClosed) {
            statusEl.innerHTML = `<i class="fa-solid fa-lock"></i> Đã Đóng Tiếp Nhận`;
            statusEl.className = "badge-status badge-closed";
        } else if (isExpired && isUnfunded) {
            statusEl.innerHTML = `<i class="fa-solid fa-clock"></i> Hết Hạn Chưa Đạt (Có thể Claim Refund)`;
            statusEl.className = "badge-status badge-warning";
        } else {
            statusEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> Đang Tiếp Nhận Quyên Góp`;
            statusEl.className = "badge-status badge-open";
        }

        // Đổ dữ liệu Bảng 1: Danh sách mạnh thường quân đóng góp (On-chain)
        let donations = [];
        try {
            donations = await readContract.getDonationHistory(currentCampaignId);
        } catch (donErr) {
            console.error("Lỗi đọc lịch sử quyên góp On-chain:", donErr);
        }

        if (!donations || donations.length === 0) {
            donationTbody.innerHTML = `<tr><td colspan="5" style="padding: 24px; text-align: center; color: #64748b;">Chưa có lượt quyên góp nào cho chiến dịch này.</td></tr>`;
        } else {
            donationTbody.innerHTML = "";
            [...donations].reverse().forEach((d, idx) => {
                const tr = document.createElement("tr");
                tr.style.borderBottom = "1px solid #e2e8f0";
                tr.innerHTML = `
                    <td style="padding: 12px 14px; font-family: monospace;">
                        <span style="font-weight: 600; color: #1e293b;">${shortenAddress(d.donor)}</span>
                        <button type="button" onclick="copyToClipboard('${d.donor}', 'Đã sao chép địa chỉ ví!')"
                            style="border: none; background: transparent; cursor: pointer; color: #94a3b8; margin-left: 6px;"
                            title="Sao chép địa chỉ ví">
                            <i class="fa-regular fa-copy"></i>
                        </button>
                    </td>
                    <td style="padding: 12px 14px; font-weight: 700; color: #10b981;">
                        +${ethers.formatEther(d.amount)} ETH
                    </td>
                    <td style="padding: 12px 14px; color: #334155;">
                        ${d.message || "Ủng hộ chiến dịch"}
                    </td>
                    <td style="padding: 12px 14px; color: #64748b; font-size: 0.82rem;">
                        ${formatTimestamp(d.timestamp)}
                    </td>
                    <td style="padding: 12px 14px; text-align: center;">
                        <a href="https://sepolia.etherscan.io/address/${d.donor}" target="_blank" 
                           style="color: #6366f1; text-decoration: none;" title="Xem trên Sepolia Etherscan">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        </a>
                    </td>
                `;
                donationTbody.appendChild(tr);
            });
        }

        // Tải chứng từ Off-chain từ MySQL proofs_api.php
        let offchainProofs = [];
        try {
            const proofRes = await fetch(`../server/api/proofs_api.php?campaign_id=${currentCampaignId}`);
            if (proofRes.ok) {
                const proofJson = await proofRes.json();
                if (proofJson.status === "success" && Array.isArray(proofJson.data)) {
                    offchainProofs = proofJson.data;
                }
            }
        } catch (e) {
            console.warn("Không tải được dữ liệu Off-chain từ proofs_api.php:", e);
        }

        // Đổ dữ liệu Bảng 2: Đối soát Giải ngân On-chain & Chứng từ Off-chain
        let disbursements = [];
        try {
            disbursements = await readContract.getDisbursementHistory(currentCampaignId);
        } catch (disbErr) {
            console.error("Lỗi đọc lịch sử giải ngân On-chain:", disbErr);
        }

        if ((!disbursements || disbursements.length === 0) && offchainProofs.length === 0) {
            disburseTbody.innerHTML = `<tr><td colspan="7" style="padding: 24px; text-align: center; color: #64748b;">Chưa có đề xuất giải ngân nào.</td></tr>`;
        } else if (disbursements && disbursements.length > 0) {
            disburseTbody.innerHTML = "";
            disbursements.forEach(req => {
                const matchedOffchain = offchainProofs.find(p => p.ipfs_hash === req.proofHash);
                const extraInfo = matchedOffchain
                    ? `<div style="font-size: 0.78rem; color: #64748b; margin-top: 4px;">
                         🧾 HĐ: <strong>${matchedOffchain.invoice_number}</strong> • ${matchedOffchain.supplier_name}
                       </div>`
                    : "";

                const statusBadge = req.isExecuted
                    ? `<span style="background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                         <i class="fa-solid fa-check-double"></i> Đã giải ngân (${formatTimestamp(req.executedAt)})
                       </span>`
                    : `<span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                         <i class="fa-solid fa-hourglass-half"></i> Chờ Admin Duyệt
                       </span>`;

                const txDisplay = (matchedOffchain && matchedOffchain.tx_hash)
                    ? `<span style="font-family: monospace;">${shortenAddress(matchedOffchain.tx_hash)}</span>
                       <button type="button" onclick="copyToClipboard('${matchedOffchain.tx_hash}', 'Đã sao chép TxHash!')"
                           style="border: none; background: transparent; cursor: pointer; color: #94a3b8; margin-left: 4px;" title="Sao chép TxHash">
                           <i class="fa-regular fa-copy"></i>
                       </button>
                       <a href="https://sepolia.etherscan.io/tx/${matchedOffchain.tx_hash}" target="_blank" style="color: #6366f1; margin-left: 4px;" title="Xem trên Etherscan">
                           <i class="fa-solid fa-arrow-up-right-from-square"></i>
                       </a>`
                    : `<span style="color: #94a3b8; font-size: 0.8rem;">Theo block On-chain</span>`;

                const tr = document.createElement("tr");
                tr.style.borderBottom = "1px solid #e2e8f0";
                tr.innerHTML = `
                    <td style="padding: 12px 14px; font-weight: 700;">#${req.id}</td>
                    <td style="padding: 12px 14px; font-weight: 500;">
                        ${req.purpose || "--"}
                        ${extraInfo}
                    </td>
                    <td style="padding: 12px 14px; font-weight: 800; color: #d97706;">
                        ${ethers.formatEther(req.amount || 0)} ETH
                    </td>
                    <td style="padding: 12px 14px; font-family: monospace;">
                        <span>${shortenAddress(req.recipient)}</span>
                        <button type="button" onclick="copyToClipboard('${req.recipient}', 'Đã sao chép ví thụ hưởng!')"
                            style="border: none; background: transparent; cursor: pointer; color: #94a3b8; margin-left: 4px;" title="Sao chép ví thụ hưởng">
                            <i class="fa-regular fa-copy"></i>
                        </button>
                        <a href="https://sepolia.etherscan.io/address/${req.recipient}" target="_blank" style="color: #6366f1; margin-left: 4px;" title="Xem Etherscan">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        </a>
                    </td>
                    <td style="padding: 12px 14px;">
                        ${renderProofLink(req.proofHash)}
                    </td>
                    <td style="padding: 12px 14px;">
                        ${txDisplay}
                    </td>
                    <td style="padding: 12px 14px; text-align: center;">
                        ${statusBadge}
                    </td>
                `;
                disburseTbody.appendChild(tr);
            });
        } else {
            // Hiển thị hồ sơ chứng từ Off-chain đang chờ đối soát On-chain
            disburseTbody.innerHTML = "";
            offchainProofs.forEach(item => {
                const tr = document.createElement("tr");
                tr.style.borderBottom = "1px solid #e2e8f0";
                tr.innerHTML = `
                    <td style="padding: 12px 14px; font-weight: 700;">#${item.id}</td>
                    <td style="padding: 12px 14px; font-weight: 500;">
                        ${item.description}
                        <div style="font-size: 0.78rem; color: #64748b; margin-top: 4px;">
                            🧾 HĐ: <strong>${item.invoice_number}</strong> • ${item.supplier_name}
                        </div>
                    </td>
                    <td style="padding: 12px 14px; color: #94a3b8;">--</td>
                    <td style="padding: 12px 14px; color: #94a3b8;">--</td>
                    <td style="padding: 12px 14px;">${renderProofLink(item.ipfs_hash)}</td>
                    <td style="padding: 12px 14px; font-family: monospace;">
                        <span>${shortenAddress(item.tx_hash)}</span>
                        <button type="button" onclick="copyToClipboard('${item.tx_hash}', 'Đã sao chép TxHash!')"
                            style="border: none; background: transparent; cursor: pointer; color: #94a3b8; margin-left: 4px;" title="Sao chép TxHash">
                            <i class="fa-regular fa-copy"></i>
                        </button>
                    </td>
                    <td style="padding: 12px 14px; text-align: center;">
                        <span style="background: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                            <i class="fa-solid fa-folder-open"></i> Hồ Sơ Off-chain
                        </span>
                    </td>
                `;
                disburseTbody.appendChild(tr);
            });
        }

    } catch (error) {
        console.error("Lỗi khi tải sao kê chi tiết chiến dịch (loadCampaignAuditData):", error);
        const errDetail = parseContractError(error);
        donationTbody.innerHTML = `<tr><td colspan="5" style="padding: 24px; text-align: center; color: #dc2626;">Lỗi truy xuất dữ liệu từ Smart Contract: ${errDetail}</td></tr>`;
    }
}

// 5. Lắng nghe sự kiện Real-time (Tự cập nhật giao diện khi có giao dịch mới trên Sepolia)
function listenRealtimeEvents() {
    if (!readContract) return;

    try {
        readContract.on("DonationReceived", (campaignId) => {
            if (currentCampaignId !== null && Number(campaignId) === currentCampaignId) {
                showToast("info", "Cập Nhật Quyên Góp", `Chiến dịch #${campaignId} vừa nhận thêm một khoản đóng góp mới!`);
                loadCampaignAuditData(currentCampaignId);
            }
        });

        readContract.on("FundsDisbursed", (campaignId) => {
            if (currentCampaignId !== null && Number(campaignId) === currentCampaignId) {
                showToast("success", "Cập Nhật Giải Ngân", `Chiến dịch #${campaignId} vừa thực hiện một khoản giải ngân thành công!`);
                loadCampaignAuditData(currentCampaignId);
            }
        });
    } catch (e) {
        console.warn("Không thể kích hoạt bộ lắng nghe sự kiện WebSocket/Realtime:", e);
    }
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
            showToast("warning", "Chưa Chọn Chiến Dịch", "Vui lòng chọn một chiến dịch để xem sao kê!");
            return;
        }
        loadCampaignAuditData(selectedId);
    });

    document.getElementById("selectCampaign")?.addEventListener("change", (e) => {
        if (e.target.value !== "") {
            loadCampaignAuditData(e.target.value);
        }
    });

    checkExistingWalletConnection();
    loadCampaignList();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAuditEvents);
} else {
    initAuditEvents();
}
