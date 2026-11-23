/**
 * Scientific Vote - WebCrypto Key Manager & State Machine
 *
 * Implements:
 * 1. Non-custodial client-side key generation (ECDSA P-256) via WebCrypto.
 * 2. Secure storage in IndexedDB with graceful in-memory fallback (e.g. Incognito/Private mode).
 * 3. Zero-Secret mailto: challenge URI construction.
 * 4. RFC 8785 (JCS) deterministic canonical JSON ballot serialization & signing.
 * 5. Public key affine coordinate extraction [x, y] and 64-bit limb formatting for SNARK circuits.
 * 6. Server-Sent Events (SSE) listener for out-of-band DKIM headers.
 */

const DB_NAME = "ScientificVoteKeystore";
const DB_VERSION = 1;
const STORE_NAME = "keys";
const KEY_ALIAS = "sv_ephemeral_identity";

export class WebCryptoKeyManager {
  constructor(brokerBaseUrl = "http://localhost:8088") {
    this.brokerBaseUrl = brokerBaseUrl;
    this.db = null;
    this.keyPair = null;
    this.pubkeyHex = null;
    this.inMemoryStore = new Map();
  }

  /**
   * Initializes IndexedDB storage with graceful in-memory fallback
   */
  async init() {
    try {
      if (typeof indexedDB === "undefined") {
        throw new Error("IndexedDB not available");
      }
      await new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        request.onsuccess = (e) => {
          this.db = e.target.result;
          resolve();
        };
        request.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn("[WebCryptoKeyManager] IndexedDB unavailable or blocked (Incognito mode). Falling back to in-memory key storage.");
      this.db = null;
    }

    await this.loadOrCreateKeyPair();
  }

  /**
   * Loads existing keypair or generates a non-exportable WebCrypto keypair
   */
  async loadOrCreateKeyPair() {
    const existing = await this._getStoredKey(KEY_ALIAS);
    if (existing && existing.privateKey && existing.publicKey) {
      this.keyPair = existing;
      this.pubkeyHex = await this._exportPubkeyHex(existing.publicKey);
      return;
    }

    if (typeof crypto === "undefined" || !crypto.subtle) {
      throw new Error("WebCrypto SubtleCrypto is not available in this context (insecure origin or unsupported browser).");
    }

    // Generate ECDSA P-256 with extractable: false to prevent sk theft
    this.keyPair = await crypto.subtle.generateKey(
      {
        name: "ECDSA",
        namedCurve: "P-256"
      },
      false, // non-extractable private key
      ["sign", "verify"]
    );

    this.pubkeyHex = await this._exportPubkeyHex(this.keyPair.publicKey);

    // Save key references to store
    await this._putStoredKey(KEY_ALIAS, this.keyPair);
  }

  /**
   * Exports raw uncompressed public key as hexadecimal string (65 bytes: 04 + X + Y)
   */
  async _exportPubkeyHex(publicKey) {
    const raw = await crypto.subtle.exportKey("raw", publicKey);
    return Array.from(new Uint8Array(raw))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Decomposes the P-256 public key into affine (X, Y) 64-bit limbs for Circom and Noir circuits
   */
  async getAffineLimbs() {
    if (!this.pubkeyHex) {
      throw new Error("Public key not initialized");
    }
    // pubkeyHex is 130 hex chars: "04" (2 chars) + X (64 chars) + Y (64 chars)
    const xHex = this.pubkeyHex.slice(2, 66);
    const yHex = this.pubkeyHex.slice(66, 130);

    // Split 256-bit X into 4 x 64-bit limbs (little-endian or big-endian matching circuit)
    const xLimbs = [];
    const yLimbs = [];
    for (let i = 0; i < 4; i++) {
      const xChunk = xHex.slice(i * 16, (i + 1) * 16);
      const yChunk = yHex.slice(i * 16, (i + 1) * 16);
      xLimbs.push("0x" + xChunk);
      yLimbs.push("0x" + yChunk);
    }

    return {
      xHex: "0x" + xHex,
      yHex: "0x" + yHex,
      xLimbs,
      yLimbs
    };
  }

  /**
   * Generates a random 16-byte hex challenge nonce
   */
  generateChallengeId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Constructs the zero-secret mailto: URI
   */
  buildMailtoChallenge({ seatId, coiFlag, recipientDomain = "rationalprocess.eth" }) {
    if (seatId === undefined || seatId === null) {
      throw new Error("seatId is required to construct claim challenge");
    }
    const challengeId = this.generateChallengeId();
    const recipient = `verify-${challengeId}@${recipientDomain}`;
    const subject = `SV-AI-2026-CLAIM:${seatId}:${this.pubkeyHex}:${coiFlag ? 1 : 0}`;
    const body = "Please send this verification email without altering the subject line.";

    const mailtoUrl = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    return {
      challengeId,
      recipient,
      subject,
      mailtoUrl
    };
  }

  /**
   * Subscribes to the Actix-Web SSE broker to await out-of-band DKIM headers
   */
  subscribeToHeaders(challengeId, onReceived, onError) {
    const url = `${this.brokerBaseUrl}/api/v1/challenge/stream/${challengeId}`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.status === "received") {
          eventSource.close();
          onReceived(payload.raw_headers);
        } else if (payload.status === "timeout" || payload.status === "error") {
          eventSource.close();
          onError(new Error(payload.message || "Challenge failed"));
        }
      } catch (err) {
        eventSource.close();
        onError(err);
      }
    };

    eventSource.onerror = (err) => {
      eventSource.close();
      onError(err);
    };

    return () => eventSource.close();
  }

  /**
   * RFC 8785 compliant canonical JSON stringification
   * Recursively sorts object keys lexicographically
   */
  canonicalJson(obj) {
    if (obj === null || typeof obj !== "object") {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return "[" + obj.map(item => this.canonicalJson(item)).join(",") + "]";
    }
    const sortedKeys = Object.keys(obj).sort();
    const parts = sortedKeys.map(k => `${JSON.stringify(k)}:${this.canonicalJson(obj[k])}`);
    return "{" + parts.join(",") + "}";
  }

  /**
   * Cryptographically signs the canonical JSON ballot with the non-exportable private key
   */
  async signBallot(ballotPayload) {
    if (!this.keyPair || !this.keyPair.privateKey) {
      throw new Error("Private key unavailable in keystore");
    }

    const canonicalString = this.canonicalJson(ballotPayload);
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(canonicalString);

    const signatureBuffer = await crypto.subtle.sign(
      {
        name: "ECDSA",
        hash: { name: "SHA-256" }
      },
      this.keyPair.privateKey,
      dataBuffer
    );

    const signatureHex = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    return {
      payload: ballotPayload,
      canonicalString,
      signatureHex,
      voterPubkey: this.pubkeyHex
    };
  }

  // Storage helper routines
  async _getStoredKey(key) {
    if (this.db) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction([STORE_NAME], "readonly");
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.inMemoryStore.get(key) || null;
  }

  async _putStoredKey(key, val) {
    if (this.db) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction([STORE_NAME], "readwrite");
        const req = tx.objectStore(STORE_NAME).put(val, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
    this.inMemoryStore.set(key, val);
  }
}
