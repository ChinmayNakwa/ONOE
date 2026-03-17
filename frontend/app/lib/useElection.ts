'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { CONTRACT_ADDRESS, ONOE_ABI } from './contract';

export type Candidate = {
  id: number;
  name: string;
  party: string;
  constituencyId: number;
  isMP: boolean;
  voteCount: number;
};

const POLL_MS = 3000;
const MAX_CANDIDATES = 50;

// Reads the public election data from the contract and keeps it fresh.
export function useElection() {
  const poll = { refetchInterval: POLL_MS };

  const stateRead = useReadContract({ address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'state', query: poll });
  const countRead = useReadContract({ address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'candidateCount', query: poll });
  const revealedRead = useReadContract({ address: CONTRACT_ADDRESS, abi: ONOE_ABI, functionName: 'totalRevealed', query: poll });

  const candidateCount = countRead.data ? Math.min(Number(countRead.data), MAX_CANDIDATES) : 0;

  const candidatesRead = useReadContracts({
    contracts: Array.from({ length: candidateCount }, (_, i) => ({
      address: CONTRACT_ADDRESS,
      abi: ONOE_ABI,
      functionName: 'candidates' as const,
      args: [BigInt(i + 1)] as [bigint],
    })),
    query: { enabled: candidateCount > 0, ...poll },
  });

  const candidates: Candidate[] = [];
  for (const r of candidatesRead.data ?? []) {
    if (r.status !== 'success' || !r.result) continue;
    const [id, name, party, constituencyId, isMP, voteCount] = r.result as readonly [bigint, string, string, bigint, boolean, bigint];
    if (name) candidates.push({ id: Number(id), name, party, constituencyId: Number(constituencyId), isMP, voteCount: Number(voteCount) });
  }

  return {
    // -1 until the first answer arrives from the chain
    phase: stateRead.data !== undefined ? Number(stateRead.data) : -1,
    candidateCount,
    totalRevealed: revealedRead.data !== undefined ? Number(revealedRead.data) : 0,
    candidates,
    isLoading: stateRead.isLoading || countRead.isLoading || (candidateCount > 0 && candidatesRead.isLoading),
    // True when the contract could not be read (wrong address, node not running, wrong network)
    isError: stateRead.isError,
    lastUpdated: stateRead.dataUpdatedAt,
    refetch: () => {
      stateRead.refetch();
      countRead.refetch();
      revealedRead.refetch();
      candidatesRead.refetch();
    },
  };
}
