// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {PrivaToken} from "../src/PrivaToken.sol";
import {PrivaScoreCore} from "../src/PrivaScoreCore.sol";
import {PrivaScoreAgent} from "../src/PrivaScoreAgent.sol";
import {IPrivaScoreCore} from "../src/interfaces/IPrivaScoreCore.sol";
import {MockHTTPPrecompile} from "./mocks/MockHTTPPrecompile.sol";
import {MockLLMPrecompile} from "./mocks/MockLLMPrecompile.sol";
import {MockScheduler} from "./mocks/MockScheduler.sol";

contract PrivaScoreTest is Test {
    address constant HTTP_PRECOMPILE = 0x0000000000000000000000000000000000000801;
    address constant LLM_PRECOMPILE = 0x0000000000000000000000000000000000000802;
    address constant ASYNC_DELIVERY = 0x5A16214fF555848411544b005f7Ac063742f39F6;

    PrivaToken token;
    PrivaScoreCore core;
    PrivaScoreAgent agent;
    MockScheduler mockScheduler;

    address owner = address(this);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        // Etch precompile mocks at fixed addresses
        vm.etch(HTTP_PRECOMPILE, address(new MockHTTPPrecompile()).code);
        vm.etch(LLM_PRECOMPILE, address(new MockLLMPrecompile()).code);

        mockScheduler = new MockScheduler();

        token = new PrivaToken(owner);
        core = new PrivaScoreCore(owner, address(token));
        agent = new PrivaScoreAgent(owner, address(core), address(mockScheduler));

        core.setAgent(address(agent));
        token.setMinter(address(core));

        // Mock mode on by default
        assertTrue(agent.mockMode());
    }

    // ─── Full mock flow ──────────────────────────────────────────────────────

    function test_RequestScore_MockMode_FullFlow_Success() public {
        // Mock mode settles fetch+analyze+SBT in a single call
        agent.fetchData(alice);

        (
            uint256 score,
            uint8 tier,
            uint256 lastUpdated,
            bytes32 dataHash,
            IPrivaScoreCore.RequestStatus status,
            string memory reasoning
        ) = core.scores(alice);

        assertEq(uint8(status), uint8(IPrivaScoreCore.RequestStatus.Settled));
        assertTrue(score <= 999);
        assertTrue(tier <= 2);
        assertTrue(lastUpdated > 0);
        assertTrue(dataHash != bytes32(0));
        assertTrue(bytes(reasoning).length > 0);
        assertEq(core.tokenIdOf(alice), 1);
        assertEq(core.ownerOf(1), alice);
        assertEq(token.balanceOf(alice), core.REWARD_AMOUNT());
        assertEq(agent.pendingData(alice).length, 0);
    }

    function test_ScoreNow_OneShot() public {
        agent.scoreNow(bob);
        (, , , , IPrivaScoreCore.RequestStatus status,) = core.scores(bob);
        assertEq(uint8(status), uint8(IPrivaScoreCore.RequestStatus.Settled));
        assertEq(core.ownerOf(1), bob);
    }

    // ─── HTTP path with etched mock ──────────────────────────────────────────

    function test_FetchData_RealMode_CallsHTTPPrecompile() public {
        agent.setMockMode(false);
        agent.setDefaultExecutor(address(0xE11E));

        agent.fetchData(alice, "https://example.com/api", address(0xE11E));

        bytes memory pending = agent.pendingData(alice);
        assertTrue(pending.length > 0);

        (, , , , IPrivaScoreCore.RequestStatus status,) = core.scores(alice);
        assertEq(uint8(status), uint8(IPrivaScoreCore.RequestStatus.DataFetched));
    }

    // ─── LLM parse ───────────────────────────────────────────────────────────

    function test_AnalyzeScore_ParsesLLMResponse_Correctly() public {
        agent.setMockMode(false);
        agent.setDefaultExecutor(address(0xE11E));

        // Real-mode fetch leaves pendingData (does not settle inline)
        agent.fetchData(bob, "https://example.com/api", address(0xE11E));
        agent.analyzeScore(0, bob);

        (uint256 score, uint8 tier,,, IPrivaScoreCore.RequestStatus status, string memory reasoning) =
            core.scores(bob);

        assertEq(uint8(status), uint8(IPrivaScoreCore.RequestStatus.Settled));
        // MockLLM includes "score":742 -> tier High (2) by on-chain thresholds
        assertEq(score, 742);
        assertEq(tier, 2);
        assertTrue(bytes(reasoning).length > 0);
    }

    // ─── SBT mint / update ───────────────────────────────────────────────────

    function test_FulfillScore_MintsSBT_OnFirstRequest() public {
        agent.fetchData(alice);

        assertEq(core.balanceOf(alice), 1);
        assertEq(core.tokenIdOf(alice), 1);
        assertEq(core.ownerOf(1), alice);
        assertEq(core.scoredUserCount(), 1);
    }

    function test_FulfillScore_UpdatesExistingSBT_OnSubsequentRequest() public {
        agent.fetchData(alice);
        uint256 tid1 = core.tokenIdOf(alice);
        (uint256 score1,,,,,) = core.scores(alice);

        // Second scoring cycle — same token id
        vm.roll(block.number + 10);
        agent.fetchData(alice);

        uint256 tid2 = core.tokenIdOf(alice);
        assertEq(tid1, tid2);
        assertEq(core.balanceOf(alice), 1);
        // Reward only once
        assertEq(token.balanceOf(alice), core.REWARD_AMOUNT());

        (uint256 score2,,,, IPrivaScoreCore.RequestStatus status,) = core.scores(alice);
        assertEq(uint8(status), uint8(IPrivaScoreCore.RequestStatus.Settled));
        assertTrue(score2 <= 999);
        score1;
    }

    // ─── Access control ──────────────────────────────────────────────────────

    function test_RevertWhen_NonAgent_CallsFulfillScore() public {
        vm.prank(alice);
        vm.expectRevert(PrivaScoreCore.OnlyAgent.selector);
        core.fulfillScore(alice, 100, 0, bytes32(0), "nope");
    }

    function test_SBT_CannotBeTransferred() public {
        agent.fetchData(alice);

        vm.prank(alice);
        vm.expectRevert(PrivaScoreCore.Soulbound.selector);
        core.transferFrom(alice, bob, 1);

        vm.prank(alice);
        vm.expectRevert(PrivaScoreCore.Soulbound.selector);
        core.approve(bob, 1);
    }

    // ─── Scheduler registration ──────────────────────────────────────────────

    function test_ScheduleRegistration_CalledAfterFetchData() public {
        // Scheduler only used in real (non-mock) mode
        agent.setMockMode(false);
        agent.setDefaultExecutor(address(0xE11E));
        uint256 before = mockScheduler.scheduleCount();
        agent.fetchData(alice, "https://example.com/api", address(0xE11E));
        assertEq(mockScheduler.scheduleCount(), before + 1);
        assertEq(mockScheduler.lastCaller(), address(agent));
        assertTrue(mockScheduler.lastData().length >= 4);
        assertTrue(agent.lastScheduleId(alice) > 0);
        assertTrue(agent.analyzePending(alice));
    }

    // ─── Mock mode ownership ─────────────────────────────────────────────────

    function test_ToggleMockMode_OnlyOwner() public {
        agent.setMockMode(false);
        assertFalse(agent.mockMode());
        agent.setMockMode(true);
        assertTrue(agent.mockMode());

        vm.prank(alice);
        vm.expectRevert();
        agent.setMockMode(false);
    }

    // ─── AsyncDelivery auth ──────────────────────────────────────────────────

    function test_RevertWhen_Callback_NotFromAsyncDelivery() public {
        vm.prank(alice);
        vm.expectRevert(PrivaScoreAgent.UnauthorizedCallback.selector);
        agent.onAsyncDelivery(bytes32(uint256(1)), bytes("hi"));
    }

    function test_Callback_FromAsyncDelivery_Succeeds() public {
        vm.prank(ASYNC_DELIVERY);
        agent.onAsyncDelivery(bytes32(uint256(42)), bytes("ok"));
        assertEq(agent.lastDeliveryResult(), "ok");
    }

    // ─── tokenURI ────────────────────────────────────────────────────────────

    function test_TokenURI_ReturnsDataUri() public {
        agent.fetchData(alice);
        string memory uri = core.tokenURI(1);
        assertTrue(bytes(uri).length > 30);
        // starts with data:application/json;base64,
        bytes memory b = bytes(uri);
        assertEq(b[0], "d");
        assertEq(b[1], "a");
        assertEq(b[2], "t");
        assertEq(b[3], "a");
    }

    // ─── Auto-execute schedule path ──────────────────────────────────────────

    function test_FullFlow_WithAutoScheduler() public {
        // Real mode: schedule auto-executes analyze via mock scheduler
        agent.setMockMode(false);
        agent.setDefaultExecutor(address(0xE11E));
        mockScheduler.setAutoExecute(true);
        agent.fetchData(alice, "https://example.com/api", address(0xE11E));

        (, , , , IPrivaScoreCore.RequestStatus status,) = core.scores(alice);
        assertEq(uint8(status), uint8(IPrivaScoreCore.RequestStatus.Settled));
        assertEq(core.ownerOf(1), alice);
    }
}
