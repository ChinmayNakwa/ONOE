// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title One Nation One Election Voting System
/// @notice Implements Commit-Reveal scheme with Dual-Voting (MP + MLA)
contract ONOE_Voting {
    // --- Roles ---
    address public immutable ECI_ADMIN; 

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
    
    // Mappings
    mapping(uint => Candidate) public candidates;
    mapping(bytes32 => bool) public commitments; // Hashed votes
    mapping(address => bool) public hasVoted;    // Sybil resistance

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

    constructor() {
        ECI_ADMIN = msg.sender;
        state = ElectionState.NotStarted;
    }

    // --- Admin Dashboard Functions ---
    function setElectionState(ElectionState _newState) external onlyAdmin {
        state = _newState;
        emit ElectionStateChanged(_newState);
    }

    function addCandidate(string memory _name, string memory _party, uint _constituencyId, bool _isMP) external onlyAdmin {
        candidateCount++;
        candidates[candidateCount] = Candidate(candidateCount, _name, _party, _constituencyId, _isMP, 0);
        emit CandidateAdded(candidateCount, _name, _constituencyId, _isMP ? "MP" : "MLA");
    }

    // --- Core ONOE Logic ---

    // 1. COMMIT PHASE: User submits Hash + Government Signature
    function commitVote(bytes32 _commitment, uint _voterConstituency, bytes memory _adminSignature) external inState(ElectionState.Voting) {
        require(!hasVoted[msg.sender], "Already voted");

        // Verify the "Digital Voter Slip" (Signature from your Node.js backend)
        bytes32 messageHash = keccak256(abi.encodePacked(msg.sender, _voterConstituency));
        bytes32 ethSignedMessageHash = getEthSignedMessageHash(messageHash);
        require(recoverSigner(ethSignedMessageHash, _adminSignature) == ECI_ADMIN, "Invalid Voter Slip Signature");

        commitments[_commitment] = true;
        hasVoted[msg.sender] = true;
        emit VoteCommitted(_commitment);
    }

    // 2. REVEAL PHASE: User reveals choices (MP + MLA)
    function revealVote(uint _mpId, uint _mlaId, uint _voterConstituency, string memory _salt) external inState(ElectionState.Revealing) {
        // Recreate the hash to prove it matches the commitment
        bytes32 hash = keccak256(abi.encodePacked(_mpId, _mlaId, _voterConstituency, msg.sender, _salt));
        require(commitments[hash], "No matching vote commitment found");

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