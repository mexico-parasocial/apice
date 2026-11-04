FROM minio/mc:latest AS mc

FROM postgres:16-alpine
COPY --from=mc /usr/bin/mc /usr/local/bin/mc
