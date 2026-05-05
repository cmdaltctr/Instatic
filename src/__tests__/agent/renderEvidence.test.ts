import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { captureAgentRenderSnapshot } from '@core/agent/renderEvidence'

beforeEach(() => {
  document.body.innerHTML = ''
})

// Clear DOM after each test too — these tests inject ad-hoc elements directly
// onto document.body (bypassing React testing-library's render+cleanup), so
// leftover nodes (e.g. [data-breakpoint-id="mobile"]) would otherwise leak
// into later suites that querySelector the same attributes.
afterEach(() => {
  document.body.innerHTML = ''
})

function setRect(el: Element, rect: Partial<DOMRectReadOnly>) {
  const full = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: rect.y ?? 0,
    left: rect.x ?? 0,
    right: (rect.x ?? 0) + (rect.width ?? 0),
    bottom: (rect.y ?? 0) + (rect.height ?? 0),
    toJSON: () => ({}),
    ...rect,
  } as DOMRect
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => full,
  })
}

describe('captureAgentRenderSnapshot — on-demand browser bridge', () => {
  it('captures breakpoint layout, node boxes, and overflow warnings from the canvas DOM', async () => {
    const viewport = document.createElement('div')
    viewport.dataset.breakpointId = 'mobile'
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 375 },
      clientHeight: { configurable: true, value: 600 },
      scrollWidth: { configurable: true, value: 420 },
      scrollHeight: { configurable: true, value: 600 },
    })
    setRect(viewport, { x: 0, y: 0, width: 375, height: 600 })

    const wrapper = document.createElement('div')
    wrapper.dataset.nodeId = 'title'
    wrapper.dataset.moduleId = 'base.text'
    wrapper.textContent = 'Overflowing headline'
    setRect(wrapper, { x: 8, y: 16, width: 420, height: 64 })
    viewport.appendChild(wrapper)
    document.body.appendChild(viewport)

    const snapshot = await captureAgentRenderSnapshot({
      breakpointId: 'mobile',
      captureScreenshot: false,
    })

    expect(snapshot).not.toBeNull()
    expect(snapshot!.breakpointId).toBe('mobile')
    expect(snapshot!.layout.viewport.scrollWidth).toBe(420)
    expect(snapshot!.layout.nodes[0].nodeId).toBe('title')
    expect(snapshot!.layout.warnings.some((warning) =>
      warning.type === 'horizontal-overflow' && warning.nodeId === 'title',
    )).toBe(true)
  })

  it('returns null when no canvas frame is mounted', async () => {
    const snapshot = await captureAgentRenderSnapshot({
      breakpointId: 'mobile',
      captureScreenshot: false,
    })
    expect(snapshot).toBeNull()
  })

  it('falls back to the first canvas frame when no breakpointId is provided', async () => {
    const viewport = document.createElement('div')
    viewport.dataset.breakpointId = 'desktop'
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 1440 },
      clientHeight: { configurable: true, value: 900 },
      scrollWidth: { configurable: true, value: 1440 },
      scrollHeight: { configurable: true, value: 900 },
    })
    setRect(viewport, { x: 0, y: 0, width: 1440, height: 900 })
    document.body.appendChild(viewport)

    const snapshot = await captureAgentRenderSnapshot({
      captureScreenshot: false,
    })
    expect(snapshot?.breakpointId).toBe('desktop')
  })
})
