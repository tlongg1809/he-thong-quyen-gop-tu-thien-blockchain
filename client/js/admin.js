// client/js/admin.js

let provider = null;
let signer = null;
let contract = null;
let currentAccount = null;

// DOM Elements
const btnConnect = document.getElementById("btnConnect");
const walletAddress = document.getElementById("walletAddress");
const sidebarWalletAddr = document.getElementById("sidebarWalletAddr");

// Form 1: Tạo chiến dịch (Stake-based Permissionless Creation + Hybrid Off-chain Image)
const formCreateCampaign = document.getElementById("formCreateCampaign");
const campaignTitle = document.getElementById("campaignTitle");
const campaignDesc = document.getElementById("campaignDesc");
const campaignImage = document.getElementById("campaignImage");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const imagePreviewImg = document.getElementById("imagePreviewImg");
const imagePreviewName = document.getElementById("imagePreviewName");
const imagePreviewSize = document.getElementById("imagePreviewSize");
const campaignManager = document.getElementById("campaignManager");
const chkUseCurrentWallet = document.getElementById("chkUseCurrentWallet");
const managerHint = document.getElementById("managerHint");
const campaignTarget = document.getElementById("campaignTarget");
const campaignDays = document.getElementById("campaignDays");
const campaignDeadline = document.getElementById("campaignDeadline");
const calculatedStakeDisplay = document.getElementById("calculatedStakeDisplay");
const deadlineDaysHint = document.getElementById("deadlineDaysHint");
const btnSubmitCampaign = document.getElementById("btnSubmitCampaign");

// Form 2: Yêu cầu giải ngân
const formRequestDisbursement = document.getElementById("formRequestDisbursement");
const disburseCampaignId = document.getElementById("disburseCampaignId");
const disbursePurpose = document.getElementById("disbursePurpose");
const disburseAmount = document.getElementById("disburseAmount");
const disburseRecipient = document.getElementById("disburseRecipient");
const disburseProof = document.getElementById("disburseProof");
const btnSubmitDisburse = document.getElementById("btnSubmitDisburse");

// Form 3: Thực thi giải ngân
const formExecuteDisbursement = document.getElementById("formExecuteDisbursement");
const execCampaignId = document.getElementById("execCampaignId");
const execRequestId = document.getElementById("execRequestId");
const btnSubmitExec = document.getElementById("btnSubmitExec");

// Section 4: Quản lý ký quỹ (Refund & Slashing)
const stakeCampaignId = document.getElementById("stakeCampaignId");
const slashReason = document.getElementById("slashReason");
const btnRefundStake = document.getElementById("btnRefundStake");
const btnSlashStake = document.getElementById("btnSlashStake");

// Hint containers cho Form 2 & Form 3
const disburseCampaignHint = document.getElementById("disburseCampaignHint");
const execRequestHint = document.getElementById("execRequestHint");

/**
 * Helper hiển thị toast thông báo nếu có sẵn, hoặc fallback dùng alert
 */
function notify(type, title, message) {
  if (typeof window.showToast === "function") {
    window.showToast(type, title, message);
  } else if (typeof showToast === "function") {
    showToast(type, title, message);
  } else {
    alert(`${title}\n${message}`);
  }
}

/**
 * Trình bóc tách lỗi Smart Contract & Web3 thân thiện với người dùng
 * Sử dụng trực tiếp từ web3-common.js để bảo đảm tính nhất quán và triệt tiêu hoàn toàn lỗi đệ quy RangeError.
 */
function getContractErrorMessage(err) {
  if (typeof window.parseContractError === "function") {
    return window.parseContractError(err);
  }
  return err?.shortMessage || err?.message || String(err);
}

// Tính toán mức ký quỹ bắt buộc (Dynamic Stake): max(0.05 ETH, 2% target)
function getRequiredStake() {
  const targetVal = parseFloat(campaignTarget?.value) || 0;
  const percentStake = targetVal * 0.02;
  const required = Math.max(0.05, percentStake);
  if (calculatedStakeDisplay) {
    if (targetVal > 0) {
      calculatedStakeDisplay.value = `${required.toFixed(4)} ETH (${percentStake > 0.05 ? '2% mục tiêu' : 'Mức sàn tối thiểu 0.05 ETH'})`;
    } else {
      calculatedStakeDisplay.value = "0.0500 ETH (Tối thiểu)";
    }
  }
  return required;
}

// Thiết lập ô chọn ngày kết thúc và tính số ngày tương ứng on-chain
function setupDeadlinePicker() {
  if (!campaignDeadline) return;
  const tomorrow = new Date(Date.now() + 86400000);
  const defaultDate = new Date(Date.now() + 30 * 86400000);

  campaignDeadline.min = tomorrow.toISOString().split("T")[0];
  if (!campaignDeadline.value) {
    campaignDeadline.value = defaultDate.toISOString().split("T")[0];
  }

  function updateDays() {
    const selected = new Date(campaignDeadline.value);
    const now = new Date();
    const diffTime = selected - now;
    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    if (deadlineDaysHint) {
      deadlineDaysHint.innerText = `Thời hạn tương ứng: ${diffDays} ngày kể từ thời điểm tạo.`;
    }
    if (campaignDays) {
      campaignDays.value = diffDays;
    }
    return diffDays;
  }

  campaignDeadline.addEventListener("change", updateDays);
  updateDays();
}

/**
 * Cập nhật thông tin chiến dịch và số dư khả dụng theo thời gian thực (Form 2)
 */
