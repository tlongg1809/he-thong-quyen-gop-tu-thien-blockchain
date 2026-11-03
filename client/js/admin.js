// client/js/admin.js
console.log("Admin script loaded.");
const btnConnect = document.getElementById("btnConnect");
const walletAddress = document.getElementById("walletAddress");

btnConnect?.addEventListener("click", async () => {
    if (window.ethereum) {
        try {
            const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
            walletAddress.innerText = "Admin: " + accounts[0].substring(0, 6) + "..." + accounts[0].substring(38);
            walletAddress.style.display = "inline-block";
            btnConnect.style.display = "none";
        } catch (err) {
            alert("Lỗi kết nối ví: " + err.message);
        }
    } else {
        alert("Vui lòng cài đặt MetaMask!");
    }
});