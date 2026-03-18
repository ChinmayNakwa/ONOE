# foundry-voting

The smart contract for the One Nation, One Election prototype, built with [Foundry](https://book.getfoundry.sh/).

- `src/ONOE_Voting.sol`: the voting contract
- `test/`: unit tests and gas metrics
- `script/Deploy.s.sol`: deploy script (needs `PRIVATE_KEY` and `SLIP_SIGNER_ADDRESS`, see `.env.example`)

```shell
forge build
forge test -vv
```

See the [main README](../Readme.md) for the architecture, how to deploy and run everything, and the known limits.
