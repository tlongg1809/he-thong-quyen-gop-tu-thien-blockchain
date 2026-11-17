// client/js/web3-common.js
/**
 * Module Dùng Chung cho Web3, Hợp Đồng CharityChain và Tiện Ích Giao Diện (Toast, Format, Copy)
 * Dự án: CharityChain - Quyên Góp Từ Thiện Minh Bạch Trên Ethereum Sepolia
 */

// Cấu hình mạng Sepolia
const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7"; // 11155111
const SEPOLIA_CHAIN_PARAMS = {
  chainId: "0xaa36a7",
  chainName: "Sepolia Test Network",
  nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
  blockExplorerUrls: ["https://sepolia.etherscan.io"]
};

const DEFAULT_SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

/**
 * 1. Nạp địa chỉ Smart Contract từ backend PHP (server/.env)
 */
async function initContractConfig() {
  if (typeof loadContractConfig === "function") {
    try {
      await loadContractConfig();
    } catch (e) {
      console.warn("Lỗi gọi loadContractConfig:", e);
    }
  }

  // Nếu chưa có, thử nạp trực tiếp từ config_api.php
  if (typeof CHARITY_CONTRACT_ADDRESS === "undefined" || !CHARITY_CONTRACT_ADDRESS) {
    try {
      const apiPath = window.location.pathname.includes("/client/")
        ? "../server/config/config_api.php"
        : "server/config/config_api.php";
      const res = await fetch(apiPath);
      if (res.ok) {
        const data = await res.json();
        if (data.contractAddress && data.contractAddress.startsWith("0x")) {
          CHARITY_CONTRACT_ADDRESS = data.contractAddress;
          CONTRACT_ADDRESS = data.contractAddress;
        }
      }
    } catch (err) {
      console.warn("Không thể nạp CONTRACT_ADDRESS từ .env:", err);
    }
  }

  return (typeof CHARITY_CONTRACT_ADDRESS !== "undefined") ? CHARITY_CONTRACT_ADDRESS : "";
}

/**
 * 2. Lấy Web3 Provider (ưu tiên MetaMask BrowserProvider, fallback sang Sepolia RPC công khai)
 */
async function getWeb3Provider() {
  if (window.ethereum) {
    try {
      return new ethers.BrowserProvider(window.ethereum);
    } catch (e) {
      console.warn("Không thể dùng BrowserProvider từ MetaMask, dùng RPC dự phòng:", e);
    }
  }
  return new ethers.JsonRpcProvider(DEFAULT_SEPOLIA_RPC);
}

/**
 * 3. Kiểm tra hoặc tự động yêu cầu chuyển sang mạng Sepolia
 */
async function checkOrSwitchSepolia() {
  if (!window.ethereum) return false;
  try {
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (chainId !== SEPOLIA_CHAIN_ID_HEX) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }]
        });
        return true;
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [SEPOLIA_CHAIN_PARAMS]
          });
          return true;
        }
        throw switchError;
      }
    }
    return true;
  } catch (err) {
    console.warn("Không thể chuyển sang mạng Sepolia:", err);
    return false;
  }
}

/**
 * 4. Rút gọn địa chỉ ví Ethereum (0x1234...5678)
 */
function shortenAddress(addr) {
  if (!addr) return "--";
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * 5. Định dạng thời gian Unix Timestamp sang giờ Việt Nam
 */
function formatTimestamp(unixSeconds) {
  if (!unixSeconds || Number(unixSeconds) === 0) return "--";
  return new Date(Number(unixSeconds) * 1000).toLocaleString("vi-VN");
}

/**
 * 6. Sao chép văn bản vào bộ nhớ tạm (Clipboard) có hiển thị Toast
 */
async function copyToClipboard(text, successMsg = "Đã sao chép vào bộ nhớ tạm!") {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast("success", "Sao chép thành công", successMsg);
  } catch (err) {
    // Fallback nếu clipboard API bị chặn
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast("success", "Sao chép thành công", successMsg);
  }
}

/**
 * 7. Từ Điển & Trình Bóc Tách Lỗi Smart Contract & Web3 Thân Thiện (Tiếng Việt)
 */
