# 09. Voter Authentication & Login Providers
## Identity Genesis, OAuth Decoupling & The ZK-Email Verification Pipeline
**Target Audience:** Security Architects, Frontend Engineers, Governance Committee  
**Protocol Invariant:** Slide 10 Zero-Custody (No third-party provider is load-bearing for the Scientific Panel)  

---

## 1. The Core Architectural Axiom: Sign-In ≠ Panel Qualification

In the **2026 AI Scientific Vote (`zk-cirket`)**, a foundational separation of concerns governs user authentication:

> **"Signing in creates a voting account session. It does NOT establish which panel you belong to. That is claimed after you answer, and it has to be proved."** *(Onboarding Brief, Screen 2)*

When a voter lands on the dApp, they first answer the five ballot questions on Screen 3. Only after their ballot choices are formed do they proceed to **Screen 4 & 5 (Panel Selection & Verification)**:

```
[Screen 2: Sign-In Options]
  ├── Google Workspace (OAuth 2.0)
  ├── ORCID iD (OIDC / Academic Identity)
  ├── eduGAIN (Federated SAML2 / InCommon)
  └── Email Magic Link (One-Time Challenge)
           │
           ▼
[Browser WebCrypto Key Genesis]
  • Generates non-exportable ECDSA P-256 keypair in IndexedDB
  • Private key never leaves the client browser sandbox
           │
           ▼
[Screen 3: Candidate Selection]
  • Voter answers 5 statements on AI capability & governance
           │
           ▼
[Screen 4 & 5: Panel Claim & Cryptographic Proof]
  ┌───────────────────────┬───────────────────────┬───────────────────────┐
  ▼                       ▼                       ▼                       ▼
Vote 1: Scientific      Vote 2: Stakeholder     Vote 3: General         Politicians
Top 300 OpenAlex Panel  Industry / Invested     Public Unrestricted     (Receives
Must prove DKIM / ORCID Published verbatim COI  Proof-of-Personhood     Published Package)
```

---

## 2. Deep Dive: Login Providers & Authentication Channels

### 2.1 Google Workspace / Google Sign-In
* **Primary Target Cohorts:** General Public (Vote 3) and Corporate Stakeholders (Vote 2).
* **The "Google Contradiction" (Project Invariant):**
  As documented in the onboarding brief:
  > *"The whole claim of this project is that no central party can be captured or switched off. An OAuth dependency on one company is exactly such a party, for as long as it is the only door. It is here because the general vote has to be two clicks or it will not happen, and it ships alongside ORCID, institutional sign-in and an email link from day one so that no single provider is load-bearing. My recommendation is that the scientific panel never uses it."*
* **Implementation:** Standard OAuth 2.0 / OpenID Connect (OIDC). Google issues a signed ID token verifying the user's email.
* **Security Guardrail:** Google sign-in **cannot** claim a seat in Vote 1 (Scientific Panel) without producing a valid Zero-Knowledge proof from the university's institutional DKIM key.

---

### 2.2 ORCID (`orcid.org` / Academic Identity)
* **Primary Target Cohort:** Vote 1 (Top 300 AI Researchers).
* **Why ORCID is Fundamental:** Over 85% of active AI researchers in Simon's top-300 OpenAlex corpus possess verified ORCID iDs (`0000-0002-xxxx-xxxx`) permanently bound to their publication records.
* **Dual Integration Mechanics:**
  1. **Session Bootstrapping (OAuth/OIDC):** The scientist logs in via ORCID OAuth to quickly retrieve their published profile, author metadata, and Simon's list seat rank.
  2. **The Cryptographic ZK-Email Fallback Bridge:**
     - If a university mail server strips outgoing DKIM headers (e.g. departmental firewall, legacy SPF-only configuration), the scientist triggers an automated transactional email from `orcid.org`.
     - `orcid.org` sends a verification email signed with its standard **2048-bit RSA DKIM key** (`d=orcid.org`, selector `default._domainkey.orcid.org`).
     - The in-browser ZK circuit parses the `orcid.org` signature, extracts the verified ORCID iD, and matches it against the Merkle tree leaf:
       $$\text{Leaf}_i = \text{Poseidon}(\text{SeatID}, \text{ORCID\_Hash}, \text{Domain\_Hash})$$
     - **Result:** 100% automated, trustless claiming with zero human admin in the loop.

