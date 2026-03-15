// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ONOE_Voting.sol";

contract ONOEMetrics is Test {
    ONOE_Voting voting;
    uint adminKey = 0x1234; // Simulated Admin Private Key
    address admin = vm.addr(adminKey);

    uint signerKey = 0x9abc; // Simulated Government Node (slip signer) Private Key
    address slipSigner = vm.addr(signerKey);

    uint voterKey = 0x5678; // Simulated Voter Private Key
    address voter = vm.addr(voterKey);

    function setUp() public {
        vm.prank(admin);
        voting = new ONOE_Voting(slipSigner);

        // Admin adds candidates (Simulating the Dashboard)
        vm.startPrank(admin);
        voting.setElectionState(ONOE_Voting.ElectionState.Registration);
        voting.addCandidate("Modi", "BJP", 1, true);   // MP
        voting.addCandidate("Yogi", "BJP", 1, false);  // MLA
        voting.setElectionState(ONOE_Voting.ElectionState.Voting);
        vm.stopPrank();
    }

    function test_GeneratePaperMetrics() public {
        // 1. Off-Chain Identity (Simulating Government Node)
        bytes32 nullifier = keccak256("VOTER_ID_1");
        uint deadline = block.timestamp + 15 minutes;
        bytes32 msgHash = voting.getSlipHash(voter, 1, nullifier, deadline);
        bytes32 ethMsgHash = voting.getEthSignedMessageHash(msgHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, ethMsgHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        // 2. Commit Phase (Measure Gas)
        vm.startPrank(voter);
        bytes32 salt = keccak256("SECRET_PASSWORD");
        bytes32 commitment = keccak256(abi.encodePacked(uint(1), uint(2), uint(1), voter, salt));
        
        uint startGas = gasleft();
        voting.commitVote(commitment, 1, nullifier, deadline, signature);
        uint commitGas = startGas - gasleft();
        vm.stopPrank();

        // 3. Reveal Phase (Measure Gas)
        vm.prank(admin);
        voting.setElectionState(ONOE_Voting.ElectionState.Revealing);

        vm.startPrank(voter);
        startGas = gasleft();
        voting.revealVote(1, 2, 1, salt);
        uint revealGas = startGas - gasleft();
        vm.stopPrank();

        assertTrue(voting.hasRevealed(voter));
        assertEq(voting.totalRevealed(), 1);

        // LOGGING DATA FOR PAPER
        console.log("-------------------------------------------");
        console.log("METRICS FOR RESEARCH PAPER:");
        console.log("Commit Gas (MP+MLA):", commitGas);
        console.log("Reveal Gas (MP+MLA):", revealGas);
        console.log("Total Gas per Voter:", commitGas + revealGas);
        console.log("-------------------------------------------");
    }
}