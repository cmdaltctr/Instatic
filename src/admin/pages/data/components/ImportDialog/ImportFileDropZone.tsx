/**
 * ImportFileDropZone — drag-and-drop / file-picker for site bundle JSON files.
 *
 * Accepts a dropped or browsed `.json` file, reads it as text, and validates
 * it against `SiteBundleSchema` via `parseSiteBundle`. On success, calls
 * `onBundleLoaded` with the parsed bundle and the filename. On failure, renders
 * an inline `role="alert"` with the parse error message.
 */
import { useRef, useState, type DragEvent, type ChangeEvent } from 'react'
import { UploadIcon } from 'pixel-art-icons/icons/upload'
import { parseSiteBundle, SiteBundleParseError } from '@core/persistence/cmsTransfer'
import type { SiteBundle } from '@core/data/bundleSchema'
import styles from './ImportDialog.module.css'

export interface ImportFileDropZoneProps {
  onBundleLoaded: (bundle: SiteBundle, filename: string) => void
  /** Disables the drop zone while a different step is in progress. */
  disabled?: boolean
}

export function ImportFileDropZone({ onBundleLoaded, disabled }: ImportFileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setParseError(null)
    try {
      const raw = await file.text()
      const bundle = parseSiteBundle(raw)
      onBundleLoaded(bundle, file.name)
    } catch (err) {
      if (err instanceof SiteBundleParseError) {
        setParseError(err.message)
      } else {
        setParseError(err instanceof Error ? err.message : 'Failed to read file')
      }
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (!disabled) setDragging(true)
  }

  function handleDragEnter(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (!disabled) {
      setDragging(true)
      setParseError(null)
    }
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }

  function handleClick() {
    if (!disabled) inputRef.current?.click()
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
    // Reset so the same file can be re-selected if validation fails.
    e.target.value = ''
  }

  return (
    <div className={styles.dropZoneWrapper}>
      <div
        className={styles.dropZone}
        data-dragging={dragging ? 'true' : undefined}
        data-disabled={disabled ? 'true' : undefined}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Drop a site bundle here or click to browse"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleClick()
          }
        }}
      >
        <UploadIcon size={24} aria-hidden="true" className={styles.dropZoneIcon} />
        <span className={styles.dropZoneTitle}>Drop a site bundle here</span>
        <span className={styles.dropZoneHint}>or click to browse (.json)</span>
      </div>

      {parseError && (
        <p role="alert" className={styles.dropZoneError}>
          {parseError}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className={styles.hiddenInput}
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleChange}
      />
    </div>
  )
}
