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

// Public Sepolia RPC để luôn đọc được dữ liệu chiến dịch dù ví đang ở mạng nào hoặc chưa kết nối ví
const SEPOLIA_PUBLIC_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const readProvider = new ethers.JsonRpcProvider(SEPOLIA_PUBLIC_RPC);

async function init() {
    // 1. Tải địa chỉ contract từ .env trước
    await loadContractConfig();

    // 2. Luôn tải danh sách chiến dịch bằng Public Sepolia RPC
    await loadCampaigns();

    // 3. Khởi tạo Web3 / MetaMask nếu có sẵn
    if (window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum);
        try {
            const accounts = await provider.send("eth_accounts", []);
            if (accounts.length > 0) {
                await setupUser(accounts[0]);
            }
        } catch (e) {
            console.warn("Lỗi kiểm tra ví đã kết nối:", e);
        }

        window.ethereum.on("accountsChanged", (accs) => {
            if (accs.length > 0) setupUser(accs[0]);
            else location.reload();
        });

        window.ethereum.on("chainChanged", () => {
            location.reload();
        });
    }
}

async function setupUser(account) {
    userAddress = account;
    if (provider) {
        signer = await provider.getSigner();
        contract = new ethers.Contract(CHARITY_CONTRACT_ADDRESS, CHARITY_CONTRACT_ABI, signer);
    }

    if (walletAddress) {
        walletAddress.innerText = account.substring(0, 6) + "..." + account.substring(account.length - 4);
        walletAddress.style.display = "inline-block";
    }
    if (btnConnect) {
        btnConnect.style.display = "none";
    }
}

async function loadCampaigns() {
    try {
        const readContract = new ethers.Contract(CHARITY_CONTRACT_ADDRESS, CHARITY_CONTRACT_ABI, readProvider);
        const count = await readContract.campaignCount();
        campaignsContainer.innerHTML = "";

        if (Number(count) === 0) {
            campaignsContainer.innerHTML = "<p style='color: var(--text-muted); grid-column: 1 / -1; text-align: center; padding: 32px;'>Hiện tại chưa có chiến dịch nào được khởi tạo trên Smart Contract.</p>";
            return;
        }

        for (let i = 0; i < count; i++) {
            const c = await readContract.campaigns(i);
            renderCampaignCard(c);
        }
    } catch (err) {
        console.error("Lỗi tải chiến dịch:", err);
        campaignsContainer.innerHTML = "<p style='color: var(--danger); grid-column: 1 / -1; text-align: center; padding: 24px;'>Không thể tải dữ liệu từ Smart Contract. Vui lòng kiểm tra kết nối mạng Internet hoặc RPC Sepolia.</p>";
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

        // Đảm bảo ví đang ở mạng Sepolia
        await checkOrSwitchSepolia();
        if (!provider) {
            provider = new ethers.BrowserProvider(window.ethereum);
        }
        if (!signer) {
            signer = await provider.getSigner();
        }
        const writeContract = new ethers.Contract(CHARITY_CONTRACT_ADDRESS, CHARITY_CONTRACT_ABI, signer);

        // Chuyển ETH sang Wei
        const amountWei = ethers.parseEther(amountEth);

        // Gọi hàm donate trên Smart Contract kèm giá trị coin
        const tx = await writeContract.donate(id, message, { value: amountWei });
        
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

// Kiểm tra hoặc tự động chuyển mạng Sepolia
async function checkOrSwitchSepolia() {
    if (!window.ethereum) return;
    try {
        const chainId = await window.ethereum.request({ method: "eth_chainId" });
        if (chainId !== "0xaa36a7") {
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

async function connectWallet() {
    if (!window.ethereum) {
        if (window.location.protocol === "file:") {
            alert("Lỗi: Bạn đang mở trang bằng đường dẫn file:// trực tiếp.\nMetaMask bị trình duyệt chặn không cho tương tác trên file://.\n\nVui lòng khởi động Apache trong XAMPP và truy cập qua:\nhttp://localhost/he-thong-quyen-gop-tu-thien-blockchain/client/index.html");
        } else {
            alert("Vui lòng cài đặt tiện ích mở rộng MetaMask trên trình duyệt (https://metamask.io)!");
        }
        return;
    }
    try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        if (accounts && accounts.length > 0) {
            await setupUser(accounts[0]);
            await checkOrSwitchSepolia();
        }
    } catch (err) {
        console.error("Lỗi kết nối ví:", err);
        if (err.code === 4001) {
            alert("Bạn đã hủy/từ chối yêu cầu kết nối ví MetaMask.");
        } else if (err.code === -32002) {
            alert("Yêu cầu kết nối đang chờ xử lý!\n\nVui lòng bấm vào biểu tượng con cáo MetaMask ở góc trên bên phải trình duyệt để mở cửa sổ xác nhận.");
        } else {
            alert("Lỗi kết nối ví: " + (err.message || err));
        }
    }
}

window.connectWallet = connectWallet;

btnConnect?.addEventListener("click", connectWallet);

init();