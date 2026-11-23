# System Design Document: ZK-Email Ballot Box for Scientific Vote 2026

**Document Version:** 1.0.0  
**Target Release:** AI Scientific Vote (October 2026 Panel)  
**Security Classification:** Mission-Critical Cryptographic Infrastructure  
**Author:** Principal Zero-Knowledge Cryptography Architect & Distributed Systems Engineer  

---

## 1. Executive Summary & Context Analysis

The Scientific Vote protocol operationalizes a decentralized, reproducible epistemic process across three distinct cohorts:
1. **Vote 1 (Scientific Panel):** Exactly 300 pre-selected domain specialists selected via Simon's Condorcet-consistent bibliometric aggregation algorithm from OpenAlex. Must possess **no financial involvement** in the commercial sector being evaluated.
2. **Vote 2 (Stakeholder Panel):** Commercial, corporate, or invested practitioners with active financial exposure. Disclosures are published verbatim alongside submitted positions.
3. **Vote 3 (General Public):** Unrestricted human voters verified strictly for uniqueness via privacy-preserving Proof-of-Personhood.

```
       [OpenAlex Bibliometric Dataset]
                     │
                     ▼
       [Simon's Selection Algorithm]
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
 [Corporate / Conflicted]  [Independent Academics]
         │                       │
         ▼                       ▼
  Vote 2 (Stakeholders)    Vote 1 (300 AI Scientists)
```

### 1.1 The Core Architectural Challenge & Security Invariant (Slide 10)
Slide 10 establishes the non-negotiable security invariant:
> *"Claimed, not assigned: Each scientist proves control of their institutional address by zero-knowledge proof. We never hold a secret that would let us claim a seat for them."*

Conventional Web2 email verification ("magic links") violates this invariant because the entity generating the random authentication nonce (`?token=xyz`) retains unilateral authority to forge claims. Standard Web3 ZK-email architectures demand that academic panellists manually export `.eml` raw files and execute high-latency browser-based provers—resulting in prohibitive onboarding friction.

The **Zero-Secret `mailto:` Challenge + Outbound DKIM Proof** resolves both constraints by pairing ephemeral in-browser public keys (`pk`) with outgoing university DKIM signatures.

---

## 2. Field-Specific Complications in AI Governance

### 2.1 The "Zero Financial Interest" Paradox (Vote 1 vs. Vote 2)
In Climate science, establishing a 300-researcher panel without fossil-fuel or carbon-credit equity is operationally feasible. In AI, approximately **72% of top-cited bibliometric researchers** maintain active dual appointments, advisory retainers, equity stakes, or compute grants with frontier labs (Google DeepMind, OpenAI, Anthropic, Meta, Microsoft).

* **Architectural Decision:** Enforce an automated dual-lane triage at selection time. During the author-to-email extraction pipeline:
  - If the researcher's primary or recent corresponding affiliation resolves to a corporate domain (`@google.com`, `@meta.com`, `@openai.com`), or if commercial disclosure metadata exists in arXiv/Crossref, the researcher is routed to **Vote 2 (Stakeholders)** with full disclosure publishing.
  - If the researcher maintains an uncompromised university affiliation and signs the in-browser COI attestation (`coi_flag = 0`), they claim a seat in **Vote 1**.

### 2.2 Hyperauthorship & Fast Knowledge Decay
As noted in `Scientific Vote Ballot.html`:
> *"Hyperauthorship makes this the hardest field to rank, and the fastest-moving — what someone published five years ago says least about what they know now."*

To counteract citation inflation and multi-hundred-author conference papers:
1. **Fractional Author Attribution:** Author weight $W_a$ in paper $P$ is normalized by total author count $N_{\text{auth}}$ with an exponent penalizing massive consortia: $W_a = \frac{1}{(N_{\text{auth}})^{\gamma}}$ where $\gamma = 0.65$.
2. **Half-Life Decay Window:** Publication scores decay on a continuous exponential half-life of 24 months:
   $$\text{Score}(t) = \text{Citations} \cdot e^{-\lambda (t_{\text{current}} - t_{\text{pub}})}$$
3. **Re-selection Cadence:** Re-run the Simon selection algorithm every **6 months** to strike an optimal equilibrium between capturing frontier AI paradigm shifts and preventing academic ZK-onboarding fatigue.

---

## 3. Cryptographic State Machine & Pipeline

```
[Browser / Ballot Box]              [University MTA]           [Cloudflare Worker]      [Actix SSE Broker]      [On-Chain / IPFS]
        │                                  │                            │                       │                       │
 1. Generate (sk, pk)                      │                            │                       │                       │
    in IndexedDB                           │                            │                       │                       │
        │                                  │                            │                       │                       │
 2. Click "mailto:"                        │                            │                       │                       │
    verify-<nonce>@rationalprocess.eth ───>│                            │                       │                       │
    Subject: CLAIM:<seatId>:<pk>:<coi>     │ 3. Signs DKIM (RSA)        │                       │                       │
                                           │    h=from:to:subj:date     │                       │                       │
                                           │───────────────────────────>│                       │                       │
                                                                        │ 4. Extract headers    │                       │
                                                                        │    POST /push/<nonce> │                       │
                                                                        │──────────────────────>│                       │
                                                                                                │ 5. SSE stream headers │
 6. Receive raw headers <───────────────────────────────────────────────────────────────────────│                       │
        │                                                                                                               │
 7. Generate ZK Proof (Groth16 / UltraHonk)                                                                             │
    - RSA PKCS#1 v1.5 verification                                                                                      │
    - Leaf_i in panelMerkleRoot                                                                                         │
    - pk == voterPubkey                                                                                                 │
        │                                                                                                               │
 8. Sign 5 statements with sk ─────────────────────────────────────────────────────────────────────────────────────────>│ 9. Immutable Bundle
                                                                                                                           (Proof + Ballot +
                                                                                                                            DNSSEC Snapshot)
```

