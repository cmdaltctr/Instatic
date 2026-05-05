# HTTPS via Caddy (compose.tls.yml)

The `compose.tls.yml` override runs a Caddy reverse proxy in front of the CMS, terminating TLS at a real domain with auto-provisioned Let's Encrypt certificates. It composes on top of either the Postgres or SQLite production stack — pick whichever DB mode you want, then add `-f compose.tls.yml`.

## Prerequisites

1. **A domain you control** with DNS A/AAAA records pointing at the server's public IP.
2. **Ports 80 and 443** open to the public internet (Let's Encrypt HTTP-01 and TLS-ALPN-01 challenges).
3. The `Caddyfile` and `compose.tls.yml` files in your install directory (already in the repo at the root).

## One-time setup

Edit `.env` and set:

```sh
DOMAIN=cms.example.com
LETSENCRYPT_EMAIL=ops@example.com   # optional but recommended (cert expiry notices)
```

The other secret (`POSTGRES_PASSWORD`) is unchanged.

## Bring it up

**Postgres + TLS:**

```sh
docker compose -f compose.prod.yml -f compose.tls.yml up -d
```

**SQLite + TLS:**

```sh
docker compose -f compose.prod.yml -f compose.sqlite.yml -f compose.tls.yml up -d
```

The first request to `https://cms.example.com` triggers cert issuance (takes a few seconds). Cert state persists in the `caddy_data` named volume across restarts and re-deploys.

## What the override does

- Adds a `caddy` service listening on `:80`, `:443`, and `:443/udp` (HTTP/3).
- Auto-provisions a Let's Encrypt certificate for `${DOMAIN}` on first request.
- Reverse-proxies all traffic to `app:3001` over the internal Docker network.
- **Removes the `app` host port mapping** (`!reset []`) so the only public-facing port is Caddy. The CMS is no longer reachable on `:3001` from outside; only Caddy can reach it via the docker network.

## Verifying

```sh
# HTTPS should serve the admin shell:
curl -I https://cms.example.com/health
# → HTTP/2 200

# Plain HTTP should redirect to HTTPS automatically (Caddy default):
curl -I http://cms.example.com/
# → HTTP/1.1 308 Permanent Redirect
# → location: https://cms.example.com/
```

If cert provisioning fails, check Caddy's logs:

```sh
docker compose -f compose.prod.yml -f compose.tls.yml logs caddy
```

Common issues:
- **DNS not propagated** — `dig +short cms.example.com` from outside the server should return your IP.
- **Port 80 blocked** — Let's Encrypt HTTP-01 needs port 80 reachable. UFW/iptables/cloud firewall rules.
- **Rate limit** — Let's Encrypt limits cert issuance per domain per week. While testing, point Caddy at the staging directory by adding `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` inside the global `{ ... }` block of `Caddyfile`.

## Customizing the Caddyfile

The Caddyfile at the repo root is a template. Common customizations:

**Multiple domains:**

```caddy
cms.example.com, www.cms.example.com {
    encode zstd gzip
    reverse_proxy app:3001
}
```

**Basic auth on /admin:**

```caddy
{$DOMAIN} {
    encode zstd gzip
    @admin path /admin /admin/*
    basic_auth @admin {
        # Generate with: caddy hash-password
        admin $2a$14$...
    }
    reverse_proxy app:3001
}
```

**IP allowlist on /admin:**

```caddy
{$DOMAIN} {
    encode zstd gzip
    @admin path /admin /admin/*
    @trusted remote_ip 203.0.113.0/24
    handle @admin {
        @block not @trusted
        respond @block 403
        reverse_proxy app:3001
    }
    reverse_proxy app:3001
}
```

**Static caching for published pages:**

The CMS already sets `Cache-Control: public, max-age=31536000, immutable` on `/assets/*` (hashed). For additional CDN-friendly caching at the Caddy layer:

```caddy
@static path *.css *.js *.png *.webp *.woff2
header @static Cache-Control "public, max-age=31536000, immutable"
```

After editing, reload Caddy without restarting:

```sh
docker compose -f compose.prod.yml -f compose.tls.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## Removing TLS

To go back to plain HTTP on `:3001`:

```sh
docker compose -f compose.prod.yml -f compose.tls.yml down
docker compose -f compose.prod.yml up -d
```

The certs in `caddy_data` are preserved; if you re-enable TLS later, Caddy reuses the existing cert if it's still valid.
