/**
 * Cloudflare Email Worker for Scientific Vote ZK-Email Verification
 * Intercepts incoming "mailto:" verification challenges, extracts the challenge nonce,
 * and streams raw canonical headers to the stateless Actix-Web broker.
 */
export default {
  async email(message, env, ctx) {
    const recipient = message.to; // e.g., verify-9f3c4b8a2d10@rationalprocess.eth
    const match = recipient.match(/^verify-([a-f0-9]{12,64})@/i);
    if (!match) {
      console.warn(`Rejected invalid recipient address format: ${recipient}`);
      message.setReject("Invalid challenge recipient format.");
      return;
    }
    const challengeId = match[1].toLowerCase();

    // Read raw email stream into text buffer
    const rawStream = message.raw;
    const reader = rawStream.getReader();
    let rawText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      rawText += new TextDecoder("utf-8").decode(value);
    }

    // Isolate RFC 5322 headers (discarding body payload for voter privacy)
    const headerEndIdx = rawText.indexOf("\r\n\r\n");
    const headersPayload = headerEndIdx !== -1 ? rawText.substring(0, headerEndIdx) : rawText;

    // Securely forward raw email headers to Actix-Web SSE broker
    const backendUrl = env.BACKEND_API_URL || "https://relayer.rationalprocess.eth.limo";
    const workerSecret = env.WORKER_SECRET || "soonami_dev_secret";

    try {
      const response = await fetch(`${backendUrl}/api/v1/challenge/push/${challengeId}`, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "X-Worker-Secret": workerSecret
        },
        body: headersPayload
      });

      if (!response.ok) {
        console.error(`Broker push failed with status: ${response.status}`);
      } else {
        console.log(`Streamed headers for challenge ${challengeId} successfully.`);
      }
    } catch (err) {
      console.error(`Failed to dispatch headers to backend broker: ${err}`);
    }
  }
};
