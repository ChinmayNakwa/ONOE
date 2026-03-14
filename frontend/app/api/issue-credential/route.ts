import { NextResponse } from 'next/server';
import { keccak256, encodePacked } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// In a real 2026 system, this key is in a Hardware Security Module (HSM).
const ADMIN_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

export async function POST(request: Request) {
  try {
    const { address } = await request.json();
    const account = privateKeyToAccount(ADMIN_PRIVATE_KEY);
    
    // Hash the voter's address
    const messageHash = keccak256(encodePacked(["address"], [address as `0x${string}`]));

    // Government signs the hash (The "Credential")
    const signature = await account.signMessage({ message: { raw: messageHash } });

    return NextResponse.json({ signature });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to issue credential' }, { status: 500 });
  }
}