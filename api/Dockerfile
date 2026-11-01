# Kitty API. Multi-stage so the image carries a static-ish binary and nothing else:
# sqlx bundles SQLite and reqwest uses rustls, so the runtime needs no libssl and no
# libsqlite3 (verified with ldd on the built binary).
FROM rust:1-slim-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY migrations ./migrations
COPY src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /src/target/release/kitty-api /usr/local/bin/kitty-api
ENV PORT=8080 \
    DATABASE_URL=/data/kitty.db \
    RUST_LOG=info
EXPOSE 8080
CMD ["kitty-api"]
