// web/app/api/auth-voter/route.ts
import { NextResponse } from 'next/server';
import { createWalletClient, http, toBytes, keccak256, encodePacked } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

// SIMULATED DATABASE (2 Constituencies)
const VOTER_DB: Record<string, number> = {
  "VARANASI01": 1, // PM's constituency
  "WAYANAD02": 2,  // Opposition's constituency
};

export async function POST(req: Request) {
  try {
    const { voterId, walletAddress } = await req.json();

    // 1. Verify Identity
    const constituencyId = VOTER_DB[voterId];
    if (!constituencyId) {
      return NextResponse.json({ error: "Invalid Voter ID" }, { status: 401 });
    }

    // 2. Sign the "Digital Slip"
    // The Private Key here MUST match the address that deployed the contract (ECI_ADMIN)
    const account = privateKeyToAccount(`0x${process.env.ADMIN_PRIVATE_KEY}`);
    
    // Hash matches Solidity logic: keccak256(abi.encodePacked(voter, constituency))
    // We sign the hash of the data
    const messageHash = keccak256(encodePacked(
      ['address', 'uint256'],
      [walletAddress as `0x${string}`, BigInt(constituencyId)]
    ));

    // Sign the raw hash (mimicking standard Ethereum signing)
    const signature = await account.signMessage({ 
        message: { raw: toBytes(messageHash) } 
    });

    return NextResponse.json({ verified: true, constituencyId, signature });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}