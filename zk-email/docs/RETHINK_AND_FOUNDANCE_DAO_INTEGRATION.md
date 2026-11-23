# Integration Architecture: Rethink.finance Vaults & Foundance DAO
## Decentralized Capital, Governance & Execution Mechanics for `zk-cirket`
**Protocol:** 2026 AI Scientific Vote  
**Ecosystem:** soonami4good / Foundance / Rethink Finance  
**Classification:** Epistemic Governance & Financial Smart Contract Architecture  

---

## 1. Architectural Overview & The Tri-Partite System

The **2026 AI Scientific Vote (`zk-cirket`)** does not operate as an isolated dApp. Instead, it forms the epistemic core of the **soonami.io** ecosystem, combining three interlocking decentralized systems:

1. **rethink.finance:** Non-custodial smart contract vaults providing capital preservation and continuous staking yield.
2. **Foundance DAO (`foundance.org`):** Decentralized community, researcher, and tokenized governance approving ballot mandates, panel roots, and milestone disbursements.
3. **zk-cirket Smart Contracts (`PanelRegistry.sol` & `Groth16Verifier.sol`):** The trustless, non-custodial zero-knowledge voting machine.

```
                      +---------------------------------------+
                      |         Backers / Benefactors         |
                      |    Deposit WETH / stETH (Principal)   |
                      +-------------------+-------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |     rethink.finance Staking Vault     |
                      |     soonami4good.rethink.finance      |
                      |   (1,000 ETH Principal -> ~25 ETH/yr) |
                      +-------------------+-------------------+
                                          |
                                 Staking Yield Only
                                 (Principal Untouched)
                                          v
+-------------------------------+   Gnosis Safe 3/5   +-------------------------------+
|         Foundance DAO         |   Smart Treasury    |      zk-cirket Execution      |
|        (foundance.org)        +---- Multisig Account+----->| PanelRegistry.sol (onlySafe)   |
| Proposals, veSNI Governance,  |   (0x1234...5678)   |      | • Gasless Voter Sponsorship    |
| & Milestone Verification      |                     |      | • Emergency Pause/Unpause      |
+---------------+---------------+                     |      | • Self-Hosted Node OpEx        |
                |                                     |      +-------------------------------+
                | Zodiac Scoped Roles Module          |
                +-------------------------------------+
```

---

## 2. Rethink.finance Vault Integration (Capital Layer)

### 2.1 The "Venture Staking" Primitive (Slide 12 & 13)
Traditional DAOs dilute tokens or spend donor principal to fund development and gas. In the **soonami / rethink.finance** model:
- **Principal Preservation:** Institutional supporters, patrons, and DAOs deposit assets (e.g., 1,000 WETH or stETH) into the non-custodial `soonami4good` vault on `rethink.finance`.
- **Zero Principal Risk:** Depositors retain 100% legal and cryptographic ownership of their deposited principal with no lock-in penalties and zero exposure to market volatility.
- **Yield Skimming:** The vault automatically streams the generated liquid staking yield (~2.5% APR $\approx 25 \text{ ETH/year}$) directly to the **Gnosis Safe 3/5 multisig** treasury address configured in our deployment engine.

### 2.2 Operational Allocations of Vault Yield
The annual 25 ETH yield is systematically budgeted across three operational accounts:
1. **Gasless Voter Relayer Float (1.0 – 2.0 ETH):** Subsidizes on-chain execution of `claimAndCastBallot()` so that the 300 academic scientists never have to own a Web3 wallet, hold ETH, or sign gas transactions.
2. **Sovereign Infrastructure OpEx (~$350 / year $\approx 0.15 \text{ ETH}$):** Covers the self-hosted Linux VPS (hosting the Actix-Web broker and local Kubo IPFS daemon) and Cloudflare Email Worker.
3. **Audit & Bug Bounty Pools (15 – 20 ETH):** Funds the AuditOne smart contract and zero-knowledge circuit audit retainers and bug bounty escrow.

---

## 3. Foundance DAO Integration (Governance Layer)

**Foundance (`foundance.org`)** is the co-founding ecosystem and governance platform for soonami. It bridges token holders (`$fSNI` / `$SNI`), researchers, and builders through decentralized proposals and milestone tracking.

### 3.1 Simon's Top 300 Panel Ratification
1. The off-chain data pipeline extracts the top 300 global AI researchers from OpenAlex bibliometrics using Simon's Condorcet-consistent selection algorithm.
2. A formal **Foundance Governance Proposal (FGP)** is submitted on `foundance.org` detailing the dataset snapshot hash and the resulting Poseidon Merkle root.
3. Foundance community members and scientific committee members vote using staked governance tokens (`veSNI`).
4. Upon quorum and approval, the proposal triggers on-chain execution.

### 3.2 Gnosis Safe & Zodiac Execution Module
To ensure that no individual or multisig signer can unilaterally tamper with the voting machine:
- The **Gnosis Safe** smart account (`safeTreasury`) is bound to a **Zodiac Roles & Reality Module**.
- The Zodiac module allows the Safe to atomically execute transactions only if they have been formally passed by a verified Foundance DAO proposal.

In [PanelRegistry.sol](file:///d:/workspace/dapp/zk-circuit/zk-email/contracts/PanelRegistry.sol):
```solidity
modifier onlySafe() {
    require(msg.sender == safeTreasury, "PanelRegistry: caller is not Safe treasury");
    _;
}

// Foundance DAO can trigger an emergency circuit-breaker via Zodiac
function pause() external onlySafe {
    paused = true;
    emit EmergencyPaused(msg.sender);
}

function unpause() external onlySafe {
    paused = false;
    emit EmergencyUnpaused(msg.sender);
}
```

---

## 4. Milestone Bounty Disbursements (Builder & Auditor Layer)

Foundance DAO organizes technical execution through scoped milestone bounties as detailed in [08_IMPLEMENTATION_ROADMAP_AND_BOUNTIES.md](file:///d:/workspace/dapp/zk-circuit/docs/08_IMPLEMENTATION_ROADMAP_AND_BOUNTIES.md):

```
[rethink.finance Vault Yield]
              │
              ▼
   [Gnosis Safe Treasury]
              │
    (Zodiac Roles Module)
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
[Bounty 1] [Bounty 2] [Audit Gate]
  M1 (25%)  M2-M3 (50%) AuditOne (25%)
```

1. **Milestone Submission:** Core developers or security auditors submit cryptographically signed delivery receipts (commit hashes, test run logs, and audit reports).
2. **Foundance Evaluation:** Foundance ecosystem mentors and technical arbiters verify delivery against specification.
3. **Atomic Payout:** Approved milestones release USDC/ETH directly from the Safe vault yield balance to the contributor address, eliminating salaried overhead and counterparty risk.

---

## 5. Security Invariant Summary

| Security Requirement | Implementation | Guarantee |
|:---|:---|:---|
| **Non-Custodial Principal** | rethink.finance smart vault | Benefactors can withdraw their staked ETH anytime; DAO never controls principal. |
| **Trustless Execution** | Zodiac Module on Gnosis Safe | Multisig signers cannot divert funds or pause contracts without Foundance DAO consensus. |
| **Zero Secret Voting** | Groth16 SnarkJS in browser | Neither Foundance DAO, rethink.finance, nor the relayer can forge or decrypt a scientist's vote. |
| **Gasless Participation** | Yield-funded relayer sponsorship | Academic panelists authenticate purely via university DKIM email with zero Web3 friction. |
