use actix_cors::Cors;
use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer, Responder};
use futures_util::stream::Stream;
use hickory_resolver::config::{ResolverConfig, ResolverOpts};
use hickory_resolver::TokioAsyncResolver;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tracing::{error, info, warn};

/// In-memory pub-sub broker routing inbound raw emails to active browser SSE streams
pub struct ChallengeBroker {
    channels: Mutex<HashMap<String, broadcast::Sender<String>>>,
}

impl ChallengeBroker {
    pub fn new() -> Self {
        Self {
            channels: Mutex::new(HashMap::new()),
        }
    }

    pub fn subscribe(&self, challenge_id: &str) -> broadcast::Receiver<String> {
        let mut map = self.channels.lock().unwrap();
        map.entry(challenge_id.to_string())
            .or_insert_with(|| broadcast::channel(4).0)
            .subscribe()
    }

    pub fn publish(&self, challenge_id: &str, raw_email: String) -> usize {
        let map = self.channels.lock().unwrap();
        if let Some(tx) = map.get(challenge_id) {
            tx.send(raw_email).unwrap_or(0)
        } else {
            0
        }
    }
}

#[derive(Serialize, Deserialize)]
pub struct PushResponse {
    pub status: String,
    pub receivers: usize,
}

#[derive(Serialize, Deserialize)]
pub struct DnssecSnapshotResponse {
    pub domain: String,
    pub selector: String,
    pub rsa_modulus_hex: String,
    pub key_bits: usize,
    pub dnssec_validated: bool,
    pub pubkey_hash: String,
}

/// Implements RFC 6376 Relaxed Header Canonicalization
/// Converts headers into standard canonical format required by ZK circuit
pub fn canonicalize_relaxed_headers(raw_headers: &str) -> String {
    let mut unfolded: Vec<String> = Vec::new();
    
    // Unfold multi-line headers (RFC 5322 section 2.2.3)
    for line in raw_headers.lines() {
        if line.starts_with(' ') || line.starts_with('\t') {
            if let Some(last) = unfolded.last_mut() {
                last.push(' ');
                last.push_str(line.trim());
            }
        } else if !line.trim().is_empty() {
            unfolded.push(line.to_string());
        }
    }

    // Canonicalize each header line (RFC 6376 section 3.4.2)
    let mut canonicalized = String::new();
    for line in unfolded {
        if let Some((name, val)) = line.split_once(':') {
            let canon_name = name.trim().to_ascii_lowercase();
            // Convert multiple consecutive WSP to single SP
            let canon_val = val
                .split_whitespace()
                .collect::<Vec<&str>>()
                .join(" ");
            canonicalized.push_str(&format!("{}:{}\r\n", canon_name, canon_val));
        }
    }
    canonicalized
}

/// Endpoint called by Cloudflare Email Worker when an inbound verification email is intercepted
#[actix_web::post("/api/v1/challenge/push/{challenge_id}")]
async fn push_challenge_email(
    broker: web::Data<Arc<ChallengeBroker>>,
    path: web::Path<String>,
    body: String,
    req: HttpRequest,
) -> impl Responder {
    let challenge_id = path.into_inner().to_lowercase();

    // 1. Validate challenge ID format (hex string between 12 and 64 chars)
    if !challenge_id.chars().all(|c| c.is_ascii_hexdigit()) || challenge_id.len() < 12 || challenge_id.len() > 64 {
        warn!("Rejected malformed challenge ID: {}", challenge_id);
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Invalid challenge ID format (must be 12-64 hex chars)"
        }));
    }

    // 2. Prevent memory exhaustion (max 2MB limit for email headers)
    if body.len() > 2 * 1024 * 1024 {
        warn!("Payload exceeded 2MB limit for challenge {}", challenge_id);
        return HttpResponse::PayloadTooLarge().json(serde_json::json!({
            "error": "Header payload exceeds 2MB limit"
        }));
    }

    // 3. Verify worker authorization secret if configured
    let expected_secret = std::env::var("WORKER_SECRET").unwrap_or_else(|_| "soonami_dev_secret".to_string());
    let provided_secret = req.headers().get("X-Worker-Secret").and_then(|h| h.to_str().ok());

    if provided_secret != Some(&expected_secret) {
        warn!("Unauthorized attempt to push challenge {}", challenge_id);
        return HttpResponse::Unauthorized().json(serde_json::json!({
            "error": "Invalid or missing X-Worker-Secret"
        }));
    }

    info!("Received email for challenge ID: {} ({} bytes)", challenge_id, body.len());
    let receivers = broker.publish(&challenge_id, body);

    HttpResponse::Ok().json(PushResponse {
        status: "streamed".to_string(),
        receivers,
    })
}

