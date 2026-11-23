// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Groth16Verifier.sol";

/**
 * @title IP256Verifier
 * @notice Optional 4-byte selector interface if a non-raw P-256 verifier contract is used
 */
interface IP256Verifier {
    function verify(bytes32 messageHash, bytes32 r, bytes32 s, uint256 qx, uint256 qy) external view returns (bool);
}

/**
 * @title PanelRegistry (Audited & Hardened v2.2)
 * @notice On-chain registry for the 2026 AI Scientific Vote (soonami4good / zk-cirket).
 *
 * Audit Fixes Applied:
 *   SV-15 – Uses sha256() for domainSeparatedHash (matching WebCrypto ECDSA SHA-256) and binds nullifier, publicSeatId, and coiFlag
 *   SV-16 – Enforces non-zero & upper bounds on r and s; supports raw 160-byte EIP-7212 fallback (Daimo/OZ) plus 4-byte selector
 *   SV-17 – Separates Vote 1 (coiFlag == 0) named seat claims from Vote 2 (coiFlag == 1) so Stakeholders cannot lock out Scientists
 */
contract PanelRegistry {
    // -------------------------------------------------------------
    // Constants & Immutables
    // -------------------------------------------------------------
    string public constant PANEL_ID = "ai-2026-q4";
    uint256 public constant MAX_PANEL_SEATS = 300;

    /// @notice RIP-7212 secp256r1 (P-256) precompile address
    address internal constant P256_PRECOMPILE = address(0x0100);

    /// @notice P-256 curve order n and n/2 for strict range & low-s malleability checks (SV-10, SV-16)
    uint256 internal constant P256_N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;
    uint256 internal constant P256_HALF_N = 0x7FFFFFFF800000007FFFFFFFFFFFFFFFDE737D56D38BCF4279DCE5617E3192A8;

    /// @notice Domain separator prefix for ballot hash binding (SV-11, SV-15)
    bytes32 internal constant BALLOT_DOMAIN_PREFIX = keccak256("PanelRegistry.BallotVote.v1");

    uint256 public immutable electionEpoch;   // e.g., 202610
    uint256 public immutable panelMerkleRoot; // Poseidon root of Simon's 300 AI scientists
    uint256 public immutable votingClosesAt;  // e.g., 2026-11-10 23:59:59 UTC (1794355199)
    IGroth16Verifier public immutable verifier;
    address public immutable safeTreasury;

    // -------------------------------------------------------------
    // State Variables
    // -------------------------------------------------------------
    bool public paused;
    uint256 public totalBallotsCast;

    /// @notice Cohort-separated ballot counters (SV-12)
    uint256 public totalScientificBallots;   // coiFlag == 0 (Vote 1)
    uint256 public totalStakeholderBallots;  // coiFlag == 1 (Vote 2)

    /// @notice Optional software-based P-256 fallback verifier for L1 Mainnet (SV-10, SV-16)
    address public p256FallbackVerifier;

    /// @notice Whitelisted Poseidon hashes of DNSSEC-verified institutional & ORCID DKIM RSA moduli (SV-07)
    mapping(uint256 => bool) public isValidDkimKeyHash;

    /// @notice Nullifier double-claim tracking: seatNullifier => isSpent (SV-03)
    mapping(uint256 => bool) public isNullifierSpent;

    /// @notice Cohort-separated seat claim tracking: coiFlag (0 or 1) => publicSeatId (1..300) => isClaimed (SV-04, SV-17)
    mapping(uint8 => mapping(uint256 => bool)) public isCohortSeatClaimed;

    /// @notice Recorded ballot hashes indexed by nullifier (preserves anonymity when publicSeatId == 0, SV-06)
    mapping(uint256 => bytes32) public nullifierToBallotHash;

    /// @notice Recorded voter P-256 public keys indexed by nullifier
    mapping(uint256 => bytes) public nullifierToVoterPubkey;

    // -------------------------------------------------------------
    // Custom Errors
    // -------------------------------------------------------------
    error ContractPaused();
    error OnlySafeTreasury();
    error InvalidAddress();
    error VotingWindowClosed();
    error InvalidMerkleRoot();
    error InvalidElectionEpoch();
    error UnregisteredDkimKeyHash(uint256 dkimPubkeyHash);
    error InvalidSeatIdBounds(uint256 publicSeatId);
    error InvalidCoiFlag(uint256 coiFlag);
    error NullifierAlreadySpent(uint256 nullifier);
    error SeatAlreadyClaimed(uint8 coiFlag, uint256 publicSeatId);
    error InvalidVoterPubkeyLength();
    error VoterPubkeyLimbMismatch();
    error InvalidP256BallotSignature();
    error InvalidGroth16Proof();
    error ScientificSeatCapReached();
    error EcdsaInvalidOrMalleableSig();

    // -------------------------------------------------------------
    // Events
    // -------------------------------------------------------------
    event DkimKeyHashUpdated(uint256 indexed dkimKeyHash, bool allowed);
    event P256FallbackVerifierUpdated(address indexed newVerifier);

    event SeatClaimedAndBallotCast(
        uint256 indexed nullifier,
        uint256 indexed publicSeatId, // 1..300 if named, 0 if anonymous (#anon toggle)
        uint8 coiFlag,
        bytes32 indexed ballotHash,
        bytes voterPubkey,
        uint256 timestamp
    );

    event EmergencyPaused(address indexed trigger);
    event EmergencyUnpaused(address indexed trigger);

    // -------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------
    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    modifier onlySafe() {
        if (msg.sender != safeTreasury) revert OnlySafeTreasury();
        _;
    }

    constructor(
        uint256 _panelMerkleRoot,
        uint256 _electionEpoch,
        uint256 _votingClosesAt,
        address _verifierAddress,
        address _safeTreasury,
        uint256[] memory _initialDkimKeyHashes
    ) {
        if (_verifierAddress == address(0) || _safeTreasury == address(0)) {
            revert InvalidAddress();
        }

        panelMerkleRoot = _panelMerkleRoot;
        electionEpoch = _electionEpoch;
        votingClosesAt = _votingClosesAt;
        verifier = IGroth16Verifier(_verifierAddress);
        safeTreasury = _safeTreasury;

        for (uint256 i = 0; i < _initialDkimKeyHashes.length; i++) {
            isValidDkimKeyHash[_initialDkimKeyHashes[i]] = true;
            emit DkimKeyHashUpdated(_initialDkimKeyHashes[i], true);
        }
    }

    /**
     * @notice Atomically verifies the ZK-Email Groth16 proof, checks voter key binding,
     *         verifies the WebCrypto ECDSA P-256 signature over a domain-separated `ballotHash`,
     *         and seals the vote.
     */
    function claimAndCastBallot(
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC,
        uint256[10] calldata publicInputs,
        bytes calldata voterPubkey,
        bytes32 ballotHash,
        bytes32 ballotSigR,
        bytes32 ballotSigS
    ) external whenNotPaused {
        if (block.timestamp > votingClosesAt) revert VotingWindowClosed();

        // 1. Validate Public Input Invariants (SV-07)
        if (publicInputs[0] != panelMerkleRoot) revert InvalidMerkleRoot();
        if (publicInputs[8] != electionEpoch) revert InvalidElectionEpoch();
        if (!isValidDkimKeyHash[publicInputs[1]]) revert UnregisteredDkimKeyHash(publicInputs[1]);

        uint256 publicSeatId = publicInputs[6];
        if (publicSeatId > MAX_PANEL_SEATS) revert InvalidSeatIdBounds(publicSeatId);

        // Strict range check on coiFlag bits (SV-05)
        if (publicInputs[7] > 1) revert InvalidCoiFlag(publicInputs[7]);
        // casting to uint8 is safe because publicInputs[7] <= 1
        uint8 coiFlag = uint8(publicInputs[7]);

        // SV-12: Enforce 300-seat cap for Vote 1 Scientific cohort
        if (coiFlag == 0 && totalScientificBallots >= MAX_PANEL_SEATS) {
            revert ScientificSeatCapReached();
        }

        // Enforce nullifier has not been spent (SV-03)
        uint256 nullifier = publicInputs[9];
        if (isNullifierSpent[nullifier]) revert NullifierAlreadySpent(nullifier);

        // SV-04 & SV-17: Enforce cohort-separated seat claim so Vote 2 cannot lock out Vote 1
        if (publicSeatId != 0 && isCohortSeatClaimed[coiFlag][publicSeatId]) {
            revert SeatAlreadyClaimed(coiFlag, publicSeatId);
        }

        // 2. Cryptographically Bind & Extract `voterPubkey` (SV-03)
        (uint256 pubX, uint256 pubY) = _validateAndExtractPubkey(voterPubkey, publicInputs);

        // 3. SV-10 & SV-16: Enforce non-zero r, s and low-s ECDSA malleability bound (s <= P256_N / 2)
        if (
            uint256(ballotSigR) == 0 ||
            uint256(ballotSigR) >= P256_N ||
            uint256(ballotSigS) == 0 ||
            uint256(ballotSigS) > P256_HALF_N
        ) {
            revert EcdsaInvalidOrMalleableSig();
        }

        // 4. SV-11 & SV-15: Domain-separated SHA-256 ballot hash binding (matches browser WebCrypto ECDSA SHA-256)
        bytes32 domainSeparatedHash = sha256(
            abi.encodePacked(
                BALLOT_DOMAIN_PREFIX,
                block.chainid,
                address(this),
                electionEpoch,
                nullifier,
                publicSeatId,
                coiFlag,
                ballotHash
            )
        );

        // 5. Verify Browser WebCrypto ECDSA P-256 Signature over domain-separated hash
        if (!_verifyP256Signature(domainSeparatedHash, ballotSigR, ballotSigS, pubX, pubY)) {
            revert InvalidP256BallotSignature();
        }

        // 6. Verify Groth16 ZK-Email Proof
        if (!verifier.verifyProof(proofA, proofB, proofC, publicInputs)) {
            revert InvalidGroth16Proof();
        }

        // 7. Commit State Effects
        isNullifierSpent[nullifier] = true;
        if (publicSeatId != 0) {
            isCohortSeatClaimed[coiFlag][publicSeatId] = true;
        }
        nullifierToVoterPubkey[nullifier] = voterPubkey;
        nullifierToBallotHash[nullifier] = ballotHash;

        if (coiFlag == 0) {
            unchecked { totalScientificBallots += 1; }
        } else {
            unchecked { totalStakeholderBallots += 1; }
        }
        unchecked {
            totalBallotsCast += 1;
        }

        emit SeatClaimedAndBallotCast(
            nullifier,
            publicSeatId,
            coiFlag,
            ballotHash,
            voterPubkey,
            block.timestamp
        );
    }

    /**
     * @dev Validates voterPubkey format (65 bytes: 0x04 || X || Y) and ensures limb decomposition
     *      matches publicInputs[2..5] (SV-03).
     */
    function _validateAndExtractPubkey(
        bytes calldata voterPubkey,
        uint256[10] calldata publicInputs
    ) internal pure returns (uint256 pubX, uint256 pubY) {
        if (voterPubkey.length != 65 || voterPubkey[0] != 0x04) {
            revert InvalidVoterPubkeyLength();
        }
        assembly {
            pubX := calldataload(add(voterPubkey.offset, 1))
            pubY := calldataload(add(voterPubkey.offset, 33))
        }
        if (
            (pubX >> 128) != publicInputs[2] ||
            (pubX & type(uint128).max) != publicInputs[3] ||
            (pubY >> 128) != publicInputs[4] ||
            (pubY & type(uint128).max) != publicInputs[5]
        ) {
            revert VoterPubkeyLimbMismatch();
        }
    }

    /**
     * @dev Calls the RIP-7212 secp256r1 precompile at 0x0100, falling back to either a raw
     *      EIP-7212 fallback contract (Daimo/OZ) or the IP256Verifier.verify selector on L1 Mainnet (SV-16).
     */
    function _verifyP256Signature(
        bytes32 messageHash,
        bytes32 r,
        bytes32 s,
        uint256 qx,
        uint256 qy
    ) internal view returns (bool) {
        bytes memory args = abi.encode(messageHash, r, s, qx, qy);

        // 1. Try native RIP-7212 precompile at 0x0100
        (bool ok, bytes memory ret) = P256_PRECOMPILE.staticcall(args);
        if (ok && ret.length == 32 && abi.decode(ret, (uint256)) == 1) {
            return true;
        }

        // 2. Fallback to software P-256 verifier on L1 Mainnet (SV-10, SV-16)
        address fallbackAddr = p256FallbackVerifier;
        if (fallbackAddr != address(0)) {
            // Try standard raw 160-byte EIP-7212 fallback call first (e.g., Daimo P256Verifier)
            (bool okRaw, bytes memory retRaw) = fallbackAddr.staticcall(args);
            if (okRaw && retRaw.length == 32 && abi.decode(retRaw, (uint256)) == 1) {
                return true;
            }
            // Fallback to explicit 4-byte IP256Verifier.verify(...) selector
            (bool okSel, bytes memory retSel) = fallbackAddr.staticcall(
                abi.encodeWithSelector(IP256Verifier.verify.selector, messageHash, r, s, qx, qy)
            );
            if (okSel && retSel.length == 32 && abi.decode(retSel, (bool))) {
                return true;
            }
        }

        return false;
    }

    // -------------------------------------------------------------
    // Safe / Zodiac Governance Administration
    // -------------------------------------------------------------
    function setDkimKeyHashes(uint256[] calldata hashes, bool allowed) external onlySafe {
        for (uint256 i = 0; i < hashes.length; i++) {
            isValidDkimKeyHash[hashes[i]] = allowed;
            emit DkimKeyHashUpdated(hashes[i], allowed);
        }
    }

    function setP256FallbackVerifier(address _fallback) external onlySafe {
        p256FallbackVerifier = _fallback;
        emit P256FallbackVerifierUpdated(_fallback);
    }

    function pause() external onlySafe {
        paused = true;
        emit EmergencyPaused(msg.sender);
    }

    function unpause() external onlySafe {
        paused = false;
        emit EmergencyUnpaused(msg.sender);
    }
}
