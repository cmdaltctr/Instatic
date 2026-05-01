/**
 * PagesSection — manage pages (add / rename / delete / reorder slug).
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { useEditorStore, selectActivePage } from '../../../../core/editor-store/store'
import {
  createUniquePageSlug,
  normalizePageSlug,
  pageSlugDuplicateError,
  pageSlugError,
} from '../../../../core/page-tree/slugs'
import { Button } from '@ui/components/Button'
import { Input } from '@ui/components/Input'
import s from '../Settings.module.css'

export function PagesSection() {
  const project = useEditorStore((state) => state.project)
  const activePage = useEditorStore(selectActivePage)
  const addPage = useEditorStore((state) => state.addPage)
  const deletePage = useEditorStore((state) => state.deletePage)
  const renamePage = useEditorStore((state) => state.renamePage)

  const [newTitle, setNewTitle] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [pageError, setPageError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (confirmDeleteId) confirmBtnRef.current?.focus()
  }, [confirmDeleteId])

  const handleAdd = useCallback(() => {
    const title = newTitle.trim()
    if (!title || !project) return
    const slug = createUniquePageSlug(title, project.pages)
    addPage(title, slug)
    setNewTitle('')
    setPageError(null)
  }, [newTitle, project, addPage])

  const handleStartEdit = (id: string, title: string, slug: string) => {
    setEditingId(id)
    setEditTitle(title)
    setEditSlug(slug)
    setPageError(null)
  }

  const handleSaveEdit = useCallback(() => {
    if (!editingId || !project) return
    const title = editTitle.trim()
    const slug = normalizePageSlug(editSlug)
    const error = pageSlugError(slug) || pageSlugDuplicateError(slug, project.pages, editingId)
    if (error) {
      setPageError(error)
      return
    }
    if (title) renamePage(editingId, title, slug)
    setEditingId(null)
    setPageError(null)
  }, [editingId, editTitle, editSlug, project, renamePage])

  const handleDeletePage = (id: string) => {
    if (!project) return
    if (project.pages.length <= 1) return
    deletePage(id)
    setConfirmDeleteId(null)
  }

  if (!project) {
    return <div className={s.noProject}>No project loaded.</div>
  }

  return (
    <div>
      <h3 className={s.sectionHeading}>Pages</h3>
      <p className={s.sectionDescription}>
        Manage pages in your site. Each page has a URL slug used by the published frontend.
      </p>

      {/* Page list */}
      <ul role="list" className={s.list}>
        {project.pages.map((page) => (
          <li key={page.id}>
            {editingId === page.id ? (
              /* Edit row */
              <div className={s.editForm}>
                <Input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Page title"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEdit()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  aria-label="Page title"
                />
                <Input
                  type="text"
                  value={editSlug}
                  onChange={(e) => {
                    setEditSlug(normalizePageSlug(e.target.value))
                    setPageError(null)
                  }}
                  placeholder="url-slug"
                  aria-label="URL slug"
                />
                {pageError && (
                  <p role="alert" className={s.errorText}>
                    {pageError}
                  </p>
                )}
                <div className={s.editFormActions}>
                  <Button variant="primary" size="md" onClick={handleSaveEdit}>Save</Button>
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => {
                      setEditingId(null)
                      setPageError(null)
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              /* Display row */
              <div className={s.pageItemDisplay}>
                <div className={s.pageItemMeta}>
                  <div className={s.pageItemTitle}>
                    {page.title}
                    {page.id === activePage?.id && (
                      <span className={s.activeBadge}>active</span>
                    )}
                  </div>
                  <div className={s.pageItemSlug}>/{page.slug}</div>
                </div>
                <div
                  className={s.pageItemActions}
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setConfirmDeleteId(null) } }}
                >
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => handleStartEdit(page.id, page.title, page.slug)}
                    aria-label={`Rename page ${page.title}`}
                  >
                    Rename
                  </Button>
                  {confirmDeleteId === page.id ? (
                    <>
                      <Button
                        ref={confirmBtnRef}
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeletePage(page.id)}
                        aria-label={`Confirm delete page ${page.title}`}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setConfirmDeleteId(null)}
                        aria-label="Cancel delete"
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="destructive"
                      size="md"
                      onClick={project.pages.length <= 1 ? undefined : () => setConfirmDeleteId(page.id)}
                      aria-disabled={project.pages.length <= 1 ? 'true' : undefined}
                      aria-label={`Delete page ${page.title}`}
                      title={project.pages.length <= 1 ? 'Cannot delete the last page' : undefined}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Add new page */}
      <div className={s.pageAddForm}>
        <Input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New page title…"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          aria-label="New page title"
          className={s.pageAddInput}
        />
        <Button
          variant="primary"
          size="md"
          onClick={handleAdd}
          disabled={!newTitle.trim()}
        >
          + Add Page
        </Button>
      </div>
    </div>
  )
}
