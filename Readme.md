# One Nation, One Election: a blockchain e-voting prototype

A learning and research project. A voter casts **one MP vote and one MLA vote** in their constituency, using a
commit-reveal scheme on an Ethereum-compatible chain. It runs locally on Anvil and is not meant for real elections.

## Architecture

```
 Voter browser (Next.js)           Government node (Next.js API)          Blockchain (Anvil / ONOE_Voting)
 ───────────────────────           ─────────────────────────────          ────────────────────────────────
 1  voter ID + PIN ──────────────▶ check the table, derive a nullifier,
                                   sign a voter slip  ◀──────────────── (slip signer key ≠ admin key)
 2  pick MP + MLA, make a salt
    save the session locally
 3  commitVote(hash, slip) ─────────────────────────────────────────────▶ verify slip, burn nullifier, store hash
 4  (admin opens REVEALING)                                              admin: Registration → Voting → Revealing → Ended
 5  revealVote(choices, salt) ──────────────────────────────────────────▶ recompute hash, count one MP + one MLA vote
 6  results page reads tallies ◀─────────────────────────────────────────  candidates, totalRevealed
```

Three layers:

| Layer | What it does | Where |
|---|---|---|
| **Identity** | A government node checks a voter ID + PIN and signs a short-lived, wallet-specific *voter slip*. This simulates DID/SSI. | `frontend/app/api/auth-voter/route.ts` |
| **Privacy** | Votes are sealed as a hash (commit) and only opened later (reveal), so nobody can see choices while voting is open. | `foundry-voting/src/ONOE_Voting.sol` |
| **Integrity** | Phases, tallies and rules live in a public contract, so anyone can verify the count. | `foundry-voting/src/ONOE_Voting.sol` |

### The vote flow, step by step

1. **Admin deploys** the contract with two different keys: the admin wallet (`ECI_ADMIN`, runs the election) and a separate
   slip signer address (`SLIP_SIGNER`, the government node). A leaked server key cannot change phases or candidates.
2. **Phases** only move forward, one step at a time: `NotStarted → Registration → Voting → Revealing → Ended`.
   Candidates can only be added during Registration.
3. **Verify.** The voter enters a voter ID and PIN. The server derives a `nullifier = keccak256(VOTER_SECRET ‖ voterId)` and signs
   a slip over `(contract, chainId, wallet, constituency, nullifier, deadline)`. The slip works only for that wallet, contract and chain, for 15 minutes.
4. **Seal.** The browser makes a random 32-byte salt and saves the session (salt, choices, slip) under the wallet address *before*
   sending anything. `commitVote` stores only `keccak256(mpId, mlaId, constituency, wallet, salt)`. The contract rejects an expired
   or forged slip, a second vote from the same wallet, and a second vote with the same voter ID from any wallet (the nullifier).
5. **Reveal.** After the admin opens Revealing, the voter sends their choices and salt. The contract recomputes the hash,
   checks that both candidates exist and belong to the voter's constituency, counts one vote for each, and marks the voter as revealed.
6. **Results.** The results page polls the contract for tallies and `totalRevealed`.

If the page is reloaded, progress is restored from the chain (`hasVoted`, `hasRevealed`) plus the saved session. A receipt file
can be downloaded after sealing, in case the browser's storage is cleared.

## Repo layout

```
foundry-voting/
  src/ONOE_Voting.sol          the contract
  test/ONOE_Voting.t.sol       unit tests (phases, slips, nullifier, commit-reveal)
  test/ONOE_Metrics.t.sol      gas numbers for the research paper
  script/Deploy.s.sol          deploy script
frontend/
  app/page.tsx                 voter page
  app/admin/page.tsx           ECI admin dashboard
  app/results/page.tsx         live results
  app/api/auth-voter/route.ts  government node (signs voter slips)
  app/lib/                     shared logic: contract helpers, vote session, election hook, theme
  app/components/              shared UI: header, cards, banners, stepper, tally
  scripts/e2e.mjs              end-to-end smoke test
```

## Running it locally

