// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ONOE_Voting.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address slipSigner = vm.envAddress("SLIP_SIGNER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        ONOE_Voting voting = new ONOE_Voting(slipSigner);
        console.log("Contract deployed at:", address(voting));
        console.log("ECI admin:", voting.ECI_ADMIN());
        console.log("Slip signer:", voting.SLIP_SIGNER());

        vm.stopBroadcast();
    }
}