async function updateDisburseCampaignHint() {
  if (!disburseCampaignHint) return;
  const rawId = disburseCampaignId?.value?.trim();
  if (rawId === "" || isNaN(rawId)) {
    disburseCampaignHint.style.display = "none";
    disburseCampaignHint.innerHTML = "";
    return;
  }

  const campaignId = parseInt(rawId, 10);
  if (campaignId < 0) {
    disburseCampaignHint.style.display = "block";
    disburseCampaignHint.innerHTML = `<span class="hint-badge hint-badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> Mã Campaign ID không thể là số âm</span>`;
    return;
  }

  const c = contract || (typeof getWeb3Provider === "function" && typeof CHARITY_CONTRACT_ABI !== "undefined" && typeof CHARITY_CONTRACT_ADDRESS !== "undefined" ? new ethers.Contract(CHARITY_CONTRACT_ADDRESS, CHARITY_CONTRACT_ABI, await getWeb3Provider()) : null);
  if (!c) return;

  try {
    const totalCount = await c.campaignCount();
    if (campaignId >= Number(totalCount)) {
      disburseCampaignHint.style.display = "block";
      disburseCampaignHint.innerHTML = `
        <div class="disburse-info-box">
          <span class="hint-badge hint-badge-danger">
            <i class="fa-solid fa-circle-xmark"></i> Chiến dịch #${campaignId} không tồn tại (Hệ thống hiện có ${totalCount} chiến dịch: #0 đến #${Number(totalCount) > 0 ? Number(totalCount) - 1 : 0}).
          </span>
        </div>
      `;
      return;
    }

    const camp = await c.campaigns(campaignId);
    const raisedEth = ethers.formatEther(camp.raisedAmount);
    const disbursedEth = ethers.formatEther(camp.disbursedAmount);
    const availWei = BigInt(camp.raisedAmount) - BigInt(camp.disbursedAmount);
    const availEth = ethers.formatEther(availWei);

    const activeAccount = (currentAccount || (signer ? await signer.getAddress() : "") || "").toLowerCase();
    const isManager = activeAccount && (activeAccount === camp.manager.toLowerCase());

    let statusBadge = `<span class="hint-badge hint-badge-success"><i class="fa-solid fa-circle-check"></i> Đang hoạt động</span>`;
    if (camp.isCancelled) {
      statusBadge = `<span class="hint-badge hint-badge-danger"><i class="fa-solid fa-ban"></i> Đã bị hủy</span>`;
    } else if (camp.stakeSlashed) {
      statusBadge = `<span class="hint-badge hint-badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> Bị xử phạt (Slashed)</span>`;
    } else if (camp.isClosed) {
      statusBadge = `<span class="hint-badge hint-badge-warning"><i class="fa-solid fa-lock"></i> Đã đóng</span>`;
    }

    let managerBadge = "";
    if (activeAccount) {
      if (isManager) {
        managerBadge = `<span class="hint-badge hint-badge-success"><i class="fa-solid fa-user-check"></i> Bạn là Quản lý</span>`;
      } else {
        managerBadge = `<span class="hint-badge hint-badge-warning"><i class="fa-solid fa-user-xmark"></i> Không phải ví Quản lý</span>`;
      }
    }

    const availDisplay = availWei > 0n
      ? `<span class="avail-val">${availEth} ETH</span>`
      : `<span style="color: #ef4444; font-weight: 700;">0 ETH (Hết số dư để giải ngân)</span>`;

    const maxButton = availWei > 0n && isManager
      ? `<button type="button" class="btn-fill-max" onclick="fillMaxDisburse('${availEth}')"><i class="fa-solid fa-bolt"></i> Rút tối đa</button>`
      : "";

    disburseCampaignHint.style.display = "block";
    disburseCampaignHint.innerHTML = `
      <div class="disburse-info-box">
        <div class="info-row title-row">
          <span><strong>📌 Chiến dịch #${campaignId}:</strong> <span style="font-weight: 600; color: #0f172a;">${camp.title}</span></span>
          ${statusBadge}
        </div>
        <div class="info-row">
          <span>Người quản lý: <code title="${camp.manager}">${camp.manager ? `${camp.manager.slice(0, 6)}...${camp.manager.slice(-4)}` : '--'}</code></span>
          ${managerBadge}
        </div>
        <div class="info-row">
          <span>Đã quyên góp: <b>${raisedEth} ETH</b> | Đã giải ngân: <b>${disbursedEth} ETH</b></span>
        </div>
        <div class="info-row highlight-balance">
          <span>💰 <b>Khả dụng giải ngân:</b> ${availDisplay}</span>
          ${maxButton}
        </div>
      </div>
    `;
  } catch (err) {
    console.warn("Lỗi tra cứu thông tin chiến dịch giải ngân:", err);
  }
}

// Hàm gán số tiền khả dụng tối đa vào ô disburseAmount
window.fillMaxDisburse = function (amountStr) {
  if (disburseAmount) {
    disburseAmount.value = amountStr;
    disburseAmount.focus();
  }
};

/**
 * Cập nhật thông tin yêu cầu giải ngân theo thời gian thực (Form 3)
 */
async function updateExecRequestHint() {
  if (!execRequestHint) return;
  const rawCId = execCampaignId?.value?.trim();
  const rawRId = execRequestId?.value?.trim();

  if (rawCId === "" || rawRId === "" || isNaN(rawCId) || isNaN(rawRId)) {
    execRequestHint.style.display = "none";
    execRequestHint.innerHTML = "";
    return;
  }

  const cId = parseInt(rawCId, 10);
  const rId = parseInt(rawRId, 10);
  if (cId < 0 || rId < 0) return;

  const c = contract || (typeof getWeb3Provider === "function" && typeof CHARITY_CONTRACT_ABI !== "undefined" && typeof CHARITY_CONTRACT_ADDRESS !== "undefined" ? new ethers.Contract(CHARITY_CONTRACT_ADDRESS, CHARITY_CONTRACT_ABI, await getWeb3Provider()) : null);
  if (!c) return;

  try {
    const totalCount = await c.campaignCount();
    if (cId >= Number(totalCount)) {
      execRequestHint.style.display = "block";
      execRequestHint.innerHTML = `<span class="hint-badge hint-badge-danger"><i class="fa-solid fa-circle-xmark"></i> Chiến dịch #${cId} không tồn tại.</span>`;
      return;
    }

    const req = await c.getDisbursementRequest(cId, rId);
    const amountEth = ethers.formatEther(req.amount);
    const adminAddr = (await c.systemAdmin()).toLowerCase();
    const activeAccount = (currentAccount || (signer ? await signer.getAddress() : "") || "").toLowerCase();
    const isAdmin = activeAccount && (activeAccount === adminAddr);

    let statusBadge = req.isExecuted
      ? `<span class="hint-badge hint-badge-success"><i class="fa-solid fa-circle-check"></i> Đã thực thi</span>`
      : `<span class="hint-badge hint-badge-warning"><i class="fa-solid fa-clock"></i> Chờ duyệt</span>`;

    let adminBadge = "";
    if (activeAccount) {
      if (isAdmin) {
        adminBadge = `<span class="hint-badge hint-badge-success"><i class="fa-solid fa-shield-halved"></i> Bạn là Admin</span>`;
      } else {
        adminBadge = `<span class="hint-badge hint-badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> Không phải Admin</span>`;
      }
    }

    execRequestHint.style.display = "block";
    execRequestHint.innerHTML = `
      <div class="disburse-info-box">
        <div class="info-row title-row">
          <span><strong>📋 Yêu cầu #${rId} (Chiến dịch #${cId})</strong></span>
          ${statusBadge}
        </div>
        <div class="info-row">
          <span>Mục đích: <b>${req.purpose}</b></span>
          <span>Số tiền: <b style="color: #0284c7;">${amountEth} ETH</b></span>
        </div>
        <div class="info-row">
          <span>Thụ hưởng: <code>${req.recipient ? `${req.recipient.slice(0, 6)}...${req.recipient.slice(-4)}` : '--'}</code></span>
          ${adminBadge}
        </div>
        <div class="info-row" style="font-size: 0.8rem; color: #64748b;">
          <span>Chứng từ: <code>${req.proofHash || "--"}</code></span>
        </div>
      </div>
    `;
  } catch (err) {
    execRequestHint.style.display = "block";
    execRequestHint.innerHTML = `<span class="hint-badge hint-badge-warning"><i class="fa-solid fa-triangle-exclamation"></i> Không tìm thấy yêu cầu #${rId} trong chiến dịch #${cId}.</span>`;
  }
}

