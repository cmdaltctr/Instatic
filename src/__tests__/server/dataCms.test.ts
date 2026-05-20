import { describe, expect, it } from 'bun:test'
import type { DbResult } from '../../../server/db'
import { pgMigrations } from '../../../server/db/migrations-pg'
import {
  listDataTables,
  createDataTable,
  updateDataTable,
  createDataRow,
  listDataAuthorOptions,
  updateDataRowAuthor,
  saveDataRowDraft,
  publishDataRow,
  getPublishedDataRowByRoute,
  getDataRowRedirectByRoute,
} from '../../../server/repositories/data'
import { renderDataRowDocumentHtml } from '../../../server/publish/dataRenderer'
import { handleServerRequest } from '../../../server/router'
import { createFakeDb } from './dbTestFake'

type QueryHandler = (sql: string, params: unknown[]) => DbResult | undefined

function makeDataFakeDb(handlers: QueryHandler[]) {
  return createFakeDb(async (rawSql, params): Promise<DbResult> => {
    const sql = rawSql.replace(/\s+/g, ' ').trim().toLowerCase()
    for (const handler of handlers) {
      const result = handler(sql, params)
      if (result) return result
    }
    throw new Error(`Unhandled SQL: ${rawSql}`)
  })
}

function rowDate(value: string) {
  return new Date(value)
}

const defaultFields = [
  { type: 'text', id: 'title', label: 'Title', required: true, builtIn: true },
  { type: 'text', id: 'slug', label: 'Slug', required: true, builtIn: true },
  { type: 'richText', id: 'body', label: 'Body', format: 'markdown', builtIn: true },
  { type: 'media', id: 'featuredMedia', label: 'Featured media', mediaKind: 'image', builtIn: true },
  { type: 'text', id: 'seoTitle', label: 'SEO title', builtIn: true },
  { type: 'longText', id: 'seoDescription', label: 'SEO description', builtIn: true },
]

describe('data CMS migrations', () => {
  it('creates data tables and seeds the default Posts table', () => {
    const sql = pgMigrations.map((migration) => migration.sql).join('\n')

    expect(sql).toContain('create table if not exists data_tables')
    expect(sql).toContain('create table if not exists data_rows')
    expect(sql).toContain('create table if not exists data_row_versions')
    expect(sql).toContain('active_version_id')
    expect(sql).toContain('create table if not exists data_row_redirects')
    expect(sql).toContain("insert into data_tables")
  })
})

