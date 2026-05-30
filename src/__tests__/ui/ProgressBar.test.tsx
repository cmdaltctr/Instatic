import { afterEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { ProgressBar } from '@ui/components/ProgressBar'

afterEach(cleanup)

describe('ProgressBar', () => {
  it('renders with role=progressbar', () => {
    render(<ProgressBar value={50} />)
    expect(screen.getByRole('progressbar')).toBeDefined()
  })

  it('clamps value above max to max', () => {
    render(<ProgressBar value={120} max={100} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('100')
  })

  it('clamps value below 0 to 0', () => {
    render(<ProgressBar value={-5} max={100} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('0')
  })

  it('sets aria-valuetext to percentage when determinate', () => {
    render(<ProgressBar value={42} max={100} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuetext')).toBe('42%')
  })

  it('rounds the percentage for aria-valuetext', () => {
    render(<ProgressBar value={1} max={3} />)
    const bar = screen.getByRole('progressbar')
    // 1/3 = 33.333... → rounds to 33%
    expect(bar.getAttribute('aria-valuetext')).toBe('33%')
  })

  it('indeterminate omits aria-valuenow', () => {
    render(<ProgressBar value={50} indeterminate />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBeNull()
  })

  it('indeterminate omits aria-valuetext', () => {
    render(<ProgressBar value={50} indeterminate />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuetext')).toBeNull()
  })

  it('sets tone data-attribute correctly', () => {
    render(<ProgressBar value={60} tone="success" />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('data-tone')).toBe('success')
  })

  it('omits data-tone attribute for the default tone', () => {
    render(<ProgressBar value={60} tone="default" />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('data-tone')).toBeNull()
  })

  it('uses the provided label as aria-label', () => {
    render(<ProgressBar value={30} label="Upload progress" />)
    const bar = screen.getByRole('progressbar', { name: 'Upload progress' })
    expect(bar).toBeDefined()
  })

  it('falls back to "Progress" as aria-label when no label provided', () => {
    render(<ProgressBar value={30} />)
    const bar = screen.getByRole('progressbar', { name: 'Progress' })
    expect(bar).toBeDefined()
  })

  it('sets aria-valuemin=0 and aria-valuemax equal to max', () => {
    render(<ProgressBar value={50} max={200} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('200')
  })

  it('sets data-indeterminate attribute when indeterminate', () => {
    render(<ProgressBar value={0} indeterminate />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('data-indeterminate')).toBe('true')
  })

  it('omits data-indeterminate attribute when determinate', () => {
    render(<ProgressBar value={50} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('data-indeterminate')).toBeNull()
  })
})
