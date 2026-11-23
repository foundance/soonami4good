# 01. Context & Architectural Requirements

## 1. Project Background & Epistemic Governance Model

The **Scientific Vote** (codenamed **zk-cirket**) is a decentralized epistemic protocol engineered under the `soonami4good` initiative. Its core mandate is rebuilding how human society establishes informed consensus on consequential technological and existential questions—beginning with **Artificial Intelligence (AI)** in the October 2026 ballot.

Unlike conventional polling mechanisms that collapse disparate constituencies into a single manipulated average, the Scientific Vote formalizes three sovereign, unweighted publics published in parallel:
1. **Vote 1 (The Scientific Panel):** Exactly 300 domain specialists chosen by a reproducible, published algorithm (Simon's Condorcet-consistent selection) from open bibliometric data (OpenAlex). Candidates must have **no financial involvement** in the commercial sector being evaluated.
2. **Vote 2 (The Stakeholder Panel):** Industry professionals, lab researchers, investors, and engineers with direct financial, career, or equity exposure. Disclosures are published verbatim alongside their votes.
3. **Vote 3 (The General Public):** Open to all human beings globally, verified strictly for uniqueness via privacy-preserving Proof-of-Personhood.

At the conclusion of the voting window, all three distributions, dissents, and forum arguments are handed over to legislators and the public as an un-tampered, byte-identical package.

---

## 2. Cryptographic Security Invariants (Slide 10 & Slide 13)

### 2.1 The Core Invariant
Slide 10 of the foundational protocol specification mandates:
> *"Claimed, not assigned: Each scientist proves control of their institutional address by zero-knowledge proof. We never hold a secret that would let us claim a seat for them."*

Furthermore, Slide 10 and Slide 13 require:
* **Stranger Re-Derivability:** Any third party must be able to download the election artifacts years later and mathematically re-verify every vote from root principles without trusting the platform operators.
* **Permanence:** All manifests, zero-knowledge proofs, and public verification chains must reside permanently on decentralized, content-addressed storage (IPFS/Arweave).

### 2.2 Why Traditional Authentication Paradigms Violate the Invariants
1. **Web2 "Magic Link" Authentication:** A central or relayer server generates an authentication token $T$ and emails `https://ballot.eth/?token=T` to `scientist@university.edu`. In this scheme, the server that generated $T$ holds the capability to claim the seat and forge a ballot before the email is sent, invalidating Slide 10.
2. **Traditional Web3 ZK-Email Workflows:** The voter is requested to receive an email, download the raw `.eml` file, and execute a heavy client-side browser prover (WASM-based Groth16 or UltraHonk). In practice, benchmark latency (60–180 seconds on consumer hardware) and technical friction create unacceptable drop-off rates among academic panellists.

---

## 3. Field-Specific Complications in Artificial Intelligence

### 3.1 The "Zero Financial Interest" Paradox (Vote 1 vs. Vote 2)
In disciplines such as Climate science, identifying 300 preeminent academics without equity in carbon markets or fossil fuel holdings is straightforward. In Artificial Intelligence, **approximately 72% of top-cited researchers** hold direct financial, consulting, or compute grants with frontier AI corporations:
- **Pieter Abbeel:** Early research scientist at OpenAI (2016–2017), founder of Covariant.
- **Quoc Viet Le:** Google Fellow and founding member of Google Brain.
- **Yoshua Bengio:** Head of Mila / Université de Montréal, with high-level advisory and summit engagements with OpenAI, Anthropic, and Meta.
- **Geoffrey Hinton:** Decades at Google Brain / DNNresearch; former students co-founded OpenAI.

**Architectural Resolution:**
* The protocol establishes a deterministic two-lane classification engine during ingestion.
* Scientists with active corporate email addresses (`@google.com`, `@openai.com`, `@meta.com`, `@microsoft.com`) or explicit equity/salary disclosures on Crossref/arXiv are classified under **Vote 2 (Stakeholders)**.
* Independent university professors without commercial equity who attest to the in-browser COI attestation (`coi_flag = 0`) are allocated to **Vote 1 (Scientific Panel)**.

### 3.2 Hyperauthorship & Fast Knowledge Decay
As codified in `Scientific Vote Ballot.html`:
> *"Hyperauthorship makes this the hardest field to rank, and the fastest-moving — what someone published five years ago says least about what they know now."*

To maintain ranking legitimacy:
1. **Fractional Author Weighting:** Author credit on large-scale collaborations decays non-linearly:
   $$W_{\text{author}} = \frac{1}{(N_{\text{authors}})^{\gamma}}, \quad \gamma = 0.65$$
2. **Exponential Citation Half-Life:** Citation velocity is discounted using a 24-month half-life:
   $$\text{Score}(t) = \text{Citations} \cdot e^{-\lambda (t_{\text{current}} - t_{\text{pub}})}$$
3. **Panel Re-selection Cadence:** Re-selection is executed every **6 months**. A 3-month cadence incurs excessive onboarding fatigue and circuit re-proving overhead, while a 12-month cadence fails to capture rapid breakthroughs in frontier model architectures.

### 3.3 Author-to-Email Mapping Pipeline in OpenAlex
OpenAlex author profiles (`author.id`) index names, affiliations, and ROR (Research Organization Registry) IDs, but intentionally mask raw institutional emails for privacy.
* The ingestion pipeline resolves each author's most recent publications within the last 36 months (`works_api_url`).
* An automated extraction crawler parses the corresponding-author metadata from arXiv LaTeX source packages, Crossref XML dumps, and PubMed Central records.
* This mapping establishes the verified author email address committed into the panel Merkle tree.
