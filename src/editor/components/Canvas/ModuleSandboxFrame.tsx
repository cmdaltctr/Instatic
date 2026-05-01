/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { AnyModuleDefinition } from '../../../core/module-engine/types'
import { createModuleImportMap } from '../../../core/module-engine/runtimeResolver'
import type { SiteDocument } from '../../../core/page-tree/types'
import { useEditorStore } from '../../../core/editor-store/store'
import { cn } from '../../../ui/cn'
import { generateClassCSS } from '../../../core/publisher/classCss'
import styles from './ModuleSandboxFrame.module.css'

const SANDBOX_MESSAGE_SOURCE = 'page-builder-module-sandbox'
const HOST_MESSAGE_SOURCE = 'page-builder-module-host'

interface SandboxContext {
  props: Record<string, unknown>
  nodeId: string
  isSelected: boolean
  className: string
  dependencies: Record<string, string>
  apiVersion: 1
}

interface SandboxSrcDocInput {
  title: string
  source: string
  importMap: ReturnType<typeof createModuleImportMap>
  context: SandboxContext
  classCSS: string
}

interface ModuleSandboxFrameProps {
  moduleDefinition: AnyModuleDefinition
  props: Record<string, unknown>
  nodeId: string
  isSelected: boolean
  mcClassName?: string
  classIds?: string[]
}

interface SandboxUpdatePayload {
  context: SandboxContext
  classCSS: string
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeStyleContent(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style')
}

function base64EncodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function getNodeClassCSS(site: SiteDocument | null, classIds: string[] | undefined): string {
  if (!site || !classIds?.length) return ''

  const classes: SiteDocument['classes'] = {}
  for (const id of classIds) {
    const cls = site.classes[id]
    if (cls) classes[id] = cls
  }

  if (Object.keys(classes).length === 0) return ''
  return generateClassCSS(classes, site.breakpoints)
}

export function createSandboxSrcDoc({
  title,
  source,
  importMap,
  context,
  classCSS,
}: SandboxSrcDocInput): string {
  const moduleUrl = `data:text/javascript;base64,${base64EncodeUtf8(source)}`

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtmlText(title)}</title>
    <script type="importmap">${safeJson(importMap)}</script>
    <style>
      html,
      body,
      #root {
        width: 100%;
        min-height: 100%;
        margin: 0;
      }

      body {
        overflow: hidden;
        background: transparent;
        color: #f8fafc;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }

      #root {
        height: 100%;
      }

      .pb-runtime-error {
        display: grid;
        min-height: 240px;
        place-items: center;
        padding: 16px;
        color: #fecaca;
        background: #1f0f13;
        font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        white-space: pre-wrap;
      }
    </style>
    <style id="pb-class-styles">${escapeStyleContent(classCSS)}</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      let context = ${safeJson(context)};
      const moduleUrl = ${safeJson(moduleUrl)};
      const root = document.getElementById('root');
      const classStyleEl = document.getElementById('pb-class-styles');
      root.className = context.className || '';
      let runtime = null;
      let cleanup = null;
      let updateRuntime = null;
      let mounting = null;
      let updateChain = Promise.resolve();

      function emit(type) {
        try {
          window.parent.postMessage({
            source: ${safeJson(SANDBOX_MESSAGE_SOURCE)},
            type,
            nodeId: context.nodeId,
          }, '*');
        } catch (_) {}
      }

      function showError(error) {
        const message = error instanceof Error ? error.stack || error.message : String(error);
        root.textContent = '';
        const pre = document.createElement('pre');
        pre.className = 'pb-runtime-error';
        pre.textContent = message;
        root.appendChild(pre);
      }

      document.addEventListener('pointerdown', () => emit('pointerdown'), true);
      document.addEventListener('dblclick', () => emit('dblclick'), true);

      function mountRuntime() {
        if (mounting) return mounting;

        const mountPromise = (async () => {
          if (cleanup) cleanup();
          cleanup = null;
          updateRuntime = null;
          root.textContent = '';

          if (typeof runtime.mount !== 'function') {
            throw new Error('Sandbox runtime must export mount(root, context).');
          }
          const result = await runtime.mount(root, context);

          if (typeof result === 'function') {
            cleanup = result;
          } else if (result && typeof result === 'object') {
            cleanup = typeof result.cleanup === 'function' ? result.cleanup : null;
            updateRuntime = typeof result.update === 'function' ? result.update : null;
          }

          if (!updateRuntime && typeof runtime.update === 'function') {
            updateRuntime = runtime.update;
          }
        })();

        mounting = mountPromise;
        mountPromise.then(
          () => {
            if (mounting === mountPromise) mounting = null;
          },
          () => {
            if (mounting === mountPromise) mounting = null;
          },
        );
        return mountPromise;
      }

      async function applyUpdate(nextContext, nextClassCSS) {
        context = nextContext;
        root.className = context.className || '';
        if (typeof nextClassCSS === 'string' && classStyleEl.textContent !== nextClassCSS) {
          classStyleEl.textContent = nextClassCSS;
        }

        if (!runtime) return;
        if (mounting) await mounting;

        if (updateRuntime) {
          await updateRuntime(root, context);
        } else {
          await mountRuntime();
        }
      }

      window.addEventListener('message', (event) => {
        const message = event.data;
        if (
          !message ||
          message.source !== ${safeJson(HOST_MESSAGE_SOURCE)} ||
          message.type !== 'update' ||
          !message.context ||
          message.context.nodeId !== context.nodeId
        ) {
          return;
        }

        updateChain = updateChain.then(() => applyUpdate(message.context, message.classCSS)).catch((error) => {
          console.error('[module sandbox update]', error);
          showError(error);
        });
      });

      try {
        runtime = await import(moduleUrl);
        await mountRuntime();
      } catch (error) {
        console.error('[module sandbox]', error);
        showError(error);
      }

      window.addEventListener('pagehide', () => {
        if (cleanup) cleanup();
      });
    </script>
  </body>