describe('data CMS repository', () => {
  it('lists data tables with frontend field names', async () => {
    const db = makeDataFakeDb([
      (sql) => {
        if (!sql.startsWith('select id, name, slug, kind, route_base')) return undefined
        return {
          rows: [{
            id: 'posts',
            name: 'Posts',
            slug: 'posts',
            kind: 'postType',
            route_base: '/posts',
            singular_label: 'Post',
            plural_label: 'Posts',
            primary_field_id: 'title',
            fields_json: defaultFields,
            created_by_user_id: null,
            updated_by_user_id: null,
            created_at: rowDate('2026-05-01T10:00:00Z'),
            updated_at: rowDate('2026-05-01T10:00:00Z'),
          }],
          rowCount: 1,
        }
      },
    ])

    await expect(listDataTables(db)).resolves.toEqual([{
      id: 'posts',
      name: 'Posts',
      slug: 'posts',
      kind: 'postType',
      routeBase: '/posts',
      singularLabel: 'Post',
      pluralLabel: 'Posts',
      primaryFieldId: 'title',
      fields: defaultFields,
      system: false,
      createdByUserId: null,
      updatedByUserId: null,
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    }])
  })

  it('creates a data table with persisted field settings', async () => {
    const db = makeDataFakeDb([
      (sql, params) => {
        if (!sql.startsWith('insert into data_tables')) return undefined
        expect(String(params[0])).toBeTruthy() // id (nanoid)
        expect(params[1]).toBe('Products')
        expect(params[2]).toBe('products')
        return {
          rows: [{
            id: 'products',
            name: 'Products',
            slug: 'products',
            kind: 'postType',
            route_base: '/products',
            singular_label: 'Product',
            plural_label: 'Products',
            primary_field_id: 'title',
            fields_json: defaultFields,
            created_by_user_id: null,
            updated_by_user_id: null,
            created_at: rowDate('2026-05-01T10:00:00Z'),
            updated_at: rowDate('2026-05-01T10:00:00Z'),
          }],
          rowCount: 1,
        }
      },
    ])

    await expect(createDataTable(db, {
      name: 'Products',
      slug: 'products',
      kind: 'postType',
      routeBase: '/products',
      singularLabel: 'Product',
      pluralLabel: 'Products',
      primaryFieldId: 'title',
      fields: defaultFields,
    }, null)).resolves.toMatchObject({
      id: 'products',
      name: 'Products',
      slug: 'products',
      fields: defaultFields,
    })
  })

  it('updates table identity, route, labels, and field settings', async () => {
    const nextFields = defaultFields.slice(0, 2)
    const db = makeDataFakeDb([
      (sql, params) => {
        if (!sql.startsWith('update data_tables')) return undefined
        expect(params).toContain('Catalog')
        expect(params).toContain('catalog')
        return {
          rows: [{
            id: 'products',
            name: 'Catalog',
            slug: 'catalog',
            kind: 'postType',
            route_base: '/catalog',
            singular_label: 'Product',
            plural_label: 'Catalog',
            primary_field_id: 'title',
            fields_json: nextFields,
            created_by_user_id: null,
            updated_by_user_id: null,
            created_at: rowDate('2026-05-01T10:00:00Z'),
            updated_at: rowDate('2026-05-01T10:05:00Z'),
          }],
          rowCount: 1,
        }
      },
    ])

    await expect(updateDataTable(db, 'products', {
      name: 'Catalog',
      slug: 'catalog',
      routeBase: '/catalog',
      singularLabel: 'Product',
      pluralLabel: 'Catalog',
      fields: nextFields,
    }, null)).resolves.toMatchObject({
      id: 'products',
      name: 'Catalog',
      slug: 'catalog',
      routeBase: '/catalog',
      fields: nextFields,
    })
  })

  it('lists active data authors with role display metadata', async () => {
    const db = makeDataFakeDb([
      (sql, params) => {
        if (!sql.startsWith('select users.id')) return undefined
        expect(sql).toContain('users.status = $1')
        expect(params).toEqual(['active'])
        return {
          rows: [{
            id: 'author_1',
            email: 'author@example.com',
            email_normalized: 'author@example.com',
            display_name: 'Author Name',
            password_hash: 'hash',
            status: 'active',
            role_id: 'editor',
            last_login_at: null,
            created_at: rowDate('2026-05-01T10:00:00Z'),
            updated_at: rowDate('2026-05-01T10:00:00Z'),
            deleted_at: null,
            role_slug: 'editor',
            role_name: 'Editor',
            role_description: '',
            role_is_system: true,
            role_capabilities_json: ['content.edit.own'],
          }],
          rowCount: 1,
        }
      },
    ])

    await expect(listDataAuthorOptions(db)).resolves.toEqual([{
      id: 'author_1',
      email: 'author@example.com',
      displayName: 'Author Name',
      roleSlug: 'editor',
      roleName: 'Editor',
    }])
  })

  it('resolves the active published version by table route and row slug', async () => {
    const db = makeDataFakeDb([
      (sql, params) => {
        if (!sql.startsWith('select data_row_versions.id')) return undefined
        expect(sql).toContain('data_row_versions.id = data_rows.active_version_id')
        expect(params).toEqual(['/posts', 'hello'])
        return {
          rows: [{
            id: 'version_1',
            row_id: 'row_1',
            table_id: 'posts',
            table_slug: 'posts',
            table_kind: 'postType',
            table_route_base: '/posts',
            version_number: 2,
            cells_json: {
              title: 'Published Hello',
              slug: 'hello',
              body: 'Published body',
              featuredMedia: null,
              seoTitle: 'SEO',
              seoDescription: 'Description',
            },
            slug: 'hello',
            author_user_id: 'author_1',
            author_display_name: 'Author Name',
            author_role_slug: 'editor',
            author_role_name: 'Editor',
            published_by_user_id: 'publisher_1',
            published_by_display_name: 'Publisher Name',
            published_by_role_slug: 'admin',
            published_by_role_name: 'Admin',
            published_at: rowDate('2026-05-01T10:02:00Z'),
            created_at: rowDate('2026-05-01T10:02:00Z'),
          }],
          rowCount: 1,
        }
      },
    ])

    await expect(getPublishedDataRowByRoute(db, '/posts', 'hello')).resolves.toMatchObject({
      id: 'version_1',
      rowId: 'row_1',
      tableSlug: 'posts',
      tableRouteBase: '/posts',
      versionNumber: 2,
      slug: 'hello',
      authorUserId: 'author_1',
      authorName: 'Author Name',
      publishedByUserId: 'publisher_1',
      publishedByName: 'Publisher Name',
    })
  })

  it('does not resolve rows with non-matching published slugs', async () => {
    const db = makeDataFakeDb([
      (sql, params) => {
        if (!sql.startsWith('select data_row_versions.id')) return undefined
        expect(params).toEqual(['/posts', 'untitled'])
        return { rows: [], rowCount: 0 }
      },
    ])

    await expect(getPublishedDataRowByRoute(db, '/posts', 'untitled')).resolves.toBeNull()
  })

  it('resolves old published slugs as redirects to the active published slug', async () => {
    const db = makeDataFakeDb([
      (sql, params) => {
        if (!sql.startsWith('select data_row_redirects.id')) return undefined
        expect(params).toEqual(['/posts', 'untitled'])
        return {
          rows: [{
            id: 'redirect_1',
            from_route_base: '/posts',
            from_slug: 'untitled',
            target_route_base: '/posts',
            target_slug: 'post',
          }],
          rowCount: 1,
        }
      },
    ])

    await expect(getDataRowRedirectByRoute(db, '/posts', 'untitled')).resolves.toEqual({
      id: 'redirect_1',
      fromPath: '/posts/untitled',
      targetPath: '/posts/post',
    })
  })
})