/**
 * Khởi tạo ứng dụng & nạp cấu hình hợp đồng
 */
async function init() {
  if (typeof initContractConfig === "function") {
    await initContractConfig();
  } else if (typeof loadContractConfig === "function") {
    await loadContractConfig();
  }

  if (!CHARITY_CONTRACT_ADDRESS || !CHARITY_CONTRACT_ADDRESS.startsWith("0x")) {
    notify("error", "Lỗi cấu hình", "Chưa cấu hình CONTRACT_ADDRESS hợp lệ trong file server/.env!");
    return;
  }

  // Khởi tạo xem trước ảnh đại diện (Image Preview)
  if (campaignImage) {
    campaignImage.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        if (imagePreviewContainer && imagePreviewImg && imagePreviewName && imagePreviewSize) {
          imagePreviewImg.src = URL.createObjectURL(file);
          imagePreviewName.innerText = file.name;
          const sizeKb = (file.size / 1024).toFixed(1);
          const sizeStr = file.size > 1024 * 1024
            ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
            : `${sizeKb} KB`;
          imagePreviewSize.innerText = `Dung lượng: ${sizeStr} • Định dạng: ${file.type || 'image'}`;
          imagePreviewContainer.style.display = "flex";
        }
      } else {
        if (imagePreviewContainer) imagePreviewContainer.style.display = "none";
      }
    });
  }

  // Khởi tạo checkbox tự động dùng ví kết nối làm Manager
  if (chkUseCurrentWallet && campaignManager) {
    chkUseCurrentWallet.addEventListener("change", (e) => {
      if (e.target.checked) {
        if (currentAccount) {
          campaignManager.value = currentAccount;
        }
        campaignManager.readOnly = true;
        if (managerHint) managerHint.innerText = "Đã tự động điền địa chỉ ví đang kết nối của bạn.";
      } else {
        campaignManager.readOnly = false;
        if (managerHint) managerHint.innerText = "Nhập địa chỉ ví Ethereum của Trưởng ban quản lý (0x...).";
      }
    });
  }

  // Lắng nghe tính toán Dynamic Stake theo mục tiêu kêu gọi
  if (campaignTarget) {
    campaignTarget.addEventListener("input", getRequiredStake);
    getRequiredStake();
  }

  // Khởi tạo ô chọn ngày kết thúc
  setupDeadlinePicker();

  // Lắng nghe cập nhật thông tin giải ngân theo thời gian thực (Form 2 & Form 3)
  if (disburseCampaignId) {
    disburseCampaignId.addEventListener("input", updateDisburseCampaignHint);
    disburseCampaignId.addEventListener("change", updateDisburseCampaignHint);
  }
  if (execCampaignId) {
    execCampaignId.addEventListener("input", updateExecRequestHint);
    execCampaignId.addEventListener("change", updateExecRequestHint);
  }
  if (execRequestId) {
    execRequestId.addEventListener("input", updateExecRequestHint);
    execRequestId.addEventListener("change", updateExecRequestHint);
  }

  if (window.ethereum) {
    provider = new ethers.BrowserProvider(window.ethereum);

    try {
      const accounts = await provider.send("eth_accounts", []);
      if (accounts.length > 0) {
        await handleAccountConnected(accounts[0]);
      }
    } catch (e) {
      console.warn("Lỗi đọc accounts:", e);
    }

    window.ethereum.on("accountsChanged", (accounts) => {
      if (accounts.length > 0) {
        handleAccountConnected(accounts[0]);
      } else {
        location.reload();
      }
    });

    window.ethereum.on("chainChanged", () => {
      location.reload();
    });
  } else {
    notify("warning", "Thiếu MetaMask", "Vui lòng cài đặt tiện ích mở rộng MetaMask để truy cập trang quản trị!");
  }
}

/**
 * Xử lý khi ví đã được kết nối
 * Cho phép MỌI VÍ đều có quyền tạo chiến dịch thông qua cơ chế Ký Quỹ.
 */
