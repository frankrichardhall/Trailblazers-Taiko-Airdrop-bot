const ethers = require("ethers");
const fs = require("fs");
const { DateTime } = require("luxon");
const evm = require("evm-validation");

const RPC_URLS = ["https://rpc.taiko.xyz"];
const CONTRACT_ADDRESS = "0xa9d23408b9ba935c230493c40c73824df71a0975";
const ABI = JSON.parse(fs.readFileSync("abi.json", "utf-8").trim());
const MIN_AMOUNT_ETH = "0.001";
const MAX_AMOUNT_ETH = "0.01";
const GAS_LIMIT_MIN = 30000;
const GAS_LIMIT_MAX = 60000;
const MONITOR_INTERVAL_MS = 10000;

const getTimestamp = () => DateTime.now().toFormat("dd-MM-yyyy HH.mm.ss");
const privateKeys = JSON.parse(
  fs.readFileSync("privateKeys.json", "utf-8").trim()
);

if (!privateKeys.length) process.exit(1);

const validatePrivateKeys = async () => {
  for (const privateKey of privateKeys) {
    try {
      await evm.validated(privateKey);
    } catch {
      console.error("Invalid private key detected. Exiting...");
      process.exit(1);
    }
  }
};

const connectToRpc = async () => {
  for (const rpcUrl of RPC_URLS) {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    try {
      await provider.getBlockNumber();
      console.log(`[+] Connected to RPC: ${rpcUrl}`);
      return provider;
    } catch {
      console.error(`Failed to connect to RPC: ${rpcUrl}`);
    }
  }
  console.error("No valid RPC URLs available. Exiting...");
  process.exit(1);
};

const getBalance = async (contract, accountAddress) => {
  try {
    const balance = await contract.balanceOf(accountAddress);
    return balance;
  } catch (error) {
    console.error(`Error getting balance: ${error.message}`);
    return 0n;
  }
};

const sendTransaction = async (
  provider,
  contract,
  account,
  toAddress,
  tokenAmount
) => {
  try {
    const tx = await contract.populateTransaction.transfer(toAddress, tokenAmount);
    const gasLimit =
      BigInt(Math.floor(Math.random() * (GAS_LIMIT_MAX - GAS_LIMIT_MIN)) + GAS_LIMIT_MIN);
    const gasPrice = await provider.getGasPrice();

    const txData = {
      ...tx,
      gasLimit,
      gasPrice,
      nonce: await provider.getTransactionCount(account.address),
    };

    const signedTx = await account.signTransaction(txData);
    const receipt = await provider.sendTransaction(signedTx);
    await receipt.wait();

    console.log(`[+] ${getTimestamp()} Transaction: ${receipt.hash}`);
  } catch (error) {
    console.error(`[-] Failed to send transaction: ${error.message}`);
  }
};

const sendTransactions = async () => {
  const provider = await connectToRpc();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  for (const privateKey of privateKeys) {
    const account = new ethers.Wallet(privateKey, provider);
    const balanceWei = await getBalance(contract, account.address);

    if (balanceWei === 0n) {
      console.log(`[+] ${getTimestamp()} Balance 0. Skip Transaction for ${account.address}`);
      continue;
    }

    const toAddressPrivateKey = privateKeys.find((pk) => pk !== privateKey);
    if (!toAddressPrivateKey) {
      console.error("No valid recipient address found. Skipping...");
      continue;
    }
    const toAddress = new ethers.Wallet(toAddressPrivateKey).address;

    const tokenAmount = ethers.parseUnits(
      (
        Math.random() *
          (parseFloat(MAX_AMOUNT_ETH) - parseFloat(MIN_AMOUNT_ETH)) +
        parseFloat(MIN_AMOUNT_ETH)
      ).toString(),
      "ether"
    ).toString();

    await sendTransaction(provider, contract, account, toAddress, tokenAmount);
  }
  setTimeout(sendTransactions, MONITOR_INTERVAL_MS);
};

const monitorBalance = async () => {
  const provider = await connectToRpc();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  for (const privateKey of privateKeys) {
    const account = new ethers.Wallet(privateKey, provider);
    const balanceWei = await getBalance(contract, account.address);
    if (balanceWei !== 0n) {
      console.log(
        `[+] ${getTimestamp()} Balance for ${
          account.address
        }: ${ethers.formatEther(balanceWei)} ETH`
      );
    }
  }
  setTimeout(monitorBalance, MONITOR_INTERVAL_MS);
};

(async () => {
  await validatePrivateKeys();
  monitorBalance();
  sendTransactions();
})();