describe('data CMS rendering', () => {
  it('renders markdown data row as safe public HTML', () => {
    const html = renderDataRowDocumentHtml({
      id: 'version_1',
      rowId: 'row_1',
      tableId: 'posts',
      tableSlug: 'posts',
      tableKind: 'postType',
      tableRouteBase: '/posts',
      versionNumber: 1,
      cells: {
        title: 'Hello <script>alert(1)</script>',
        slug: 'hello',
        body: [
          '# Heading',
          '',
          'Paragraph with [link](https://example.com).',
          '',
          '![Alt image](/uploads/image.png)',
          '',
          '@[video](/uploads/movie.mp4)',
        ].join('\n'),
        featuredMedia: null,
        seoTitle: 'SEO Hello',
        seoDescription: 'Description',
      },
      slug: 'hello',
      featuredMediaId: null,
      featuredMediaPath: null,
      authorUserId: null,
      authorName: null,
      authorRoleSlug: null,
      authorRoleName: null,
      publishedByUserId: null,
      publishedByName: null,
      publishedByRoleSlug: null,
      publishedByRoleName: null,
      publishedAt: '2026-05-01T10:00:00.000Z',
      createdAt: '2026-05-01T10:00:00.000Z',
    })

    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<title>SEO Hello</title>')
    expect(html).toContain('<h1>Heading</h1>')
    expect(html).toContain('<a href="https://example.com"')
    expect(html).toContain('<img src="/uploads/image.png" alt="Alt image"')
    expect(html).toContain('<video controls src="/uploads/movie.mp4"')
    expect(html).not.toContain('<script>')
  })

  it('resolves {page.*} and {currentEntry.*} tokens embedded in cells', () => {
    const html = renderDataRowDocumentHtml({
      id: 'version_2',
      rowId: 'row_2',
      tableId: 'posts',
      tableSlug: 'posts',
      tableKind: 'postType',
      tableRouteBase: '/posts',
      versionNumber: 1,
      cells: {
        title: 'My Post',
        slug: 'my-post',
        body: 'Welcome to {page.title} — see {currentEntry.title}!',
        featuredMedia: null,
        seoTitle: '',
        seoDescription: '',
      },
      slug: 'my-post',
      featuredMediaId: null,
      featuredMediaPath: null,
      authorUserId: null,
      authorName: null,
      authorRoleSlug: null,
      authorRoleName: null,
      publishedByUserId: null,
      publishedByName: null,
      publishedByRoleSlug: null,
      publishedByRoleName: null,
      publishedAt: '2026-05-01T10:00:00.000Z',
      createdAt: '2026-05-01T10:00:00.000Z',
    })

    // The fallback renderer synthesises a `page` frame from the row, so
    // `{page.title}` maps to the row's title. `{currentEntry.title}`
    // resolves against the entry stack frame.
    expect(html).toContain('Welcome to My Post — see My Post!')
  })

  it('emits the token fallback when a value is missing', () => {
    const html = renderDataRowDocumentHtml({
      id: 'version_3',
      rowId: 'row_3',
      tableId: 'posts',
      tableSlug: 'posts',
      tableKind: 'postType',
      tableRouteBase: '/posts',
      versionNumber: 1,
      cells: {
        title: 'Authored',
        slug: 'authored',
        body: 'Hello {viewer.displayName|guest}!',
        featuredMedia: null,
        seoTitle: '',
        seoDescription: '',
      },
      slug: 'authored',
      featuredMediaId: null,
      featuredMediaPath: null,
      authorUserId: null,
      authorName: null,
      authorRoleSlug: null,
      authorRoleName: null,
      publishedByUserId: null,
      publishedByName: null,
      publishedByRoleSlug: null,
      publishedByRoleName: null,
      publishedAt: '2026-05-01T10:00:00.000Z',
      createdAt: '2026-05-01T10:00:00.000Z',
    })

    expect(html).toContain('Hello guest!')
  })
})