const CONTRACT_REVERT_DICT = {
  // ── Giải ngân ──
  "So du quy khong du de giai ngan": "Số dư quỹ không đủ để giải ngân! Số tiền bạn yêu cầu vượt quá số dư khả dụng hiện tại của chiến dịch (Tổng đã quyên góp trừ các đợt đã giải ngân).",
  "So du quy khong du": "Số dư quỹ của chiến dịch không đủ để giải ngân khoản tiền này.",
  "Dia chi nguoi thu huong khong hop le": "Địa chỉ ví đơn vị thụ hưởng không hợp lệ hoặc là địa chỉ 0x0.",
  "So tien giai ngan phai lon hon 0": "Số tiền đề xuất giải ngân phải lớn hơn 0 ETH.",
  "Yeu cau khong ton tai": "Yêu cầu giải ngân không tồn tại (Mã Request ID không hợp lệ trên chiến dịch này).",
  "Yeu cau da duoc thuc hien truoc do": "Yêu cầu giải ngân này đã được Admin phê duyệt và thực thi chuyển tiền trước đó.",

  // ── Quyền hạn ──
  "Loi: Chi Admin he thong moi co quyen": "Hành động bị từ chối: Thao tác này chỉ dành riêng cho Quản trị viên hệ thống (Admin).",
  "Loi: Chi quan ly chien dich moi co quyen": "Hành động bị từ chối: Chỉ người quản lý (Manager) của chiến dịch mới có quyền gửi đề xuất giải ngân.",
  "Loi: Khong co quyen yeu cau hoan ky quy": "Hành động bị từ chối: Chỉ người tạo chiến dịch hoặc Admin mới có quyền yêu cầu hoàn trả tiền ký quỹ.",

  // ── Tạo chiến dịch ──
  "Loi: Chien dich khong ton tai": "Chiến dịch không tồn tại trên Smart Contract (Mã Campaign ID không hợp lệ).",
  "Loi: Muc tieu quyen gop phai lon hon 0": "Mục tiêu kêu gọi quyên góp phải lớn hơn 0 ETH.",
  "Loi: Thoi han quyen gop phai lon hon 0": "Thời hạn chiến dịch phải lớn hơn 0 ngày.",
  "Loi: Dia chi quan ly khong hop le": "Địa chỉ ví người quản lý chiến dịch không hợp lệ.",
  "Loi: Ten chien dich khong duoc de trong": "Tên chiến dịch không được để trống.",
  "Loi: Tien ky quy khong du (Toi thieu 0.05 ETH hoac 2% muc tieu)": "Tiền ký quỹ không đủ! Người tạo chiến dịch cần đặt cọc tối thiểu 0.05 ETH (hoặc 2% mục tiêu) để đảm bảo trách nhiệm.",

  // ── Đóng góp & Trạng thái chiến dịch ──
  "Chien dich da dong tiep nhan": "Chiến dịch đã kết thúc hoặc đóng tiếp nhận quyên góp mới.",
  "Chien dich da bi huy bo do vi pham": "Chiến dịch này đã bị hủy bỏ do phát hiện vi phạm chính sách.",
  "Chien dich da bi huy": "Chiến dịch này đã bị hủy bỏ hoặc tạm dừng hoạt động.",
  "Chien dich da bi huy truoc do": "Chiến dịch này đã bị hủy trước đó.",
  "Chien dich da het han quyen gop": "Chiến dịch đã kết thúc thời hạn tiếp nhận quyên góp.",
  "So tien quyen gop phai lon hon 0": "Số tiền quyên góp phải lớn hơn 0 ETH.",
  "Chien dich da bi khoa do vi pham ky quy": "Chiến dịch đã bị khóa vĩnh viễn do vi phạm chính sách ký quỹ.",
  "Chien dich da bi dinh chi do vi pham gian lan": "Chiến dịch đã bị đình chỉ hoạt động do phát hiện dấu hiệu gian lận.",

  // ── Ký quỹ & Xử phạt (Slashing) ──
  "Loi: Tien ky quy da duoc hoan tra": "Khoản tiền ký quỹ của chiến dịch này đã được hoàn trả thành công trước đó.",
  "Loi: Tien ky quy da bi tich thu do vi pham": "Tiền ký quỹ đã bị tịch thu (Slashing) do chiến dịch vi phạm.",
  "Loi: Chien dich da bi huy do vi pham": "Không thể hoàn tiền ký quỹ vì chiến dịch đã bị hủy do vi phạm.",
  "Loi: Khong co khoan ky quy kha dung": "Chiến dịch không có khoản tiền ký quỹ nào khả dụng để rút.",
  "Loi: Chien dich chua co dot giai ngan minh bach nao": "Chưa đủ điều kiện rút ký quỹ: Chiến dịch cần thực hiện ít nhất 1 đợt giải ngân minh bạch có chứng từ được Admin phê duyệt.",
  "Khong co quy tich thu de rut": "Quỹ tiền phạt tịch thu hiện không có số dư để rút.",
  "Rut quy that bai": "Giao dịch rút quỹ tịch thu thất bại.",
  "Loi: Chuyen tien hoan ky quy that bai": "Chuyển tiền hoàn trả ký quỹ thất bại.",

  // ── Hoàn tiền cho nhà hảo tâm (Donor Refund) ──
  "Chien dich chua du dieu kien hoan tra tien cho nha hao tam": "Chiến dịch chưa đủ điều kiện hoàn trả tiền (chỉ hoàn trả khi hết hạn không đạt mục tiêu hoặc bị hủy do vi phạm).",
  "Ban khong co so du quyen gop de rut lai trong chien dich nay": "Ví của bạn không có số dư quyên góp khả dụng để rút lại trong chiến dịch này.",
  "Giao dich rut lai tien quyen gop that bai": "Giao dịch rút lại tiền quyên góp cho nhà hảo tâm thất bại.",
  "Giao dich chuyen tien that bai": "Giao dịch chuyển tiền từ hợp đồng đến ví người nhận thất bại."
};

