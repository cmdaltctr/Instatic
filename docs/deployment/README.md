# Deployment overview

This index maps every supported deployment target to the exact compose command and the docs you'll need. Pick a row, follow the linked guide.

## Quick decision tree

1. **Just running locally?** → use `bun run dev`. SQLite, no Docker, no env file. See the project [README](../../README.md#local-development).
2. **Self-hosting on one server?** → see the matrix below.
3. **Managed PaaS (Railway / Render / Fly)?** → see [managed-hosts.md](managed-hosts.md).

## Self-host compose matrix

Every production stack starts with `compose.prod.yml`. Layered overrides switch the database engine and add a TLS-terminating reverse proxy.

| What you want | Stack command | Public surface | Containers | Docs |
|---|---|---|---|---|
| Postgres, plain HTTP | `docker compose -f compose.prod.yml up -d` | `http://server:${HOST_PORT}` | `app` + `postgres` | [vps-compose.md](vps-compose.md) |
| Postgres + HTTPS | `docker compose -f compose.prod.yml -f compose.tls.yml up -d` | `https://${DOMAIN}` | `app` + `postgres` + `caddy` | [tls-caddy.md](tls-caddy.md) |
| SQLite, plain HTTP | `docker compose -f compose.prod.yml -f compose.sqlite.yml up -d` | `http://server:${HOST_PORT}` | `app` only | [sqlite-install.md](sqlite-install.md) |
| SQLite + HTTPS | `docker compose -f compose.prod.yml -f compose.sqlite.yml -f compose.tls.yml up -d` | `https://${DOMAIN}` | `app` + `caddy` | [sqlite-install.md](sqlite-install.md) + [tls-caddy.md](tls-caddy.md) |

Build-from-source (when no published image exists yet): append `-f compose.build.yml --build` to any of the above and ensure `PAGE_BUILDER_IMAGE` resolves to a tag your local Docker daemon can produce.

## Per-mode trade-offs

| Criterion | Postgres | SQLite |
|---|---|---|
| Container count | 2 | 1 |
| RAM floor | ~256 MB (postgres) + ~80 MB (app) | ~80 MB (app) |
| Concurrent admin writers | Many | One at a time (WAL allows concurrent reads) |
| Horizontal scale (>1 app instance) | ✅ | ❌ (file-locked) |
| Backup tooling | `pg_dump` / streaming replication | File copy / [Litestream](https://litestream.io) |
| Setup complexity | Low | Trivial |
| Best for | Small business → mid SaaS | Hobby / single-tenant / per-tenant SaaS |

The CMS visitor traffic hits generated static HTML (it doesn't touch the DB), so the SQLite single-writer constraint only matters when multiple humans are saving in the admin simultaneously.

## File reference

| File | Role |
|---|---|
| `compose.prod.yml` | Production stack base (Postgres + app, ports + healthchecks + restart policies) |
| `compose.sqlite.yml` | Override that disables Postgres and points DATABASE_URL at a SQLite file |
| `compose.tls.yml` | Override that adds Caddy in front for HTTPS via Let's Encrypt |
| `compose.build.yml` | Override that builds the app image from source instead of pulling |
| `docker-compose.yml` | Local-dev Postgres (used by `bun run dev` Postgres mode) — not a prod file |
| `Dockerfile` | The production app image |
| `Caddyfile` | TLS reverse-proxy config consumed by `compose.tls.yml` |
| `.env.production.example` | Production env template — copy to `.env` and edit |

## Documentation

- [Production Docker image](docker-image.md) — building, tagging, running standalone
- [VPS Docker Compose (Postgres)](vps-compose.md) — step-by-step VPS install with Postgres
- [SQLite deployment](sqlite-install.md) — when to use SQLite, Litestream replication
- [HTTPS via Caddy](tls-caddy.md) — auto-TLS layered on either DB mode
- [Backup and restore](backup-restore.md) — Postgres + SQLite, ad-hoc + Litestream
- [Managed hosts](managed-hosts.md) — Railway, Render, Fly, Heroku notes
- [Release and image publishing workflow](release-workflow.md) — tag → GHCR → `docker pull`

## Pre-release notes

Until the public repo and image registry are finalized:

- `PAGE_BUILDER_IMAGE` defaults to `ghcr.io/GITHUB_OWNER/IMAGE_NAME:latest` (placeholder).
- Until that image exists, build locally: `docker build -t page-builder-cms:local .` and set `PAGE_BUILDER_IMAGE=page-builder-cms:local` in `.env`.
- Once the public release lands, the placeholders get replaced with the real image name everywhere.
