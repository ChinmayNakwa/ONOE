// The "government node": checks a voter ID + PIN and signs a voter slip for the voter's wallet.
import { NextResponse } from 'next/server';
import { encodePacked, isAddress, isHex, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CHAIN_ID, SLIP_VALIDITY_SECONDS } from '../../lib/constants';

// SIMULATED DATABASE (2 constituencies). Demo PINs only - a real system would use real credentials.
const VOTER_DB: Record<string, { constituencyId: number; pin: string }> = {
  VARANASI01: { constituencyId: 1, pin: '1111' }, // PM's constituency
  VARANASI02: { constituencyId: 1, pin: '2222' },
  WAYANAD01: { constituencyId: 2, pin: '3333' }, // Opposition's constituency
  WAYANAD02: { constituencyId: 2, pin: '4444' },
};

// Block guessing of PINs: 5 wrong tries on a voter ID from one address locks that pair for 5 minutes
// (in memory, resets on restart). The lock is per voter ID AND address, so a stranger who types wrong PINs for
// someone's ID only locks themselves out, not the real voter. Only real voter IDs are tracked.
// Behind a proxy, x-forwarded-for must be set by a proxy you trust; otherwise a caller can fake it.
const MAX_FAILED_TRIES = 5;
const LOCK_MS = 5 * 60 * 1000;
const MAX_TRACKED = 1000; // upper bound on remembered (voter ID, address) pairs
const failedTries = new Map<string, { count: number; lastTry: number; lockedUntil: number }>();

function clientAddress(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}

// Forget entries that are old: an expired lock or a count nobody has added to for LOCK_MS.
function forgetStaleTries(now: number) {
  for (const [key, t] of failedTries) {
    if (now - t.lastTry > LOCK_MS && t.lockedUntil <= now) failedTries.delete(key);
  }
}

function recordFailedTry(key: string, now: number) {
  forgetStaleTries(now);
  if (!failedTries.has(key) && failedTries.size >= MAX_TRACKED) {
    failedTries.delete(failedTries.keys().next().value!); // still full: drop the oldest entry
  }
  const count = (failedTries.get(key)?.count ?? 0) + 1;
  failedTries.set(key, { count, lastTry: now, lockedUntil: count >= MAX_FAILED_TRIES ? now + LOCK_MS : 0 });
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  // 1. Server configuration
  const signerKey = process.env.SLIP_SIGNER_PRIVATE_KEY;
  const voterSecret = process.env.VOTER_SECRET;
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (!signerKey || !isHex(signerKey) || signerKey.length !== 66 || !voterSecret || !contractAddress || !isAddress(contractAddress)) {
    console.error('Set SLIP_SIGNER_PRIVATE_KEY, VOTER_SECRET and NEXT_PUBLIC_CONTRACT_ADDRESS in frontend/.env.local');
    return error('Government node is not configured. Contact the administrator.', 500);
  }

  // 2. Request body
  let body: { voterId?: unknown; pin?: unknown; walletAddress?: unknown };
  try {
    body = await req.json();
  } catch {
    return error('Invalid request.', 400);
  }
  const voterId = typeof body.voterId === 'string' ? body.voterId.trim().toUpperCase() : '';
  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  const walletAddress = body.walletAddress;
  if (!voterId || !pin || typeof walletAddress !== 'string' || !isAddress(walletAddress)) {
    return error('Voter ID, PIN and a connected wallet are required.', 400);
  }

  // 3. Verify identity
  const now = Date.now();
  const voter = Object.hasOwn(VOTER_DB, voterId) ? VOTER_DB[voterId] : undefined;
  if (!voter) return error('Invalid Voter ID or PIN.', 401); // unknown IDs are not tracked, so the map cannot grow

  const tryKey = `${voterId}|${clientAddress(req)}`;
  const tries = failedTries.get(tryKey);
  if (tries && tries.lockedUntil > now) {
    return error('Too many wrong attempts. Try again in a few minutes.', 429);
  }
  if (tries && tries.lockedUntil !== 0) failedTries.delete(tryKey); // the lock has expired: start counting from zero
  if (voter.pin !== pin) {
    recordFailedTry(tryKey, now);
    return error('Invalid Voter ID or PIN.', 401);
  }
  failedTries.delete(tryKey);

  // 4. Build the slip. The nullifier is the same for a voter ID whatever wallet they use, so the contract
  //    can reject a second vote. It is hashed with a server secret so it does not reveal the voter ID.
  const nullifier = keccak256(encodePacked(['string', 'string'], [voterSecret, voterId]));
  const deadline = Math.floor(Date.now() / 1000) + SLIP_VALIDITY_SECONDS;

  // Must match ONOE_Voting.getSlipHash()
  const slipHash = keccak256(encodePacked(
    ['address', 'uint256', 'address', 'uint256', 'bytes32', 'uint256'],
    [contractAddress, BigInt(CHAIN_ID), walletAddress, BigInt(voter.constituencyId), nullifier, BigInt(deadline)]
  ));

  // 5. Sign it like eth_sign does (matches ONOE_Voting.getEthSignedMessageHash)
  const account = privateKeyToAccount(signerKey);
  const signature = await account.signMessage({ message: { raw: slipHash } });

  return NextResponse.json({
    verified: true,
    constituencyId: voter.constituencyId,
    nullifier,
    deadline,
    signature,
  });
}
