FROM golang:1.26.8-bookworm AS build
ENV CGO_ENABLED=0
# Resolved upstream release tags, never @latest.
RUN go install github.com/minio/minio@9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a \
 && go install github.com/minio/mc@d6541ea280b73a834b64d4097e21f2be77676104
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /go/bin/minio /go/bin/mc /usr/local/bin/
ENTRYPOINT ["minio"]