describe('data CMS public routes', () => {
  it('renders published data rows without a page template using the document fallback', async () => {
    const db = makeDataFakeDb([
      (sql) => {
        if (sql.startsWith('select id, name, version, enabled, lifecycle_status')) {
          return { rows: [], rowCount: 0 }
        }
        return undefined
      },
      (sql) => {
        // getPublishedPageBySlug — now queries data_row_versions.snapshot_json
        if (sql.startsWith('select data_row_versions.snapshot_json')) {
          return { rows: [], rowCount: 0 }
        }
        return undefined
      },
      (sql, params) => {
        if (!sql.startsWith('select data_row_versions.id')) return undefined
        return {
          rows: [{
            id: 'version_1',
            row_id: 'row_1',
            table_id: 'products',
            table_slug: 'products',
            table_kind: 'postType',
            table_route_base: '/products',
            version_number: 1,
            cells_json: {
              title: 'Some product',
              slug: 'some-product',
              body: 'A product body.',
              featuredMedia: null,
              seoTitle: '',
              seoDescription: '',
            },
            slug: 'some-product',
            published_at: rowDate('2026-05-01T10:00:00Z'),
            created_at: rowDate('2026-05-01T10:00:00Z'),
          }],
          rowCount: 1,
        }
      },
    ])

    const res = await handleServerRequest(new Request('http://localhost/products/some-product'), { db })
    const html = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(html).toContain('<h1>Some product</h1>')
    expect(html).toContain('<p>A product body.</p>')
  })
})
