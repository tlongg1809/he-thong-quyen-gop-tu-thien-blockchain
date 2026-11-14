// client/js/admin.js

let provider = null;
let signer = null;
let contract = null;
let currentAccount = null;

// DOM Elements
const btnConnect = document.getElementById("btnConnect");
const walletAddress = document.getElementById("walletAddress");

// Form 1: Tạo chiến dịch
const formCreateCampaign = document.getElementById("formCreateCampaign");
const campaignTitle = document.getElementById("campaignTitle");
const campaignDesc = document.getElementById("campaignDesc");
const campaignManager = document.getElementById("campaignManager");
const campaignTarget = document.getElementById("campaignTarget");
const campaignDays = document.getElementById("campaignDays");
const btnSubmitCampaign = document.getElementById("btnSubmitCampaign");

// Form 2: Yêu cầu giải ngân
const formRequestDisbursement = document.getElementById(
  "formRequestDisbursement",
);
const disburseCampaignId = document.getElementById("disburseCampaignId");
const disbursePurpose = document.getElementById("disbursePurpose");
const disburseAmount = document.getElementById("disburseAmount");
const disburseRecipient = document.getElementById("disburseRecipient");
const disburseProof = document.getElementById("disburseProof");
const btnSubmitDisburse = document.getElementById("btnSubmitDisburse");

// Form 3: Thực thi giải ngân
const formExecuteDisbursement = document.getElementById(
  "formExecuteDisbursement",
);
const execCampaignId = document.getElementById("execCampaignId");
const execRequestId = document.getElementById("execRequestId");
const btnSubmitExec = document.getElementById("btnSubmitExec");

/**
 * Khởi tạo ứng dụng & nạp cấu hình hợp đồng
 */
async function init() {
  if (typeof loadContractConfig === "function") {
    await loadContractConfig();
  }

  if (!CHARITY_CONTRACT_ADDRESS) {
    alert("Chưa cấu hình CHARITY_CONTRACT_ADDRESS hợp lệ trong file .env!");
    return;
  }

  if (window.ethereum) {
    provider = new ethers.BrowserProvider(window.ethereum);

    const accounts = await provider.send("eth_accounts", []);
    if (accounts.length > 0) {
      await handleAccountConnected(accounts[0]);
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
    alert(
      "Vui lòng cài đặt tiện ích mở rộng MetaMask để truy cập trang quản trị!",
    );
  }
}

/**
 * Xử lý khi ví đã được kết nối
 */
async function handleAccountConnected(account) {
  currentAccount = account;
  signer = await provider.getSigner();
  contract = new ethers.Contract(
    CHARITY_CONTRACT_ADDRESS,
    CHARITY_CONTRACT_ABI,
    signer,
  );

  if (walletAddress) {
    walletAddress.innerText = `${account.substring(0, 6)}...${account.substring(account.length - 4)}`;
    walletAddress.style.display = "inline-block";
  }
  if (btnConnect) {
    btnConnect.innerText = "Đã Kết Nối";
    btnConnect.classList.remove("btn-primary");
    btnConnect.style.background = "#e2e8f0";
    btnConnect.style.color = "#334155";
    btnConnect.disabled = true;
  }
}

/**
 * Sự kiện bấm nút Kết nối ví
 */
if (btnConnect) {
  btnConnect.addEventListener("click", async () => {
    if (!window.ethereum) {
      alert("MetaMask chưa được cài đặt!");
      return;
    }
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      if (accounts.length > 0) {
        await handleAccountConnected(accounts[0]);
      }
    } catch (err) {
      console.error("Lỗi kết nối ví:", err);
      alert("Không thể kết nối ví MetaMask: " + (err.message || err));
    }
  });
}

/**
 * Xử lý Form 1: Tạo Chiến Dịch Mới
 */
if (formCreateCampaign) {
  formCreateCampaign.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!contract || !signer) {
      alert("Vui lòng kết nối ví quản trị trước!");
      return;
    }

    const title = campaignTitle.value.trim();
    const desc = campaignDesc.value.trim();
    const manager = campaignManager.value.trim();
    const targetEth = campaignTarget.value;
    const durationDays = parseInt(campaignDays.value, 10);

    if (!ethers.isAddress(manager)) {
      alert("Địa chỉ ví Trưởng ban quản lý không hợp lệ!");
      return;
    }

    try {
      btnSubmitCampaign.disabled = true;
      btnSubmitCampaign.innerText = "Đang gửi giao dịch lên Blockchain...";

      const targetWei = ethers.parseEther(targetEth);
      const tx = await contract.createCampaign(
        title,
        desc,
        manager,
        targetWei,
        durationDays,
      );

      btnSubmitCampaign.innerText = "Đang chờ xác nhận khối...";
      await tx.wait();

      alert(`✅ Tạo chiến dịch thành công!\nTxHash: ${tx.hash}`);
      formCreateCampaign.reset();
    } catch (err) {
      console.error("Lỗi tạo chiến dịch:", err);
      alert("Tạo chiến dịch thất bại: " + (err.reason || err.message));
    } finally {
      btnSubmitCampaign.disabled = false;
      btnSubmitCampaign.innerText = "Tạo Chiến Dịch Lên Blockchain";
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
      alert("Vui lòng kết nối ví trước!");
      return;
    }

    const campaignId = parseInt(disburseCampaignId.value, 10);
    const purpose = disbursePurpose.value.trim();
    const amountEth = disburseAmount.value;
    const recipient = disburseRecipient.value.trim();
    const proofHash = disburseProof.value.trim();

    if (!ethers.isAddress(recipient)) {
      alert("Địa chỉ ví đơn vị thụ hưởng không hợp lệ!");
      return;
    }

    try {
      btnSubmitDisburse.disabled = true;
      btnSubmitDisburse.innerText = "Đang gửi đề xuất...";

      const amountWei = ethers.parseEther(amountEth);
      const tx = await contract.requestDisbursement(
        campaignId,
        purpose,
        amountWei,
        recipient,
        proofHash,
      );

      btnSubmitDisburse.innerText = "Đang chờ xác nhận khối...";
      await tx.wait();

      alert(`✅ Gửi đề xuất giải ngân thành công!\nTxHash: ${tx.hash}`);
      formRequestDisbursement.reset();
    } catch (err) {
      console.error("Lỗi đề xuất giải ngân:", err);
      alert("Yêu cầu giải ngân thất bại: " + (err.reason || err.message));
    } finally {
      btnSubmitDisburse.disabled = false;
      btnSubmitDisburse.innerText = "Gửi Yêu Cầu Giải Ngân";
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
      alert("Vui lòng kết nối ví trước!");
      return;
    }

    const campaignId = parseInt(execCampaignId.value, 10);
    const requestId = parseInt(execRequestId.value, 10);

    try {
      btnSubmitExec.disabled = true;
      btnSubmitExec.innerText = "Đang thực thi chuyển quỹ...";

      const tx = await contract.executeDisbursement(campaignId, requestId);

      btnSubmitExec.innerText = "Đang chờ xác nhận trên mạng...";
      await tx.wait();

      alert(
        `✅ Giải ngân thành công! Tiền đã được chuyển tới ví thụ hưởng.\nTxHash: ${tx.hash}`,
      );
      formExecuteDisbursement.reset();
    } catch (err) {
      console.error("Lỗi thực thi giải ngân:", err);
      alert("Thực thi giải ngân thất bại: " + (err.reason || err.message));
    } finally {
      btnSubmitExec.disabled = false;
      btnSubmitExec.innerText = "Thực Thi Chuyển Tiền";
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