async function handleAccountConnected(account) {
  currentAccount = account;
  signer = await provider.getSigner();
  contract = new ethers.Contract(
    CHARITY_CONTRACT_ADDRESS,
    CHARITY_CONTRACT_ABI,
    signer,
  );

  const shortAddr = `${account.substring(0, 6)}...${account.substring(account.length - 4)}`;

  if (walletAddress) {
    walletAddress.innerText = shortAddr;
    walletAddress.style.display = "inline-block";
  }
  if (sidebarWalletAddr) {
    sidebarWalletAddr.innerText = account;
  }
  if (btnConnect) {
    btnConnect.innerText = "Đã Kết Nối";
    btnConnect.classList.remove("btn-primary");
    btnConnect.style.background = "#e2e8f0";
    btnConnect.style.color = "#334155";
    btnConnect.disabled = true;
  }

  // Tự động điền địa chỉ ví vào ô Trưởng ban quản lý nếu checkbox đang chọn
  if (campaignManager && (!chkUseCurrentWallet || chkUseCurrentWallet.checked)) {
    campaignManager.value = account;
    campaignManager.readOnly = true;
  }

  // Phân biệt vai trò hiển thị trực quan (Admin Hệ Thống vs Thành Viên Cộng Đồng)
  try {
    const adminAddress = await contract.systemAdmin();
    const isAdmin = account.toLowerCase() === adminAddress.toLowerCase();

    let roleBadge = document.getElementById("adminRoleBadge");
    if (!roleBadge) {
      roleBadge = document.createElement("span");
      roleBadge.id = "adminRoleBadge";
      roleBadge.style.padding = "6px 12px";
      roleBadge.style.borderRadius = "20px";
      roleBadge.style.fontSize = "0.82rem";
      roleBadge.style.fontWeight = "600";
      walletAddress?.parentNode?.insertBefore(roleBadge, btnConnect);
    }

    if (isAdmin) {
      roleBadge.style.background = "#dcfce7";
      roleBadge.style.color = "#166534";
      roleBadge.style.border = "1px solid #bbf7d0";
      roleBadge.innerText = "👑 Quản Trị Viên (Admin Hệ Thống)";
    } else {
      // Mọi thành viên đều có quyền khởi tạo chiến dịch có ký quỹ
      roleBadge.style.background = "#eff6ff";
      roleBadge.style.color = "#1d4ed8";
      roleBadge.style.border = "1px solid #bfdbfe";
      roleBadge.innerText = "✨ Thành Viên (Quyền Tạo Chiến Dịch Ký Quỹ)";
    }

    // Kiểm tra tính tương thích của Smart Contract đã deploy
    try {
      if (typeof contract.MIN_STAKE_FEE === "function") {
        await contract.MIN_STAKE_FEE();
        console.log("✅ Smart Contract đã được xác thực: Phiên bản Dynamic Stake + Off-chain Image.");
      }
    } catch (contractErr) {
      console.warn("⚠️ Cảnh báo: Smart Contract tại địa chỉ hiện tại chưa hỗ trợ Dynamic Stake:", contractErr);
    }
    // Cập nhật thông tin hint giải ngân nếu người dùng đã nhập sẵn ID
    updateDisburseCampaignHint();
    updateExecRequestHint();
  } catch (e) {
    console.warn("Không thể kiểm tra vai trò Admin:", e);
  }
}

// Kiểm tra hoặc tự động chuyển mạng Sepolia
async function checkOrSwitchSepolia() {
  if (!window.ethereum) return;
  try {
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (chainId !== "0xaa36a7") {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0xaa36a7" }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0xaa36a7",
                chainName: "Sepolia Test Network",
                nativeCurrency: {
                  name: "SepoliaETH",
                  symbol: "ETH",
                  decimals: 18,
                },
                rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              },
            ],
          });
        }
      }
    }
  } catch (e) {
    console.warn("Không thể kiểm tra/chuyển mạng Sepolia:", e);
  }
}

/**
 * Sự kiện bấm nút Kết nối ví
 */
async function connectWallet() {
  if (!window.ethereum) {
    if (window.location.protocol === "file:") {
      notify(
        "error",
        "Môi trường chưa đúng",
        "Bạn đang mở trang bằng file:// trực tiếp. Vui lòng mở qua Apache: http://localhost/blockchain_bc/client/admin.html",
      );
    } else {
      notify("warning", "Chưa cài MetaMask", "Vui lòng cài đặt tiện ích MetaMask trên trình duyệt (https://metamask.io)!");
    }
    return;
  }
  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    if (accounts.length > 0) {
      await handleAccountConnected(accounts[0]);
      await checkOrSwitchSepolia();
    }
  } catch (err) {
    console.error("Lỗi kết nối ví:", err);
    if (err.code === 4001) {
      notify("info", "Đã hủy", "Bạn đã từ chối yêu cầu kết nối ví MetaMask.");
    } else if (err.code === -32002) {
      notify("warning", "Đang chờ xử lý", "Vui lòng mở biểu tượng con cáo MetaMask để xác nhận kết nối.");
    } else {
      notify("error", "Lỗi kết nối", err.message || String(err));
    }
  }
}

window.connectWallet = connectWallet;

if (btnConnect) {
  btnConnect.addEventListener("click", connectWallet);
}

/**
 * Xử lý Form 1: Tạo Chiến Dịch Mới (Stake-based + Lưu Ảnh Off-chain & Hash SHA-256 On-chain)
 * Luồng 3 bước:
 *   (1) Upload ảnh lên server -> tính mã băm SHA-256
 *   (2) Gọi contract.createCampaign(..., imageHash) kèm 0.05 ETH
 *   (3) Cập nhật campaign_id và tx_hash vào bảng MySQL campaigns_metadata
 */