/**
 * Trích xuất chuỗi Revert Reason từ lỗi của Ethers.js v6 / MetaMask
 */
function extractRevertReason(err) {
  if (!err) return "";

  // 1. err.revert?.args?.[0] (cấu trúc chuẩn Ethers v6 CALL_EXCEPTION)
  if (err.revert && Array.isArray(err.revert.args) && err.revert.args.length > 0) {
    const r = String(err.revert.args[0]).trim();
    if (r) return r;
  }

  // 2. err.reason
  if (err.reason && typeof err.reason === "string") {
    let r = err.reason.trim();
    r = r.replace(/^execution reverted:\s*/i, "").replace(/^"|"$/g, "").trim();
    if (r && r !== "require(false)" && !r.includes("missing revert data")) {
      return r;
    }
  }

  // 3. err.shortMessage, err.info?.error?.message, err.message
  const messages = [
    err.shortMessage,
    err.info?.error?.message,
    err.info?.message,
    err.message,
    typeof err === "string" ? err : ""
  ];

  for (const msg of messages) {
    if (!msg || typeof msg !== "string") continue;
    const match = msg.match(/execution reverted:\s*"?([^"\n\r]+)"?/i);
    if (match && match[1]) {
      const extracted = match[1].trim();
      if (extracted && extracted !== "require(false)" && !extracted.includes("missing revert data")) {
        return extracted;
      }
    }
  }

  // 4. Thử giải mã Error(string) hex selector 0x08c379a0 nếu có
  const hexData = err.data || err.info?.error?.data || err.info?.errorPayload?.data;
  if (typeof hexData === "string" && hexData.startsWith("0x08c379a0") && typeof ethers !== "undefined" && ethers.AbiCoder) {
    try {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + hexData.slice(10));
      if (decoded && decoded[0]) {
        return String(decoded[0]).trim();
      }
    } catch (_) { }
  }

  return "";
}

/**
 * Trình phân tích lỗi Smart Contract & Web3 thân thiện (Tiếng Việt)
 */
function parseContractError(err) {
  if (!err) return "Đã xảy ra lỗi không xác định.";

  // 1. Người dùng bấm Hủy (Reject) trên MetaMask
  if (
    err.code === 4001 ||
    err.code === "ACTION_REJECTED" ||
    (err.message && err.message.toLowerCase().includes("user rejected")) ||
    (err.info?.error?.code === 4001)
  ) {
    return "Bạn đã từ chối ký xác nhận giao dịch trên ví MetaMask.";
  }

  // 2. Không đủ tiền (Insufficient funds)
  if (
    err.code === "INSUFFICIENT_FUNDS" ||
    (err.message && err.message.toLowerCase().includes("insufficient funds")) ||
    (err.shortMessage && err.shortMessage.toLowerCase().includes("insufficient funds"))
  ) {
    return "Số dư ví SepoliaETH của bạn không đủ để thanh toán số tiền và phí gas mạng.";
  }

  // 3. Trích xuất và dịch lý do Revert cụ thể từ Smart Contract
  const reason = extractRevertReason(err);
  if (reason) {
    // Tìm chính xác trong từ điển
    if (CONTRACT_REVERT_DICT[reason]) {
      return CONTRACT_REVERT_DICT[reason];
    }
    // Tìm tương đối trong từ điển
    const lowerReason = reason.toLowerCase();
    for (const [key, val] of Object.entries(CONTRACT_REVERT_DICT)) {
      if (lowerReason.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerReason)) {
        return val;
      }
    }
    // Trả về lý do cụ thể từ Smart Contract
    return `Lỗi từ Smart Contract: "${reason}"`;
  }

  // 4. Bóc tách lỗi từ Custom Error ABI nếu có
  const hexData = err.data || err.info?.error?.data;
  if (hexData && typeof hexData === "string" && hexData.length > 10 && typeof CHARITY_CONTRACT_ABI !== "undefined" && typeof ethers !== "undefined") {
    try {
      const iface = new ethers.Interface(CHARITY_CONTRACT_ABI);
      const parsedErr = iface.parseError(hexData);
      if (parsedErr) return `Lỗi Smart Contract: ${parsedErr.name}`;
    } catch (_) { }
  }

  // 5. Fallback thông điệp lỗi rõ ràng cho EVM Revert
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
      "💡 Các nguyên nhân thường gặp:\n" +
      "1. Ví hiện tại không đúng quyền hạn (chỉ Quản lý chiến dịch hoặc Admin hệ thống).\n" +
      "2. Số dư quỹ khả dụng không đủ để đáp ứng yêu cầu giải ngân.\n" +
      "3. Điều kiện của chiến dịch chưa thỏa mãn (chiến dịch đã đóng, đã bị hủy hoặc yêu cầu đã thực thi)."
    );
  }

  return rawMsg;
}

