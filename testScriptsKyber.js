// These scripts manually check Arb contract with Kyber <-> UniSwap functions.
// Set ISMAINNET variable to either connect to Rinkeby or Mainnet.
// Useful Kyber info:
// https://developer.kyber.network/docs/Integrations-Web3Guide/
// https://medium.com/quiknode/building-with-kyber-network-be596863772d
const fs = require('fs');
let Web3 = require("web3");
const BigNumber = require('bignumber.js');
const Tx = require("ethereumjs-tx").Transaction;
let KyberUniArbContract = JSON.parse(fs.readFileSync("client/src/contracts/KyberUniArbContract.json"));
let ERC20Token = JSON.parse(fs.readFileSync("client/src/contracts/ERC20Token.json"));
const UniSwap = require('@uniswap/sdk');
const abis = JSON.parse(fs.readFileSync("./ABIs.json"));                                                  // Various Uniswap/Kyber ABI details.

require('dotenv').config();

// Set true for Mainnet, false for Rinkeby
var ISMAINNET = false;
// Set true for transactions to be sent to network.
var ISLIVE = true;

// User trade account
const SOURCE_ACCOUNT = '0xeE398666cA860DFb7390b5D73EE927e9Fb41a60A';
// Token Details - Assuming initial trade token is Eth
const SRC_TOKEN = "ETH";
const SRC_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const SRC_DECIMALS = 18;
const DST_DECIMALS = 12;

let web3, DST_TOKEN, DST_TOKEN_ADDRESS, KYBER_NETWORK_PROXY_ADDRESS, chainIdOrProvider, UNISWAP_CONTRACT_ADDRESS;

// Mainnet trades done Eth - Dai. Rinkeby Eth - OMG (No DAI on Rinkeby Exhchange)
if(ISMAINNET){
    console.log('MAIN NET');
    if(ISLIVE){
      console.log('NOT DEPLOYED FULLY ON MAINNET YET');
      return;
    }

    web3 = new Web3(new Web3.providers.HttpProvider(process.env.INFURAMAIN));
    DST_TOKEN = "DAI";
    DST_TOKEN_ADDRESS = '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359'                    // DAI Mainnet
    KYBER_NETWORK_PROXY_ADDRESS = "0x818E6FECD516Ecc3849DAf6845e3EC868087B755";         // Mainnet
    ARB_CONTRACT_ADDRESS = '0xbaA1f8d938c064322C0D9c2DC68f0e516AE35678';                // !!!! NOT DEPLOYED ON MAIN NET YET SO JUST A HOLDER Deployed contract address
    chainIdOrProvider = 1;
    UNISWAP_CONTRACT_ADDRESS = '0xc0a47dFe034B400B47bDaD5FecDa2621de6c4d95';                      // Mainnet
}else{
    console.log('RINKEBY');
    web3 = new Web3(new Web3.providers.HttpProvider(process.env.INFURARINKEBY));
    DST_TOKEN = "OMG";
    DST_TOKEN_ADDRESS = '0x732fBA98dca813C3A630b53a8bFc1d6e87B1db65'                    // OMG Rinkeby
    KYBER_NETWORK_PROXY_ADDRESS = "0xF77eC7Ed5f5B9a5aee4cfa6FFCaC6A4C315BaC76";         // Rinkeby
    ARB_CONTRACT_ADDRESS = '0xA5c8F2d64942cB11317C18A184146D5a9BE37262';                // Deployed contract address
    chainIdOrProvider = 4;
    UNISWAP_CONTRACT_ADDRESS = '0xf5D915570BC477f9B8D6C0E980aA81757A3AaC36';                      // rinkeby
}

// Starting Qty of Eth to trade
var TRADE_QTY_ETH = 0.001;
const TRADE_QTY_WEI = web3.utils.toWei(TRADE_QTY_ETH.toString(), 'ether');

// Get the KyberNetworkContract instances
const KYBER_NETWORK_PROXY_CONTRACT = new web3.eth.Contract(abis.KYBER_NETWORK_PROXY_ABI, KYBER_NETWORK_PROXY_ADDRESS);