You need [Foundry](https://book.getfoundry.sh/getting-started/installation), Node.js 20+ and a browser wallet such as MetaMask.

**1. Start a local chain.** The chain id must be 1337.

```shell
anvil --chain-id 1337
```

**2. Deploy the contract.** In `foundry-voting`, copy `.env.example` to `.env` and fill it in (forge loads it automatically). `PRIVATE_KEY` is Anvil account #0 (the admin),
and `SLIP_SIGNER_ADDRESS` is the address of Anvil account #1 (the government node). Both are printed when Anvil starts.

```shell
cd foundry-voting
git submodule update --init      # first time only (forge-std)
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

Note the printed `Contract deployed at: 0x...` address.

**3. Configure and start the frontend.** In `frontend`, copy `.env.example` to `.env.local`:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | the address printed by the deploy script |
| `SLIP_SIGNER_PRIVATE_KEY` | the private key of Anvil account #1 (must match `SLIP_SIGNER_ADDRESS`) |
| `VOTER_SECRET` | any long random string |

```shell
cd frontend
npm install
npm run dev
```

**4. Set up the wallet.** In MetaMask add a custom network with RPC `http://127.0.0.1:8545` and chain id `1337`, then import the
Anvil private keys you need: account #0 for the admin and any other account for each voter.

**5. Run an election** at `http://localhost:3000`:

1. Open `/admin` with account #0 → **Start registration** → add candidates (an MP and an MLA for each constituency) → **Start voting**.
2. Open `/` with a voter account, verify with a demo voter, pick candidates and seal the vote.
3. On `/admin` → **Start revealing**. On `/` press **Reveal my vote**.
4. On `/admin` → **End election**. See the winners on `/results`.

Demo voters (the table is in `app/api/auth-voter/route.ts`; they are fake data):

| Voter ID | PIN | Constituency |
|---|---|---|
| `VARANASI01` | `1111` | 1 (Varanasi) |
| `VARANASI02` | `2222` | 1 (Varanasi) |
| `WAYANAD01` | `3333` | 2 (Wayanad) |
| `WAYANAD02` | `4444` | 2 (Wayanad) |

After redeploying the contract, update `NEXT_PUBLIC_CONTRACT_ADDRESS` and restart `npm run dev`.

## Tests

```shell
cd foundry-voting
forge test -vv                                   # unit tests + gas metrics
forge test --match-contract ONOEMetrics -vv      # the numbers used in the research paper
forge test --gas-report                          # gas per function
```

End-to-end test (runs a whole election, including attack attempts). Start Anvil, deploy a **fresh** contract, start the frontend, then:

```shell
cd frontend
NEXT_PUBLIC_CONTRACT_ADDRESS=0x... node scripts/e2e.mjs      # add APP_URL=http://localhost:3001 if you use another port
```

If you change the contract, regenerate the frontend ABI: `cd foundry-voting && forge inspect ONOE_Voting abi --json`
and paste the result into `frontend/app/abi.ts`.

## Trust assumptions and known limits

This is a prototype. What it does and does not protect against:

- **Votes are pseudonymous, not anonymous.** The reveal transaction links a wallet to its choices, and the government node knows which
  voter ID asked for a slip for which wallet. Real anonymity would need blind signatures or zero-knowledge proofs.
- **The government node is trusted for identity.** The contract cannot tell whether a voter is real, only that the slip signer vouched for them.
  The nullifier stops one voter ID voting twice, but a dishonest signer could create fake voter IDs.
- **The admin controls timing.** They can end Voting early or never open Revealing. Phases cannot go backwards.
- **A vote that is never revealed is not counted.**
- **Tallies are public while revealing**, so a voter could see partial results before deciding whether to reveal. Contract storage cannot be hidden.
- **A voter can prove their vote** by sharing their salt, so there is no receipt-freeness (vote buying is not prevented).
- **The wallet that pays gas can link to the voter.** There is no relayer.
- Voter PINs are demo values, and the PIN attempt limit lives in server memory.

## What was fixed in the original prototype

| Problem | Fix |
|---|---|
| Anyone who knew a voter ID could take that voter's vote; one voter could use many wallets | PIN required, and a per-voter nullifier that the contract burns |
| Slips could be replayed on another contract or chain, and never expired | Slips cover the contract, chain id and a deadline |
| The backend key was also the contract admin | A separate immutable `SLIP_SIGNER` |
| Any phase could be set at any time; candidates could be added mid-election | Forward-only phases; candidates only during Registration |
| The salt was a short `Math.random` string, so sealed votes could be guessed | A 32-byte secure random `bytes32` salt |
| A reload lost the slip and salt | A per-wallet saved session, plus a downloadable receipt |
| Vote total was computed as a guess (`sum / 2`) | `totalRevealed` counter in the contract |

## License

MIT. See [LICENSE](LICENSE).
