// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title One Nation One Election Voting System
/// @notice Implements Commit-Reveal scheme with Dual-Voting (MP + MLA)
contract ONOE_Voting {
    // --- Roles ---
    address public immutable ECI_ADMIN;   // runs the election (phases, candidates)
    address public immutable SLIP_SIGNER; // government node key that signs voter slips

    // --- State & Structs ---
    enum ElectionState { NotStarted, Registration, Voting, Revealing, Ended }
    
    struct Candidate {
        uint id;
        string name;
        string party;
        uint constituencyId;
        bool isMP; // true = Lok Sabha, false = Vidhan Sabha
        uint voteCount;
    }

    ElectionState public state;
    uint public candidateCount;
    uint public totalRevealed; // number of voters whose votes have been counted
    
    // Mappings
    mapping(uint => Candidate) public candidates;
    mapping(bytes32 => bool) public commitments; // Hashed votes
    mapping(address => bool) public hasVoted;    // One commit per wallet
    mapping(address => bool) public hasRevealed; // Lets the UI resume at the right step
    mapping(bytes32 => bool) public nullifierUsed; // One commit per real voter ID, whatever wallet they use
    mapping(address => uint) public voterConstituency; // Constituency from the signed slip, enforced again at reveal

    // --- Events (Crucial for your Frontend) ---
    event ElectionStateChanged(ElectionState newState);
    event CandidateAdded(uint id, string name, uint constituencyId, string role);
    event VoteCommitted(bytes32 indexed commitment);
    event VoteRevealed(uint mpId, uint mlaId);

    modifier onlyAdmin() {
        require(msg.sender == ECI_ADMIN, "Only ECI Admin allowed");
        _;
    }

    modifier inState(ElectionState _state) {
        require(state == _state, "Invalid election state");
        _;
    }

    constructor(address _slipSigner) {
        require(_slipSigner != address(0), "Slip signer required");
        ECI_ADMIN = msg.sender;
        SLIP_SIGNER = _slipSigner;
        state = ElectionState.NotStarted;
    }

    // --- Admin Dashboard Functions ---
    /// @notice Phases only move forward, one step at a time.
    function setElectionState(ElectionState _newState) external onlyAdmin {
        require(uint(_newState) == uint(state) + 1, "Phases only move forward one step");
        state = _newState;
        emit ElectionStateChanged(_newState);
    }

    function addCandidate(string memory _name, string memory _party, uint _constituencyId, bool _isMP)
        external
        onlyAdmin
        inState(ElectionState.Registration)
    {
        candidateCount++;
        candidates[candidateCount] = Candidate(candidateCount, _name, _party, _constituencyId, _isMP, 0);
        emit CandidateAdded(candidateCount, _name, _constituencyId, _isMP ? "MP" : "MLA");
    }

    // --- Core ONOE Logic ---

    /// @notice The hash the government node signs for a voter. It is tied to this contract and
    /// chain, so a slip cannot be replayed elsewhere, and to a nullifier (one per real voter).
    function getSlipHash(address _voter, uint _constituency, bytes32 _nullifier, uint _deadline) public view returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), block.chainid, _voter, _constituency, _nullifier, _deadline));
    }

    // 1. COMMIT PHASE: User submits Hash + Government Slip
    function commitVote(
        bytes32 _commitment,
        uint _voterConstituency,
        bytes32 _nullifier,
        uint _deadline,
        bytes memory _slipSignature
    ) external inState(ElectionState.Voting) {
        require(block.timestamp <= _deadline, "Voter slip expired");
        require(!hasVoted[msg.sender], "Already voted");
        require(!nullifierUsed[_nullifier], "Voter ID already used");

        // Verify the "Digital Voter Slip" (signed by the government node, not by the admin)
        bytes32 ethSignedMessageHash = getEthSignedMessageHash(getSlipHash(msg.sender, _voterConstituency, _nullifier, _deadline));
        require(recoverSigner(ethSignedMessageHash, _slipSignature) == SLIP_SIGNER, "Invalid Voter Slip Signature");

        commitments[_commitment] = true;
        hasVoted[msg.sender] = true;
        nullifierUsed[_nullifier] = true;
        voterConstituency[msg.sender] = _voterConstituency;
        emit VoteCommitted(_commitment);
    }

    // 2. REVEAL PHASE: User reveals choices (MP + MLA)
    function revealVote(uint _mpId, uint _mlaId, uint _voterConstituency, bytes32 _salt) external inState(ElectionState.Revealing) {
        // Candidate ids start at 1; id 0 and unknown ids must not pass as an MLA
        require(_mpId >= 1 && _mpId <= candidateCount, "Unknown MP");
        require(_mlaId >= 1 && _mlaId <= candidateCount, "Unknown MLA");

        // Recreate the hash to prove it matches the commitment
        bytes32 hash = keccak256(abi.encodePacked(_mpId, _mlaId, _voterConstituency, msg.sender, _salt));
        require(commitments[hash], "No matching vote commitment found");

        // The constituency must be the one on the signed slip, not one the voter picked inside the hash
        require(_voterConstituency == voterConstituency[msg.sender], "Constituency does not match your slip");

        // Enforce ONOE Rules
        Candidate memory mp = candidates[_mpId];
        Candidate memory mla = candidates[_mlaId];

        require(mp.isMP == true, "Selected candidate is not an MP");
        require(mla.isMP == false, "Selected candidate is not an MLA");
        require(mp.constituencyId == _voterConstituency, "MP not in your constituency");
        require(mla.constituencyId == _voterConstituency, "MLA not in your constituency");

        // Count votes
        candidates[_mpId].voteCount++;
        candidates[_mlaId].voteCount++;
        
        // Prevent replay
        commitments[hash] = false;
        hasRevealed[msg.sender] = true;
        totalRevealed++;
        emit VoteRevealed(_mpId, _mlaId);
    }

    // --- Crypto Helpers ---
    function getEthSignedMessageHash(bytes32 _messageHash) public pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _messageHash));
    }

    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _signature) public pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);
        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(bytes memory sig) public pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "Invalid signature length");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
}