async function checkCompleteTrade(){

  const privateKey = Buffer.from(process.env.PRIVATEKEY, 'hex',);

  var accountBalance = await web3.eth.getBalance(SOURCE_ACCOUNT);
  console.log('Bot Account Balance: ' + web3.utils.fromWei(accountBalance, 'ether'));

  const arbContract = new web3.eth.Contract(KyberUniArbContract.abi, ARB_CONTRACT_ADDRESS);
  const uniswapContract = new web3.eth.Contract(abis.UNISWAP_ABI, UNISWAP_CONTRACT_ADDRESS);

  var contractBalance = await web3.eth.getBalance(ARB_CONTRACT_ADDRESS);
  console.log('Arb Contract Balance: ' + web3.utils.fromWei(contractBalance, 'ether'));

  let uniswapExchange = await uniswapContract.methods.getExchange(DST_TOKEN_ADDRESS).call();                          // Gets the Uniswap Exchange for particular token. Used for approval only.
  console.log("The Uniswap exchange address for " + DST_TOKEN + " token is:" + uniswapExchange);

  const tokenContract = new web3.eth.Contract(ERC20Token.abi, DST_TOKEN_ADDRESS);
  var allowance = await tokenContract.methods.allowance(ARB_CONTRACT_ADDRESS, uniswapExchange).call();
  //console.log('Allowance: ' + allowance.toString());

  // The UniSwap Exchange contract must be approved to transfer ERC20 trade token from the ArbContract
  if(allowance == '0'){
    console.log('Approving token...');
    // For now approve UniSwap exchange for total supply of token. Opinion differs on this but address is trusted for now.
    var totalSupply = await tokenContract.methods.totalSupply().call();
    console.log('Total supply: ' + web3.utils.fromWei(totalSupply, 'ether'));

    var tx = await arbContract.methods.approveToken(DST_TOKEN_ADDRESS, uniswapExchange, totalSupply);
    var encodedABI = tx.encodeABI();
    var txCount = await web3.eth.getTransactionCount(SOURCE_ACCOUNT);
    console.log('Tx Count: ' + txCount);

    var txData = {
      nonce: web3.utils.toHex(txCount),
      gasLimit: web3.utils.toHex(6000000),
      gasPrice: web3.utils.toHex(10000000000),    // Should look at optimising this.
      to: ARB_CONTRACT_ADDRESS,
      from: SOURCE_ACCOUNT,
      data: encodedABI
    }

    var transaction = new Tx(txData, {'chain':'rinkeby'});
    if(ISMAINNET){
      transaction = new Tx(txData, {'chain':'mainnet'});
    }
    transaction.sign(privateKey);
    console.log('Signed...')
    var serializedTx = transaction.serialize().toString('hex');
    if(ISLIVE){
      console.log('Sending...')
      var receipt = await web3.eth.sendSignedTransaction('0x' + serializedTx);
      console.log('Sent...');
      // console.log(receipt);
    }else{
      console.log('!!!! Transactions Not Sent As ISLIVE is false.');
    }

    allowance = await tokenContract.methods.allowance(ARB_CONTRACT_ADDRESS, uniswapExchange).call();
    console.log('Allowance: ' + allowance.toString());
  }
  console.log('Token Approved.');

  // Get UniSwap market info
  const tokenReserves = await UniSwap.getTokenReserves(DST_TOKEN_ADDRESS, chainIdOrProvider);
  // const marketDetails = UniSwap.getMarketDetails(undefined, tokenReserves) // ETH<>ERC20
  const marketDetails = UniSwap.getMarketDetails(tokenReserves, undefined); // ERC20<>ETH
  // console.log(marketDetails)
  // console.log(marketDetails.inputReserves.ethReserve.token)
  console.log('Uniswap Eth Reserve: ' + web3.utils.fromWei(web3.utils.toBN(marketDetails.inputReserves.ethReserve.amount), 'ether'))    // !! Could add a check here but probably not neccessary in live contract
  // console.log(marketDetails.inputReserves.tokenReserve.token)
  console.log('Uniswap Token Reserve: ' + web3.utils.fromWei(web3.utils.toBN(marketDetails.inputReserves.tokenReserve.amount), 'ether'))

  var uniswapRate = marketDetails.marketRate.rate;
  var uniswapRateInverted = marketDetails.marketRate.rateInverted;
  console.log('\nUniswap (' + DST_TOKEN + ' -> Eth): ' + marketDetails.marketRate.rate.toString() + ' (' + uniswapRateInverted.toString() + ')');

  var kyberRate = await KYBER_NETWORK_PROXY_CONTRACT.methods.getExpectedRate(SRC_TOKEN_ADDRESS, DST_TOKEN_ADDRESS, TRADE_QTY_WEI).call();
  var kyberRateEther = web3.utils.fromWei(kyberRate.expectedRate, 'ether');
  console.log('Kyber (Eth -> ' + DST_TOKEN + '): ' + kyberRateEther);

  // DECISION TO TRADE OR NOT IS MADE HERE IN BOT

  var tokenTradeQtyEth = TRADE_QTY_ETH * parseFloat(kyberRateEther);
  var tokenTradeQtyWei = web3.utils.toWei(tokenTradeQtyEth.toString(), 'ether');
  var tokenTradeQtyWeiBn = web3.utils.toBN(tokenTradeQtyWei);

  console.log('\nTrading - Kyber: ' + TRADE_QTY_ETH.toString() + 'Eth swapped for: ' + tokenTradeQtyEth + 'OMG');
  // console.log('Tokens To Swap Wei BN: ' + tokenTradeQtyWeiBn.toString())
  // console.log(web3.utils.fromWei(tokenTradeQtyWeiBn, 'ether'))

  const tradeDetails = await UniSwap.tradeExactTokensForEthWithData(tokenReserves, tokenTradeQtyWeiBn.toString());
  const executionDetails = await UniSwap.getExecutionDetails(tradeDetails);

  var maxTokensToSell = web3.utils.toWei(executionDetails.methodArguments[0].toString(), 'wei');    // Tokens that will be sold
  var ethToBuy = web3.utils.toWei(executionDetails.methodArguments[1].toString(), 'wei');                // Eth that will be bought
  var value = web3.utils.toWei(executionDetails.value.toString(), 'wei');                           // Eth value to send (should be 0)

  // console.log(executionDetails);
  console.log('Trading - Uniswap: Sell: ' + web3.utils.fromWei(maxTokensToSell, 'ether') + ' for Eth: ' + web3.utils.fromWei(ethToBuy, 'ether'))
  // console.log('Eth Value: ' + web3.utils.fromWei(eth, 'ether'))
  // console.log('Eth value to Send: ' + web3.utils.fromWei(value, 'ether'))

  var tx = await arbContract.methods.trade(
    KYBER_NETWORK_PROXY_ADDRESS,
    DST_TOKEN_ADDRESS,
    kyberRate.expectedRate,
    executionDetails.exchangeAddress,
    TRADE_QTY_WEI,
    maxTokensToSell,
    executionDetails.methodArguments[2],        // Sell deadline
    ethToBuy);

  var encodedABI = tx.encodeABI();
  var txCount = await web3.eth.getTransactionCount(SOURCE_ACCOUNT);
  console.log('Tx Count: ' + txCount);

  // construct the transaction data
  var txData = {
    nonce: web3.utils.toHex(txCount),
    gasLimit: web3.utils.toHex(6000000),
    gasPrice: web3.utils.toHex(10000000000),   // Should look at optimising this.
    to: ARB_CONTRACT_ADDRESS,
    from: SOURCE_ACCOUNT,
    data: encodedABI,
    value: web3.utils.toHex(TRADE_QTY_WEI)
  }

  var transaction = new Tx(txData, {'chain':'rinkeby'});
  if(ISMAINNET){
    transaction = new Tx(txData, {'chain':'mainnet'});
  }
  transaction.sign(privateKey);
  console.log('Signed...')
  var serializedTx = transaction.serialize().toString('hex');

  if(ISLIVE){
    console.log('Sending...')
    var receipt = await web3.eth.sendSignedTransaction('0x' + serializedTx);
    console.log('Sent...');
    // console.log(receipt);
  }else{
    console.log('!!!! Transactions Not Sent As ISLIVE is false.');
  }

  accountBalance = await web3.eth.getBalance(SOURCE_ACCOUNT);
  console.log(web3.utils.fromWei(accountBalance, 'ether'));

  contractBalance = await web3.eth.getBalance(ARB_CONTRACT_ADDRESS);
  console.log(web3.utils.fromWei(contractBalance, 'ether'));
}

checkCompleteTrade()
