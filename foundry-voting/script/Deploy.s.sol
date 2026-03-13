// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ONOE_Voting.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        ONOE_Voting voting = new ONOE_Voting();
        console.log("Contract deployed at:", address(voting));

        vm.stopBroadcast();
    }
}