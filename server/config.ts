export interface ServerConfig {
  port: number
  databaseUrl: string
  uploadsDir: string
  staticDir: string
  trustedProxyCidrs: string[]
}

function readCsvList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function readServerConfig(
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  return {
    port: Number(env.PORT ?? 3001),
    databaseUrl: env.DATABASE_URL ?? 'sqlite:./.tmp/dev.db',
    uploadsDir: env.UPLOADS_DIR ?? './uploads',
    staticDir: env.STATIC_DIR ?? './dist',
    trustedProxyCidrs: readCsvList(env.TRUSTED_PROXY_CIDRS),
  }
}