</html>`
}

export function ModuleSandboxFrame({
  moduleDefinition,
  props,
  nodeId,
  isSelected,
  mcClassName,
  classIds,
}: ModuleSandboxFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const updateFrameRef = useRef<number | null>(null)
  const pendingUpdateRef = useRef<SandboxUpdatePayload | null>(null)
  const site = useEditorStore((s) => s.site)
  const packageJson = useEditorStore((s) => s.packageJson)
  const selectNode = useEditorStore((s) => s.selectNode)
  const setFocusedPanel = useEditorStore((s) => s.setFocusedPanel)
  const runtime = moduleDefinition.editorRuntime?.sandbox

  const classCSS = useMemo(
    () => getNodeClassCSS(site, classIds),
    [site, classIds],
  )

  const importMap = useMemo(
    () => createModuleImportMap(moduleDefinition, { packageJson, strictSiteManifest: true }),
    [moduleDefinition, packageJson],
  )

  const sandboxContext = useMemo<SandboxContext>(
    () => ({
      props,
      nodeId,
      isSelected,
      className: mcClassName ?? '',
      dependencies: importMap.imports,
      apiVersion: 1,
    }),
    [props, nodeId, isSelected, mcClassName, importMap],
  )

  const srcDoc = useMemo(() => {
    if (!runtime) return ''

    return createSandboxSrcDoc({
      title: `${moduleDefinition.name} preview`,
      source: runtime.source,
      importMap,
      context: sandboxContext,
      classCSS,
    })
    // The iframe document must stay mounted while props/class styles change.
    // Those values are delivered by postMessage below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, moduleDefinition.name, importMap, sandboxContext.nodeId])

  const flushUpdate = useCallback(() => {
    const payload = pendingUpdateRef.current
    if (!payload) return

    pendingUpdateRef.current = null
    iframeRef.current?.contentWindow?.postMessage({
      source: HOST_MESSAGE_SOURCE,
      type: 'update',
      context: payload.context,
      classCSS: payload.classCSS,
    }, '*')
  }, [])

  const scheduleUpdate = useCallback(() => {
    pendingUpdateRef.current = { context: sandboxContext, classCSS }
    if (updateFrameRef.current !== null) return

    updateFrameRef.current = window.requestAnimationFrame(() => {
      updateFrameRef.current = null
      flushUpdate()
    })
  }, [sandboxContext, classCSS, flushUpdate])

  const postUpdate = useCallback(() => {
    pendingUpdateRef.current = { context: sandboxContext, classCSS }
    if (updateFrameRef.current !== null) {
      window.cancelAnimationFrame(updateFrameRef.current)
      updateFrameRef.current = null
    }
    flushUpdate()
  }, [sandboxContext, classCSS, flushUpdate])

  useEffect(() => {
    scheduleUpdate()
  }, [scheduleUpdate])

  useEffect(() => () => {
    if (updateFrameRef.current !== null) {
      window.cancelAnimationFrame(updateFrameRef.current)
      updateFrameRef.current = null
    }
  }, [])

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return

      const message = event.data as { source?: string; type?: string; nodeId?: string } | null
      if (!message || message.source !== SANDBOX_MESSAGE_SOURCE || message.nodeId !== nodeId) return

      if (message.type === 'pointerdown' || message.type === 'dblclick') {
        selectNode(nodeId)
        setFocusedPanel('canvas')
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [nodeId, selectNode, setFocusedPanel])

  if (!runtime) {
    return (
      <div className={styles.fallback}>
        Missing sandbox runtime for {moduleDefinition.name}
      </div>
    )
  }

  return (
    <div
      className={cn(styles.frame, mcClassName)}
      style={{ '--module-sandbox-min-height': `${runtime.minHeight ?? 360}px` } as CSSProperties}
    >
      <iframe
        ref={iframeRef}
        title={`${moduleDefinition.name} sandbox preview`}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        onLoad={postUpdate}
        className={styles.iframe}
      />
    </div>
  )
}
