# Data Workspace

The admin UI for managing `data_tables` schemas and raw-row editing, accessible at `/admin/data`.

The Data workspace lets operators define and edit table schemas (field types, routing, display settings) and directly inspect or edit individual rows. It has no Zustand store of its own — all data is fetched and mutated via the `useDataWorkspace` hook in `src/admin/pages/data/hooks/useDataWorkspace.ts`.

---

## TL;DR

- **Entry:** `DataPage.tsx` → `DataCanvas.tsx` — three-pane layout: sidebar + grid + inspector.
- **DataSidebar:** table list, table creation, import/export entry points.
- **DataGrid:** virtual, cell-editing spreadsheet over `data_rows`.
- **DataInspector:** right panel — switches between `RowDetail` (cell editor) and `TableSettings` (schema editor) based on row selection.
- **TableSettings** owns field management via `FieldsSection`, which is split into `FieldRow`, `FieldEditForm`, `fieldGuards`, and `fieldEditState`.
- Field classification: three tiers — mandatory built-ins (locked), optional built-ins (editable/deletable with badge), custom fields (fully editable/deletable).
- Field edit state uses a flat `FieldEditState` draft that `fieldToEditState` / `applyEditState` convert to/from the persisted `DataField`.

---

## Component structure

```text
DataPage.tsx
└── DataCanvas.tsx
    ├── DataSidebar.tsx             ← table list, new-table dialog, import/export
    ├── DataGrid.tsx                ← virtual spreadsheet (data_rows)
    │   ├── DataGridHeaderCell.tsx  ← column header: field type icon + label
    │   ├── DataGridRow.tsx         ← row cells
    │   └── cells/                 ← per-type cell display + inline edit components
    └── DataInspector.tsx          ← right-hand inspector panel
        ├── RowDetail.tsx           ← row selected: cell-by-cell editor
        └── TableSettings.tsx       ← no row selected: schema + metadata editor
            └── FieldsSection.tsx   ← field list: DnD reorder, inline edit, delete, add
                ├── FieldRow.tsx        ← presentational field row
                ├── FieldEditForm.tsx   ← inline field edit form
                ├── fieldGuards.ts      ← pure field classification
                └── fieldEditState.ts   ← draft state shape + conversions
```

---

## DataInspector

`DataInspector.tsx` renders `RowDetail` when a row is selected or `TableSettings` when no row is selected. Both views are inside the same panel; the switch is driven by a `row: DataRow | null` prop.

```tsx
// DataInspector.tsx (simplified)
{row !== null ? (
  <RowDetail row={row} table={table} ... />
) : (
  <TableSettings table={table} rows={rows} ... />
)}
```

---

## TableSettings and field management

`TableSettings.tsx` renders four collapsible sections (General, Routing, Display, Fields, Kind, Danger zone). The **Fields** section delegates to `FieldsSection`.

### FieldsSection

`FieldsSection.tsx` owns all field-list state:

- **Drag-and-drop reorder** — native HTML5 drag API; `handleDrop` reorders `table.fields` and calls `onUpdateTable`.
- **Inline edit** — `editingFieldId` + `editState` (`FieldEditState`) track the open editor. State is owned here; `FieldEditForm` is purely presentational.
- **Delete** — via `useConfirmDelete`; calls `onUpdateTable` with the field removed.
- **New field** — via `NewFieldDialog`.

### Field classification — `fieldGuards.ts`

Three tiers for postType tables, enforced by the guard functions:

| Tier | Field IDs | Edit affordance | Delete affordance |
|------|-----------|-----------------|-------------------|
| Mandatory built-in | `title`, `slug` | None — locked row, no edit/delete buttons | Blocked |
| Optional built-in | `body`, `featuredMedia`, `seoTitle`, `seoDescription` | Description + required only; label locked | Allowed |
| Custom | all others | Fully editable | Allowed if not the primary field |

