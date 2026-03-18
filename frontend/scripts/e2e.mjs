// End-to-end smoke test: runs a whole election against a local Anvil node and the running Next.js app.
//
//   1. anvil --chain-id 1337
//   2. deploy a FRESH contract (see the README), put its address in frontend/.env.local, then npm run dev
//   3. NEXT_PUBLIC_CONTRACT_ADDRESS=0x... SLIP_SIGNER_ADDRESS must match the app's SLIP_SIGNER_PRIVATE_KEY
//      node scripts/e2e.mjs            (set APP_URL if the app is not on http://localhost:3000)
//
// The private keys below are Anvil's public development keys. They only work on a local test chain.
import { createPublicClient, createWalletClient, defineChain, encodePacked, http, keccak256, parseAbi, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
if (!CONTRACT) {
  console.error('Set NEXT_PUBLIC_CONTRACT_ADDRESS to the address of a freshly deployed contract.');
  process.exit(1);
}

const KEYS = {
  admin: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // Anvil #0
  alice: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // Anvil #2
  bob: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', // Anvil #3
  carol: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a', // Anvil #4
  mallory: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba', // Anvil #5
};

const abi = parseAbi([
  'function state() view returns (uint8)',
  'function totalRevealed() view returns (uint256)',
  'function candidates(uint256) view returns (uint256 id, string name, string party, uint256 constituencyId, bool isMP, uint256 voteCount)',
  'function setElectionState(uint8 newState)',
  'function addCandidate(string name, string party, uint256 constituencyId, bool isMP)',
  'function commitVote(bytes32 commitment, uint256 constituency, bytes32 nullifier, uint256 deadline, bytes slipSignature)',
  'function revealVote(uint256 mpId, uint256 mlaId, uint256 constituency, bytes32 salt)',
]);

const chain = defineChain({ id: 1337, name: 'Anvil', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } });
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
const wallets = Object.fromEntries(Object.entries(KEYS).map(([name, key]) => {
  const account = privateKeyToAccount(key);
  return [name, createWalletClient({ account, chain, transport: http(RPC_URL) })];
}));

let checks = 0;
function check(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks++;
  console.log(`  ok  ${message}`);
}

async function send(who, functionName, args) {
  const hash = await wallets[who].writeContract({ address: CONTRACT, abi, functionName, args });
  await publicClient.waitForTransactionReceipt({ hash });
}

// The call must revert, and the revert reason must contain `reason`.
async function expectRevert(who, functionName, args, reason) {
  try {
    await send(who, functionName, args);
  } catch (err) {
    check(String(err.message).includes(reason), `${functionName} by ${who} reverts with "${reason}"`);
    return;
  }
  throw new Error(`FAILED: ${functionName} by ${who} should have reverted with "${reason}"`);
}

