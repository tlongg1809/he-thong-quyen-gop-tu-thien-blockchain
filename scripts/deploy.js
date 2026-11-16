const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { ethers } = require('ethers');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

async function main() {
    console.log("=== BẮT ĐẦU BIÊN DỊCH VÀ TRIỂN KHAI SMART CONTRACT ===");

    // 1. Đọc và biên dịch hợp đồng
    const contractPath = path.join(__dirname, '../contracts/CharityDonation.sol');
    const source = fs.readFileSync(contractPath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: {
            'CharityDonation.sol': {
                content: source,
            },
        },
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
            outputSelection: {
                '*': {
                    '*': ['abi', 'evm.bytecode'],
                },
            },
        },
    };

    console.log("Đang biên dịch CharityDonation.sol...");
    const output = JSON.parse(solc.compile(JSON.stringify(input)));

    if (output.errors) {
        let hasError = false;
        output.errors.forEach((err) => {
            if (err.severity === 'error') {
                console.error("Lỗi biên dịch:", err.formattedMessage);
                hasError = true;
            } else {
                console.warn("Cảnh báo:", err.formattedMessage);
            }
        });
        if (hasError) process.exit(1);
    }

    const compiledContract = output.contracts['CharityDonation.sol']['CharityDonation'];
    const abi = compiledContract.abi;
    const bytecode = compiledContract.evm.bytecode.object;
    console.log("Biên dịch thành công! Kích thước bytecode:", bytecode.length / 2, "bytes");

    // Lưu ABI mới vào file contracts/CharityDonationABI.json
    fs.writeFileSync(
        path.join(__dirname, '../contracts/CharityDonationABI.json'),
        JSON.stringify(abi, null, 2)
    );

    // 2. Kết nối mạng Sepolia
    const rpcUrl = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
    const privateKey = process.env.PRIVATE_KEY;

    if (!privateKey) {
        throw new Error("Không tìm thấy PRIVATE_KEY trong server/.env");
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const balance = await provider.getBalance(wallet.address);

    console.log("Ví deployer:", wallet.address);
    console.log("Số dư ví:", ethers.formatEther(balance), "SepoliaETH");

    if (balance === 0n) {
        throw new Error("Ví deployer không có SepoliaETH để trả phí gas!");
    }

    // 3. Triển khai hợp đồng
    console.log("Đang gửi giao dịch triển khai lên mạng Sepolia...");
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    const contract = await factory.deploy();

    console.log("Đang chờ xác nhận block trên Sepolia... Hash:", contract.deploymentTransaction().hash);
    await contract.waitForDeployment();

    const deployedAddress = await contract.getAddress();
    console.log("\n>>> TRIỂN KHAI THÀNH CÔNG! <<<");
    console.log("Địa chỉ Smart Contract mới:", deployedAddress);

    // 4. Tạo ngay một chiến dịch mẫu đầu tiên để DApp có dữ liệu hiển thị
    console.log("\nĐang khởi tạo chiến dịch mẫu số 1 trên Blockchain...");
    try {
        const tx = await contract.createCampaign(
            "Cứu Trợ Đồng Bào Lũ Lụt Miền Trung",
            "Chung tay quyên góp hỗ trợ nhu yếu phẩm, áo phao và sửa chữa nhà cửa cho bà con vùng lũ lụt.",
            wallet.address,
            ethers.parseEther("1.0"), // Mục tiêu 1 ETH
            30 // 30 ngày
        );
        console.log("Giao dịch tạo chiến dịch đang chờ xác nhận:", tx.hash);
        await tx.wait();
        console.log("Khởi tạo chiến dịch mẫu thành công!");
    } catch (e) {
        console.warn("Không thể tạo chiến dịch mẫu tự động:", e.message);
    }

    // 5. Cập nhật địa chỉ vào file server/.env
    const envPath = path.join(__dirname, '../server/.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    if (/^CONTRACT_ADDRESS=/m.test(envContent)) {
        envContent = envContent.replace(/^CONTRACT_ADDRESS=.*/m, `CONTRACT_ADDRESS=${deployedAddress}`);
    } else {
        envContent += `\nCONTRACT_ADDRESS=${deployedAddress}`;
    }
    fs.writeFileSync(envPath, envContent);
    console.log("Đã cập nhật CONTRACT_ADDRESS trong server/.env!");

    // 6. Cập nhật client/js/config.js và client/js/audit.js
    const configJsPath = path.join(__dirname, '../client/js/config.js');
    let configJs = fs.readFileSync(configJsPath, 'utf8');
    configJs = configJs.replace(/let CHARITY_CONTRACT_ADDRESS = "0x[a-fA-F0-9]{40}";/, `let CHARITY_CONTRACT_ADDRESS = "${deployedAddress}";`);
    fs.writeFileSync(configJsPath, configJs);

    const auditJsPath = path.join(__dirname, '../client/js/audit.js');
    let auditJs = fs.readFileSync(auditJsPath, 'utf8');
    auditJs = auditJs.replace(/"0x[a-fA-F0-9]{40}"/, `"${deployedAddress}"`);
    fs.writeFileSync(auditJsPath, auditJs);

    console.log("Đã cập nhật địa chỉ hợp đồng vào toàn bộ frontend!");
}

main().catch((err) => {
    console.error("Lỗi:", err);
    process.exit(1);
});