if (formCreateCampaign) {
  formCreateCampaign.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!contract || !signer) {
      notify("warning", "Chưa kết nối ví", "Vui lòng kết nối ví MetaMask trước khi tạo chiến dịch!");
      return;
    }

    const title = campaignTitle.value.trim();
    const desc = campaignDesc.value.trim();
    const manager = campaignManager.value.trim();
    const targetEth = campaignTarget.value;
    let durationDays = parseInt(campaignDays?.value || "30", 10);
    if (campaignDeadline && campaignDeadline.value) {
      const selectedDate = new Date(campaignDeadline.value);
      const now = new Date();
      const diffTime = selectedDate - now;
      const calcDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (calcDays > 0) durationDays = calcDays;
    }

    if (!title) {
      notify("warning", "Thiếu thông tin", "Vui lòng nhập tên chiến dịch!");
      return;
    }
    if (!desc) {
      notify("warning", "Thiếu thông tin", "Vui lòng nhập mô tả chiến dịch!");
      return;
    }
    if (!campaignImage || !campaignImage.files || campaignImage.files.length === 0) {
      notify("warning", "Thiếu ảnh đại diện", "Vui lòng chọn ảnh đại diện cho chiến dịch!");
      return;
    }
    if (!ethers.isAddress(manager)) {
      notify("error", "Địa chỉ không hợp lệ", "Địa chỉ ví Trưởng ban quản lý không đúng định dạng Ethereum!");
      return;
    }
    if (!targetEth || parseFloat(targetEth) <= 0) {
      notify("warning", "Số tiền không hợp lệ", "Mục tiêu kêu gọi phải lớn hơn 0 ETH!");
      return;
    }
    if (!durationDays || durationDays <= 0) {
      notify("warning", "Thời hạn không hợp lệ", "Thời hạn quyên góp phải lớn hơn 0 ngày!");
      return;
    }

    const requiredStake = getRequiredStake();
    const stakeWei = ethers.parseEther(requiredStake.toFixed(6));
    const targetWei = ethers.parseEther(targetEth);

    // 1. Kiểm tra số dư ví để tránh lỗi revert bí ẩn trên MetaMask
    try {
      const balance = await provider.getBalance(currentAccount);
      if (balance < stakeWei) {
        notify(
          "warning",
          "Số Dư Không Đủ Ký Quỹ",
          `Ví của bạn hiện có ${parseFloat(ethers.formatEther(balance)).toFixed(4)} ETH. Cần tối thiểu ${requiredStake.toFixed(4)} ETH để ký quỹ chiến dịch này.\nVui lòng nhận thêm SepoliaETH từ faucet trước khi khởi tạo!`
        );
        return;
      }
    } catch (bErr) {
      console.warn("Không đọc được số dư ví:", bErr);
    }

    // 2. Kiểm tra tính tương thích của Smart Contract trước khi gửi
    try {
      if (typeof contract.calculateRequiredStake === "function") {
        await contract.calculateRequiredStake(targetWei);
      }
    } catch (verErr) {
      console.warn("Hợp đồng chưa hỗ trợ calculateRequiredStake, có thể là phiên bản cũ:", verErr);
      notify(
        "error",
        "Hợp Đồng Chưa Cập Nhật",
        `Smart Contract tại địa chỉ ${CHARITY_CONTRACT_ADDRESS.substring(0, 10)}... chưa được cập nhật phiên bản mới (Dynamic Stake + Lưu mã băm ảnh).\n\n` +
        `👉 Vui lòng:\n` +
        `1. Mở Remix IDE biên dịch file contracts/CharityDonation.sol.\n` +
        `2. Deploy lại hợp đồng mới lên Sepolia Testnet.\n` +
        `3. Cập nhật CONTRACT_ADDRESS vào file server/.env và client/js/config.js.`
      );
      return;
    }

    try {
      btnSubmitCampaign.disabled = true;
      btnSubmitCampaign.innerText = `Bước 1/3: Đang tải ảnh lên máy chủ & tính mã băm SHA-256...`;

      if (typeof updateTimeline === "function") updateTimeline("timelineCreate", 1);
      if (typeof setTxLoading === "function") {
        setTxLoading(true, "Đang xử lý ảnh đại diện…", "Tải ảnh lên máy chủ Off-chain và tính băm SHA-256");
      }

      // ── BƯỚC 1: Tải ảnh lên Server PHP và nhận mã SHA-256 ──
      const imageFile = campaignImage.files[0];
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("title", title);

      let uploadRes = null;
      try {
        const res = await fetch("../server/api/upload_campaign_image.php", {
          method: "POST",
          body: formData
        });
        uploadRes = await res.json();
      } catch (uploadErr) {
        console.error("Lỗi upload ảnh:", uploadErr);
        throw new Error("Không thể kết nối đến máy chủ PHP để tải ảnh lên. Vui lòng kiểm tra Apache XAMPP!");
      }

      if (!uploadRes || !uploadRes.success || !uploadRes.image_sha256) {
        throw new Error(uploadRes?.message || "Tải ảnh lên máy chủ thất bại.");
      }

      const imageSha256 = uploadRes.image_sha256;
      const metaRecordId = uploadRes.record_id;
      console.log("Ảnh đã lưu:", uploadRes.image_path, "Mã SHA-256:", imageSha256);

      // ── BƯỚC 2: Gọi Smart Contract On-chain kèm tiền ký quỹ Dynamic Stake và imageHash ──
      btnSubmitCampaign.innerText = `Bước 2/3: Xác nhận ký quỹ ${requiredStake.toFixed(4)} ETH trên MetaMask...`;
      if (typeof updateTimeline === "function") updateTimeline("timelineCreate", 2);
      if (typeof setTxLoading === "function") {
        setTxLoading(true, "Đang gửi giao dịch lên Blockchain…", `Ký quỹ ${requiredStake.toFixed(4)} ETH • Mã băm ảnh: ${imageSha256.substring(0, 12)}…`);
      }

      // Gọi createCampaign payable(title, desc, manager, targetWei, durationDays, imageHash)
      const tx = await contract.createCampaign(
        title,
        desc,
        manager,
        targetWei,
        durationDays,
        imageSha256,
        { value: stakeWei }
      );

      btnSubmitCampaign.innerText = "Bước 3/3: Đang chờ xác nhận khối trên Sepolia...";
      if (typeof setTxLoading === "function") {
        setTxLoading(true, "Đang xác nhận khối trên mạng Sepolia…", `TxHash: ${tx.hash}`);
      }

      const receipt = await tx.wait();

      // Bóc tách campaignId mới được tạo từ event logs
      let createdCampaignId = null;
      if (receipt && receipt.logs) {
        for (const log of receipt.logs) {
          try {
            const parsed = contract.interface.parseLog(log);
            if (parsed && parsed.name === "CampaignCreated") {
              createdCampaignId = Number(parsed.args.campaignId);
              break;
            }
          } catch (e) {
            // bỏ qua các log không khớp
          }
        }
      }

      if (createdCampaignId === null) {
        // Fallback: lấy từ campaignCount() - 1
        try {
          const totalCount = await contract.campaignCount();
          createdCampaignId = Number(totalCount) - 1;
        } catch (e) {
          createdCampaignId = 0;
        }
      }

      // ── BƯỚC 3: Đồng bộ Campaign ID và TxHash vào CSDL MySQL ──
      try {
        await fetch("../server/api/sync_campaign.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            record_id: metaRecordId,
            campaign_id: createdCampaignId,
            tx_hash: tx.hash,
            image_sha256: imageSha256
          })
        });
        console.log("Đã đồng bộ thông tin chiến dịch vào MySQL campaigns_metadata.");
      } catch (syncErr) {
        console.warn("Cảnh báo đồng bộ MySQL:", syncErr);
      }

      if (typeof updateTimeline === "function") updateTimeline("timelineCreate", 3);

      notify(
        "success",
        "Tạo Chiến Dịch Thành Công!",
        `Chiến dịch #${createdCampaignId} đã được khởi tạo trên Blockchain!\n• Ký quỹ: ${requiredStake.toFixed(4)} ETH\n• Băm ảnh SHA-256 On-chain: ${imageSha256.substring(0, 16)}...\n• TxHash: ${tx.hash}`
      );

      formCreateCampaign.reset();
      if (imagePreviewContainer) imagePreviewContainer.style.display = "none";
      if (currentAccount && chkUseCurrentWallet && chkUseCurrentWallet.checked) {
        campaignManager.value = currentAccount;
        campaignManager.readOnly = true;
      }
      getRequiredStake();
      setupDeadlinePicker();
    } catch (err) {
      console.error("Lỗi tạo chiến dịch:", err);
      if (typeof resetTimeline === "function") resetTimeline("timelineCreate");
      const parsedMsg = getContractErrorMessage(err);
      notify("error", "Tạo chiến dịch thất bại", parsedMsg);
    } finally {
      if (typeof setTxLoading === "function") setTxLoading(false);
      btnSubmitCampaign.disabled = false;
      btnSubmitCampaign.innerText = "🔒 Đặt Ký Quỹ & Tạo Chiến Dịch";
    }
  });
}

