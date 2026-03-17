import { ONOE_ABI } from '../abi';

export { ONOE_ABI };

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

// Turns a wagmi/viem error into one short sentence a voter can understand.
export function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/user rejected|user denied|rejected the request/i.test(message)) return 'You cancelled the request in your wallet.';
  if (/insufficient funds/i.test(message)) return 'Your wallet has no ETH to pay for the transaction.';

  // The contract's own require() messages come through as: reverted with the following reason: <message>
  const reason = message.match(/reason:\s*([^\n]+)/i) ?? message.match(/reverted with[^:]*:\s*([^\n]+)/i);
  if (reason) return reason[1].trim();

  return message.split('\n')[0];
}
