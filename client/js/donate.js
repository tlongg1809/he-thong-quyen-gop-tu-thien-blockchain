// client/js/donate.js
/**
 * Logic Quyên Góp, Đối Soát Mã Băm Ảnh và Thống Kê Trang Chủ
 * Dự án: CharityChain - Quyên Góp Từ Thiện Minh Bạch Trên Ethereum Sepolia
 */

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

// Modal kiểm chứng tính toàn vẹn ảnh
const verifyImageModal = document.getElementById("verifyImageModal");
const verifyModalImg = document.getElementById("verifyModalImg");
const verifyModalCampaignName = document.getElementById("verifyModalCampaignName");
const verifyModalFilePath = document.getElementById("verifyModalFilePath");
const verifyOffChainHash = document.getElementById("verifyOffChainHash");
const verifyOnChainHash = document.getElementById("verifyOnChainHash");
const verifyMatchStatus = document.getElementById("verifyMatchStatus");

// Danh sách metadata ảnh và thông tin bổ sung tải từ MySQL
let campaignsMetadataMap = {};

async function init() {
    // 1. Tải địa chỉ contract từ .env / config.js
    await initContractConfig();

    // 2. Tải danh sách chiến dịch bằng Public Sepolia RPC + Metadata Off-chain từ MySQL
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
        walletAddress.innerHTML = `<i class="fa-solid fa-wallet"></i> ${shortenAddress(account)}`;
        walletAddress.style.display = "inline-flex";
    }
    if (btnConnect) {
        btnConnect.style.display = "none";
    }
}

// Tải metadata ảnh từ MySQL để kết hợp với dữ liệu On-chain
async function fetchMetadataList() {
    try {
        const res = await fetch("../server/api/campaigns_metadata_api.php");
        if (res.ok) {
            const json = await res.json();
            if (json.status === "success" && Array.isArray(json.data)) {
                campaignsMetadataMap = {};
                json.data.forEach(item => {
                    if (item.campaign_id !== null && item.campaign_id !== undefined) {
                        campaignsMetadataMap[Number(item.campaign_id)] = item;
                    }
                });
            }
        }
    } catch (e) {
        console.warn("Không tải được metadata từ MySQL (dùng chế độ thuần On-chain):", e);
    }
}

