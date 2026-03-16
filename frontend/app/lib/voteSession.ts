// Everything a voter needs to finish their vote later: the secret salt, their choices and the government slip.
// It is stored per wallet and per contract in localStorage, and saved BEFORE the commit transaction is sent.
// If the salt is lost the vote can never be revealed, so the voter can also download it as a receipt file.
import { isAddress, isHex, toHex } from 'viem';

export type VoteSession = {
  wallet: `0x${string}`;
  contract: `0x${string}`;
  constituencyId: number;
  nullifier: `0x${string}`;
  deadline: number; // slip expiry (unix seconds)
  signature: `0x${string}`;
  salt: `0x${string}`;
  mpId: number; // 0 until the voter has chosen
  mlaId: number;
};

// 32 random bytes from the browser's secure random generator.
export function newSalt(): `0x${string}` {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

function key(wallet: string, contract: string) {
  return `onoe:session:${contract.toLowerCase()}:${wallet.toLowerCase()}`;
}

export function loadSession(wallet: string, contract: string): VoteSession | null {
  try {
    const raw = localStorage.getItem(key(wallet, contract));
    return raw ? (JSON.parse(raw) as VoteSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: VoteSession) {
  try {
    localStorage.setItem(key(session.wallet, session.contract), JSON.stringify(session));
  } catch {
    // Storage can be blocked (private mode). The receipt download is the backup.
  }
}

export function clearSession(wallet: string, contract: string) {
  try {
    localStorage.removeItem(key(wallet, contract));
  } catch {}
}

export function downloadReceipt(session: VoteSession) {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `onoe-vote-receipt-${session.wallet.slice(0, 8)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

// Reads a receipt file. Returns null when it is not a valid receipt.
export function parseReceipt(text: string): VoteSession | null {
  try {
    const s = JSON.parse(text);
    const ok =
      isAddress(s.wallet) && isAddress(s.contract) &&
      isHex(s.nullifier) && isHex(s.signature) && isHex(s.salt) &&
      Number.isInteger(s.constituencyId) && Number.isInteger(s.deadline) &&
      Number.isInteger(s.mpId) && Number.isInteger(s.mlaId);
    return ok ? (s as VoteSession) : null;
  } catch {
    return null;
  }
}
