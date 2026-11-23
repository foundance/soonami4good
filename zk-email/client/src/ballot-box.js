/**
 * Scientific Vote Ballot Box Module
 * Connects the in-browser WebCrypto identity, the 5 AI statements ballot state,
 * and the ZK-Email seat claiming flow with complete EIP-712 domain separation.
 */

import { WebCryptoKeyManager } from "./webcrypto-key-manager.js";

export class BallotBox {
  constructor(config = {}) {
    this.keyManager = new WebCryptoKeyManager(config.brokerUrl || "http://localhost:8088");
    this.panelId = config.panelId || "ai-2026-q4";
    this.merkleRoot = config.merkleRoot || "0x2e1a49f8749bc67265aef4023dc8104523a";
    this.chainId = config.chainId || 1; // 1 = Mainnet, 11155111 = Sepolia
    this.verifyingContract = config.verifyingContract || "0x1234567890123456789012345678901234567890";
    this.electionEpoch = config.electionEpoch || 202610;
    
    this.seatId = null;
    this.coiDeclared = false;
    this.verificationProof = null;
    this.answers = {};
  }

  async init() {
    await this.keyManager.init();
    console.log(`[BallotBox] Initialized with voter pubkey: ${this.keyManager.pubkeyHex}`);
  }

  /**
   * Sets the voter's position and weight on a statement
   */
  recordAnswer(statementId, position, weight) {
    if (position < 1 || position > 10) {
      throw new Error("Position must be an integer between 1 and 10");
    }
    const validWeights = ["none", "sl", "mod", "con", "str"];
    if (!validWeights.includes(weight)) {
      throw new Error(`Invalid weight: ${weight}`);
    }

    this.answers[statementId] = {
      pos: weight === "none" ? null : Number(position),
      wt: weight,
      timestamp: Math.floor(Date.now() / 1000)
    };
  }

  /**
   * Sets the declared seat ID and Conflict of Interest flag
   */
  setIdentityBinding(seatId, coiDeclared) {
    this.seatId = Number(seatId);
    this.coiDeclared = Boolean(coiDeclared);
  }

  /**
   * Initiates the mailto: flow
   */
  prepareEmailClaim() {
    if (this.seatId === null) {
      throw new Error("Seat ID must be selected before initiating claim.");
    }
    return this.keyManager.buildMailtoChallenge({
      seatId: this.seatId,
      coiFlag: this.coiDeclared
    });
  }

  /**
   * Attach proof returned by ZK-Email prover
   */
  setVerificationProof(proofData) {
    this.verificationProof = proofData;
  }

  /**
   * Assembles, canonicalizes, signs, and bundles the complete ballot
   * Enforces EIP-712-style domain separation to prevent cross-chain/cross-election replay attacks.
   */
  async finalizeBallotBundle() {
    if (!this.verificationProof) {
      throw new Error("Cannot finalize ballot: ZK verification proof missing.");
    }

    // EIP-712 Domain Separator bindings
    const domainSeparator = {
      name: "ScientificVoteBallotBox",
      version: "1.0.0",
      chainId: this.chainId,
      verifyingContract: this.verifyingContract,
      merkleRoot: this.merkleRoot,
      electionEpoch: this.electionEpoch
    };

    const ballotPayload = {
      domain: domainSeparator,
      panel: this.panelId,
      seat_id: this.seatId,
      coi_declared: this.coiDeclared,
      voter_pubkey: this.keyManager.pubkeyHex,
      votes: Object.entries(this.answers)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, ans]) => ({
          id,
          pos: ans.pos,
          wt: ans.wt
        })),
      timestamp: Math.floor(Date.now() / 1000)
    };

    const signedBallot = await this.keyManager.signBallot(ballotPayload);

    const electionBundle = {
      version: "1.0.0",
      module: "zk-email-ballot-box",
      domain: domainSeparator,
      merkle_root: this.merkleRoot,
      nullifier: this.verificationProof.seatNullifier,
      ballot: signedBallot,
      zk_proof: this.verificationProof,
      created_at: new Date().toISOString()
    };

    return electionBundle;
  }
}