/**
 * 8. Hệ thống Toast Notification Chuẩn Hóa
 * Nền sáng tương phản cao (#ffffff), viền màu trạng thái rõ ràng, tiêu đề #0f172a, mô tả #475569.
 * Không bị lỗi chữ trắng trên nền trắng và tự động chuẩn hóa lỗi require(false)!
 */
function showToast(arg1, arg2, arg3, durationMs = 6000) {
  let type = "info";
  let title = "Thông Báo";
  let message = "";
  const validTypes = ["success", "error", "warning", "info"];

  if (validTypes.includes(arg1)) {
    type = arg1;
    if (arg3 !== undefined) {
      // Gọi 3 tham số: showToast(type, title, message)
      title = arg2 || (type === "error" ? "Lỗi Giao Dịch" : type === "success" ? "Thành Công" : "Thông Báo");
      message = arg3 || "";
    } else {
      // Gọi 2 tham số: showToast(type, message) -> chuẩn hóa để không bị mất title
      title = type === "error" ? "Lỗi Giao Dịch" : type === "success" ? "Thành Công" : type === "warning" ? "Cảnh Báo" : "Thông Báo";
      message = arg2 || "";
    }
  } else if (validTypes.includes(arg3)) {
    // Gọi kiểu (title, message, type)
    title = arg1 || "Thông Báo";
    message = arg2 || "";
    type = arg3;
  } else if (validTypes.includes(arg2)) {
    // Gọi kiểu (message, type)
    message = arg1 || "";
    type = arg2;
    title = type === "error" ? "Lỗi Giao Dịch" : type === "success" ? "Thành Công" : "Thông Báo";
  } else {
    // Gọi kiểu 1 tham số (message)
    message = String(arg1 || "");
    title = "Thông Báo";
  }

  // Tự động lọc và khắc phục lỗi require(false) nếu lọt vào Toast
  if (title === "require(false)" || title.toLowerCase().includes("execution reverted")) {
    title = "Lỗi Thực Thi Hợp Đồng";
  }
  if (typeof message === "string" && (message === "require(false)" || message.includes("require(false)"))) {
    message =
      "Giao dịch bị từ chối bởi Smart Contract (Execution Reverted).\n\n" +
      "💡 Hợp đồng tại địa chỉ hiện tại chưa được cập nhật phiên bản mới trên Sepolia Testnet. " +
      "Vui lòng biên dịch lại contracts/CharityDonation.sol trên Remix IDE, Deploy lại và dán địa chỉ mới vào server/.env!";
  }

  // Icon FontAwesome 6
  const iconMap = {
    success: '<i class="fa-solid fa-circle-check" style="color: #10b981;"></i>',
    error: '<i class="fa-solid fa-circle-xmark" style="color: #ef4444;"></i>',
    warning: '<i class="fa-solid fa-triangle-exclamation" style="color: #f59e0b;"></i>',
    info: '<i class="fa-solid fa-circle-info" style="color: #3b82f6;"></i>'
  };

  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type} ${type}`;
  toast.setAttribute("role", "alert");
  toast.innerHTML = `
    <div class="toast-icon">${iconMap[type] || iconMap.info}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-msg">${message}</div>` : ""}
    </div>
    <button type="button" class="toast-close" aria-label="Đóng" onclick="this.closest('.toast').remove()">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;

  container.appendChild(toast);

  // Tự động đóng sau durationMs
  if (durationMs > 0) {
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add("toast-fadeout");
        setTimeout(() => toast.remove(), 300);
      }
    }, durationMs);
  }
  return toast;
}

// Xuất các hàm ra phạm vi toàn cục (window)
window.initContractConfig = initContractConfig;
window.getWeb3Provider = getWeb3Provider;
window.checkOrSwitchSepolia = checkOrSwitchSepolia;
window.shortenAddress = shortenAddress;
window.formatTimestamp = formatTimestamp;
window.copyToClipboard = copyToClipboard;
window.parseContractError = parseContractError;
window.showToast = showToast;