/**
 * Xử lý Form 2: Tạo Đề Xuất Giải Ngân
 */
if (formRequestDisbursement) {
  formRequestDisbursement.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!contract || !signer) {
      notify("warning", "Chưa kết nối ví", "Vui lòng kết nối ví MetaMask trước khi thực hiện!");
      return;
    }

    const idVal = disburseCampaignId?.value?.trim();
    if (idVal === "" || isNaN(idVal)) {
      notify("warning", "Thiếu thông tin", "Vui lòng nhập Mã chiến dịch (Campaign ID) hợp lệ!");
      return;
    }

    const campaignId = parseInt(idVal, 10);
    const purpose = disbursePurpose.value.trim();
    const amountEth = disburseAmount.value.trim();
    const recipient = disburseRecipient.value.trim();
    const proofHash = disburseProof.value.trim();

    if (!purpose) {
      notify("warning", "Thiếu mục đích", "Vui lòng nhập mục đích chi tiêu cụ thể!");
      return;
    }
    if (!amountEth || isNaN(amountEth) || parseFloat(amountEth) <= 0) {
      notify("warning", "Số tiền không hợp lệ", "Số tiền giải ngân phải lớn hơn 0 ETH!");
      return;
    }
    if (!ethers.isAddress(recipient)) {
      notify("error", "Địa chỉ không hợp lệ", "Địa chỉ ví đơn vị thụ hưởng không đúng định dạng Ethereum (0x...)!");
      return;
    }
    if (!proofHash) {
      notify("warning", "Thiếu chứng từ", "Vui lòng nhập mã băm chứng từ (IPFS CID hoặc link biên lai)!");
      return;
    }

    // ── Kiểm tra dữ liệu và quyền hạn trên Blockchain trước khi gọi ví MetaMask ──
    try {
      const totalCount = await contract.campaignCount();
      if (campaignId >= Number(totalCount)) {
        notify(
          "error",
          "Chiến dịch không tồn tại",
          `Chiến dịch #${campaignId} không tồn tại trên hệ thống (Hiện có ${totalCount} chiến dịch: từ #0 đến #${Number(totalCount) > 0 ? Number(totalCount) - 1 : 0}).`
        );
        return;
      }

      const camp = await contract.campaigns(campaignId);
      const userAddr = (await signer.getAddress()).toLowerCase();
      const managerAddr = (camp.manager || "").toLowerCase();

      // 1. Kiểm tra quyền quản lý
      if (userAddr !== managerAddr) {
        notify(
          "error",
          "Không có quyền quản lý",
          `Chỉ người quản lý chiến dịch (${shortenAddress(camp.manager)}) mới có quyền gửi yêu cầu giải ngân!\nVí hiện tại của bạn: ${shortenAddress(userAddr)}`
        );
        return;
      }

      // 2. Kiểm tra trạng thái chiến dịch
      if (camp.isCancelled) {
        notify("error", "Chiến dịch đã bị hủy", `Chiến dịch "${camp.title}" đã bị hủy bỏ do vi phạm chính sách, không thể đề xuất giải ngân!`);
        return;
      }
      if (camp.stakeSlashed) {
        notify("error", "Chiến dịch bị phong tỏa", `Chiến dịch "${camp.title}" đã bị xử phạt tịch thu tiền ký quỹ, mọi hoạt động giải ngân đã bị đình chỉ!`);
        return;
      }

      // 3. Kiểm tra số dư quỹ khả dụng
      const raisedWei = BigInt(camp.raisedAmount);
      const disbursedWei = BigInt(camp.disbursedAmount);
      const availableWei = raisedWei - disbursedWei;
      const requestedWei = ethers.parseEther(amountEth);

      if (availableWei <= 0n) {
        notify(
          "error",
          "Số dư quỹ bằng 0",
          `Chiến dịch "${camp.title}" hiện chưa có số dư khả dụng để giải ngân!\n` +
          `• Tổng quyên góp: ${ethers.formatEther(raisedWei)} ETH\n` +
          `• Đã giải ngân: ${ethers.formatEther(disbursedWei)} ETH\n` +
          `• Khả dụng hiện tại: 0 ETH`
        );
        return;
      }

      if (requestedWei > availableWei) {
        notify(
          "error",
          "Số dư quỹ không đủ giải ngân",
          `Số tiền bạn yêu cầu (${amountEth} ETH) vượt quá số dư khả dụng hiện có của chiến dịch!\n` +
          `• Số dư khả dụng hiện tại: ${ethers.formatEther(availableWei)} ETH\n` +
          `• Số tiền bạn nhập: ${amountEth} ETH\n` +
          `💡 Vui lòng điều chỉnh số tiền giải ngân tối đa không quá ${ethers.formatEther(availableWei)} ETH.`
        );
        return;
      }

      // ── Gửi giao dịch lên Blockchain ──
      btnSubmitDisburse.disabled = true;
      btnSubmitDisburse.innerText = "Đang gửi đề xuất...";

      if (typeof updateTimeline === "function") updateTimeline("timelineDisburse", 1);
      if (typeof setTxLoading === "function") setTxLoading(true, "Đang gửi đề xuất giải ngân…", "Xác nhận trên MetaMask");

      const tx = await contract.requestDisbursement(
        campaignId,
        purpose,
        requestedWei,
        recipient,
        proofHash,
      );

      btnSubmitDisburse.innerText = "Đang chờ xác nhận khối...";
      if (typeof updateTimeline === "function") updateTimeline("timelineDisburse", 2);

      await tx.wait();

      if (typeof updateTimeline === "function") updateTimeline("timelineDisburse", 3);
      notify("success", "Đề xuất thành công", `Đề xuất giải ngân đã được ghi nhận trên chuỗi!\nTxHash: ${tx.hash}`);
      formRequestDisbursement.reset();
      updateDisburseCampaignHint();
    } catch (err) {
      console.error("Lỗi đề xuất giải ngân:", err);
      if (typeof resetTimeline === "function") resetTimeline("timelineDisburse");
      const parsedMsg = getContractErrorMessage(err);
      notify("error", "Yêu cầu giải ngân thất bại", parsedMsg);
    } finally {
      if (typeof setTxLoading === "function") setTxLoading(false);
      btnSubmitDisburse.disabled = false;
      btnSubmitDisburse.innerText = "💸 Gửi Yêu Cầu Giải Ngân";
    }
  });
}

