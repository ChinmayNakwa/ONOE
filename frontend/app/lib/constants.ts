// Values shared by the browser code and the API route.

// Chain id used by the local Anvil node (start it with: anvil --chain-id 1337).
export const CHAIN_ID = 1337;

// How long a voter slip stays valid after the government node signs it.
export const SLIP_VALIDITY_SECONDS = 15 * 60;

// Constituency names for the demo election (ids match the voter table and the admin form).
export const CONSTITUENCIES: Record<number, string> = {
  1: 'Varanasi',
  2: 'Wayanad',
};

export function constituencyName(id: number) {
  return CONSTITUENCIES[id] ?? `Constituency ${id}`;
}
