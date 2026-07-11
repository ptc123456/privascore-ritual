// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {PrivaScoreAgent} from "../src/PrivaScoreAgent.sol";
import {PrivaScoreCore} from "../src/PrivaScoreCore.sol";

/// @notice Redeploy agent only and wire it to an existing Core.
contract DeployAgent is Script {
    address constant SCHEDULER = 0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address coreAddr = vm.envAddress("CORE");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        PrivaScoreAgent agent = new PrivaScoreAgent(deployer, coreAddr, SCHEDULER);
        PrivaScoreCore(coreAddr).setAgent(address(agent));
        vm.stopBroadcast();

        console2.log("CORE", coreAddr);
        console2.log("AGENT", address(agent));
    }
}
