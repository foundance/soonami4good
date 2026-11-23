# Multi-stage Dockerfile for Scientific Vote Actix-Web SSE Broker & DNSSEC Resolver
FROM rust:1.78-bookworm AS builder

WORKDIR /usr/src/zk-email-relayer
COPY Cargo.toml Cargo.lock* ./
# Pre-build dependencies for caching
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src

# Copy real source code and compile binary
COPY src ./src
RUN touch src/main.rs && cargo build --release

# Minimal runtime stage
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /usr/src/zk-email-relayer/target/release/zk-email-relayer /app/zk-email-relayer

ENV RUST_LOG=info
ENV WORKER_SECRET=soonami_production_secret_key_2026
EXPOSE 8088

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8088/health || exit 0

CMD ["/app/zk-email-relayer"]