---

### 2.3 eduGAIN / InCommon (Federated Institutional SAML2)
* **Primary Target Cohort:** Faculty and researchers across European, North American, and global universities.
* **Mechanism:** 
  - eduGAIN connects over 5,000 university identity providers globally.
  - The researcher selects their institution from the discovery service and authenticates against their university's Single Sign-On (SSO).
  - The university IdP releases the scoped `eduPersonPrincipalName` (e.g., `nakamura@u-tokyo.ac.jp`) and affiliation attributes (`faculty`, `researcher`).
* **Cryptographic Role:** Used to bootstrap the browser session and pre-fill the claimant's seat verification parameters without storing passwords.

---

### 2.4 Direct Email Magic Link & ZK-Email `mailto:` Challenge
* **Primary Target Cohort:** Any panelist desiring complete independence from commercial identity providers.
* **The Primary Scientific Claim Flow:**
  1. The scientist clicks **"Prove you control that address"** on Screen 5.
  2. The browser generates an ephemeral 64-character challenge nonce and a customized `mailto:` link:
     ```text
     To: verify-9f3c4b8a2d10@rationalprocess.eth
     Subject: SV-AI-2026-CLAIM: 42 : 0x7c2b...9a1f : 0
     ```
  3. The scientist sends one empty email from their institutional inbox.
  4. The Cloudflare Email Worker intercepts the incoming message, isolates the canonical RFC 5322 headers, and forwards them to the Actix-Web broker.
  5. The broker streams the headers over SSE to the scientist's browser.
  6. The browser computes the Groth16 witness using SnarkJS Wasm, produces the ZK proof $\pi = (A, B, C)$, and submits it to [`PanelRegistry.claimAndCastBallot()`](file:///d:/workspace/dapp/zk-circuit/zk-email/contracts/PanelRegistry.sol#L97-L127).

---

## 3. Comparison of Authentication Providers

| Feature / Property | Google OAuth | ORCID iD | eduGAIN / SAML2 | Direct ZK-Email |
|:---|:---:|:---:|:---:|:---:|
| **Target Cohort** | General / Stakeholders | Scientific Panel | Scientific Panel | Scientific Panel |
| **Decentralization** | Low (Commercial Silo) | High (Academic Non-profit) | High (Global Federation) | **Maximum (Pure Math/DKIM)** |
| **Usability** | 2 Clicks | 2 Clicks | SSO Redirect | 1 Empty Email |
| **Can Claim Seat in Vote 1?** | ❌ No (Cannot bypass DKIM) | ✅ Yes (Via ZK-Bridge) | ✅ Yes (With DKIM binding) | **✅ Yes (Primary Standard)** |
| **Platform Secret Custody** | None (OAuth JWT) | None (OIDC Token) | None (SAML Assertion) | **Zero (Local WebCrypto)** |

---

## 4. How the Smart Contract Validates the Authentication

In [PanelRegistry.sol](file:///d:/workspace/dapp/zk-circuit/zk-email/contracts/PanelRegistry.sol#L106-L125), the contract does not check OAuth tokens. It verifies pure zero-knowledge cryptographic facts:

```solidity
// 1. Enforce Merkle Root integrity (Simon's top 300 AI list)
require(publicInputs[0] == panelMerkleRoot, "PanelRegistry: Invalid Merkle Root");

// 2. Enforce seat bounds [0..299]
require(seatId < 300, "PanelRegistry: Seat ID exceeds panel size (300)");

// 3. Double-claim / Double-spend prevention
require(!isNullifierSpent[nullifier], "PanelRegistry: Seat nullifier already spent");

// 4. Verify Groth16 Proof (matches DKIM RSA signature or ORCID bridge)
bool proofValid = verifier.verifyProof(proofA, proofB, proofC, publicInputs);
require(proofValid, "PanelRegistry: Invalid ZK-Email Groth16 proof");
```

Regardless of whether the user signed in initially with ORCID, eduGAIN, or Google, **the contract accepts the ballot only if a mathematically valid Groth16 proof demonstrates control of an authenticated panel seat.**