async function askGovernmentNode(who, voterId, pin) {
  const res = await fetch(`${APP_URL}/api/auth-voter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voterId, pin, walletAddress: wallets[who].account.address }),
  });
  return { status: res.status, body: await res.json() };
}

// Gets a slip from the government node and seals a vote. Returns what is needed to reveal it later.
async function castVote(who, voterId, pin, mpId, mlaId) {
  const { body } = await askGovernmentNode(who, voterId, pin);
  const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const commitment = keccak256(encodePacked(
    ['uint256', 'uint256', 'uint256', 'address', 'bytes32'],
    [BigInt(mpId), BigInt(mlaId), BigInt(body.constituencyId), wallets[who].account.address, salt],
  ));
  await send(who, 'commitVote', [commitment, BigInt(body.constituencyId), body.nullifier, BigInt(body.deadline), body.signature]);
  return { who, mpId, mlaId, constituencyId: body.constituencyId, salt };
}

const reveal = v => send(v.who, 'revealVote', [BigInt(v.mpId), BigInt(v.mlaId), BigInt(v.constituencyId), v.salt]);
const nextPhase = n => send('admin', 'setElectionState', [n]);
const votesOf = async id => Number((await publicClient.readContract({ address: CONTRACT, abi, functionName: 'candidates', args: [BigInt(id)] }))[5]);

async function main() {
  const startPhase = await publicClient.readContract({ address: CONTRACT, abi, functionName: 'state' });
  if (startPhase !== 0) throw new Error('The contract is not fresh (phase is not NOT STARTED). Deploy a new one and try again.');

  console.log('Registration');
  await nextPhase(1);
  // ids 1..6: C1 has two MP candidates and two MLA candidates, C2 has one of each
  for (const [name, party, c, isMP] of [
    ['MP Asha', 'AAA', 1, true], ['MLA Arun', 'AAA', 1, false], ['MP Bina', 'BBB', 1, true],
    ['MLA Bala', 'BBB', 1, false], ['MP Chitra', 'CCC', 2, true], ['MLA Chetan', 'CCC', 2, false],
  ]) await send('admin', 'addCandidate', [name, party, BigInt(c), isMP]);
  await expectRevert('alice', 'addCandidate', ['Sneaky', 'ZZZ', 1n, true], 'Only ECI Admin allowed');
  await expectRevert('admin', 'setElectionState', [3], 'Phases only move forward one step');

  console.log('Voting');
  await nextPhase(2);
  const wrongPin = await askGovernmentNode('alice', 'VARANASI01', '0000');
  check(wrongPin.status === 401, 'government node rejects a wrong PIN');
  const unknownId = await askGovernmentNode('alice', 'NOBODY99', '1111');
  check(unknownId.status === 401, 'government node rejects an unknown voter ID');

  const alice = await castVote('alice', 'VARANASI01', '1111', 1, 2); // C1: MP Asha + MLA Arun
  const bob = await castVote('bob', 'VARANASI02', '2222', 1, 4);     // C1: MP Asha + MLA Bala
  const carol = await castVote('carol', 'WAYANAD01', '3333', 5, 6); // C2: MP Chitra + MLA Chetan
  check(true, 'three voters sealed their votes');

  // Mallory takes Alice's voter ID and PIN but uses her own wallet: a valid slip, but the nullifier is already used.
  const stolen = await askGovernmentNode('mallory', 'VARANASI01', '1111');
  await expectRevert('mallory', 'commitVote', [keccak256('0x01'), BigInt(stolen.body.constituencyId), stolen.body.nullifier, BigInt(stolen.body.deadline), stolen.body.signature], 'Voter ID already used');
  // Alice cannot vote twice either.
  const second = await askGovernmentNode('alice', 'VARANASI01', '1111');
  await expectRevert('alice', 'commitVote', [keccak256('0x02'), BigInt(second.body.constituencyId), second.body.nullifier, BigInt(second.body.deadline), second.body.signature], 'Already voted');
  // Revealing is not allowed yet.
  await expectRevert('alice', 'revealVote', [1n, 2n, 1n, alice.salt], 'Invalid election state');

  // A slip that is left unused past its deadline stops working. (Do this last: it moves the chain clock forward.)
  const late = await askGovernmentNode('mallory', 'WAYANAD02', '4444');
  await publicClient.request({ method: 'evm_increaseTime', params: [20 * 60] });
  await publicClient.request({ method: 'evm_mine', params: [] });
  await expectRevert('mallory', 'commitVote', [keccak256('0x03'), BigInt(late.body.constituencyId), late.body.nullifier, BigInt(late.body.deadline), late.body.signature], 'Voter slip expired');

  console.log('Revealing');
  await nextPhase(3);
  await expectRevert('mallory', 'revealVote', [1n, 2n, 1n, alice.salt], 'No matching vote commitment found');
  await expectRevert('bob', 'revealVote', [1n, 4n, 1n, alice.salt], 'No matching vote commitment found'); // wrong salt
  for (const voter of [alice, bob, carol]) await reveal(voter);
  await expectRevert('alice', 'revealVote', [1n, 2n, 1n, alice.salt], 'No matching vote commitment found'); // replay

  console.log('Ended');
  await nextPhase(4);
  const tally = Object.fromEntries(await Promise.all([1, 2, 3, 4, 5, 6].map(async id => [id, await votesOf(id)])));
  check(tally[1] === 2, 'MP Asha has 2 votes');
  check(tally[2] === 1 && tally[4] === 1, 'MLA Arun and MLA Bala have 1 vote each');
  check(tally[3] === 0, 'MP Bina has 0 votes');
  check(tally[5] === 1 && tally[6] === 1, 'MP Chitra and MLA Chetan have 1 vote each');
  const revealed = await publicClient.readContract({ address: CONTRACT, abi, functionName: 'totalRevealed' });
  check(revealed === 3n, 'totalRevealed is 3');

  console.log(`\nAll ${checks} checks passed.`);
}

main().catch(err => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
