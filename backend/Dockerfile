FROM rust:1-bookworm

WORKDIR /app

RUN rustup component add rustfmt clippy

EXPOSE 3000

CMD ["cargo", "run", "--bin", "foggy_map_backend"]
