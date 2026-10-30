# Deployment Guide

## Local Process

Use the per-service environment examples, install dependencies with `npm ci`, apply migrations, run the development seed, and start the backend/frontend as described in the root README. MySQL must be reachable before migrations and seed.

## Compose Development

`docker-compose.yml` runs MySQL 8.4, backend, and Vite. Its default secrets and seed credentials are local-development-only. Run `docker compose up --build`, then check `/health` and `http://localhost:5173`. Docker Compose was not available during this implementation, so this path needs a real build/start/stop test.

## Production Checklist

- Use a managed or secured MySQL instance, least-privilege database account, TLS, backups, and tested restore procedures.
- Set strong separate JWT access and refresh secrets, `NODE_ENV=production`, `COOKIE_SECURE=true`, an appropriate SameSite/domain policy, and exact CORS origins.
- Configure a trusted TLS-terminating proxy and review Express `trust proxy` for the deployment topology.
- Never run the development seed in production. Provision the first administrator through a protected operational process.
- Configure persistent, non-public upload storage and enforce file-type/size limits.
- Set SMTP values only when delivery is configured; monitor failed delivery logs.
- Configure log redaction/retention, dependency scanning, request limits/timeouts, and incident response.
- Review all permissions, branch scoping, reports, audit access, and personal-data retention.
- Do not claim online payment support without a provider, server-side signature verification, idempotency, and webhook tests.

## Backup and Restore

Use a scheduled `mysqldump --single-transaction --routines --triggers` suitable for the deployment's requirements, encrypt backups at rest, and test restores into an isolated database. For Compose development, stop the stack before manually moving the named volume; do not use destructive volume removal where data must be retained.