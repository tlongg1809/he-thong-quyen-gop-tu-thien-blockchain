// client/js/audit.js

let provider = null;
let contract = null;
let currentAccount = null;

const btnConnect = document.getElementById("btnConnect");
const walletAddress = document.getElementById("walletAddress");
const selectCampaign = document.getElementById("selectCampaign");
const btnLoadAudit = document.getElementById("btnLoadAudit");

const campaignOverview = document.getElementById("campaignOverview");
const infoTitle = document.getElementById("infoTitle");
const infoDesc = document.getElementById("infoDesc");
const infoRaised = document.getElementById("infoRaised");
const infoTarget = document.getElementById("infoTarget");
const infoDisbursed = document.getElementById("infoDisbursed");
const infoStatus = document.getElementById("infoStatus");

const donationTableBody = document.getElementById("donationTableBody");
const disburseTableBody = document.getElementById("disburseTableBody");

async function init() {
    // 1. Nạp địa chỉ Smart Contract từ file .env qua PHP API
    if (typeof loadContractConfig === "function") {
        await loadContractConfig();
    }

    if (!CHARITY_CONTRACT_ADDRESS) {
        alert("Chưa cấu hình CHARITY_CONTRACT_ADDRESS hợp lệ!");
        return;
    }

    // 2. Khởi tạo kết nối Web3 (Chỉ cần Read-only Provider nếu người dùng không kết nối ví)
    if (window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_accounts", []);
        if (accounts.length > 0) {
            currentAccount = accounts[0];
            walletAddress.innerText = `${currentAccount.substring(0, 6)}...${currentAccount.substring(currentAccount.length - 4)}`;
            walletAddress.style.display = "inline-block";
            btnConnect.innerText = "Đã Kết Nối";
            btnConnect.disabled = true;
        }
        
        const signer = await provider.getSigner();
        contract = new ethers.Contract(CHARITY_CONTRACT_ADDRESS, CHARITY_CONTRACT_ABI, signer);
    } else {
        // Fallback dùng public provider nếu không cài MetaMask
        provider = new ethers.JsonRpcProvider("https://rpc.sepolia.org");
        contract = new ethers.Contract(CHARITY_CONTRACT_ADDRESS, CHARITY_CONTRACT_ABI, provider);
    }

    // 3. Tải danh sách chiến dịch vào thẻ <select>
    await loadCampaignOptions();
}

/**
 * Tải danh sách chiến dịch để đưa vào ô lựa chọn
 */
async function loadCampaignOptions() {
    try {
        const count = await contract.campaignCount();
        selectCampaign.innerHTML = "";

        if (Number(count) === 0) {
            selectCampaign.innerHTML = `<option value="">-- Không có chiến dịch nào trên hệ thống --</option>`;
            return;
        }

        selectCampaign.innerHTML = `<option value="">-- Chọn một chiến dịch để xem sao kê --</option>`;
        for (let i = 0; i < count; i++) {
            const c = await contract.campaigns(i);
            const opt = document.createElement("option");
            opt.value = c.id.toString();
            opt.textContent = `[ID: ${c.id}] ${c.title} (${c.isClosed ? 'Đã đóng' : 'Đang kêu gọi'})`;
            selectCampaign.appendChild(opt);
        }
    } catch (err) {
        console.error("Lỗi tải danh sách chiến dịch:", err);
        selectCampaign.innerHTML = `<option value="">-- Lỗi kết nối Smart Contract --</option>`;
    }
}

/**
 * Xử lý sự kiện khi bấm nút "Xem Sao Kê"
 */
