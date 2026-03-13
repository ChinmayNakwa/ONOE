// web/app/abi.ts

export const ONOE_ABI =[
  {
    "type": "constructor",
    "inputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ECI_ADMIN",
    "inputs": [],
    "outputs":[
      { "name": "", "type": "address", "internalType": "address" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "addCandidate",
    "inputs":[
      { "name": "_name", "type": "string", "internalType": "string" },
      { "name": "_party", "type": "string", "internalType": "string" },
      { "name": "_constituencyId", "type": "uint256", "internalType": "uint256" },
      { "name": "_isMP", "type": "bool", "internalType": "bool" }
    ],
    "outputs":[],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "candidateCount",
    "inputs":[],
    "outputs":[
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "candidates",
    "inputs":[
      { "name": "", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs":[
      { "name": "id", "type": "uint256", "internalType": "uint256" },
      { "name": "name", "type": "string", "internalType": "string" },
      { "name": "party", "type": "string", "internalType": "string" },
      { "name": "constituencyId", "type": "uint256", "internalType": "uint256" },
      { "name": "isMP", "type": "bool", "internalType": "bool" },
      { "name": "voteCount", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "commitVote",
    "inputs":[
      { "name": "_commitment", "type": "bytes32", "internalType": "bytes32" },
      { "name": "_voterConstituency", "type": "uint256", "internalType": "uint256" },
      { "name": "_adminSignature", "type": "bytes", "internalType": "bytes" }
    ],
    "outputs":[],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "commitments",
    "inputs":[
      { "name": "", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs":[
      { "name": "", "type": "bool", "internalType": "bool" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getEthSignedMessageHash",
    "inputs":[
      { "name": "_messageHash", "type": "bytes32", "internalType": "bytes32" }
    ],
    "outputs":[
      { "name": "", "type": "bytes32", "internalType": "bytes32" }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "hasVoted",
    "inputs":[
      { "name": "", "type": "address", "internalType": "address" }
    ],
    "outputs":[
      { "name": "", "type": "bool", "internalType": "bool" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "recoverSigner",
    "inputs":[
      { "name": "_ethSignedMessageHash", "type": "bytes32", "internalType": "bytes32" },
      { "name": "_signature", "type": "bytes", "internalType": "bytes" }
    ],
    "outputs":[
      { "name": "", "type": "address", "internalType": "address" }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "revealVote",
    "inputs":[
      { "name": "_mpId", "type": "uint256", "internalType": "uint256" },
      { "name": "_mlaId", "type": "uint256", "internalType": "uint256" },
      { "name": "_voterConstituency", "type": "uint256", "internalType": "uint256" },
      { "name": "_salt", "type": "string", "internalType": "string" }
    ],
    "outputs":[],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setElectionState",
    "inputs":[
      { "name": "_newState", "type": "uint8", "internalType": "enum ONOE_Voting.ElectionState" }
    ],
    "outputs":[],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "splitSignature",
    "inputs":[
      { "name": "sig", "type": "bytes", "internalType": "bytes" }
    ],
    "outputs":[
      { "name": "r", "type": "bytes32", "internalType": "bytes32" },
      { "name": "s", "type": "bytes32", "internalType": "bytes32" },
      { "name": "v", "type": "uint8", "internalType": "uint8" }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "state",
    "inputs": [],
    "outputs":[
      { "name": "", "type": "uint8", "internalType": "enum ONOE_Voting.ElectionState" }
    ],
    "stateMutability": "view"
  }
] as const;