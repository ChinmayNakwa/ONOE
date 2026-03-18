// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ONOE_Voting.sol";

contract ONOEVotingTest is Test {
    ONOE_Voting voting;

    uint adminKey = 0xA11CE;
    uint signerKey = 0x516E;
    address admin = vm.addr(adminKey);
    address signer = vm.addr(signerKey);
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    // Candidate ids are assigned in the order they are added in setUp.
    uint constant MP_C1 = 1;
    uint constant MLA_C1 = 2;
    uint constant MP_C2 = 3;
    uint constant MLA_C2 = 4;

    bytes32 constant SALT = keccak256("alice-secret-salt");
    bytes32 constant ALICE_ID = keccak256("ALICE-VOTER-ID");
    bytes32 constant BOB_ID = keccak256("BOB-VOTER-ID");

    function setUp() public {
        vm.startPrank(admin);
        voting = new ONOE_Voting(signer);
        voting.setElectionState(ONOE_Voting.ElectionState.Registration);
        voting.addCandidate("MP One", "AAA", 1, true);
        voting.addCandidate("MLA One", "AAA", 1, false);
        voting.addCandidate("MP Two", "BBB", 2, true);
        voting.addCandidate("MLA Two", "BBB", 2, false);
        voting.setElectionState(ONOE_Voting.ElectionState.Voting);
        vm.stopPrank();
    }

    // --- helpers ---

    function _slip(ONOE_Voting target, uint key, address voter, uint constituency, bytes32 nullifier, uint deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = target.getEthSignedMessageHash(target.getSlipHash(voter, constituency, nullifier, deadline));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _commitment(uint mp, uint mla, uint constituency, address voter, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(mp, mla, constituency, voter, salt));
    }

    /// Commits a vote for `voter` using a valid slip from the real signer.
    function _commit(address voter, bytes32 nullifier, uint constituency, uint mp, uint mla, bytes32 salt) internal {
        uint deadline = block.timestamp + 15 minutes;
        bytes memory sig = _slip(voting, signerKey, voter, constituency, nullifier, deadline);
        vm.prank(voter);
        voting.commitVote(_commitment(mp, mla, constituency, voter, salt), constituency, nullifier, deadline, sig);
    }

    function _startRevealing() internal {
        vm.prank(admin);
        voting.setElectionState(ONOE_Voting.ElectionState.Revealing);
    }

    // --- deployment and admin ---

    function test_ConstructorSetsRoles() public view {
        assertEq(voting.ECI_ADMIN(), admin);
        assertEq(voting.SLIP_SIGNER(), signer);
    }

    function test_ConstructorRejectsZeroSigner() public {
        vm.expectRevert("Slip signer required");
        new ONOE_Voting(address(0));
    }

    function test_OnlyAdminCanChangeState() public {
        vm.prank(alice);
        vm.expectRevert("Only ECI Admin allowed");
        voting.setElectionState(ONOE_Voting.ElectionState.Revealing);
    }

    function test_OnlyAdminCanAddCandidates() public {
        vm.prank(alice);
        vm.expectRevert("Only ECI Admin allowed");
        voting.addCandidate("Sneaky", "ZZZ", 1, true);
    }

    function test_StateCannotMoveBackwards() public {
        vm.prank(admin);
        vm.expectRevert("Phases only move forward one step");
        voting.setElectionState(ONOE_Voting.ElectionState.Registration);
    }

    function test_StateCannotSkipAPhase() public {
        vm.prank(admin);
        vm.expectRevert("Phases only move forward one step");
        voting.setElectionState(ONOE_Voting.ElectionState.Ended);
    }

    function test_CandidatesCanOnlyBeAddedDuringRegistration() public {
        vm.prank(admin);
        vm.expectRevert("Invalid election state");
        voting.addCandidate("Too late", "ZZZ", 1, true);
    }

    // --- commit phase ---

    function test_CommitStoresCommitmentAndMarksVoter() public {
        bytes32 commitment = _commitment(MP_C1, MLA_C1, 1, alice, SALT);
        _commit(alice, ALICE_ID, 1, MP_C1, MLA_C1, SALT);

        assertTrue(voting.commitments(commitment));
        assertTrue(voting.hasVoted(alice));
        assertTrue(voting.nullifierUsed(ALICE_ID));
    }

    function test_CommitOutsideVotingPhaseReverts() public {
        _startRevealing();
        uint deadline = block.timestamp + 15 minutes;
        bytes memory sig = _slip(voting, signerKey, alice, 1, ALICE_ID, deadline);

        vm.prank(alice);
        vm.expectRevert("Invalid election state");
        voting.commitVote(_commitment(MP_C1, MLA_C1, 1, alice, SALT), 1, ALICE_ID, deadline, sig);
    }

    function test_SlipFromWrongSignerReverts() public {
        uint deadline = block.timestamp + 15 minutes;
        // The admin key must not be able to sign slips.
        bytes memory sig = _slip(voting, adminKey, alice, 1, ALICE_ID, deadline);

        vm.prank(alice);
        vm.expectRevert("Invalid Voter Slip Signature");
        voting.commitVote(_commitment(MP_C1, MLA_C1, 1, alice, SALT), 1, ALICE_ID, deadline, sig);
    }

    function test_ExpiredSlipReverts() public {
        uint deadline = block.timestamp + 15 minutes;
        bytes memory sig = _slip(voting, signerKey, alice, 1, ALICE_ID, deadline);

        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert("Voter slip expired");
        voting.commitVote(_commitment(MP_C1, MLA_C1, 1, alice, SALT), 1, ALICE_ID, deadline, sig);
    }

    function test_SlipForAnotherWalletReverts() public {
        uint deadline = block.timestamp + 15 minutes;
        bytes memory aliceSlip = _slip(voting, signerKey, alice, 1, ALICE_ID, deadline);

        vm.prank(bob);
        vm.expectRevert("Invalid Voter Slip Signature");
        voting.commitVote(_commitment(MP_C1, MLA_C1, 1, bob, SALT), 1, ALICE_ID, deadline, aliceSlip);
    }

    function test_SlipForAnotherConstituencyReverts() public {
        uint deadline = block.timestamp + 15 minutes;
        bytes memory slipForC1 = _slip(voting, signerKey, alice, 1, ALICE_ID, deadline);

        vm.prank(alice);
        vm.expectRevert("Invalid Voter Slip Signature");
        voting.commitVote(_commitment(MP_C2, MLA_C2, 2, alice, SALT), 2, ALICE_ID, deadline, slipForC1);
    }

    function test_SlipWithSwappedNullifierReverts() public {
        uint deadline = block.timestamp + 15 minutes;
        bytes memory sig = _slip(voting, signerKey, alice, 1, ALICE_ID, deadline);

        vm.prank(alice);
        vm.expectRevert("Invalid Voter Slip Signature");
        voting.commitVote(_commitment(MP_C1, MLA_C1, 1, alice, SALT), 1, BOB_ID, deadline, sig);
    }

    function test_SlipForAnotherContractReverts() public {
        vm.prank(admin);
        ONOE_Voting other = new ONOE_Voting(signer);
        uint deadline = block.timestamp + 15 minutes;
        bytes memory slipForOther = _slip(other, signerKey, alice, 1, ALICE_ID, deadline);

        vm.prank(alice);
        vm.expectRevert("Invalid Voter Slip Signature");
        voting.commitVote(_commitment(MP_C1, MLA_C1, 1, alice, SALT), 1, ALICE_ID, deadline, slipForOther);
    }

    function test_SlipForAnotherChainReverts() public {
        uint deadline = block.timestamp + 15 minutes;
        bytes memory sig = _slip(voting, signerKey, alice, 1, ALICE_ID, deadline);

        vm.chainId(block.chainid + 1);
        vm.prank(alice);
        vm.expectRevert("Invalid Voter Slip Signature");
        voting.commitVote(_commitment(MP_C1, MLA_C1, 1, alice, SALT), 1, ALICE_ID, deadline, sig);
    }

    function test_SameWalletCannotCommitTwice() public {
        _commit(alice, ALICE_ID, 1, MP_C1, MLA_C1, SALT);

        uint deadline = block.timestamp + 15 minutes;
        bytes memory sig = _slip(voting, signerKey, alice, 1, BOB_ID, deadline);
        vm.prank(alice);
        vm.expectRevert("Already voted");
        voting.commitVote(_commitment(MP_C1, MLA_C1, 1, alice, SALT), 1, BOB_ID, deadline, sig);
    }

    function test_SameVoterIdCannotVoteFromSecondWallet() public {
        _commit(alice, ALICE_ID, 1, MP_C1, MLA_C1, SALT);

        // Same voter ID (nullifier), different wallet, perfectly valid slip.
        uint deadline = block.timestamp + 15 minutes;
        bytes memory sig = _slip(voting, signerKey, bob, 1, ALICE_ID, deadline);
        vm.prank(bob);
        vm.expectRevert("Voter ID already used");
        voting.commitVote(_commitment(MP_C1, MLA_C1, 1, bob, SALT), 1, ALICE_ID, deadline, sig);
    }

    // --- reveal phase ---

    function test_RevealCountsBothVotes() public {
        _commit(alice, ALICE_ID, 1, MP_C1, MLA_C1, SALT);
        _startRevealing();

        vm.prank(alice);
        voting.revealVote(MP_C1, MLA_C1, 1, SALT);

        (, , , , , uint mpVotes) = voting.candidates(MP_C1);
        (, , , , , uint mlaVotes) = voting.candidates(MLA_C1);
        assertEq(mpVotes, 1);
        assertEq(mlaVotes, 1);
        assertTrue(voting.hasRevealed(alice));
        assertEq(voting.totalRevealed(), 1);
    }

    function test_RevealBeforeRevealingPhaseReverts() public {
        _commit(alice, ALICE_ID, 1, MP_C1, MLA_C1, SALT);

        vm.prank(alice);
        vm.expectRevert("Invalid election state");
        voting.revealVote(MP_C1, MLA_C1, 1, SALT);
    }

    function test_RevealWithWrongSaltReverts() public {
        _commit(alice, ALICE_ID, 1, MP_C1, MLA_C1, SALT);
        _startRevealing();

        vm.prank(alice);
        vm.expectRevert("No matching vote commitment found");
        voting.revealVote(MP_C1, MLA_C1, 1, keccak256("wrong salt"));
    }

    function test_RevealWithDifferentChoicesReverts() public {
        // Alice sealed MP_C1 + MLA_C1, but tries to reveal for the other constituency's MLA.
        _commit(alice, ALICE_ID, 1, MP_C1, MLA_C1, SALT);
        _startRevealing();

        vm.prank(alice);
        vm.expectRevert("No matching vote commitment found");
        voting.revealVote(MP_C1, MLA_C2, 1, SALT);
    }

    function test_RevealCannotBeReplayed() public {
        _commit(alice, ALICE_ID, 1, MP_C1, MLA_C1, SALT);
        _startRevealing();

        vm.startPrank(alice);
        voting.revealVote(MP_C1, MLA_C1, 1, SALT);
        vm.expectRevert("No matching vote commitment found");
        voting.revealVote(MP_C1, MLA_C1, 1, SALT);
        vm.stopPrank();

        assertEq(voting.totalRevealed(), 1);
    }

    function test_OtherWalletCannotRevealAlicesCommitment() public {
        _commit(alice, ALICE_ID, 1, MP_C1, MLA_C1, SALT);
        _startRevealing();

        vm.prank(bob);
        vm.expectRevert("No matching vote commitment found");
        voting.revealVote(MP_C1, MLA_C1, 1, SALT);
    }

    function test_RevealRejectsCandidatesFromAnotherConstituency() public {
        // Alice is a constituency-1 voter but sealed a vote for constituency-2 candidates.
        _commit(alice, ALICE_ID, 1, MP_C2, MLA_C2, SALT);
        _startRevealing();

        vm.prank(alice);
        vm.expectRevert("MP not in your constituency");
        voting.revealVote(MP_C2, MLA_C2, 1, SALT);
    }

    function test_RevealRejectsMpAndMlaSwapped() public {
        _commit(alice, ALICE_ID, 1, MLA_C1, MP_C1, SALT);
        _startRevealing();

        vm.prank(alice);
        vm.expectRevert("Selected candidate is not an MP");
        voting.revealVote(MLA_C1, MP_C1, 1, SALT);
    }

    function test_RevealRejectsUnknownCandidate() public {
        _commit(alice, ALICE_ID, 1, 99, MLA_C1, SALT);
        _startRevealing();

        vm.prank(alice);
        vm.expectRevert("Unknown MP");
        voting.revealVote(99, MLA_C1, 1, SALT);
    }

    function test_RevealRejectsCandidateIdZero() public {
        _commit(alice, ALICE_ID, 1, MP_C1, 0, SALT);
        _startRevealing();

        vm.prank(alice);
        vm.expectRevert("Unknown MLA");
        voting.revealVote(MP_C1, 0, 1, SALT);
    }

    function test_RevealRejectsConstituencyDifferentFromSlip() public {
        // Alice's slip is for constituency 1, but she seals a vote for constituency 2.
        uint deadline = block.timestamp + 15 minutes;
        bytes memory sig = _slip(voting, signerKey, alice, 1, ALICE_ID, deadline);
        vm.prank(alice);
        voting.commitVote(_commitment(MP_C2, MLA_C2, 2, alice, SALT), 1, ALICE_ID, deadline, sig);
        _startRevealing();

        vm.prank(alice);
        vm.expectRevert("Constituency does not match your slip");
        voting.revealVote(MP_C2, MLA_C2, 2, SALT);
    }

    // --- whole election ---

    function test_TwoVotersInDifferentConstituencies() public {
        _commit(alice, ALICE_ID, 1, MP_C1, MLA_C1, SALT);
        _commit(bob, BOB_ID, 2, MP_C2, MLA_C2, SALT);
        _startRevealing();

        vm.prank(alice);
        voting.revealVote(MP_C1, MLA_C1, 1, SALT);
        vm.prank(bob);
        voting.revealVote(MP_C2, MLA_C2, 2, SALT);

        (, , , , , uint mp1) = voting.candidates(MP_C1);
        (, , , , , uint mla1) = voting.candidates(MLA_C1);
        (, , , , , uint mp2) = voting.candidates(MP_C2);
        (, , , , , uint mla2) = voting.candidates(MLA_C2);
        assertEq(mp1 + mla1 + mp2 + mla2, 4);
        assertEq(voting.totalRevealed(), 2);
    }

    function test_UnrevealedVotesAreNotCounted() public {
        _commit(alice, ALICE_ID, 1, MP_C1, MLA_C1, SALT);
        _commit(bob, BOB_ID, 2, MP_C2, MLA_C2, SALT);
        _startRevealing();

        vm.prank(alice);
        voting.revealVote(MP_C1, MLA_C1, 1, SALT);

        assertEq(voting.totalRevealed(), 1);
        assertFalse(voting.hasRevealed(bob));
    }
}
