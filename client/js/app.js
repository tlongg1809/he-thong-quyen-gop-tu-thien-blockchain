// client/js/app.js
let provider = null;
let signer = null;
let votingContract = null;
let currentAccount = null;

const btnConnect = document.getElementById("btnConnect");
const walletAddress = document.getElementById("walletAddress");
const electionTitle = document.getElementById("electionTitle");
const electionStatusBadge = document.getElementById("electionStatusBadge");
const endTimeText = document.getElementById("endTimeText");
const whitelistStatusText = document.getElementById("whitelistStatusText");
const candidatesContainer = document.getElementById("candidatesContainer");
const txReceiptCard = document.getElementById("txReceiptCard");
const txHashDisplay = document.getElementById("txHashDisplay");

async function init() {
    if (window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum);
        
        // Kiểm tra xem đã kết nối ví trước đó chưa
        const accounts = await provider.send("eth_accounts", []);
        if (accounts.length > 0) {
            await handleAccountChanged(accounts[0]);
        }

        // Lắng nghe sự kiện chuyển tài khoản
        window.ethereum.on("accountsChanged", (accs) => {
            if (accs.length > 0) handleAccountChanged(accs[0]);
            else location.reload();
        });
    }
}

async function handleAccountChanged(account) {
    currentAccount = account;
    signer = await provider.getSigner();
    votingContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    walletAddress.innerText = account.substring(0, 6) + "..." + account.substring(38);
    walletAddress.style.display = "inline-block";
    btnConnect.style.display = "none";

    await loadElectionData();
}

async function loadElectionData() {
    if (!votingContract || CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
        electionTitle.innerText = "Chưa kết nối Smart Contract (Vui lòng điền CONTRACT_ADDRESS)";
        return;
    }

    try {
        // 1. Đọc thông tin phiên biểu quyết
        const title = await votingContract.electionTitle();
        const isOpen = await votingContract.votingOpen();
        const endTime = await votingContract.votingEndTime();
        const isWhitelisted = await votingContract.isWhitelisted(currentAccount);
        const hasVoted = await votingContract.hasVoted(currentAccount);

        electionTitle.innerText = title;
        electionStatusBadge.innerText = isOpen ? "Đang diễn ra" : "Đã đóng";
        electionStatusBadge.className = "badge-status " + (isOpen ? "badge-open" : "badge-closed");

        const date = new Date(Number(endTime) * 1000);
        endTimeText.innerText = date.toLocaleString();

        if (hasVoted) {
            whitelistStatusText.innerText = "Đã bỏ phiếu ✅";
            whitelistStatusText.style.color = "var(--primary)";
        } else if (isWhitelisted) {
            whitelistStatusText.innerText = "Hợp lệ (Được quyền vote)";
            whitelistStatusText.style.color = "var(--success)";
        } else {
            whitelistStatusText.innerText = "Không thuộc Whitelist ❌";
            whitelistStatusText.style.color = "var(--danger)";
        }

        // 2. Tải danh sách ứng viên
        const candidates = await votingContract.getAllCandidates();
        renderCandidates(candidates, isOpen, isWhitelisted, hasVoted);
    } catch (err) {
        console.error("Lỗi tải dữ liệu bầu chọn:", err);
    }
}

function renderCandidates(candidates, isOpen, isWhitelisted, hasVoted) {
    candidatesContainer.innerHTML = "";
    if (candidates.length === 0) {
        candidatesContainer.innerHTML = "<p>Chưa có ứng viên nào được tạo.</p>";
        return;
    }

    candidates.forEach((c) => {
        const canVote = isOpen && isWhitelisted && !hasVoted;
        const card = document.createElement("div");
        card.className = "candidate-card";
        card.innerHTML = `
            <div>
                <h3 style="margin-bottom: 8px;">#${c.id} - ${c.name}</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 16px;">
                    ${c.description}
                </p>
            </div>
            <div>
                <div style="font-weight: 700; font-size: 1.2rem; color: var(--primary); margin-bottom: 12px;">
                    ${c.voteCount.toString()} phiếu
                </div>
                <button class="btn btn-primary" style="width: 100%;" 
                    ${!canVote ? "disabled" : ""} 
                    onclick="castVote(${c.id})">
                    ${hasVoted ? "Đã Bỏ Phiếu" : "Bỏ Phiếu"}
                </button>
            </div>
        `;
        candidatesContainer.appendChild(card);
    });
}

// 3. Hàm ký và gửi giao dịch bỏ phiếu
window.castVote = async function(candidateId) {
    if (!votingContract) return;
    try {
        const tx = await votingContract.vote(candidateId);
        txReceiptCard.style.display = "block";
        txHashDisplay.innerText = "Đang xác thực giao dịch: " + tx.hash;

        await tx.wait(); // Chờ block được xác nhận trên mạng
        txHashDisplay.innerText = tx.hash;
        alert("Bỏ phiếu thành công!");
        await loadElectionData();
    } catch (err) {
        alert("Giao dịch thất bại: " + (err.reason || err.message));
    }
};

btnConnect?.addEventListener("click", async () => {
    if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        await handleAccountChanged(accounts[0]);
    } else {
        alert("Vui lòng cài đặt MetaMask!");
    }
});

init();