/**
 * Xử lý Form 3: Thực Thi Giải Ngân (executeDisbursement)
 */
if (formExecuteDisbursement) {
  formExecuteDisbursement.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!contract || !signer) {
      notify("warning", "Chưa kết nối ví", "Vui lòng kết nối ví MetaMask trước!");
      return;
    }

    const cIdVal = execCampaignId?.value?.trim();
    const rIdVal = execRequestId?.value?.trim();
    if (cIdVal === "" || rIdVal === "" || isNaN(cIdVal) || isNaN(rIdVal)) {
      notify("warning", "Thiếu thông tin", "Vui lòng nhập Mã chiến dịch và Mã yêu cầu giải ngân!");
      return;
    }

    const campaignId = parseInt(cIdVal, 10);
    const requestId = parseInt(rIdVal, 10);

    // ── Kiểm tra quyền Admin & tính hợp lệ của đề xuất trước khi gọi MetaMask ──
    try {
      const adminAddr = (await contract.systemAdmin()).toLowerCase();
      const userAddr = (await signer.getAddress()).toLowerCase();

      // 1. Kiểm tra quyền Admin hệ thống
      if (userAddr !== adminAddr) {
        notify(
          "error",
          "Từ chối quyền Admin",
          `Chỉ Quản trị viên hệ thống (${shortenAddress(adminAddr)}) mới có quyền thực thi chuyển quỹ giải ngân!\nVí hiện tại của bạn: ${shortenAddress(userAddr)}`
        );
        return;
      }

      // 2. Kiểm tra tồn tại chiến dịch
      const totalCount = await contract.campaignCount();
      if (campaignId >= Number(totalCount)) {
        notify("error", "Chiến dịch không tồn tại", `Chiến dịch #${campaignId} không tồn tại trên hệ thống.`);
        return;
      }

      // 3. Kiểm tra thông tin đề xuất giải ngân
      let req;
      try {
        req = await contract.getDisbursementRequest(campaignId, requestId);
      } catch (getErr) {
        notify("error", "Yêu cầu không tồn tại", `Không tìm thấy yêu cầu giải ngân #${requestId} trong chiến dịch #${campaignId}.`);
        return;
      }

      if (req.isExecuted) {
        notify(
          "warning",
          "Yêu cầu đã thực thi",
          `Yêu cầu #${requestId} của chiến dịch #${campaignId} đã được thực thi và chuyển tiền thành công trước đó!`
        );
        return;
      }

      const camp = await contract.campaigns(campaignId);
      if (camp.isCancelled || camp.stakeSlashed) {
        notify("error", "Chiến dịch bị phong tỏa", `Chiến dịch #${campaignId} đã bị hủy hoặc phong tỏa do vi phạm, không thể giải ngân!`);
        return;
      }

      const availableWei = BigInt(camp.raisedAmount) - BigInt(camp.disbursedAmount);
      if (BigInt(req.amount) > availableWei) {
        notify(
          "error",
          "Số dư quỹ không đủ",
          `Số dư quỹ khả dụng (${ethers.formatEther(availableWei)} ETH) không đủ để thực thi giải ngân khoản ${ethers.formatEther(req.amount)} ETH!`
        );
        return;
      }

      // ── Thực thi giao dịch ──
      btnSubmitExec.disabled = true;
      btnSubmitExec.innerText = "Đang thực thi chuyển quỹ...";

      if (typeof updateTimeline === "function") updateTimeline("timelineExec", 1);
      if (typeof setTxLoading === "function") setTxLoading(true, "Đang thực thi giải ngân quỹ…", "Admin đang chuyển tiền qua Smart Contract");

      const tx = await contract.executeDisbursement(campaignId, requestId);

      btnSubmitExec.innerText = "Đang chờ xác nhận trên mạng...";
      if (typeof updateTimeline === "function") updateTimeline("timelineExec", 2);

      await tx.wait();

      // Đồng bộ bản ghi chứng từ giải ngân vào bảng MySQL disbursement_proofs
      try {
        await fetch("../server/api/proofs_api.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tx_hash: tx.hash,
            campaign_id: campaignId,
            description: `Thực thi giải ngân thành công yêu cầu #${requestId} cho chiến dịch #${campaignId}`
          })
        });
        console.log("Đã đồng bộ giao dịch giải ngân vào MySQL disbursement_proofs.");
      } catch (pErr) {
        console.warn("Cảnh báo lưu MySQL proofs_api:", pErr);
      }

      if (typeof updateTimeline === "function") updateTimeline("timelineExec", 3);
      notify(
        "success",
        "Giải ngân thành công!",
        `Tiền đã chuyển đến ví thụ hưởng! Khoản ký quỹ cũng đã được xử lý minh bạch.\nTxHash: ${tx.hash}`
      );
      formExecuteDisbursement.reset();
      updateExecRequestHint();
      updateDisburseCampaignHint();
    } catch (err) {
      console.error("Lỗi thực thi giải ngân:", err);
      if (typeof resetTimeline === "function") resetTimeline("timelineExec");
      const parsedMsg = getContractErrorMessage(err);
      notify("error", "Thực thi thất bại", parsedMsg);
    } finally {
      if (typeof setTxLoading === "function") setTxLoading(false);
      btnSubmitExec.disabled = false;
      btnSubmitExec.innerText = "✅ Xác Nhận & Thực Thi Chuyển Tiền";
    }
  });
}

/**
 * Xử lý Section 4: Hoàn trả ký quỹ (refundStake)
 */