async function loadCampaigns() {
    try {
        await fetchMetadataList();

        const readProvider = await getWeb3Provider();
        const readContract = new ethers.Contract(CHARITY_CONTRACT_ADDRESS, CHARITY_CONTRACT_ABI, readProvider);
        const count = await readContract.campaignCount();
        const totalCampaigns = Number(count);

        // Cập nhật DOM số lượng chiến dịch ngay lập tức (khắc phục lỗi hiện dấu '-')
        const statCampaignsEl = document.getElementById("statCampaigns");
        const statTotalRaisedEl = document.getElementById("statTotalRaised");
        const statDonationCountEl = document.getElementById("statDonationCount");

        if (statCampaignsEl) statCampaignsEl.textContent = totalCampaigns;

        campaignsContainer.innerHTML = "";

        if (totalCampaigns === 0) {
            campaignsContainer.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; background: #fff; border-radius: 16px; border: 1px dashed #cbd5e1;">
                    <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; color: #94a3b8; margin-bottom: 12px; display: block;"></i>
                    <h3 style="font-size: 1.1rem; color: #475569; margin-bottom: 6px;">Hiện Chưa Có Chiến Dịch Nào</h3>
                    <p style="color: #64748b; font-size: 0.9rem;">Hãy truy cập trang <a href="admin.html" style="font-weight: 600; text-decoration: underline;">Quản trị</a> để khởi tạo chiến dịch cứu trợ đầu tiên!</p>
                </div>`;
            if (statTotalRaisedEl) statTotalRaisedEl.textContent = "0.00 ETH";
            if (statDonationCountEl) statDonationCountEl.textContent = "0";
            return;
        }

        let totalRaisedWei = 0n;
        let totalDonationCount = 0;

        for (let i = 0; i < totalCampaigns; i++) {
            const c = await readContract.campaigns(i);
            totalRaisedWei += BigInt(c.raisedAmount || 0);

            try {
                const donHistory = await readContract.getDonationHistory(i);
                if (Array.isArray(donHistory)) {
                    totalDonationCount += donHistory.length;
                }
            } catch (_) {}

            const meta = campaignsMetadataMap[Number(c.id)] || null;
            renderCampaignCard(c, meta);
        }

        // Cập nhật số liệu thống kê tổng hợp lên Hero Section
        if (statTotalRaisedEl) {
            statTotalRaisedEl.textContent = `${parseFloat(ethers.formatEther(totalRaisedWei)).toFixed(2)} ETH`;
        }
        if (statDonationCountEl) {
            statDonationCountEl.textContent = totalDonationCount > 0 ? totalDonationCount : "0";
        }

    } catch (err) {
        console.error("Lỗi tải chiến dịch:", err);
        campaignsContainer.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 36px 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 16px; color: #991b1b;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                <strong>Không thể kết nối Smart Contract trên mạng Sepolia!</strong>
                <p style="font-size: 0.85rem; margin-top: 4px; color: #b91c1c;">Vui lòng kiểm tra kết nối Internet hoặc cấu hình CONTRACT_ADDRESS trong file .env.</p>
            </div>`;
    }
}

function renderCampaignCard(c, meta) {
    const raisedEth = ethers.formatEther(c.raisedAmount || 0);
    const targetEth = ethers.formatEther(c.targetAmount || 0);
    const percent = Math.min(100, Math.round((Number(c.raisedAmount || 0) / Number(c.targetAmount || 1)) * 100)) || 0;
    const deadlineDate = c.deadline ? new Date(Number(c.deadline) * 1000).toLocaleDateString("vi-VN") : "--";

    const isCancelled = Boolean(c.isCancelled);
    const isSlashed = Boolean(c.stakeSlashed);
    const isClosed = Boolean(c.isClosed) || isCancelled || isSlashed;
    const isExpired = c.deadline ? (Date.now() > Number(c.deadline) * 1000) : false;
    const isUnderTarget = Number(c.raisedAmount || 0) < Number(c.targetAmount || 0);
    const isExpiredUnfunded = isExpired && isUnderTarget;

    // Điều kiện nhà hảo tâm được claim refund
    const isEligibleRefund = isCancelled || isSlashed || isExpiredUnfunded;

    let statusText = 'Đang Kêu Gọi';
    let statusClass = 'badge-open';
    let statusIcon = '<i class="fa-solid fa-circle-check"></i>';

    if (isCancelled || isSlashed) {
        statusText = 'Đã Đình Chỉ';
        statusClass = 'badge-closed';
        statusIcon = '<i class="fa-solid fa-ban"></i>';
    } else if (isExpiredUnfunded) {
        statusText = 'Hết Hạn Chưa Đạt';
        statusClass = 'badge-warning';
        statusIcon = '<i class="fa-solid fa-clock"></i>';
    } else if (isClosed) {
        statusText = 'Đã Đóng';
        statusClass = 'badge-closed';
        statusIcon = '<i class="fa-solid fa-lock"></i>';
    }

    // Xử lý ảnh bìa chuẩn 16:9
    const defaultPlaceholder = "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=600&q=80";
    let imageSrc = defaultPlaceholder;
    let filePath = "";
    if (meta && meta.image_path) {
        imageSrc = `../${meta.image_path}`;
        filePath = meta.image_path;
    }

    const onChainHash = (c.imageHash && typeof c.imageHash === "string") ? c.imageHash.trim() : "";
    const offChainHash = (meta && meta.image_sha256) ? meta.image_sha256.trim() : "";

    const safeTitle = (c.title || "").replace(/'/g, "\\'").replace(/"/g, "&quot;");
    const safeImgSrc = imageSrc.replace(/'/g, "\\'");
    const safeFilePath = filePath.replace(/'/g, "\\'");
    const safeOffHash = offChainHash.replace(/'/g, "\\'");
    const safeOnHash = onChainHash.replace(/'/g, "\\'");

    let integrityBadge = "";
    if (onChainHash !== "" && offChainHash !== "") {
        if (onChainHash.toLowerCase() === offChainHash.toLowerCase()) {
            integrityBadge = `
                <button type="button" onclick="openVerifyModal(${c.id}, '${safeTitle}', '${safeImgSrc}', '${safeFilePath}', '${safeOffHash}', '${safeOnHash}')"
                    style="position: absolute; bottom: 10px; left: 10px; background: rgba(16, 185, 129, 0.95); color: #fff; padding: 5px 11px; border-radius: 8px; font-size: 0.74rem; font-weight: 600; display: inline-flex; align-items: center; gap: 5px; backdrop-filter: blur(6px); box-shadow: 0 4px 10px rgba(0,0,0,0.18); border: none; cursor: pointer; transition: all 0.2s;"
                    title="Bấm để kiểm chứng chuỗi băm SHA-256 On-chain vs Off-chain">
                    <i class="fa-solid fa-shield-halved"></i> Khớp SHA-256 (Kiểm chứng)
                </button>
            `;
        } else {
            integrityBadge = `
                <button type="button" onclick="openVerifyModal(${c.id}, '${safeTitle}', '${safeImgSrc}', '${safeFilePath}', '${safeOffHash}', '${safeOnHash}')"
                    style="position: absolute; bottom: 10px; left: 10px; background: rgba(220, 38, 38, 0.95); color: #fff; padding: 5px 11px; border-radius: 8px; font-size: 0.74rem; font-weight: 600; display: inline-flex; align-items: center; gap: 5px; backdrop-filter: blur(6px); box-shadow: 0 4px 10px rgba(0,0,0,0.18); border: none; cursor: pointer;"
                    title="CẢNH BÁO: Mã băm ảnh không khớp!">
                    <i class="fa-solid fa-triangle-exclamation"></i> Sai Lệch Băm Ảnh
                </button>
            `;
        }
    } else if (onChainHash !== "") {
        integrityBadge = `
            <button type="button" onclick="openVerifyModal(${c.id}, '${safeTitle}', '${safeImgSrc}', '${safeFilePath}', '${safeOffHash}', '${safeOnHash}')"
                style="position: absolute; bottom: 10px; left: 10px; background: rgba(59, 130, 246, 0.9); color: #fff; padding: 5px 11px; border-radius: 8px; font-size: 0.74rem; font-weight: 600; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;"
                title="Bấm để xem mã băm ảnh On-chain">
                <i class="fa-solid fa-fingerprint"></i> SHA-256: ${onChainHash.substring(0, 8)}...
            </button>
        `;
    }

    let refundButtonHtml = "";
    if (isEligibleRefund) {
        refundButtonHtml = `
            <button type="button" class="btn" 
                style="width: 100%; margin-top: 10px; background: linear-gradient(135deg, #ea580c, #c2410c); color: white; font-weight: 600; border: none; padding: 10px 14px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 7px; box-shadow: 0 4px 12px rgba(194, 65, 12, 0.25);"
                onclick="claimRefund(${c.id})">
                <i class="fa-solid fa-hand-holding-dollar"></i> Rút Lại Tiền Quyên Góp (Claim Refund)
            </button>
        `;
    }

    const card = document.createElement("div");
    card.className = "campaign-card";
    card.innerHTML = `
        <div style="position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; background: #e2e8f0;">
            <img src="${imageSrc}" alt="${c.title}" 
                 style="width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.4s ease;"
                 onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'"
                 onerror="this.src='${defaultPlaceholder}'; this.onerror=null;" />
            <span class="badge-status ${statusClass}" style="position: absolute; top: 12px; right: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                ${statusIcon} ${statusText}
            </span>
            ${integrityBadge}
        </div>

        <div style="padding: 20px; display: flex; flex-direction: column; flex: 1;">
            <h3 style="font-size: 1.15rem; font-weight: 700; color: #0f172a; margin-bottom: 8px; line-height: 1.4;">
                #${c.id} - ${c.title}
            </h3>

            <p style="color: #64748b; font-size: 0.88rem; line-height: 1.55; margin-bottom: 16px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; flex: 1;">
                ${c.description}
            </p>

            <div style="margin-top: auto; padding-top: 12px; border-top: 1px solid #f1f5f9;">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
                    <span style="color: #10b981; font-weight: 800; font-size: 1.05rem;">
                        <i class="fa-brands fa-ethereum"></i> ${raisedEth} ETH
                    </span>
                    <span style="color: #64748b; font-size: 0.82rem;">
                        Mục tiêu: <strong>${targetEth} ETH</strong>
                    </span>
                </div>

                <div class="progress-container" style="background: #f1f5f9; border-radius: 9999px; height: 9px; overflow: hidden; margin-bottom: 8px;">
                    <div class="progress-bar" style="background: linear-gradient(90deg, #6366f1 0%, #10b981 100%); width: ${percent}%; height: 100%; transition: width 0.6s ease;"></div>
                </div>

                <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: #64748b;">
                    <span>Tiến độ: <strong>${percent}%</strong></span>
                    <span><i class="fa-regular fa-calendar"></i> Hạn: <strong>${deadlineDate}</strong></span>
                </div>
            </div>

            <button class="btn btn-primary" style="width: 100%; margin-top: 14px; padding: 11px 16px; border-radius: 10px; font-weight: 600;" 
                ${isClosed ? "disabled style='opacity: 0.6; cursor: not-allowed;'" : ""} 
                onclick="openDonateModal(${c.id}, '${safeTitle}')">
                <i class="fa-solid fa-heart"></i> ${isClosed ? "Chiến Dịch Đã Đóng" : "Quyên Góp Ngay"}
            </button>
            ${refundButtonHtml}
        </div>
    `;
    campaignsContainer.appendChild(card);
}

// Mở Modal Kiểm Chứng Tính Toàn Vẹn Ảnh Off-chain vs On-chain
window.openVerifyModal = function(id, title, imgSrc, filePath, offChainHash, onChainHash) {
    if (!verifyImageModal) return;
    verifyModalCampaignName.innerText = `#${id} - ${title}`;
    verifyModalImg.src = imgSrc || "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=600&q=80";
    verifyModalFilePath.innerText = filePath ? `Đường dẫn máy chủ: ${filePath}` : "Chưa có đường dẫn ảnh trên máy chủ.";
    
    verifyOffChainHash.innerText = offChainHash || "Chưa có mã băm Off-chain trên MySQL";
    verifyOnChainHash.innerText = onChainHash || "Chưa có mã băm On-chain trên Smart Contract";

    const cleanOff = (offChainHash || "").trim().toLowerCase();
    const cleanOn = (onChainHash || "").trim().toLowerCase();

    if (cleanOff && cleanOn && cleanOff === cleanOn) {
        verifyMatchStatus.style.background = "#ecfdf5";
        verifyMatchStatus.style.border = "1px solid #a7f3d0";
        verifyMatchStatus.style.color = "#065f46";
        verifyMatchStatus.innerHTML = `
            <i class="fa-solid fa-circle-check" style="font-size: 1.5rem; color: #10b981; flex-shrink: 0;"></i>
            <div>
                <strong>TOÀN VẸN 100% — MÃ BĂM KHỚP HOÀN TOÀN</strong><br/>
                <span style="font-size:0.78rem; font-weight:normal; line-height:1.4; display:block; margin-top:2px;">
                    Mã băm SHA-256 từ file ảnh máy chủ khớp 100% với chuỗi băm bất biến được lưu trên Smart Contract Sepolia. Ảnh đại diện hoàn toàn nguyên bản, chưa từng bị chỉnh sửa hay tráo đổi!
                </span>
            </div>
        `;
    } else if (cleanOff && cleanOn) {
        verifyMatchStatus.style.background = "#fef2f2";
        verifyMatchStatus.style.border = "1px solid #fecaca";
        verifyMatchStatus.style.color = "#991b1b";
        verifyMatchStatus.innerHTML = `
            <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.5rem; color: #ef4444; flex-shrink: 0;"></i>
            <div>
                <strong>CẢNH BÁO: MÃ BĂM KHÔNG KHỚP!</strong><br/>
                <span style="font-size:0.78rem; font-weight:normal; line-height:1.4; display:block; margin-top:2px;">
                    Mã băm ảnh trên máy chủ khác với mã băm On-chain. Có dấu hiệu ảnh đã bị thay đổi hoặc giả mạo sau khi tạo chiến dịch!
                </span>
            </div>
        `;
    } else {
        verifyMatchStatus.style.background = "#eff6ff";
        verifyMatchStatus.style.border = "1px solid #bfdbfe";
        verifyMatchStatus.style.color = "#1e40af";
        verifyMatchStatus.innerHTML = `
            <i class="fa-solid fa-circle-info" style="font-size: 1.5rem; color: #3b82f6; flex-shrink: 0;"></i>
            <div>
                <strong>CHIẾN DỊCH THIẾU DỮ LIỆU ĐỐI SOÁT</strong><br/>
                <span style="font-size:0.78rem; font-weight:normal; line-height:1.4; display:block; margin-top:2px;">
                    Chiến dịch này chưa có đầy đủ mã băm cả 2 phía để thực hiện đối soát tự động.
                </span>
            </div>
        `;
    }

    verifyImageModal.style.display = "flex";
};

window.closeVerifyModal = function() {
    if (verifyImageModal) verifyImageModal.style.display = "none";
};

// Rút Lại Tiền Quyên Góp (Donor Claim Refund)
window.claimRefund = async function(campaignId) {
    if (!window.ethereum) {
        showToast("warning", "Chưa Có Ví", "Vui lòng cài đặt và kết nối ví MetaMask để rút lại tiền quyên góp!");
        return;
    }

    try {
        if (!userAddress || !signer) {
            await connectWallet();
        }
        if (!signer) return;

        await checkOrSwitchSepolia();
        const writeContract = new ethers.Contract(CHARITY_CONTRACT_ADDRESS, CHARITY_CONTRACT_ABI, signer);

        if (!confirm(`XÁC NHẬN RÚT LẠI TIỀN (CLAIM REFUND)\n\nBạn muốn rút lại toàn bộ số tiền bạn đã từng quyên góp cho Chiến dịch #${campaignId}?\n(Khoản tiền này sẽ được Smart Contract hoàn trả trực tiếp về ví của bạn)`)) {
            return;
        }

        showToast("info", "Đang Gửi Giao Dịch...", "Vui lòng ký xác nhận trên ví MetaMask để hoàn tiền...");

        const tx = await writeContract.claimRefund(campaignId);
        showToast("info", "Đang Xác Nhận Khối...", `Giao dịch đã gửi lên Sepolia. TxHash: ${shortenAddress(tx.hash)}`);

        await tx.wait();
        showToast("success", "Rút Tiền Thành Công!", `Đã hoàn trả thành công tiền quyên góp từ Chiến dịch #${campaignId} về ví của bạn!`);

        await loadCampaigns();
    } catch (err) {
        console.error("Lỗi claim refund:", err);
        const errMsg = parseContractError(err);
        showToast("error", "Rút Tiền Thất Bại", errMsg);
    }
};

window.openDonateModal = function(id, title) {
    if (!userAddress) {
        showToast("warning", "Chưa Kết Nối Ví", "Vui lòng kết nối ví MetaMask trước khi quyên góp!");
        return;
    }
    modalCampaignId.value = id;
    modalCampaignTitle.innerHTML = `<i class="fa-solid fa-heart" style="color: #ef4444;"></i> Ủng Hộ: ${title}`;
    donateModal.style.display = "flex";
};

window.closeDonateModal = function() {
    donateModal.style.display = "none";
    formDonate.reset();
};

formDonate?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = modalCampaignId.value;
    const amountEth = document.getElementById("donateAmount").value;
    const message = document.getElementById("donateMessage").value.trim() || "Ủng hộ chiến dịch";
    const btnSubmit = document.getElementById("btnSubmitDonate");

    if (!amountEth || parseFloat(amountEth) <= 0) {
        showToast("warning", "Số Tiền Không Hợp Lệ", "Vui lòng nhập số tiền lớn hơn 0 ETH!");
        return;
    }

    try {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang Xử Lý...`;

        // Đảm bảo ví đang ở mạng Sepolia
        await checkOrSwitchSepolia();
        if (!provider) {
            provider = new ethers.BrowserProvider(window.ethereum);
        }
        if (!signer) {
            signer = await provider.getSigner();
        }
        const writeContract = new ethers.Contract(CHARITY_CONTRACT_ADDRESS, CHARITY_CONTRACT_ABI, signer);
        const amountWei = ethers.parseEther(amountEth);

        // Kiểm tra số dư ví trước khi gửi
        try {
            const balance = await provider.getBalance(userAddress);
            if (balance < amountWei) {
                showToast("warning", "Số Dư Không Đủ", `Ví của bạn không đủ ${amountEth} ETH để quyên góp!`);
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = `Xác Nhận Ký Ví`;
                return;
            }
        } catch (_) {}

        showToast("info", "Chờ Ký MetaMask", `Vui lòng xác nhận quyên góp ${amountEth} ETH trong ví MetaMask...`);

        const tx = await writeContract.donate(id, message, { value: amountWei });
        closeDonateModal();

        if (txReceiptCard && txHashDisplay) {
            txReceiptCard.style.display = "block";
            txHashDisplay.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                    <span style="font-family:monospace; word-break:break-all;">TxHash: ${tx.hash}</span>
                    <button class="btn btn-sm" onclick="copyToClipboard('${tx.hash}', 'Đã sao chép mã giao dịch!')">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                </div>
            `;
        }

        showToast("info", "Đang Xác Nhận Khối", `Giao dịch đã được gửi lên Sepolia. Đang chờ đào khối...`);

        await tx.wait();
        showToast("success", "Quyên Góp Thành Công!", `Cảm ơn tấm lòng vàng của bạn! Đã quyên góp ${amountEth} ETH cho chiến dịch #${id}.`);

        await loadCampaigns();
    } catch (err) {
        console.error("Lỗi quyên góp:", err);
        const errDetail = parseContractError(err);
        showToast("error", "Giao Dịch Thất Bại", errDetail);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `Xác Nhận Ký Ví`;
    }
});

// Xử lý nút Kết nối ví trên thanh Navbar
window.connectWallet = async function() {
    if (!window.ethereum) {
        showToast("warning", "Chưa Cài MetaMask", "Vui lòng cài đặt tiện ích mở rộng MetaMask trên trình duyệt (https://metamask.io)!");
        return;
    }

    try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        if (accounts && accounts.length > 0) {
            await setupUser(accounts[0]);
            await checkOrSwitchSepolia();
            showToast("success", "Đã Kết Nối Ví", `Địa chỉ: ${shortenAddress(accounts[0])}`);
        }
    } catch (err) {
        console.error("Lỗi kết nối ví:", err);
        if (err.code === 4001) {
            showToast("info", "Đã Hủy", "Bạn đã từ chối kết nối ví MetaMask.");
        } else {
            showToast("error", "Lỗi Kết Nối", err.message || String(err));
        }
    }
};

document.addEventListener("DOMContentLoaded", init);
