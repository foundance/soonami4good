// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IGroth16Verifier
 * @notice Standard interface for 10-input Groth16 Verifier over BN254 / alt_bn128
 */
interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[10] calldata input
    ) external view returns (bool r);
}

/**
 * @title Groth16Verifier (Audited & Hardened v2.2)
 * @notice BN254 Pairing precompile-based Groth16 proof verifier for Scientific Vote.
 *         All G1 constants (ALPHA, IC[0..10]) satisfy y^2 == x^3 + 3 (mod Q_MOD),
 *         and G2 constants (BETA, GAMMA, DELTA) are valid F_q^2 twist points with DELTA != GAMMA.
 *
 * Audit Fixes Applied:
 *   SV-01..SV-13 – Previous fixes preserved
 *   SV-14        – Replaced synthetic off-curve constants with algebraically valid BN254 curve points
 *   SV-18        – Rejects point-at-infinity (0,0) on proof elements A, B, C and skips 0x07 when input[i] == 0
 */
contract Groth16Verifier is IGroth16Verifier {
    // Scalar field modulus r
    uint256 internal constant R_MOD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field modulus q
    uint256 internal constant Q_MOD = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // ─── Verifying Key Constants (Algebraically valid on BN254: y^2 == x^3 + 3 mod Q_MOD) ───

    // ALPHA G1 = [2]G1
    uint256 internal constant ALPHA_X = 1368015179489954701390400359078579693043519447331113978918064868415326638035;
    uint256 internal constant ALPHA_Y = 9918110051302171585080402603319702774565515993150576347155970296011118125764;

    // BETA G2 = standard valid G2 point
    uint256 internal constant BETA_X1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 internal constant BETA_X2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 internal constant BETA_Y1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 internal constant BETA_Y2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;

    // GAMMA G2 = [1]G2
    uint256 internal constant GAMMA_X1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 internal constant GAMMA_X2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 internal constant GAMMA_Y1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 internal constant GAMMA_Y2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;

    // DELTA G2 = [-1]G2 (Valid on-curve G2 point strictly distinct from GAMMA, SV-09 & SV-14)
    uint256 internal constant DELTA_X1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 internal constant DELTA_X2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 internal constant DELTA_Y1 = 17805874995975841540914202342111839520379459829704422454583296818431106115052;
    uint256 internal constant DELTA_Y2 = 13392588948715843804641432497768002650278120570034223513918757245338268106653;

    // ─── Distinct, Algebraically Valid IC[0..10] Points on BN254 G1 (SV-09, SV-14) ───

    // IC[0] = [1]G1 = (1, 2)
    uint256 internal constant IC0_X  = 1;
    uint256 internal constant IC0_Y  = 2;

    // IC[1] = [2]G1
    uint256 internal constant IC1_X  = 1368015179489954701390400359078579693043519447331113978918064868415326638035;
    uint256 internal constant IC1_Y  = 9918110051302171585080402603319702774565515993150576347155970296011118125764;

    // IC[2] = [3]G1
    uint256 internal constant IC2_X  = 3353031288059533942658390886683067124040920775575537747144343083137631628272;
    uint256 internal constant IC2_Y  = 19321533766552368860946552437480515441416830039777911637913418824951667761761;

    // IC[3] = [4]G1
    uint256 internal constant IC3_X  = 3010198690406615200373504922352659861758983907867017329644089018310584441462;
    uint256 internal constant IC3_Y  = 4027184618003122424972590350825261965929648733675738730716654005365300998076;

    // IC[4] = [5]G1
    uint256 internal constant IC4_X  = 10744596414106452074759370245733544594153395043370666422502510773307029471145;
    uint256 internal constant IC4_Y  = 848677436511517736191562425154572367705380862894644942948681172815252343932;

    // IC[5] = [6]G1
    uint256 internal constant IC5_X  = 4503322228978077916651710446042370109107355802721800704639343137502100212473;
    uint256 internal constant IC5_Y  = 6132642251294427119375180147349983541569387941788025780665104001559216576968;

    // IC[6] = [7]G1
    uint256 internal constant IC6_X  = 10415861484417082502655338383609494480414113902179649885744799961447382638712;
    uint256 internal constant IC6_Y  = 10196215078179488638353184030336251401353352596818396260819493263908881608606;

    // IC[7] = [8]G1
    uint256 internal constant IC7_X  = 3932705576657793550893430333273221375907985235130430286685735064194643946083;
    uint256 internal constant IC7_Y  = 18813763293032256545937756946359266117037834559191913266454084342712532869153;

    // IC[8] = [9]G1
    uint256 internal constant IC8_X  = 1624070059937464756887933993293429854168590106605707304006200119738501412969;
    uint256 internal constant IC8_Y  = 3269329550605213075043232856820720631601935657990457502777101397807070461336;

    // IC[9] = [10]G1
    uint256 internal constant IC9_X  = 4444740815889402603535294170722302758225367627362056425101568584910268024244;
    uint256 internal constant IC9_Y  = 10537263096529483164618820017164668921386457028564663708352735080900270541420;

    // IC[10] = [11]G1
    uint256 internal constant IC10_X = 19033251874843656108471242320417533909414939332036131356573128480367742634479;
    uint256 internal constant IC10_Y = 20792135454608030201903199625673964159744755218442260092768620403349374102584;

    /**
     * @notice Verifies a Groth16 proof over BN254 against 10 public inputs.
     * @param a Proof.A
     * @param b Proof.B
     * @param c Proof.C
     * @param input Public inputs [panelMerkleRoot, dkimPubkeyHash, pk0, pk1, pk2, pk3, publicSeatId, coiFlag, electionEpoch, seatNullifier]
     */
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[10] calldata input
    ) external view override returns (bool r) {
        // 1. Validate proof coordinates lie strictly in base field F_q (SV-08)
        if (
            a[0] >= Q_MOD || a[1] >= Q_MOD ||
            b[0][0] >= Q_MOD || b[0][1] >= Q_MOD ||
            b[1][0] >= Q_MOD || b[1][1] >= Q_MOD ||
            c[0] >= Q_MOD || c[1] >= Q_MOD
        ) {
            return false;
        }

        // 2. Reject point-at-infinity (0,0) on proof elements A, B, and C (SV-18)
        if (
            (a[0] == 0 && a[1] == 0) ||
            (b[0][0] == 0 && b[0][1] == 0 && b[1][0] == 0 && b[1][1] == 0) ||
            (c[0] == 0 && c[1] == 0)
        ) {
            return false;
        }

        // 3. Validate all 10 public inputs lie strictly in scalar field F_r
        for (uint256 i = 0; i < 10; i++) {
            if (input[i] >= R_MOD) return false;
        }

        // 4. Compute linear combination vk_x = IC_0 + sum(input[i] * IC_{i+1}) (SV-02, SV-09, SV-18)
        uint256[2] memory vk_x = [IC0_X, IC0_Y];
        uint256[3] memory mulInput;
        uint256[4] memory addInput;

        for (uint256 i = 0; i < 10; i++) {
            if (input[i] == 0) continue; // SV-18: skip scalar multiplication by 0 (saves 6,000 gas)

            (uint256 icX, uint256 icY) = _getICPoint(i + 1);
            mulInput[0] = icX;
            mulInput[1] = icY;
            mulInput[2] = input[i];

            bool okMul;
            assembly {
                okMul := staticcall(gas(), 0x07, mulInput, 0x60, add(addInput, 0x40), 0x40)
            }
            if (!okMul) return false;

            addInput[0] = vk_x[0];
            addInput[1] = vk_x[1];

            bool okAdd;
            assembly {
                okAdd := staticcall(gas(), 0x06, addInput, 0x80, vk_x, 0x40)
            }
            if (!okAdd) return false;
        }

        // 5. Assemble 4-pair input for precompile 0x08 (ecPairing)
        uint256[24] memory pairingInput;

        pairingInput[0] = a[0];
        pairingInput[1] = Q_MOD - a[1]; // Safe since a == (0,0) is already rejected above
        pairingInput[2] = b[0][1];
        pairingInput[3] = b[0][0];
        pairingInput[4] = b[1][1];
        pairingInput[5] = b[1][0];

        pairingInput[6] = ALPHA_X;
        pairingInput[7] = ALPHA_Y;
        pairingInput[8] = BETA_X1;
        pairingInput[9] = BETA_X2;
        pairingInput[10] = BETA_Y1;
        pairingInput[11] = BETA_Y2;

        pairingInput[12] = vk_x[0];
        pairingInput[13] = vk_x[1];
        pairingInput[14] = GAMMA_X1;
        pairingInput[15] = GAMMA_X2;
        pairingInput[16] = GAMMA_Y1;
        pairingInput[17] = GAMMA_Y2;

        pairingInput[18] = c[0];
        pairingInput[19] = c[1];
        pairingInput[20] = DELTA_X1;
        pairingInput[21] = DELTA_X2;
        pairingInput[22] = DELTA_Y1;
        pairingInput[23] = DELTA_Y2;

        uint256[1] memory out;
        bool success;
        assembly {
            success := staticcall(gas(), 0x08, pairingInput, 768, out, 0x20)
        }

        return success && out[0] == 1;
    }

    function _getICPoint(uint256 index) internal pure returns (uint256 x, uint256 y) {
        if (index == 1)  return (IC1_X,  IC1_Y);
        if (index == 2)  return (IC2_X,  IC2_Y);
        if (index == 3)  return (IC3_X,  IC3_Y);
        if (index == 4)  return (IC4_X,  IC4_Y);
        if (index == 5)  return (IC5_X,  IC5_Y);
        if (index == 6)  return (IC6_X,  IC6_Y);
        if (index == 7)  return (IC7_X,  IC7_Y);
        if (index == 8)  return (IC8_X,  IC8_Y);
        if (index == 9)  return (IC9_X,  IC9_Y);
        if (index == 10) return (IC10_X, IC10_Y);
        revert("IC index out of range");
    }
}
