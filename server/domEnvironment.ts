import { GlobalWindow } from 'happy-dom'

const DOM_GLOBALS = [
  'Node',
  'Element',
  'HTMLElement',
  'HTMLAnchorElement',
  'DocumentFragment',
  'DOMParser',
  'XMLSerializer',
] as const

export function installServerDomEnvironment(): void {
  const globalRecord = globalThis as Record<string, unknown>
  if (globalRecord.window && globalRecord.document) return

  const serverWindow = new GlobalWindow({ url: 'http://localhost/' })
  const windowRecord = serverWindow as unknown as Record<string, unknown>

  globalRecord.window = serverWindow
  globalRecord.document = serverWindow.document

  for (const key of DOM_GLOBALS) {
    const value = windowRecord[key]
    if (value !== undefined) globalRecord[key] = value
  }
}

installServerDomEnvironment()