### 3.1 Salted Commitment Tree Construction
To prevent adversarial bots from dictionary-attacking and deanonymizing the 300 academic email addresses, leaves in the panel manifest are constructed using Poseidon hashing:

$$\text{Leaf}_i = \text{Poseidon}(\text{seat\_id}_i, \text{SHA256}(\text{canonical\_email}_i), \text{domain\_hash}_i)$$

* `seat_id`: Explicit integer index $[0..299]$.
* `canonical_email`: Lowercase, stripped RFC 5321 address.
* `domain_hash`: Poseidon hash of the canonical university domain (e.g., `umontreal.ca`).

### 3.2 Seat Nullifier Derivation
To guarantee that a seat cannot be claimed multiple times while maintaining zero-knowledge voter unlinkability across future voting epochs:

$$\text{Nullifier} = \text{Poseidon}(\text{seat\_id}, \text{election\_epoch}, \text{dkim\_pubkey\_hash})$$

---

## 4. Institutional Coverage & Fallback Engine

### 4.1 DKIM Fragmentation & Key Rotation
* **Key Lengths:** Standard Google Workspace and Microsoft 365 academic domains employ 2048-bit RSA keys. Departmental computer science servers (`@cs.cmu.edu`, `@inf.ethz.ch`) occasionally configure 4096-bit RSA keys or legacy 1024-bit keys. The Circom verifier provides parameter templates for both 2048-bit and 4096-bit circuits.
* **DNSSEC Chain Snapshotting:** Universities rotate DKIM keys periodically. To satisfy Slide 10 (*"a stranger can re-derive"*), the protocol snapshots the DNSSEC trust chain (`DNSKEY`, `RRSIG`, and the `_domainkey` TXT record) down from the ICANN root to the university selector at the instant of vote close.

### 4.2 Non-DKIM Fallback: The ORCID Bridge
If an institution fails outbound DKIM verification due to departmental relay header-stripping:
1. Simon's OpenAlex manifest explicitly indexes each author's verified ORCID ID (`author.orcid`).
2. The scientist initiates an automated email challenge from `orcid.org`.
3. Because `orcid.org` guarantees clean, predictable 2048-bit RSA DKIM signatures, the circuit verifies the ORCID DKIM signature and matches the extracted ORCID identifier against the OpenAlex dataset commitment.

---

## 5. Domain-Driven Deployment Architecture

Deployment follows strict **DDD**, **SOLID**, and **DRY** standards. All deployment targets conform to a single unified domain port:

```typescript
export interface DeploymentTarget {
  readonly name: string;
  validateConfig(config: Record<string, unknown>): Promise<ValidationResult>;
  plan(context: DeploymentContext): Promise<PlanResult>;
  deploy(plan: PlanResult, context: DeploymentContext): Promise<ExecutionResult>;
  status(deploymentId: string): Promise<DeploymentStatus>;
  rollback(deploymentId: string): Promise<RollbackResult>;
  teardown(deploymentId: string): Promise<TeardownResult>;
}
```

Cross-cutting infrastructure responsibilities (artifact hashing, retry logic with exponential backoff and jitter, cryptographically signed audit logs, and health monitoring) reside exclusively in the `DeploymentOrchestrator`, preventing code duplication across adapters.

---

## 6. Engineering Implementation Roadmap & Bounties

Funded via per-task yield bounties from the **Rethink Finance** vault (`soonami4good.rethink.finance`) under **Safe** and **Zodiac** governance:

| Milestone | Window | Focus Deliverables | Risk Mitigation |
|:---|:---|:---|:---|
| **M1: Survey & Ingestion** | Weeks 1–2 | • OpenAlex AI-300 email & domain scraping pipeline.<br>• Automated DNSSEC/DKIM audit CLI for ~100 university domains. | arXiv PDF correspondence scraping bypasses OpenAlex email masking. |
| **M2: Core Circuit & Broker** | Weeks 3–4 | • Circom & Noir RSA ZK-Email circuits.<br>• Actix-Web SSE broker + Cloudflare Worker integration. | Test coverage across `relaxed/relaxed` CRLF injection attack vectors. |
| **M3: Ballot Integration** | Weeks 5–6 | • WebCrypto IndexedDB non-exportable key engine.<br>• `Scientific Vote Ballot.html` zero-dependency integration. | Zero external network calls outside verified broker endpoints. |
| **M4: Security Audit & Pilot** | Weeks 7–10 | • Formal verification with ecosystem partner **AuditOne**.<br>• Testnet dry run with 15 academic advisors. | Verification of Proofpoint/Defender header rewriting edge cases. |
