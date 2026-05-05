# Managed Host Deployment

Managed hosts usually run one web container and provide Postgres as a separate service. Use the production Dockerfile and connect the app to the provider's Postgres connection string.

## Required Settings

Set these variables in the provider dashboard:

```txt
DATABASE_URL=postgres://...
STATIC_DIR=/app/dist
UPLOADS_DIR=/app/uploads
```

Most providers set `PORT` automatically. The server reads `PORT` at runtime, so keep the provider value when it exists.

## Railway

Recommended shape:

```txt
Page Builder CMS service from Dockerfile
Railway Postgres service
Railway volume mounted at /app/uploads
```

Railway documents persistent volumes and lets you choose the mount path. Mount the volume at `/app/uploads`, then set `UPLOADS_DIR=/app/uploads`.

Railway also expects public web services to listen on `0.0.0.0:$PORT`; this server reads the injected `PORT` variable.

Useful docs:

- Railway volumes: https://docs.railway.com/volumes
- Railway public networking: https://docs.railway.com/public-networking

## Render

Recommended shape:

```txt
Render web service from Dockerfile
Render Postgres database
Render persistent disk mounted under /app/uploads
```

Render supports Docker services and persistent disks. Attach a disk for uploads and set `UPLOADS_DIR` to its mount path.

Useful docs:

- Render Docker: https://render.com/docs/docker
- Render persistent disks: https://render.com/docs/disks

## Fly.io

Recommended shape:

```txt
Fly app from Dockerfile
Fly Postgres or external Postgres
Fly volume mounted at /app/uploads
```

Keep one app instance until media storage moves to S3-compatible object storage. Multiple app instances with local uploads can serve inconsistent files unless uploads are shared.

## Heroku

Heroku can run Docker images and Heroku Postgres, but normal dynos have an ephemeral filesystem. Uploaded media will be lost on restart unless media is stored outside the dyno.

Do not use Heroku for production CMS media until S3-compatible storage is implemented, or configure an external media store yourself.

Useful docs:

- Heroku container registry/runtime: https://devcenter.heroku.com/articles/container-registry-and-runtime
- Heroku ephemeral filesystem: https://devcenter.heroku.com/articles/dyno-isolation

## Current Media Limitation

The current production image stores uploads on a local filesystem path. Choose hosts that support persistent disks or volumes for `/app/uploads`.

The next deployment improvement should add S3-compatible media storage for hosts where local disk is not durable or not shared between instances.