/// SSE endpoint connected to the browser (Screen 5 in Scientific Vote Onboarding)
#[actix_web::get("/api/v1/challenge/stream/{challenge_id}")]
async fn stream_challenge_headers(
    broker: web::Data<Arc<ChallengeBroker>>,
    path: web::Path<String>,
) -> impl Responder {
    let challenge_id = path.into_inner().to_lowercase();
    info!("Client subscribed to SSE stream for challenge: {}", challenge_id);
    let mut rx = broker.subscribe(&challenge_id);

    let stream = async_stream::stream! {
        match tokio::time::timeout(std::time::Duration::from_secs(180), rx.recv()).await {
            Ok(Ok(raw_email)) => {
                let header_end = raw_email.find("\r\n\r\n").or_else(|| raw_email.find("\n\n")).unwrap_or(raw_email.len());
                let headers_only = &raw_email[..header_end];
                let canon_headers = canonicalize_relaxed_headers(headers_only);

                yield Ok::<web::Bytes, actix_web::Error>(web::Bytes::from(format!(
                    "data: {}\n\n",
                    serde_json::json!({
                        "status": "received",
                        "raw_headers": canon_headers,
                        "timestamp": std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_secs()
                    })
                )));
            }
            Ok(Err(e)) => {
                error!("Broadcast channel error for {}: {:?}", challenge_id, e);
                yield Ok::<web::Bytes, actix_web::Error>(web::Bytes::from(
                    "data: {\"status\":\"error\",\"message\":\"Broadcast channel closed\"}\n\n"
                ));
            }
            Err(_) => {
                warn!("Challenge timeout for {}", challenge_id);
                yield Ok::<web::Bytes, actix_web::Error>(web::Bytes::from(
                    "data: {\"status\":\"timeout\",\"message\":\"Email verification timed out after 180s\"}\n\n"
                ));
            }
        }
    };

    HttpResponse::Ok()
        .content_type("text/event-stream")
        .append_header(("Cache-Control", "no-cache"))
        .append_header(("Connection", "keep-alive"))
        .streaming(stream)
}

/// Snapshot institutional DKIM key with cryptographic DNSSEC verification
#[actix_web::get("/api/v1/dnssec/snapshot/{domain}/{selector}")]
async fn get_dnssec_snapshot(path: web::Path<(String, String)>) -> impl Responder {
    let (domain, selector) = path.into_inner();
    let query_name = format!("{}._domainkey.{}", selector, domain);

    let mut opts = ResolverOpts::default();
    opts.validate = true; // Enforce DNSSEC chain verification
    let resolver = match TokioAsyncResolver::tokio(ResolverConfig::cloudflare(), opts) {
        Ok(r) => r,
        Err(e) => {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to create DNSSEC resolver: {}", e)
            }));
        }
    };

    match resolver.txt_lookup(&query_name).await {
        Ok(lookup) => {
            // Concatenate all TXT slices directly (handling RFC 1035 multi-string TXT records)
            let mut record_data = String::new();
            for rdata in lookup.iter() {
                for txt in rdata.txt_data() {
                    record_data.push_str(&String::from_utf8_lossy(txt));
                }
            }

            // Parse p= tag containing base64 encoded RSA public key modulus
            if let Some(p_start) = record_data.find("p=") {
                let p_sub = &record_data[p_start + 2..];
                let p_raw = p_sub.split(';').next().unwrap_or("").trim();
                
                // Strip all whitespace/newlines from base64 string
                let p_clean: String = p_raw.chars().filter(|c| !c.is_whitespace()).collect();

                // Calculate bit length
                let estimated_bits = (p_clean.len() * 6) - 16; // Approximate RSA bits
                let key_bits = if estimated_bits > 3000 { 4096 } else if estimated_bits > 1500 { 2048 } else { 1024 };

                HttpResponse::Ok().json(serde_json::json!({
                    "domain": domain,
                    "selector": selector,
                    "record": record_data,
                    "pubkey_base64": p_clean,
                    "key_bits": key_bits,
                    "dnssec_validated": true
                }))
            } else {
                HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "No 'p=' tag found in DKIM record",
                    "raw_record": record_data
                }))
            }
        }
        Err(e) => {
            HttpResponse::NotFound().json(serde_json::json!({
                "error": format!("DNS lookup failed for {}: {}", query_name, e),
                "dnssec_validated": false
            }))
        }
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt::init();
    info!("Starting Scientific Vote ZK-Email Actix Broker on 0.0.0.0:8088");

    let broker = Arc::new(ChallengeBroker::new());

    HttpServer::new(move || {
        let cors = Cors::permissive();
        App::new()
            .wrap(cors)
            .app_data(web::Data::new(broker.clone()))
            .service(push_challenge_email)
            .service(stream_challenge_headers)
            .service(get_dnssec_snapshot)
    })
    .bind(("0.0.0.0", 8088))?
    .run()
    .await
}
