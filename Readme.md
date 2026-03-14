# National Blockchain E-Voting System (2026 Prototype)

## Core Architecture
- **Identity Layer**: Off-chain ECDSA Signatures (Simulated DID/SSI).
- **Privacy Layer**: On-chain Commit-Reveal Scheme.
- **Integrity Layer**: Foundry-based smart contracts with public verifiability.

## Implementation Details
### Smart Contracts (Foundry)
1. `Voting.sol`: Handles the anonymous ballot logic.
2. `ElectionAuthority.sol`: Manages owner-based state transitions.

### Frontend (Next.js 16)
- Uses **Wagmi v3** and **Viem v2** for type-safe blockchain interactions.
- UI built with **Tailwind CSS v4**.

## How to Run
1. **Blockchain**: Run `anvil` in the `foundry-voting` directory.
2. **Deploy**: `forge create src/Voting.sol:Voting --private-key 0xac...`
3. **Frontend**: `npm install` then `npm run dev` in the `web` directory.

## Academic Metrics
Run `forge test --gas-report` to generate the performance evaluation data used in the methodology section of the research paper.