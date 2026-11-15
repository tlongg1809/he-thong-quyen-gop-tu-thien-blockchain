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
 * 1. Nạp địa chỉ Smart Contract từ backend PHP (.env) hoặc fallback từ config.js
 */
async function initContractConfig() {
  if (typeof loadContractConfig === "function") {
    try {
      await loadContractConfig();
    } catch (e) {
      console.warn("Lỗi gọi loadContractConfig:", e);
    }
  }

  // Đảm bảo CHARITY_CONTRACT_ADDRESS luôn có giá trị hợp lệ
  if (typeof CHARITY_CONTRACT_ADDRESS === "undefined" || !CHARITY_CONTRACT_ADDRESS) {
    CHARITY_CONTRACT_ADDRESS = "0x83ae429B03C449dF9b255A917D65204Ee6be9CF6";
  }
  return CHARITY_CONTRACT_ADDRESS;
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
 * 7. Trình phân tích lỗi Smart Contract & Web3 thân thiện (Tiếng Việt)
 */
function parseContractError(err) {
  if (!err) return "Đã xảy ra lỗi không xác định.";

  // 1. Người dùng bấm Hủy (Reject) trên MetaMask
  if (
    err.code === 4001 ||
    err.code === "ACTION_REJECTED" ||
    (err.message && err.message.toLowerCase().includes("user rejected"))
  ) {
    return "Bạn đã từ chối ký xác nhận giao dịch trên ví MetaMask.";
  }

  // 2. Không đủ tiền (Insufficient funds)
  if (
    err.code === "INSUFFICIENT_FUNDS" ||
    (err.message && err.message.toLowerCase().includes("insufficient funds"))
  ) {
    return "Số dư ví SepoliaETH của bạn không đủ để thanh toán số tiền và phí gas giao dịch.";
  }

  // 3. Revert reason rõ ràng từ Smart Contract (ví dụ 'Loi: ...')
  if (
    err.reason &&
    err.reason !== "require(false)" &&
    !err.reason.includes("execution reverted") &&
    !err.reason.includes("missing revert data")
  ) {
    return err.reason;
  }

  // 4. Bóc tách lỗi từ err.data nếu có Interface
  if (err.data && typeof err.data === "string" && err.data.length > 10 && typeof CHARITY_CONTRACT_ABI !== "undefined") {
    try {
      const iface = new ethers.Interface(CHARITY_CONTRACT_ABI);
      const parsedErr = iface.parseError(err.data);
      if (parsedErr) return `Lỗi Smart Contract: ${parsedErr.name}`;
    } catch (_) {}
  }

  // 5. Trường hợp EVM revert rỗng sinh ra lỗi require(false) / CALL_EXCEPTION
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
      "1. Smart Contract tại địa chỉ Sepolia hiện tại chưa được cập nhật phiên bản mới (Dynamic Stake + Lưu băm ảnh SHA-256). Hãy Deploy lại file contracts/CharityDonation.sol trên Remix và cập nhật CONTRACT_ADDRESS vào server/.env.\n" +
      "2. Số dư ví không đủ 0.05 ETH để đặt cọc ký quỹ chiến dịch.\n" +
      "3. Không đúng quyền quản trị hoặc điều kiện kiểm tra của hợp đồng."
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
    error:   '<i class="fa-solid fa-circle-xmark" style="color: #ef4444;"></i>',
    warning: '<i class="fa-solid fa-triangle-exclamation" style="color: #f59e0b;"></i>',
    info:    '<i class="fa-solid fa-circle-info" style="color: #3b82f6;"></i>'
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
