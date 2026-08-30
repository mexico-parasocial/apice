-- PostgreSQL initialization run automatically by the official postgres image
-- on first startup (when the data directory is empty).
CREATE DATABASE IF NOT EXISTS apice_streamplace;
GRANT ALL PRIVILEGES ON DATABASE apice_streamplace TO apice;
