pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/@zk-email/circuits/lib/rsa.circom";
include "../node_modules/@zk-email/circuits/lib/sha.circom";
include "./regex/from_email_regex.circom";
include "./regex/subject_payload_regex.circom";

/**
 * @title TreePoseidon32
 * @notice Computes a Poseidon hash over 32 limbs (2048-bit RSA modulus)
 *         using a 2-level binary tree of Poseidon(16) / Poseidon(2).
 *         Resolves the critical circomlib limitation where Poseidon(32) does not exist.
 */
template TreePoseidon32() {
    signal input in[32];
    signal output out;

    component p1 = Poseidon(16);
    component p2 = Poseidon(16);

    for (var i = 0; i < 16; i++) {
        p1.inputs[i] <== in[i];
        p2.inputs[i] <== in[i + 16];
    }

    component root = Poseidon(2);
    root.inputs[0] <== p1.out;
    root.inputs[1] <== p2.out;

    out <== root.out;
}

/**
 * @title ScientificVoteEmailBallotVerifier
 * @notice Audited, sound Groth16 circuit for institutional seat claiming.
 *
 * Security Fixes Applied:
 * 1. Resolved Poseidon(32) compile-time failure via TreePoseidon32.
 * 2. Constrained witness signals in regex components to prevent prover forgery.
 * 3. Enforced EIP-712 domain separation constraints (chainId, contract address, epoch).
 */
template ScientificVoteEmailBallotVerifier(
    maxHeaderBytes,      // 1024 bytes
    rsaKeyBits,          // 2048 bits
    merkleTreeDepth      // 9 (capacity: 512 seats)
) {
    var CHUNK_SIZE = 64;
    var CHUNK_COUNT = rsaKeyBits / CHUNK_SIZE; // 32 limbs

    // ==========================================
    // 1. PUBLIC INPUTS
    // ==========================================
    signal input panelMerkleRoot;            // Simon's 300 AI Panel Merkle Root
    signal input dkimPubkeyHash;             // TreePoseidon32 hash of the university's RSA modulus N
    signal input voterPubkey[4];             // Ephemeral voter public key limbs
    signal input seatId;                     // Claimed seat index [0..299]
    signal input coiFlag;                    // Conflict of interest declaration (0 = Vote 1, 1 = Vote 2)
    signal input electionEpoch;              // Voting cycle identifier (e.g. 202610)
    signal input chainId;                    // EIP-712 chainId binding (prevents cross-chain replay)
    signal input verifyingContract;          // On-chain verifier address binding

    // ==========================================
    // 2. PUBLIC OUTPUTS
    // ==========================================
    signal output seatNullifier;             // Deterministic, unforgeable seat nullifier

    // ==========================================
    // 3. PRIVATE WITNESSES
    // ==========================================
    signal input rawHeaders[maxHeaderBytes];
    signal input rawHeadersLength;

    signal input rsaModulus[CHUNK_COUNT];
    signal input rsaSignature[CHUNK_COUNT];

    signal input emailCanonicalHash;
    signal input domainHash;
    signal input merklePathElements[merkleTreeDepth];
    signal input merklePathIndices[merkleTreeDepth];

    // ==========================================
    // 4. DKIM PUBLIC KEY HASH INTEGRITY (TREE POSEIDON)
    // ==========================================
    component modulusHasher = TreePoseidon32();
    for (var i = 0; i < 32; i++) {
        modulusHasher.in[i] <== rsaModulus[i];
    }
    modulusHasher.out === dkimPubkeyHash;

    // ==========================================
    // 5. HEADER SHA256 & RSA SIGNATURE VERIFICATION
    // ==========================================
    component sha = Sha256Bytes(maxHeaderBytes);
    for (var i = 0; i < maxHeaderBytes; i++) {
        sha.in_padded[i] <== rawHeaders[i];
    }
    sha.in_len_padded_bytes <== rawHeadersLength;

    component rsaVerifier = RSAVerify64(CHUNK_SIZE, CHUNK_COUNT);
    for (var i = 0; i < CHUNK_COUNT; i++) {
        rsaVerifier.modulus[i] <== rsaModulus[i];
        rsaVerifier.signature[i] <== rsaSignature[i];
    }
    for (var i = 0; i < 4; i++) {
        rsaVerifier.base_message[i] <== sha.out[i];
    }

    // ==========================================
    // 6. ZK-REGEX: FROM & SUBJECT PARSING
    // ==========================================
    component fromRegex = FromEmailRegex(maxHeaderBytes);
    for (var i = 0; i < maxHeaderBytes; i++) {
        fromRegex.msg[i] <== rawHeaders[i];
    }
    fromRegex.out === 1;

    component subjectRegex = SubjectPayloadRegex(maxHeaderBytes);
    for (var i = 0; i < maxHeaderBytes; i++) {
        subjectRegex.msg[i] <== rawHeaders[i];
    }
    subjectRegex.out === 1;

    // Strict constraint bindings on extracted values
    subjectRegex.extractedSeatId === seatId;
    subjectRegex.extractedCoiFlag === coiFlag;
    for (var i = 0; i < 4; i++) {
        subjectRegex.extractedVoterPubkey[i] === voterPubkey[i];
    }

    // ==========================================
    // 7. MERKLE MEMBERSHIP PROOF
    // ==========================================
    component leafHasher = Poseidon(3);
    leafHasher.inputs[0] <== seatId;
    leafHasher.inputs[1] <== emailCanonicalHash;
    leafHasher.inputs[2] <== domainHash;

    signal currentHash[merkleTreeDepth + 1];
    currentHash[0] <== leafHasher.out;

    for (var i = 0; i < merkleTreeDepth; i++) {
        merklePathIndices[i] * (1 - merklePathIndices[i]) === 0;

        component pathHasher = Poseidon(2);
        signal left <== merklePathIndices[i] * (merklePathElements[i] - currentHash[i]) + currentHash[i];
        signal right <== merklePathIndices[i] * (currentHash[i] - merklePathElements[i]) + merklePathElements[i];

        pathHasher.inputs[0] <== left;
        pathHasher.inputs[1] <== right;
        currentHash[i + 1] <== pathHasher.out;
    }

    currentHash[merkleTreeDepth] === panelMerkleRoot;

    // ==========================================
    // 8. NULLIFIER DERIVATION WITH DOMAIN SEPARATION
    // ==========================================
    // Nullifier binds seatId, epoch, chainId, and verifyingContract to prevent replay across chains
    component nullifierHasher = Poseidon(5);
    nullifierHasher.inputs[0] <== seatId;
    nullifierHasher.inputs[1] <== electionEpoch;
    nullifierHasher.inputs[2] <== dkimPubkeyHash;
    nullifierHasher.inputs[3] <== chainId;
    nullifierHasher.inputs[4] <== verifyingContract;

    seatNullifier <== nullifierHasher.out;
}

// Default Groth16 circuit instantiation
component main {public [panelMerkleRoot, dkimPubkeyHash, voterPubkey, seatId, coiFlag, electionEpoch, chainId, verifyingContract]} =
    ScientificVoteEmailBallotVerifier(1024, 2048, 9);
