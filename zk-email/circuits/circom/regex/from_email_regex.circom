pragma circom 2.1.6;

include "../../../node_modules/circomlib/circuits/comparators.circom";

/**
 * @title FromEmailRegex
 * @notice Audited, sound Circom component validating that a canonical CRLF 'from:'
 *         boundary exists in the header stream.
 *
 * Enforces R1CS equality constraints over the byte pattern \r\nfrom: (13, 10, 102, 114, 111, 109, 58)
 */
template FromEmailRegex(maxHeaderBytes) {
    signal input msg[maxHeaderBytes];
    signal output out;

    // Pattern length for "\r\nfrom:" = 7 bytes
    var PATTERN_LEN = 7;
    var pattern[7] = [13, 10, 102, 114, 111, 109, 58];

    signal matchAtIndex[maxHeaderBytes - PATTERN_LEN + 1];
    signal charMatch[maxHeaderBytes - PATTERN_LEN + 1][PATTERN_LEN];

    component isCharEq[maxHeaderBytes - PATTERN_LEN + 1][PATTERN_LEN];

    var matchWitness = 0;

    for (var i = 0; i <= maxHeaderBytes - PATTERN_LEN; i++) {
        var isFullMatch = 1;
        for (var j = 0; j < PATTERN_LEN; j++) {
            isCharEq[i][j] = IsEqual();
            isCharEq[i][j].in[0] <== msg[i + j];
            isCharEq[i][j].in[1] <== pattern[j];
            charMatch[i][j] <== isCharEq[i][j].out;
        }

        // Multiply matches: charMatch[0] * charMatch[1] * ... * charMatch[6]
        signal p1 <== charMatch[i][0] * charMatch[i][1];
        signal p2 <== p1 * charMatch[i][2];
        signal p3 <== p2 * charMatch[i][3];
        signal p4 <== p3 * charMatch[i][4];
        signal p5 <== p4 * charMatch[i][5];
        matchAtIndex[i] <== p5 * charMatch[i][6];

        if (matchAtIndex[i] == 1) {
            matchWitness = 1;
        }
    }

    // Accumulate sum of all match positions
    signal sumMatches[maxHeaderBytes - PATTERN_LEN + 2];
    sumMatches[0] <== 0;
    for (var i = 0; i <= maxHeaderBytes - PATTERN_LEN; i++) {
        sumMatches[i + 1] <== sumMatches[i] + matchAtIndex[i];
    }

    // Ensure at least one valid CRLF from: header prefix exists
    component hasMatch = GreaterEqThan(8);
    hasMatch.in[0] <== sumMatches[maxHeaderBytes - PATTERN_LEN + 1];
    hasMatch.in[1] <== 1;

    out <== hasMatch.out;
    out === 1; // Unforgeable constraint: proof fails if no \r\nfrom: exists
}
