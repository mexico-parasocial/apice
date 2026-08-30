# Dockerfile for a self-hosted Streamplace node.
# Streamplace does not publish an official Docker image, so this downloads the
# published Linux binary from the Streamplace package registry.
#
# IMPORTANT: the package file IDs below point to a known release. Update them
# to the latest package files for your target version/architecture.
#   - linux-amd64: 786  (streamplace-v0.11.13-linux-amd64.tar.gz)
#   - linux-arm64: 789  (streamplace-v0.11.13-linux-arm64.tar.gz)
ARG STREAMPLACE_PACKAGE_FILE_ID=786
FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      tar \
    && rm -rf /var/lib/apt/lists/*

ARG STREAMPLACE_PACKAGE_FILE_ID
ENV STREAMPLACE_DOWNLOAD_URL=https://git-cloudflare.stream.place/streamplace/streamplace/-/package_files/${STREAMPLACE_PACKAGE_FILE_ID}/download

RUN mkdir -p /app && \
    curl -fsSL "$STREAMPLACE_DOWNLOAD_URL" | tar xzv -C /app && \
    chmod +x /app/streamplace

WORKDIR /app
EXPOSE 38080

# The default CMD runs the binary without flags. Override `command` in
# docker-compose.prod.yml with the flags your deployment needs, e.g.:
#   --public-host=vod.apice.example.com
#   --app-bundle-id=com.apice.vod
#   --rate-limit-per-second=10
CMD ["./streamplace"]
