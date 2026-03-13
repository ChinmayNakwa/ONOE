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

    // --- Events (Crucial for your Frontend) ---
    event ElectionStateChanged(ElectionState newState);
    event CandidateAdded(uint id, string name, uint constituencyId, string role);

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
}