if (btnRefundStake) {
  btnRefundStake.addEventListener("click", async () => {
    if (!contract || !signer) {
      notify("warning", "Chưa kết nối ví", "Vui lòng kết nối ví MetaMask trước!");
      return;
    }
    const idVal = stakeCampaignId?.value?.trim();
    if (idVal === "" || isNaN(idVal)) {
      notify("warning", "Thiếu ID", "Vui lòng nhập Campaign ID cần rút cọc!");
      return;
    }
    const cId = parseInt(idVal, 10);

    try {
      const totalCount = await contract.campaignCount();
      if (cId >= Number(totalCount)) {
        notify("error", "Chiến dịch không tồn tại", `Chiến dịch #${cId} không tồn tại trên hệ thống.`);
        return;
      }

      const camp = await contract.campaigns(cId);
      const userAddr = (await signer.getAddress()).toLowerCase();
      const adminAddr = (await contract.systemAdmin()).toLowerCase();
      const creatorAddr = (camp.creator || "").toLowerCase();

      if (userAddr !== creatorAddr && userAddr !== adminAddr) {
        notify("error", "Từ chối quyền truy cập", `Chỉ người tạo chiến dịch (${shortenAddress(camp.creator)}) hoặc Admin mới có quyền rút lại tiền ký quỹ!`);
        return;
      }
      if (camp.stakeRefunded) {
        notify("warning", "Đã hoàn trả", `Tiền ký quỹ của chiến dịch #${cId} đã được hoàn trả trước đó!`);
        return;
      }
      if (camp.stakeSlashed) {
        notify("error", "Ký quỹ đã bị tịch thu", `Tiền ký quỹ của chiến dịch #${cId} đã bị tịch thu (Slashing) do vi phạm, không thể hoàn trả!`);
        return;
      }
      if (camp.isCancelled) {
        notify("error", "Chiến dịch bị hủy", `Chiến dịch #${cId} đã bị hủy do vi phạm, tiền ký quỹ không được phép hoàn trả!`);
        return;
      }
      if (BigInt(camp.disbursedAmount) <= 0n) {
        notify("warning", "Chưa đủ điều kiện", `Chiến dịch #${cId} chưa thực hiện đợt giải ngân minh bạch nào! Cần ít nhất 1 đợt giải ngân thành công để rút lại tiền ký quỹ.`);
        return;
      }

      btnRefundStake.disabled = true;
      btnRefundStake.innerText = "Đang gửi yêu cầu hoàn ký quỹ...";
      if (typeof setTxLoading === "function") setTxLoading(true, "Đang yêu cầu hoàn trả tiền ký quỹ…", "Xác nhận trên MetaMask");

      const tx = await contract.refundStake(cId);
      await tx.wait();

      notify("success", "Hoàn ký quỹ thành công!", `Đã chuyển trả tiền ký quỹ cho người tạo chiến dịch #${cId}!\nTxHash: ${tx.hash}`);
    } catch (err) {
      console.error("Lỗi hoàn trả ký quỹ:", err);
      const parsedMsg = getContractErrorMessage(err);
      notify("error", "Hoàn ký quỹ thất bại", parsedMsg);
    } finally {
      if (typeof setTxLoading === "function") setTxLoading(false);
      btnRefundStake.disabled = false;
      btnRefundStake.innerText = "💰 Rút Lại Tiền Ký Quỹ (Refund Stake)";
    }
  });
}

/**
 * Xử lý Section 4: Tịch thu ký quỹ & Đóng chiến dịch do vi phạm (cancelOrSlashCampaign - Admin)
 */
if (btnSlashStake) {
  btnSlashStake.addEventListener("click", async () => {
    if (!contract || !signer) {
      notify("warning", "Chưa kết nối ví", "Vui lòng kết nối ví Admin trước!");
      return;
    }
    const idVal = stakeCampaignId?.value?.trim();
    if (idVal === "" || isNaN(idVal)) {
      notify("warning", "Thiếu ID", "Vui lòng nhập Campaign ID cần xử phạt!");
      return;
    }
    const cId = parseInt(idVal, 10);
    const reason = slashReason?.value?.trim() || "Vi pham quy che minh bach tu thien";

    try {
      const adminAddr = (await contract.systemAdmin()).toLowerCase();
      const userAddr = (await signer.getAddress()).toLowerCase();

      if (userAddr !== adminAddr) {
        notify("error", "Từ chối quyền Admin", `Chỉ Quản trị viên hệ thống (${shortenAddress(adminAddr)}) mới có quyền thực thi Slashing và tịch thu tiền cọc!`);
        return;
      }

      const totalCount = await contract.campaignCount();
      if (cId >= Number(totalCount)) {
        notify("error", "Chiến dịch không tồn tại", `Chiến dịch #${cId} không tồn tại trên hệ thống.`);
        return;
      }

      const camp = await contract.campaigns(cId);
      if (camp.stakeSlashed) {
        notify("warning", "Đã tịch thu trước đó", `Chiến dịch #${cId} đã bị tịch thu tiền ký quỹ trước đó!`);
        return;
      }

      if (!confirm(`CẢNH BÁO: Bạn chắc chắn muốn TỊCH THU TIỀN KÝ QUỸ (Slashing) và ĐÓNG VĨNH VIỄN chiến dịch #${cId} do vi phạm?\nLý do: "${reason}"\n\nSau khi kích hoạt, các nhà hảo tâm sẽ có quyền rút lại tiền đã quyên góp (Claim Refund)!`)) {
        return;
      }

      btnSlashStake.disabled = true;
      btnSlashStake.innerText = "Đang xử phạt (Slashing)...";
      if (typeof setTxLoading === "function") setTxLoading(true, "Đang thực thi Slashing tiền ký quỹ…", "Xử phạt chiến dịch vi phạm");

      const tx = await contract.cancelOrSlashCampaign(cId, reason);
      await tx.wait();

      notify("success", "Đã tịch thu ký quỹ (Slashing)!", `Chiến dịch #${cId} đã bị đình chỉ và tịch thu tiền ký quỹ vào quỹ chung.\nCác nhà hảo tâm giờ đây có thể tự do Claim Refund.\nTxHash: ${tx.hash}`);
    } catch (err) {
      console.error("Lỗi Slashing:", err);
      const parsedMsg = getContractErrorMessage(err);
      notify("error", "Slashing thất bại", parsedMsg);
    } finally {
      if (typeof setTxLoading === "function") setTxLoading(false);
      btnSlashStake.disabled = false;
      btnSlashStake.innerText = "⚠️ Tịch Thu Ký Quỹ Do Vi Phạm (Slash Stake - Admin)";
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
