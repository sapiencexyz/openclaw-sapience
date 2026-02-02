#!/usr/bin/env node

const WebSocket = require('ws');
const { ethers } = require('ethers');
const fs = require('fs');
const yaml = require('js-yaml');

const WS_URL = 'wss://api.sapience.xyz/auction';
const CHAIN_ID = 5064014;
const PREDICTION_MARKET = '0xAcD757322df2A1A0B3283c851380f3cFd4882cB4';

const privateKey = process.env.SAPIENCE_PRIVATE_KEY;
const configPath = process.env.CONFIG_PATH || '~/.sapience/mm-config.yaml';

if (!privateKey) {
  console.error('SAPIENCE_PRIVATE_KEY required');
  process.exit(1);
}

const wallet = new ethers.Wallet(privateKey);
let config = loadConfig();
let ws = null;
let reconnectTimeout = null;

function loadConfig() {
  const path = configPath.replace('~', process.env.HOME);
  if (!fs.existsSync(path)) {
    console.log('Config not found, using defaults');
    return {
      min_edge_pct: 0.02,
      max_edge_pct: 0.35,
      kelly_fraction: 0.25,
      min_wager_usde: 10,
      max_wager_usde: 1000,
      whitelisted_takers: [],
      single_leg_enabled: false,
      blocked_markets: [],
      bid_expiry_seconds: 60,
      reconnect_delay_ms: 5000
    };
  }
  return yaml.load(fs.readFileSync(path, 'utf8'));
}

process.on('SIGHUP', () => {
  console.log('SIGHUP received, reloading config');
  config = loadConfig();
});

async function buildSiweMessage() {
  return {
    domain: 'sapience.xyz',
    address: wallet.address,
    statement: 'Sign in to Sapience',
    uri: 'https://sapience.xyz',
    version: '1',
    chainId: CHAIN_ID,
    nonce: crypto.randomUUID(),
    issuedAt: new Date().toISOString()
  };
}

function formatSiweMessage(msg) {
  return `${msg.domain} wants you to sign in with your Ethereum account:\n${msg.address}\n\n${msg.statement}\n\nURI: ${msg.uri}\nVersion: ${msg.version}\nChain ID: ${msg.chainId}\nNonce: ${msg.nonce}\nIssued At: ${msg.issuedAt}`;
}

async function signBid(auction, makerWager, deadline) {
  const domain = {
    name: 'SignatureProcessor',
    version: '1',
    chainId: CHAIN_ID,
    verifyingContract: PREDICTION_MARKET
  };

  const types = {
    Approve: [
      { name: 'messageHash', type: 'bytes32' },
      { name: 'owner', type: 'address' }
    ]
  };

  const innerData = ethers.AbiCoder.defaultAbiCoder().encode(
    ['bytes', 'uint256', 'uint256', 'address', 'address', 'uint256', 'uint256'],
    [
      auction.predictedOutcomes[0],
      makerWager,
      auction.wager,
      auction.resolver,
      auction.taker,
      deadline,
      auction.takerNonce
    ]
  );

  const messageHash = ethers.keccak256(innerData);
  const message = { messageHash, owner: wallet.address };

  return wallet.signTypedData(domain, types, message);
}

// IMPLEMENT YOUR PRICING LOGIC HERE
function calculateQuote(auction) {
  const wager = BigInt(auction.wager);
  const wagerUsde = Number(wager) / 1e6;

  if (wagerUsde < config.min_wager_usde) return null;
  if (wagerUsde > config.max_wager_usde) return null;

  // Placeholder: match wager 1:1
  // Replace with actual edge calculation based on Polymarket prices
  return auction.wager;
}

async function handleAuction(auction) {
  console.log(`Auction ${auction.auctionId}: ${auction.wager} from ${auction.taker}`);

  const quote = calculateQuote(auction);
  if (!quote) {
    console.log(`  Skipping (filtered)`);
    return;
  }

  const deadline = Math.floor(Date.now() / 1000) + config.bid_expiry_seconds;
  const signature = await signBid(auction, quote, deadline);

  ws.send(JSON.stringify({
    type: 'bid.submit',
    payload: {
      auctionId: auction.auctionId,
      maker: wallet.address,
      makerWager: quote,
      makerDeadline: deadline,
      makerSignature: signature,
      taker: auction.taker,
      takerCollateral: auction.wager,
      resolver: auction.resolver,
      encodedPredictedOutcomes: auction.predictedOutcomes[0],
      takerNonce: auction.takerNonce
    }
  }));

  console.log(`  Bid submitted: ${quote}`);
}

async function connect() {
  console.log('Connecting to', WS_URL);
  ws = new WebSocket(WS_URL);

  ws.on('open', async () => {
    console.log('Connected');

    const siwe = await buildSiweMessage();
    const sig = await wallet.signMessage(formatSiweMessage(siwe));

    ws.send(JSON.stringify({
      type: 'auth',
      payload: { siweMessage: siwe, signature: sig }
    }));
  });

  ws.on('message', async (data) => {
    const msg = JSON.parse(data.toString());

    switch (msg.type) {
      case 'auth.ack':
        console.log('Authenticated as', wallet.address);
        break;

      case 'auction.started':
        await handleAuction(msg.payload);
        break;

      case 'bid.ack':
        if (msg.payload.ok) {
          console.log('Bid accepted');
        } else {
          console.log('Bid rejected:', msg.payload.error);
        }
        break;

      default:
        console.log('Message:', msg.type);
    }
  });

  ws.on('close', (code) => {
    console.log('Disconnected:', code);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('WS error:', err.message);
  });
}

function scheduleReconnect() {
  if (reconnectTimeout) return;
  console.log(`Reconnecting in ${config.reconnect_delay_ms}ms`);
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connect();
  }, config.reconnect_delay_ms);
}

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down');
  if (ws) ws.close();
  process.exit(0);
});

connect();
