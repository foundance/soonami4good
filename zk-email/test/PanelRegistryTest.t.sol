// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../contracts/Groth16Verifier.sol";
import "../contracts/PanelRegistry.sol";

contract PanelRegistryUnitTest {
    Groth16Verifier verifier;
    PanelRegistry registry;

    uint256 constant PANEL_ROOT = 0x1d8f4a92c3e084b17f99102a45b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e;
    uint256 constant EPOCH = 202610;
    uint256 constant VOTING_CLOSES = 1794355199; // 2026-11-10
    address constant TREASURY = address(0xCAFE);
    uint256 constant DKIM_HASH = 0x0028ab7104e931fa02c5e8011244e8bd7198c21a4f;

    uint256 constant P256_N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;
    uint256 constant P256_HALF_N = 0x7FFFFFFF800000007FFFFFFFFFFFFFFFDE737D56D38BCF4279DCE5617E3192A8;

    function setUp() public {
        verifier = new Groth16Verifier();
        uint256[] memory dkimHashes = new uint256[](1);
        dkimHashes[0] = DKIM_HASH;

        registry = new PanelRegistry(
            PANEL_ROOT,
            EPOCH,
            VOTING_CLOSES,
            address(verifier),
            TREASURY,
            dkimHashes
        );
    }

    function test_ConstantsAndSetup() public {
        setUp();
        require(registry.panelMerkleRoot() == PANEL_ROOT, "Merkle root mismatch");
        require(registry.electionEpoch() == EPOCH, "Epoch mismatch");
        require(registry.isValidDkimKeyHash(DKIM_HASH), "DKIM key hash not registered");
        require(registry.MAX_PANEL_SEATS() == 300, "Max seats mismatch");
    }

    function test_VerifierRejectsPointAtInfinity() public {
        setUp();
        uint256[2] memory a = [uint256(0), uint256(0)];
        uint256[2][2] memory b = [[uint256(1), uint256(2)], [uint256(3), uint256(4)]];
        uint256[2] memory c = [uint256(5), uint256(6)];
        uint256[10] memory input;

        bool res = verifier.verifyProof(a, b, c, input);
        require(!res, "SV-18: Must reject point-at-infinity (0,0) on A");
    }

    function test_VerifierRejectsPointAtInfinityOnC() public {
        setUp();
        uint256[2] memory a = [uint256(1), uint256(2)];
        uint256[2][2] memory b = [[uint256(1), uint256(2)], [uint256(3), uint256(4)]];
        uint256[2] memory c = [uint256(0), uint256(0)];
        uint256[10] memory input;

        bool res = verifier.verifyProof(a, b, c, input);
        require(!res, "SV-18: Must reject point-at-infinity (0,0) on C");
    }

    function test_CohortSeatSeparation() public {
        setUp();
        // SV-17: Seat claims are strictly partitioned by cohort mapping
        require(!registry.isCohortSeatClaimed(0, 42), "Sci seat 42 initially unclaimed");
        require(!registry.isCohortSeatClaimed(1, 42), "Stk seat 42 initially unclaimed");
    }

    function test_RevertOnInvalidMerkleRoot() public {
        setUp();
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[10] memory input;
        input[0] = 0xBAD; // invalid root

        bytes memory voterPub = new bytes(65);
        voterPub[0] = 0x04;

        try registry.claimAndCastBallot(a, b, c, input, voterPub, bytes32(0), bytes32(uint256(1)), bytes32(uint256(1))) {
            revert("Expected revert on invalid Merkle root");
        } catch (bytes memory reason) {
            bytes4 sel;
            assembly { sel := mload(add(reason, 0x20)) }
            require(sel == PanelRegistry.InvalidMerkleRoot.selector, "Expected InvalidMerkleRoot error");
        }
    }

    function test_RevertOnInvalidEpoch() public {
        setUp();
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[10] memory input;
        input[0] = PANEL_ROOT;
        input[8] = 999999; // invalid epoch

        bytes memory voterPub = new bytes(65);
        voterPub[0] = 0x04;

        try registry.claimAndCastBallot(a, b, c, input, voterPub, bytes32(0), bytes32(uint256(1)), bytes32(uint256(1))) {
            revert("Expected revert on invalid epoch");
        } catch (bytes memory reason) {
            bytes4 sel;
            assembly { sel := mload(add(reason, 0x20)) }
            require(sel == PanelRegistry.InvalidElectionEpoch.selector, "Expected InvalidElectionEpoch error");
        }
    }

    function test_RevertOnInvalidSeatIdBounds() public {
        setUp();
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[10] memory input;
        input[0] = PANEL_ROOT;
        input[8] = EPOCH;
        input[1] = DKIM_HASH;
        input[6] = 301; // exceeds MAX_PANEL_SEATS (300)

        bytes memory voterPub = new bytes(65);
        voterPub[0] = 0x04;

        try registry.claimAndCastBallot(a, b, c, input, voterPub, bytes32(0), bytes32(uint256(1)), bytes32(uint256(1))) {
            revert("Expected revert on seatId > 300");
        } catch (bytes memory reason) {
            bytes4 sel;
            assembly { sel := mload(add(reason, 0x20)) }
            require(sel == PanelRegistry.InvalidSeatIdBounds.selector, "Expected InvalidSeatIdBounds error");
        }
    }

    function test_RevertOnInvalidCoiFlag() public {
        setUp();
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[10] memory input;
        input[0] = PANEL_ROOT;
        input[8] = EPOCH;
        input[1] = DKIM_HASH;
        input[6] = 42;
        input[7] = 2; // invalid coiFlag (> 1)

        bytes memory voterPub = new bytes(65);
        voterPub[0] = 0x04;

        try registry.claimAndCastBallot(a, b, c, input, voterPub, bytes32(0), bytes32(uint256(1)), bytes32(uint256(1))) {
            revert("Expected revert on coiFlag > 1");
        } catch (bytes memory reason) {
            bytes4 sel;
            assembly { sel := mload(add(reason, 0x20)) }
            require(sel == PanelRegistry.InvalidCoiFlag.selector, "Expected InvalidCoiFlag error");
        }
    }

    function test_RevertOnHighSOrZeroBoundsSignature() public {
        setUp();
        uint256[2] memory a;
        uint256[2][2] memory b;
        uint256[2] memory c;
        uint256[10] memory input;
        input[0] = PANEL_ROOT;
        input[8] = EPOCH;
        input[1] = DKIM_HASH;
        input[6] = 42;
        input[7] = 0;
        input[9] = 12345; // nullifier

        // Valid 65-byte pubkey matching limbs
        bytes memory voterPub = new bytes(65);
        voterPub[0] = 0x04;
        // set dummy coordinates
        for (uint256 i = 1; i <= 64; i++) voterPub[i] = bytes1(uint8(i));

        uint256 pubX;
        uint256 pubY;
        assembly {
            pubX := mload(add(voterPub, 33))
            pubY := mload(add(voterPub, 65))
        }
        input[2] = pubX >> 128;
        input[3] = pubX & type(uint128).max;
        input[4] = pubY >> 128;
        input[5] = pubY & type(uint128).max;

        // Test SV-16: s == 0
        try registry.claimAndCastBallot(a, b, c, input, voterPub, bytes32(0), bytes32(uint256(1)), bytes32(uint256(0))) {
            revert("Expected revert on s == 0");
        } catch (bytes memory reason) {
            bytes4 sel;
            assembly { sel := mload(add(reason, 0x20)) }
            require(sel == PanelRegistry.EcdsaInvalidOrMalleableSig.selector, "Expected EcdsaInvalidOrMalleableSig for s == 0");
        }

        // Test SV-16: r == 0
        try registry.claimAndCastBallot(a, b, c, input, voterPub, bytes32(0), bytes32(uint256(0)), bytes32(uint256(1))) {
            revert("Expected revert on r == 0");
        } catch (bytes memory reason) {
            bytes4 sel;
            assembly { sel := mload(add(reason, 0x20)) }
            require(sel == PanelRegistry.EcdsaInvalidOrMalleableSig.selector, "Expected EcdsaInvalidOrMalleableSig for r == 0");
        }

        // Test SV-10 & SV-16: high-s malleability (s > P256_HALF_N)
        bytes32 highS = bytes32(P256_HALF_N + 1);
        try registry.claimAndCastBallot(a, b, c, input, voterPub, bytes32(0), bytes32(uint256(1)), highS) {
            revert("Expected revert on high s");
        } catch (bytes memory reason) {
            bytes4 sel;
            assembly { sel := mload(add(reason, 0x20)) }
            require(sel == PanelRegistry.EcdsaInvalidOrMalleableSig.selector, "Expected EcdsaInvalidOrMalleableSig for high s");
        }
    }
}
