// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {PrivaToken} from "../src/PrivaToken.sol";
import {PrivaScoreCore} from "../src/PrivaScoreCore.sol";
import {PrivaScoreAgent} from "../src/PrivaScoreAgent.sol";

/// @notice Deploy PrivaScore stack to Ritual Testnet (chainId 1979).
/// @dev Usage:
///   forge script script/Deploy.s.sol --rpc-url $RITUAL_RPC --broadcast \
///     --priority-gas-price 1000000000 -vvvv
/// Never use --legacy. Priority fee must be >= 1 gwei.
contract Deploy is Script {
    address constant SCHEDULER = 0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B;
    address constant RITUAL_WALLET = 0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console2.log("Deployer:", deployer);
        console2.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerKey);

        PrivaToken token = new PrivaToken(deployer);
        console2.log("PrivaToken:", address(token));

        PrivaScoreCore core = new PrivaScoreCore(deployer, address(token));
        console2.log("PrivaScoreCore:", address(core));

        PrivaScoreAgent agent = new PrivaScoreAgent(deployer, address(core), SCHEDULER);
        console2.log("PrivaScoreAgent:", address(agent));

        core.setAgent(address(agent));
        token.setMinter(address(core));

        // Keep mockMode = true for stable demos (owner can flip later)
        // agent.setMockMode(true); // already default

        // Seed RitualWallet for agent-paid scheduled executions (if funded)
        uint256 depositValue = vm.envOr("DEPOSIT_WEI", uint256(0));
        if (depositValue > 0) {
            agent.depositForFees{value: depositValue}(50_000);
            console2.log("Deposited to RitualWallet via agent:", depositValue);
        }

        vm.stopBroadcast();

        console2.log("--- Deployment complete ---");
        console2.log("TOKEN=", address(token));
        console2.log("CORE=", address(core));
        console2.log("AGENT=", address(agent));
        console2.log("SCHEDULER=", SCHEDULER);
        console2.log("RITUAL_WALLET=", RITUAL_WALLET);
    }
}
