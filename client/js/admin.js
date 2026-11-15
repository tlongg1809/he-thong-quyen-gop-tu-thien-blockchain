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
 * Khắc phục triệt để lỗi hiển thị "require(false)" mơ hồ khi EVM revert.
 */
function parseContractError(err) {
  if (typeof window.parseContractError === "function") {
    return window.parseContractError(err);
  }
  if (!err) return "Đã xảy ra lỗi không xác định.";

  if (
    err.code === 4001 ||
    err.code === "ACTION_REJECTED" ||
    (err.message && err.message.toLowerCase().includes("user rejected"))
  ) {
    return "Bạn đã từ chối ký xác nhận giao dịch trên ví MetaMask.";
  }

  if (
    err.code === "INSUFFICIENT_FUNDS" ||
    (err.message && err.message.toLowerCase().includes("insufficient funds"))
  ) {
    return "Số dư ví SepoliaETH của bạn không đủ để thanh toán tiền ký quỹ và phí gas giao dịch.";
  }

  if (
    err.reason &&
    err.reason !== "require(false)" &&
    !err.reason.includes("execution reverted") &&
    !err.reason.includes("missing revert data")
  ) {
    return err.reason;
  }

  if (err.data && typeof err.data === "string" && err.data.length > 10 && typeof CHARITY_CONTRACT_ABI !== "undefined") {
    try {
      const iface = new ethers.Interface(CHARITY_CONTRACT_ABI);
      const parsedErr = iface.parseError(err.data);
      if (parsedErr) return `Lỗi Smart Contract: ${parsedErr.name}`;
    } catch (_) {}
  }

  const rawMsg = err.shortMessage || err.info?.error?.message || err.message || String(err);
  if (
    err.reason === "require(false)" ||
    rawMsg.includes("require(false)") ||
    rawMsg.includes("execution reverted") ||
    rawMsg.includes("missing revert data") ||
    rawMsg.includes("CALL_EXCEPTION")
  ) {
    return (
      "Giao dịch bị từ chối bởi Smart Contract (Execution Reverted).\n\n" +
      "💡 Các nguyên nhân chính:\n" +
      "1. Smart Contract tại địa chỉ hiện tại chưa được cập nhật phiên bản mới (Dynamic Stake + Lưu băm ảnh SHA-256). Hãy Deploy lại file contracts/CharityDonation.sol trên Remix và dán địa chỉ mới vào server/.env.\n" +
      "2. Số dư ví không đủ 0.05 ETH để đặt cọc ký quỹ chiến dịch.\n" +
      "3. Không đúng quyền quản lý hoặc thông tin không hợp lệ."
    );
  }

  return rawMsg;
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
 * Khởi tạo ứng dụng & nạp cấu hình hợp đồng
 */
async function init() {
  if (typeof loadContractConfig === "function") {
    await loadContractConfig();
  }

  if (!CHARITY_CONTRACT_ADDRESS) {
    notify("error", "Lỗi cấu hình", "Chưa cấu hình CHARITY_CONTRACT_ADDRESS hợp lệ trong file .env!");
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
      const parsedMsg = parseContractError(err);
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
      notify("warning", "Chưa kết nối ví", "Vui lòng kết nối ví trước!");
      return;
    }

    const campaignId = parseInt(disburseCampaignId.value, 10);
    const purpose = disbursePurpose.value.trim();
    const amountEth = disburseAmount.value;
    const recipient = disburseRecipient.value.trim();
    const proofHash = disburseProof.value.trim();

    if (!ethers.isAddress(recipient)) {
      notify("error", "Địa chỉ không hợp lệ", "Địa chỉ ví đơn vị thụ hưởng không hợp lệ!");
      return;
    }

    try {
      btnSubmitDisburse.disabled = true;
      btnSubmitDisburse.innerText = "Đang gửi đề xuất...";

      if (typeof updateTimeline === "function") updateTimeline("timelineDisburse", 1);
      if (typeof setTxLoading === "function") setTxLoading(true, "Đang gửi đề xuất giải ngân…", "Xác nhận trên MetaMask");

      const amountWei = ethers.parseEther(amountEth);
      const tx = await contract.requestDisbursement(
        campaignId,
        purpose,
        amountWei,
        recipient,
        proofHash,
      );

      btnSubmitDisburse.innerText = "Đang chờ xác nhận khối...";
      if (typeof updateTimeline === "function") updateTimeline("timelineDisburse", 2);

      await tx.wait();

      if (typeof updateTimeline === "function") updateTimeline("timelineDisburse", 3);
      notify("success", "Đề xuất thành công", `Đề xuất giải ngân đã được ghi nhận trên chuỗi!\nTxHash: ${tx.hash}`);
      formRequestDisbursement.reset();
    } catch (err) {
      console.error("Lỗi đề xuất giải ngân:", err);
      if (typeof resetTimeline === "function") resetTimeline("timelineDisburse");
      const parsedMsg = parseContractError(err);
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
      notify("warning", "Chưa kết nối ví", "Vui lòng kết nối ví trước!");
      return;
    }

    const campaignId = parseInt(execCampaignId.value, 10);
    const requestId = parseInt(execRequestId.value, 10);

    try {
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
        `Tiền đã chuyển đến ví thụ hưởng! Khoản ký quỹ 0.05 ETH cũng đã được tự động hoàn trả cho người tạo.\nTxHash: ${tx.hash}`
      );
      formExecuteDisbursement.reset();
    } catch (err) {
      console.error("Lỗi thực thi giải ngân:", err);
      if (typeof resetTimeline === "function") resetTimeline("timelineExec");
      const parsedMsg = parseContractError(err);
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
      notify("warning", "Chưa kết nối ví", "Vui lòng kết nối ví trước!");
      return;
    }
    const idVal = stakeCampaignId?.value?.trim();
    if (idVal === "" || isNaN(idVal)) {
      notify("warning", "Thiếu ID", "Vui lòng nhập Campaign ID cần rút cọc!");
      return;
    }
    const cId = parseInt(idVal, 10);

    try {
      btnRefundStake.disabled = true;
      btnRefundStake.innerText = "Đang gửi yêu cầu hoàn ký quỹ...";
      if (typeof setTxLoading === "function") setTxLoading(true, "Đang yêu cầu hoàn trả tiền ký quỹ…", "Xác nhận trên MetaMask");

      const tx = await contract.refundStake(cId);
      await tx.wait();

      notify("success", "Hoàn ký quỹ thành công!", `Đã chuyển trả 0.05 ETH tiền ký quỹ cho người tạo chiến dịch #${cId}!\nTxHash: ${tx.hash}`);
    } catch (err) {
      console.error("Lỗi hoàn trả ký quỹ:", err);
      const parsedMsg = parseContractError(err);
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

    if (!confirm(`CẢNH BÁO: Bạn chắc chắn muốn TỊCH THU TIỀN KÝ QUỸ (Slashing) và ĐÓNG VĨNH VIỄN chiến dịch #${cId} do vi phạm?\nLý do: "${reason}"\n\nSau khi kích hoạt, các nhà hảo tâm sẽ có quyền rút lại tiền đã quyên góp (Claim Refund)!`)) {
      return;
    }

    try {
      btnSlashStake.disabled = true;
      btnSlashStake.innerText = "Đang xử phạt (Slashing)...";
      if (typeof setTxLoading === "function") setTxLoading(true, "Đang thực thi Slashing tiền ký quỹ…", "Xử phạt chiến dịch vi phạm");

      const tx = await contract.cancelOrSlashCampaign(cId, reason);
      await tx.wait();

      notify("success", "Đã tịch thu ký quỹ (Slashing)!", `Chiến dịch #${cId} đã bị đình chỉ và tịch thu tiền ký quỹ vào quỹ chung.\nCác nhà hảo tâm giờ đây có thể tự do Claim Refund.\nTxHash: ${tx.hash}`);
    } catch (err) {
      console.error("Lỗi Slashing:", err);
      const parsedMsg = parseContractError(err);
      notify("error", "Slashing thất bại", parsedMsg);
    } finally {
      if (typeof setTxLoading === "function") setTxLoading(false);
      btnSlashStake.disabled = false;
      btnSlashStake.innerText = "⚠️ Tịch Thu Ký Quỹ Do Vi Phạm (Slash Stake - Admin)";
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