btnLoadAudit.addEventListener("click", async () => {
    const campaignId = selectCampaign.value;
    if (campaignId === "") {
        alert("Vui lòng chọn một chiến dịch cụ thể!");
        return;
    }

    try {
        btnLoadAudit.disabled = true;
        btnLoadAudit.textContent = "Đang tải dữ liệu...";

        // 1. Lấy thông tin tổng quan chiến dịch
        const c = await contract.campaigns(campaignId);
        campaignOverview.style.display = "block";
        infoTitle.textContent = `#${c.id.toString()} - ${c.title}`;
        infoDesc.textContent = c.description;
        infoRaised.textContent = `${ethers.formatEther(c.raisedAmount)} ETH`;
        infoTarget.textContent = `${ethers.formatEther(c.targetAmount)} ETH`;
        infoDisbursed.textContent = `${ethers.formatEther(c.disbursedAmount)} ETH`;
        infoStatus.textContent = c.isClosed ? "Đã Đóng" : "Đang Kêu Gọi";
        infoStatus.className = "badge-status " + (c.isClosed ? "badge-closed" : "badge-open");

        // 2. Lấy lịch sử quyên góp (Donation History)
        const donations = await contract.getDonationHistory(campaignId);
        donationTableBody.innerHTML = "";
        if (donations.length === 0) {
            donationTableBody.innerHTML = `<tr><td colspan="4" style="padding: 16px; text-align: center; color: var(--text-muted);">Chưa có lượt quyên góp nào.</td></tr>`;
        } else {
            donations.forEach(d => {
                const date = new Date(Number(d.timestamp) * 1000).toLocaleString();
                const tr = document.createElement("tr");
                tr.style.borderBottom = "1px solid var(--border)";
                tr.innerHTML = `
                    <td style="padding: 10px; font-family: monospace;">${d.donor}</td>
                    <td style="padding: 10px; font-weight: bold; color: var(--primary);">+${ethers.formatEther(d.amount)} ETH</td>
                    <td style="padding: 10px;">${d.message || "(Không có)"}</td>
                    <td style="padding: 10px; color: var(--text-muted);">${date}</td>
                `;
                donationTableBody.appendChild(tr);
            });
        }

        // 3. Lấy lịch sử giải ngân (Disbursement History)
        const disbursements = await contract.getDisbursementHistory(campaignId);
        disburseTableBody.innerHTML = "";
        if (disbursements.length === 0) {
            disburseTableBody.innerHTML = `<tr><td colspan="6" style="padding: 16px; text-align: center; color: var(--text-muted);">Chưa có yêu cầu giải ngân nào.</td></tr>`;
        } else {
            disbursements.forEach(dis => {
                const tr = document.createElement("tr");
                tr.style.borderBottom = "1px solid var(--border)";
                tr.innerHTML = `
                    <td style="padding: 10px;">#${dis.id.toString()}</td>
                    <td style="padding: 10px;">${dis.purpose}</td>
                    <td style="padding: 10px; font-weight: bold; color: var(--danger);">${ethers.formatEther(dis.amount)} ETH</td>
                    <td style="padding: 10px; font-family: monospace; font-size: 0.85rem;">${dis.recipient}</td>
                    <td style="padding: 10px; font-family: monospace; font-size: 0.85rem; word-break: break-all;">${dis.proofHash}</td>
                    <td style="padding: 10px;">
                        <span class="badge-status ${dis.isExecuted ? 'badge-open' : 'badge-closed'}" style="${dis.isExecuted ? 'background: #dcfce7; color: #166534;' : 'background: #fef9c3; color: #854d0e;'}">
                            ${dis.isExecuted ? 'Đã Thực Thi' : 'Đang Chờ'}
                        </span>
                    </td>
                `;
                disburseTableBody.appendChild(tr);
            });
        }

    } catch (err) {
        console.error("Lỗi tải sao kê:", err);
        alert("Không thể tải dữ liệu sao kê: " + (err.reason || err.message));
    } finally {
        btnLoadAudit.disabled = false;
        btnLoadAudit.textContent = "Xem Sao Kê";
    }
}

// Xử lý nút Kết nối ví trên trang sao kê
btnConnect?.addEventListener("click", async () => {
    if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        if (accounts.length > 0) {
            currentAccount = accounts[0];
            walletAddress.innerText = `${currentAccount.substring(0, 6)}...${currentAccount.substring(currentAccount.length - 4)}`;
            walletAddress.style.display = "inline-block";
            btnConnect.innerText = "Đã Kết Nối";
            btnConnect.disabled = true;
        }
    } else {
        alert("Vui lòng cài đặt MetaMask!");
    }
});

document.addEventListener("DOMContentLoaded", init);