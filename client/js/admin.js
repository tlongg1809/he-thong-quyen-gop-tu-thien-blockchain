// client/js/admin.js
let provider = null;
let signer = null;
let votingContract = null;
let currentAccount = null;

const btnConnect = document.getElementById("btnConnect");
const walletAddress = document.getElementById("walletAddress");
const btnToggleVoting = document.getElementById("btnToggleVoting");
const formAddCandidate = document.getElementById("formAddCandidate");
const formAddWhitelist = document.getElementById("formAddWhitelist");

async function init() {
    if (window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_accounts", []);
        if (accounts.length > 0) {
            await handleAdminLogin(accounts[0]);
        }
    }
}

async function handleAdminLogin(account) {
    currentAccount = account;
    signer = await provider.getSigner();
    votingContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    walletAddress.innerText = "Admin: " + account.substring(0, 6) + "..." + account.substring(38);
    walletAddress.style.display = "inline-block";
    btnConnect.style.display = "none";

    // Kiểm tra quyền Admin
    const adminAddr = await votingContract.admin();
    if (adminAddr.toLowerCase() !== account.toLowerCase()) {
        alert("Cảnh báo: Ví của bạn không phải là Admin của Smart Contract!");
    }
}

// 1. Thêm ứng viên mới
formAddCandidate?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!votingContract) return alert("Vui lòng kết nối ví trước!");

    const name = document.getElementById("candidateName").value.trim();
    const desc = document.getElementById("candidateDesc").value.trim();

    try {
        const tx = await votingContract.addCandidate(name, desc);
        alert("Đang gửi giao dịch lên mạng, mã Tx: " + tx.hash);
        await tx.wait();
        alert("Thêm ứng viên thành công!");
        formAddCandidate.reset();
    } catch (err) {
        alert("Lỗi: " + (err.reason || err.message));
    }
});

// 2. Nạp mảng danh sách Whitelist
formAddWhitelist?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!votingContract) return alert("Vui lòng kết nối ví trước!");

    const rawInput = document.getElementById("whitelistInput").value;
    // Tách các dòng và lọc các địa chỉ ví hợp lệ
    const addressList = rawInput
        .split("\n")
        .map(addr => addr.trim())
        .filter(addr => ethers.isAddress(addr));

    if (addressList.length === 0) {
        return alert("Không có địa chỉ ví hợp lệ nào!");
    }

    try {
        const tx = await votingContract.addWhitelistBatch(addressList);
        alert(`Đang nạp ${addressList.length} ví vào Whitelist. Tx: ${tx.hash}`);
        await tx.wait();
        alert("Cấp quyền Whitelist thành công!");
        formAddWhitelist.reset();
    } catch (err) {
        alert("Lỗi: " + (err.reason || err.message));
    }
});

// 3. Đóng/mở phiên biểu quyết
btnToggleVoting?.addEventListener("click", async () => {
    if (!votingContract) return;
    try {
        const currentStatus = await votingContract.votingOpen();
        const tx = await votingContract.toggleVoting(!currentStatus);
        await tx.wait();
        alert(currentStatus ? "Đã đóng cuộc bình chọn!" : "Đã mở lại cuộc bình chọn!");
        btnToggleVoting.innerText = currentStatus ? "Mở Lại Cuộc Bình Chọn" : "Đóng Cuộc Bình Chọn";
        btnToggleVoting.className = currentStatus ? "btn btn-primary" : "btn btn-danger";
    } catch (err) {
        alert("Lỗi: " + (err.reason || err.message));
    }
});

btnConnect?.addEventListener("click", async () => {
    if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        await handleAdminLogin(accounts[0]);
    }
});

init();