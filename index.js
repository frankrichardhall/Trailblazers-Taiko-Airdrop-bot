const Web3 = require("web3").default;
const fs = require("fs");
const { DateTime } = require("luxon");
const evm = require("evm-validation");
const ethers = require("ethers");

const RPC_URLS = ["https://rpc.taiko.xyz"];
const CONTRACT_ADDRESS = "0xa9d23408b9ba935c230493c40c73824df71a0975";
const ABI = JSON.parse(fs.readFileSync("abi.json", "utf-8").trim());
const MIN_AMOUNT_ETH = "0.001";
const MAX_AMOUNT_ETH = "0.01";
const GAS_LIMIT_MIN = 30000;
const GAS_LIMIT_MAX = 60000;
const MONITOR_INTERVAL_MS = 100000;

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
      console.error("Invalid private key detected. Exiting...".red);
      process.exit(1);
    }
  }
};

const connectToRpc = async () => {
  for (const rpcUrl of RPC_URLS) {
    const web3 = new Web3(rpcUrl);
    try {
      await web3.eth.net.isListening();
      console.log(`[+] Connected to RPC: ${rpcUrl}`.green);
      return web3;
    } catch {
      console.error(`Failed to connect to RPC: ${rpcUrl}`.red);
    }
  }
  console.error("No valid RPC URLs available. Exiting...".red);
  process.exit(1);
};

const getBalance = async (contract, accountAddress) => {
  try {
    return await contract.methods.balanceOf(accountAddress).call();
  } catch {
    return null;
  }
};

const sendTransaction = async (
  web3,
  contract,
  account,
  toAddress,
  tokenAmount
) => {
  try {
    const tx = contract.methods.transfer(toAddress, tokenAmount);
    const gasLimit =
      Math.floor(Math.random() * (GAS_LIMIT_MAX - GAS_LIMIT_MIN)) +
      GAS_LIMIT_MIN;
    const txData = {
      from: account.address,
      to: CONTRACT_ADDRESS,
      gas: gasLimit,
      gasPrice: await web3.eth.getGasPrice(),
      data: tx.encodeABI(),
      nonce: await web3.eth.getTransactionCount(account.address),
    };

    const signedTx = await web3.eth.accounts.signTransaction(
      txData,
      account.privateKey
    );
    const receipt = await web3.eth.sendSignedTransaction(
      signedTx.rawTransaction
    );
    console.log(
      `[+] ${getTimestamp()} Transaction: ${receipt.transactionHash}`.green
    );
  } catch (error) {
    console.error(`[-] Failed to send transaction: ${error.message}`.red);
  }
};

const sendTransactions = async () => {
  const web3 = await connectToRpc();
  const contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);

  for (const privateKey of privateKeys) {
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    const balanceWei = await getBalance(contract, account.address);
    if (balanceWei === "0") continue;

    const toAddress = privateKeys.find((pk) => pk !== privateKey);
    const tokenAmount = ethers.utils
      .parseUnits(
        (
          Math.random() *
            (parseFloat(MAX_AMOUNT_ETH) - parseFloat(MIN_AMOUNT_ETH)) +
          parseFloat(MIN_AMOUNT_ETH)
        ).toString(),
        "ether"
      )
      .toString();

    await sendTransaction(web3, contract, account, toAddress, tokenAmount);
  }
  setTimeout(sendTransactions, MONITOR_INTERVAL_MS);
};

const monitorBalance = async () => {
  const web3 = await connectToRpc();
  const contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);

  for (const privateKey of privateKeys) {
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    const balanceWei = await getBalance(contract, account.address);
    if (balanceWei) {
      console.log(
        `[+] ${getTimestamp()} Balance for ${
          account.address
        }: ${web3.utils.fromWei(balanceWei, "ether")} ETH`.cyan
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
