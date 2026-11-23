# 05. Relayer & DKIM Infrastructure

## 1. Out-of-Band Challenge Interception Architecture

The ingestion pipeline pairs a lightweight serverless edge email worker with an Actix-Web broker to handle inbound `mailto:` challenges without running a persistent mail server.

Files:
- **Cloudflare Email Worker:** [worker.js](file:///d:/workspace/dapp/zk-circuit/zk-email/relayer/cloudflare/worker.js)
- **Actix-Web Broker & DNSSEC Service:** [main.rs](file:///d:/workspace/dapp/zk-circuit/zk-email/relayer/src/main.rs)

```
[University Mail System]
           │
           ▼
[Cloudflare Email Worker]
  • Intercepts verify-<challenge_id>@rationalprocess.eth
  • Strips private email body text (privacy preservation)
  • Extracts RFC 5322 headers + DKIM-Signature
           │
           ▼ (HTTPS POST with X-Worker-Secret)
[Actix-Web Broker]
  • Broadcasts headers to active challenge channel
           │
           ▼ (SSE /api/v1/challenge/stream/{challenge_id})
[Scientist Browser]
```

---

## 2. Cloudflare Email Worker Specification

The worker isolates headers while strictly discarding body payload to maintain voter privacy:

```javascript
export default {
  async email(message, env, ctx) {
    const recipient = message.to;
    const match = recipient.match(/^verify-([a-f0-9]{12,64})@/i);
    if (!match) {
      message.setReject("Invalid challenge format.");
      return;
    }
    const challengeId = match[1].toLowerCase();

    // Ingest stream and isolate RFC 5322 headers
    const rawStream = message.raw;
    const reader = rawStream.getReader();
    let rawText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      rawText += new TextDecoder("utf-8").decode(value);
    }
    const headerEndIdx = rawText.indexOf("\r\n\r\n");
    const headersPayload = headerEndIdx !== -1 ? rawText.substring(0, headerEndIdx) : rawText;

    // Secure dispatch to broker
    await fetch(`${env.BACKEND_API_URL}/api/v1/challenge/push/${challengeId}`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "X-Worker-Secret": env.WORKER_SECRET
      },
      body: headersPayload
    });
  }
};
```

---

## 3. Actix-Web SSE Broker & In-Memory Routing

The backend implements `ChallengeBroker` using Tokio broadcast channels:
* `/api/v1/challenge/push/{challenge_id}`: Authenticated endpoint accepting pushed headers from Cloudflare.
* `/api/v1/challenge/stream/{challenge_id}`: SSE endpoint streaming header bytes directly to the waiting browser tab.

---

## 4. University DKIM Key Fragmentation & DNSSEC Verification

### 4.1 Key Size Fragmentation
An audit of university domains reveals three operational tiers:
1. **Google Workspace / Microsoft 365 Academic Domains (e.g., `mit.edu`, `stanford.edu`):** Use standardized 2048-bit RSA keys.
2. **Autonomous Computer Science Departments (e.g., `cs.cmu.edu`, `inf.ethz.ch`):** Often employ 4096-bit RSA keys or custom selectors.
3. **Legacy Departmental MTAs:** A small minority retain legacy 1024-bit RSA keys.

The circuit repository accommodates key lengths dynamically using templated chunk sizes (32 limbs for 2048-bit, 64 limbs for 4096-bit).

### 4.2 DNSSEC Trust Chain Snapshotting (Permanence Guarantee)
Universities rotate DKIM keys on a 6- to 12-month schedule. If an old key is deleted from live DNS, external verification of the 2026 election would fail in 2028.

**Solution:** The broker utilizes `hickory-resolver` with `validate = true` to verify the full DNSSEC signature chain from the ICANN root down to the target `_domainkey` record:
1. Queries the DNSKEY and RRSIG records for the TLD (`.edu`, `.ac.uk`, `.ca`).
2. Validates the DS (Delegation Signer) record linking parent to child zones.
3. Snapshots the verified public modulus $N$, DNSSEC proof blob, and timestamp into the immutable IPFS election bundle.