```ts
isMandatoryField(fieldId)           // title or slug on a postType
isOptionalBuiltIn(field)            // builtIn: true but not mandatory
isFieldDeletable(field, table)      // false for primaryField or mandatory built-in
isLabelLocked(field, table)         // true for any built-in postType field
deleteTooltip(field, table)         // disabled-button tooltip text, or undefined
```

`FIELD_TYPE_LABELS` maps every `DataFieldType` to a human-readable string and is shared by `FieldRow` and `FieldEditForm`.

### Draft/commit pattern — `fieldEditState.ts`

Field editing uses a flat draft object to keep all form inputs controlled:

```ts
fieldToEditState(field: DataField): FieldEditState  // persisted → editable draft
applyEditState(field, state, labelLocked): DataField // draft → persisted
```

`FieldEditState` flattens all type-specific options to primitives (numeric constraints as `string`, select options as `DraftOption[]`). `applyEditState` converts them back and reconstructs the correct `DataField` discriminant via a fully-exhaustive `switch (field.type)`.

### React Compiler — async helper extraction

`FieldsSection.tsx` and `TableSettings.tsx` extract async save handlers to **module-level functions** (`saveFieldEdit`, `saveTableField`, `savePrimaryField`). This is required because `async/await` with `try/catch` nested inside a component function forces the React Compiler to bail out of auto-memoization for that component. Extracting the async body to module scope lets the compiler memoize the component normally.

---

## DataGrid

`DataGrid.tsx` is a virtual spreadsheet over `data_rows`. Each cell uses a two-state pattern:

- **Display** — `CellDisplayRenderer.tsx` picks the per-type display component from `cells/`.
- **Edit** — `CellEditorRenderer.tsx` picks the per-type inline editor on cell click.

The primary-column width is persisted to `localStorage` via `usePrimaryColumnWidth.ts` (key: `pb-data-grid-primary-widths-v1`).

Header cells (`DataGridHeaderCell.tsx`) render the field type icon by calling `getFieldIcon(field.type)({ size: 13 })` directly — not as a component — to avoid the `react-hooks/static-components` lint rule for a plain icon call.

---

## Import / export

Two dialogs handle bulk data movement:

- `ImportDialog.tsx` / `useImportPreview.ts` — CSV/JSON upload → `ImportPreviewPanel` → POST to the CMS data endpoint.
- `ExportDialog.tsx` / `useExportEstimate.ts` — count estimate → CSV/JSON download.

Both dialogs are opened from `DataSidebar`.

---

## Forbidden patterns

| Pattern | Why |
|---------|-----|
| Reaching into `cells_json` directly | Use the readers in `src/core/data/cells.ts` |
| Comparing field classification inline | Import from `fieldGuards.ts` |
| Adding a `kind === 'postType'` branch inside `FieldsSection` | Classification belongs in `fieldGuards.ts`; `FieldsSection` reads `isMandatoryField`, `isOptionalBuiltIn`, etc. |
| Editing a field's `type` after creation | Type is immutable; `FieldEditForm` shows it read-only with "(cannot be changed)" |
| Writing manual `useMemo`/`useCallback` in any of these components | React Compiler auto-memoizes; the only exception is the async helper extraction pattern above |

---

## Related

- [docs/features/content-storage.md](content-storage.md) — `DataField` schema, field types, `data_tables` / `data_rows` structure
- [docs/reference/ui-primitives.md](../reference/ui-primitives.md) — `Button`, `Input`, `Select`, `Switch` usage
- [docs/reference/persistence-keys.md](../reference/persistence-keys.md) — `pb-data-grid-primary-widths-v1`
- Source-of-truth files:
  - `src/admin/pages/data/` — all Data workspace components
  - `src/admin/pages/data/components/DataInspector/` — inspector, field management modules
  - `src/core/data/schemas.ts` — `DataField` union, `DataFieldType`
  - `src/core/data/fields.ts` — `isPostTypeBuiltInFieldId`, `POST_TYPE_MANDATORY_FIELD_IDS`
  - `src/core/data/cells.ts` — typed cell readers
