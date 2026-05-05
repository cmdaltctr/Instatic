# Page Builder CMS

Self-hosted CMS with an integrated visual page builder. The app serves the public website, admin editor, CMS API, published pages, and uploaded media from one Bun server. Supports **Postgres** and **SQLite** — selected by `DATABASE_URL`.

The site is currently private and the final public repository/image name is still work in progress. Deployment files are prepared for a published GitHub Container Registry image; replace placeholder image names with the final package before the first public release.

## Local Development

Install dependencies:

```sh
bun install
```

Start with zero external dependencies (SQLite, no Docker required):

```sh
bun run dev
```

Or run the full stack in containers (production-like Dockerfile + Postgres + persistent volumes):

```sh
docker compose -f compose.prod.yml -f compose.build.yml up --build
```

Open:

```txt
http://localhost:3001/admin
```

The first visit creates the site and admin account.

`bun run dev` defaults to SQLite at `.tmp/dev.db`. Set `DATABASE_URL=postgres://...` to use Postgres instead.

## Production Deployment

For a VPS/self-host install with bundled Postgres:

```sh
cp .env.production.example .env
docker compose -f compose.prod.yml up -d
```

For a VPS/self-host install with SQLite (no separate Postgres process):

```sh
docker compose -f compose.prod.yml -f compose.sqlite.yml up -d
```

To put HTTPS in front (Caddy + Let's Encrypt, auto-provisioned), layer `compose.tls.yml` on top of either DB mode and set `DOMAIN` in `.env`:

```sh
# Postgres + TLS
docker compose -f compose.prod.yml -f compose.tls.yml up -d
# SQLite + TLS
docker compose -f compose.prod.yml -f compose.sqlite.yml -f compose.tls.yml up -d
```

Without `compose.tls.yml`, the app is reachable on `http://server-ip:3001/admin`. With it, only Caddy is exposed (ports 80 / 443) and the cert is auto-provisioned for `${DOMAIN}` on the first request.

Production servers should normally pull the published Docker image configured in `.env.production.example`. Developers can build locally from source with:

```sh
docker compose -f compose.prod.yml -f compose.build.yml up -d --build
```

For managed hosts, deploy the Dockerfile from GitHub or a published image and connect it to managed Postgres with `DATABASE_URL`.

Deployment docs:

- [Production Docker image](docs/deployment/docker-image.md)
- [VPS Docker Compose](docs/deployment/vps-compose.md)
- [SQLite deployment](docs/deployment/sqlite-install.md)
- [HTTPS via Caddy](docs/deployment/tls-caddy.md)
- [Managed hosts](docs/deployment/managed-hosts.md)
- [Backup and restore](docs/deployment/backup-restore.md)
- [Release and image publishing workflow](docs/deployment/release-workflow.md)

## Required Production Data

Back up both:

- Database — Postgres (`pg_dump`) or SQLite (copy the `.db` file, or use [Litestream](https://litestream.io) for continuous replication)
- uploads directory or uploads volume

Do not run `docker compose -f compose.prod.yml down -v` unless you intentionally want to delete CMS data.

## Useful Commands

```sh
bun run build
bun test
docker build -t page-builder-cms:local .
docker compose -f compose.prod.yml pull app
curl http://localhost:3001/health
```
