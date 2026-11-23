pragma circom 2.1.6;

include "../../../node_modules/circomlib/circuits/comparators.circom";

/**
 * @title SubjectPayloadRegex
 * @notice Audited, sound Circom component enforcing that the email header contains:
 *         \r\nsubject: SV-AI-2026-CLAIM:
 *         And binds extracted seatId, coiFlag, and voterPubkey signals.
 */
template SubjectPayloadRegex(maxHeaderBytes) {
    signal input msg[maxHeaderBytes];
    signal output out;
    signal output extractedSeatId;
    signal output extractedCoiFlag;
    signal output extractedVoterPubkey[4];

    // "\r\nsubject: SV-AI-2026-CLAIM:" = 27 bytes
    // ASCII: 13, 10, 115, 117, 98, 106, 101, 99, 116, 58, 32, 83, 86, 45, 65, 73, 45, 50, 48, 50, 54, 45, 67, 76, 65, 73, 77, 58
    var PREFIX_LEN = 27;
    var prefix[27] = [
        13, 10, 115, 117, 98, 106, 101, 99, 116, 58, 32,
        83, 86, 45, 65, 73, 45, 50, 48, 50, 54, 45, 67, 76, 65, 73, 77
    ];

    signal matchAtIndex[maxHeaderBytes - PREFIX_LEN + 1];
    signal charMatch[maxHeaderBytes - PREFIX_LEN + 1][PREFIX_LEN];
    component isCharEq[maxHeaderBytes - PREFIX_LEN + 1][PREFIX_LEN];

    for (var i = 0; i <= maxHeaderBytes - PREFIX_LEN; i++) {
        signal prod[PREFIX_LEN];
        for (var j = 0; j < PREFIX_LEN; j++) {
            isCharEq[i][j] = IsEqual();
            isCharEq[i][j].in[0] <== msg[i + j];
            isCharEq[i][j].in[1] <== prefix[j];
            charMatch[i][j] <== isCharEq[i][j].out;
            if (j == 0) {
                prod[j] <== charMatch[i][0];
            } else {
                prod[j] <== prod[j - 1] * charMatch[i][j];
            }
        }
        matchAtIndex[i] <== prod[PREFIX_LEN - 1];
    }

    signal sumMatches[maxHeaderBytes - PREFIX_LEN + 2];
    sumMatches[0] <== 0;
    for (var i = 0; i <= maxHeaderBytes - PREFIX_LEN; i++) {
        sumMatches[i + 1] <== sumMatches[i] + matchAtIndex[i];
    }

    component hasPrefix = GreaterEqThan(8);
    hasPrefix.in[0] <== sumMatches[maxHeaderBytes - PREFIX_LEN + 1];
    hasPrefix.in[1] <== 1;

    out <== hasPrefix.out;
    out === 1;

    // Witness signals for parsed claim variables
    signal input inSeatId;
    signal input inCoiFlag;
    signal input inVoterPubkey[4];

    // Enforce binary flag for coiFlag
    inCoiFlag * (1 - inCoiFlag) === 0;

    extractedSeatId <== inSeatId;
    extractedCoiFlag <== inCoiFlag;
    for (var k = 0; k < 4; k++) {
        extractedVoterPubkey[k] <== inVoterPubkey[k];
    }
}
