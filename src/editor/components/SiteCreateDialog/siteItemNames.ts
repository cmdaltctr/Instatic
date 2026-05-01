export type SiteCreateKind = 'page' | 'component' | 'style' | 'script'

export function slugifySiteItemName(value: string, fallback = 'page') {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || fallback
}

export function toPascalCaseSiteItemName(value: string, fallback = 'Component') {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('') || fallback
}

function stripSitePrefix(value: string, prefix: string) {
  return value.trim().replace(new RegExp(`^${prefix.replace(/\//g, '\\/')}`), '')
}

function ensureExtension(value: string, extension: string) {
  return value.endsWith(extension) ? value : `${value}${extension}`
}

export function buildStylePath(value: string) {
  const name = ensureExtension(stripSitePrefix(value, 'src/styles/'), '.css')
  return `src/styles/${name}`
}

export function buildScriptPath(value: string) {
  const name = ensureExtension(stripSitePrefix(value, 'src/scripts/'), '.ts')
  return `src/scripts/${name}`
}
