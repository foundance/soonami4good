# 06. Fallback Mitigation Strategy: The ORCID / OpenAlex Bridge

## 1. Problem Statement: Institutional DKIM Non-Compliance

While approximately 85–90% of global research universities employ DKIM-compliant mail gateways (primarily through Google Workspace or Microsoft 365), empirical surveys reveal critical edge cases:
1. **Header Stripping by Internal Relays:** Some institutions route outgoing departmental mail through security appliances (e.g., Proofpoint, Cisco IronPort) that modify or strip `DKIM-Signature` headers.
2. **SPF-Only Configurations:** Legacy departmental mail servers configure SPF and DMARC without enabling DKIM signing keys.
3. **Mailing Relay Incompatibilities:** Mail list relays often alter the `Subject:` header or reformat body whitespace, invalidating DKIM hashes.

Manual administrative approvals are unacceptable as they violate the protocol invariant:
> *"No salaried staff, by design. A project that needs employees to survive has an operator — which is the thing we are trying not to be."*

---

## 2. The ORCID Bridge Architecture

To provide an automated, trustless fallback for researchers at non-compliant institutions, the protocol integrates the **ORCID / OpenAlex Bridge**:

```
[OpenAlex Bibliometric Dataset]
  • Contains Author ID: A5023888391
  • Directly links primary ORCID: 0000-0002-1662-0283
         │
         ▼ (Committed into Manifest Leaf)
  Leaf_i = Poseidon(seat_id, ORCID_Hash, Domain_Hash)
         │
         │ (Non-DKIM Fallback Triggered on Screen 5)
         ▼
[Scientist Browser]
  • Requests automated verification email from orcid.org
         │
         ▼
[ORCID Production Mail Server]
  • Dispatches automated transactional email to scientist
  • Signs with clean, standard 2048-bit RSA DKIM key (d=orcid.org)
         │
         ▼
[ZK-Email ORCID Verifier Circuit]
  • Validates orcid.org DKIM signature
  • Extracts verified ORCID iD from email body/headers
  • Matches ORCID against Leaf_i in panelMerkleRoot
         │
         ▼
[Seat Claim Validated]
```

---

## 3. Cryptographic Advantages of the ORCID Bridge

1. **Deterministic Public Key Infrastructure:** Unlike fragmented university domains, `orcid.org` maintains predictable, well-documented DKIM selectors (`default._domainkey.orcid.org`) with full DNSSEC coverage.
2. **Immutable Identity Binding:** Over 85% of active AI researchers in the OpenAlex top-tier corpus possess verified ORCID iDs linked directly to their publication portfolios.
3. **Self-Sovereignty:** The researcher triggers the verification flow directly from ORCID without requiring platform intervention.
