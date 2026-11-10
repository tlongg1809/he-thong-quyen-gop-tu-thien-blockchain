// client/js/donate.js
let provider = null;
let signer = null;
let contract = null;
let userAddress = null;

const btnConnect = document.getElementById("btnConnect");
const walletAddress = document.getElementById("walletAddress");
const campaignsContainer = document.getElementById("campaignsContainer");
const donateModal = document.getElementById("donateModal");
const modalCampaignId = document.getElementById("modalCampaignId");
const modalCampaignTitle = document.getElementById("modalCampaignTitle");
const formDonate = document.getElementById("formDonate");
const txReceiptCard = document.getElementById("txReceiptCard");
const txHashDisplay = document.getElementById("txHashDisplay");

async function init() {
    // 1. Tải địa chỉ contract từ .env trước
    await loadContractConfig();

    if (!CHARITY_CONTRACT_ADDRESS) {
        alert("Chưa cấu hình CONTRACT_ADDRESS trong file .env!");
        return;
    }

    // 2. Tiếp tục khởi tạo Web3 như bình thường
    if (window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_accounts", []);
        if (accounts.length > 0) {
            await setupUser(accounts[0]);
        } else {
            contract = new ethers.Contract(CHARITY_CONTRACT_ADDRESS, CHARITY_CONTRACT_ABI, provider);
            await loadCampaigns();
        }

        window.ethereum.on("accountsChanged", (accs) => {
            if (accs.length > 0) setupUser(accs[0]);
            else location.reload();
        });
    } else {
        alert("Vui lòng cài đặt MetaMask để tương tác với DApp!");
    }
}

async function setupUser(account) {
    userAddress = account;
    signer = await provider.getSigner();
    contract = new ethers.Contract(CHARITY_CONTRACT_ADDRESS, CHARITY_CONTRACT_ABI, signer);

    walletAddress.innerText = account.substring(0, 6) + "..." + account.substring(38);
    walletAddress.style.display = "inline-block";
    btnConnect.style.display = "none";

    await loadCampaigns();
}

async function loadCampaigns() {
    try {
        const count = await contract.campaignCount();
        campaignsContainer.innerHTML = "";

        if (Number(count) === 0) {
            campaignsContainer.innerHTML = "<p>Hiện tại chưa có chiến dịch nào được khởi tạo.</p>";
            return;
        }

        for (let i = 0; i < count; i++) {
            const c = await contract.campaigns(i);
            renderCampaignCard(c);
        }
    } catch (err) {
        console.error("Lỗi tải chiến dịch:", err);
        campaignsContainer.innerHTML = "<p style='color: var(--danger);'>Không thể tải dữ liệu từ Smart Contract. Vui lòng kiểm tra địa chỉ hợp đồng và mạng ví.</p>";
    }
}

function renderCampaignCard(c) {
    const raisedEth = ethers.formatEther(c.raisedAmount);
    const targetEth = ethers.formatEther(c.targetAmount);
    const percent = Math.min(100, Math.round((Number(c.raisedAmount) / Number(c.targetAmount)) * 100)) || 0;
    const deadlineDate = new Date(Number(c.deadline) * 1000).toLocaleDateString();

    const card = document.createElement("div");
    card.className = "candidate-card";
    card.innerHTML = `
        <div>
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                <h3 style="font-size: 1.15rem;">#${c.id} - ${c.title}</h3>
                <span class="badge-status ${c.isClosed ? 'badge-closed' : 'badge-open'}">
                    ${c.isClosed ? 'Đã Đóng' : 'Đang Kêu Gọi'}
                </span>
            </div>
            <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 16px;">
                ${c.description}
            </p>
            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 4px;">
                    <strong>${raisedEth} ETH</strong>
                    <span style="color: var(--text-muted);">Mục tiêu: ${targetEth} ETH</span>
                </div>
                <div style="background: #e2e8f0; border-radius: 9999px; height: 8px; overflow: hidden;">
                    <div style="background: var(--primary); width: ${percent}%; height: 100%;"></div>
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 6px;">
                    Tiến độ: ${percent}% • Hạn: ${deadlineDate}
                </div>
            </div>
        </div>
        <button class="btn btn-primary" style="width: 100%; margin-top: 12px;" 
            ${c.isClosed ? "disabled" : ""} 
            onclick="openDonateModal(${c.id}, '${c.title.replace(/'/g, "\\'")}')">
            ${c.isClosed ? "Chiến Dịch Đã Kết Thúc" : "Quyên Góp Ngay"}
        </button>
    `;
    campaignsContainer.appendChild(card);
}

window.openDonateModal = function(id, title) {
    if (!userAddress) {
        alert("Vui lòng kết nối ví MetaMask trước khi quyên góp!");
        return;
    }
    modalCampaignId.value = id;
    modalCampaignTitle.innerText = `Ủng Hộ: ${title}`;
    donateModal.style.display = "flex";
};

window.closeDonateModal = function() {
    donateModal.style.display = "none";
    formDonate.reset();
};

formDonate.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = modalCampaignId.value;
    const amountEth = document.getElementById("donateAmount").value;
    const message = document.getElementById("donateMessage").value;
    const btnSubmit = document.getElementById("btnSubmitDonate");

    try {
        btnSubmit.disabled = true;
        btnSubmit.innerText = "Đang xác thực...";

        // Chuyển ETH sang Wei
        const amountWei = ethers.parseEther(amountEth);

        // Gọi hàm donate trên Smart Contract kèm giá trị coin
        const tx = await contract.donate(id, message, { value: amountWei });
        
        closeDonateModal();
        txReceiptCard.style.display = "block";
        txHashDisplay.innerText = "Giao dịch đang chờ xác nhận: " + tx.hash;

        await tx.wait(); // Chờ đào xong block
        txHashDisplay.innerText = "Giao dịch thành công! Hash: " + tx.hash;
        alert("Cảm ơn bạn đã quyên góp thành công!");
        await loadCampaigns();
    } catch (err) {
        console.error(err);
        alert("Giao dịch thất bại: " + (err.reason || err.message));
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerText = "Xác Nhận Ký Ví";
    }
});

btnConnect?.addEventListener("click", async () => {
    if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        await setupUser(accounts[0]);
    }
});

init();