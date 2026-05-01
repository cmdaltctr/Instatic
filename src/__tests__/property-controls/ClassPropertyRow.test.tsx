import { describe, expect, it } from 'bun:test'

describe('ClassPropertyRow remove button layout', () => {
  it('does not reserve a right-side gutter that shrinks property controls', async () => {
    const { readFileSync } = await import('fs')
    const css = readFileSync(
      new URL('../../editor/components/PropertiesPanel/ClassPropertyRow.module.css', import.meta.url),
      'utf-8',
    )

    expect(css).not.toMatch(/\.propertyRowWrap\[data-state="set"\]\s*\{[^}]*padding-right:/s)
  })

  it('overlays the remove button on the left label column with a fade', async () => {
    const { readFileSync } = await import('fs')
    const css = readFileSync(
      new URL('../../editor/components/PropertiesPanel/ClassPropertyRow.module.css', import.meta.url),
      'utf-8',
    )

    expect(css).toMatch(/--class-remove-label-column:\s*120px/)
    expect(css).toMatch(/--class-remove-row-center:\s*14px/)
    expect(css).toMatch(/--class-remove-button-size:\s*22px/)
    expect(css).toMatch(/--class-remove-fade-width:\s*64px/)
    expect(css).toMatch(/\.propertyRowWrap\[data-state="set"\]::after\s*\{[^}]*linear-gradient/s)
    expect(css).toMatch(/\.removeBtn\s*\{[^}]*left:\s*calc\(var\(--class-remove-label-column\)\s*-\s*var\(--class-remove-button-size\)\s*-\s*4px\)/s)
    expect(css).toMatch(/\.removeBtn\s*\{[^}]*top:\s*calc\(var\(--class-remove-row-center\)\s*-\s*\(var\(--class-remove-button-size\)\s*\/\s*2\)\)/s)
    expect(css).toMatch(/\.removeBtn\.removeBtn\s*\{[^}]*width:\s*var\(--class-remove-button-size\)/s)
    expect(css).toMatch(/\.removeBtn\.removeBtn\s*\{[^}]*height:\s*var\(--class-remove-button-size\)/s)
    expect(css).not.toMatch(/\.removeBtn\s*\{[^}]*right:/s)
    expect(css).not.toMatch(/\.removeBtn\s*\{[^}]*translateY\(-50%\)/s)
  })

  it('uses a neutral remove affordance instead of the destructive danger hover style', async () => {
    const { readFileSync } = await import('fs')
    const rowSource = readFileSync(
      new URL('../../editor/components/PropertiesPanel/ClassPropertyRow.tsx', import.meta.url),
      'utf-8',
    )
    const css = readFileSync(
      new URL('../../editor/components/PropertiesPanel/ClassPropertyRow.module.css', import.meta.url),
      'utf-8',
    )

    expect(rowSource).not.toContain('dangerHover')
    expect(rowSource).toContain('<CloseIcon size={16}')
    expect(css).toMatch(/\.removeBtn\.removeBtn\s*\{[^}]*color:\s*var\(--editor-text-secondary\)/s)
    expect(css).toMatch(/\.removeBtn\.removeBtn:hover[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.06\)/s)
    expect(css).not.toContain('editor-danger')
  })
})

describe('ClassComposer module style remove button layout', () => {
  it('does not reserve a right-side gutter for module-owned style rows', async () => {
    const { readFileSync } = await import('fs')
    const css = readFileSync(
      new URL('../../editor/components/PropertiesPanel/ClassComposer.module.css', import.meta.url),
      'utf-8',
    )

    expect(css).not.toMatch(/\.moduleStyleRow\s*\{[^}]*padding-right:/s)
  })

  it('uses the same label-column overlay for module-owned style rows', async () => {
    const { readFileSync } = await import('fs')
    const css = readFileSync(
      new URL('../../editor/components/PropertiesPanel/ClassComposer.module.css', import.meta.url),
      'utf-8',
    )
    const compactCss = css.replace(/\s+/g, '')

    expect(css).toMatch(/--class-remove-label-column:\s*120px/)
    expect(css).toMatch(/--class-remove-row-center:\s*14px/)
    expect(css).toMatch(/--class-remove-button-size:\s*22px/)
    expect(css).toMatch(/--class-remove-fade-width:\s*64px/)
    expect(css).toMatch(/\.moduleStyleRow::after\s*\{[^}]*linear-gradient/s)
    expect(compactCss).toContain(
      '.moduleStyleRemoveBtn{position:absolute;top:calc(var(--class-remove-row-center)-(var(--class-remove-button-size)/2));left:calc(var(--class-remove-label-column)-var(--class-remove-button-size)-4px)',
    )
    expect(css).toMatch(/\.moduleStyleRemoveBtn\.moduleStyleRemoveBtn\s*\{[^}]*width:\s*var\(--class-remove-button-size\)/s)
    expect(css).toMatch(/\.moduleStyleRemoveBtn\.moduleStyleRemoveBtn\s*\{[^}]*height:\s*var\(--class-remove-button-size\)/s)
    expect(css).not.toMatch(/\.moduleStyleRemoveBtn\s*\{[^}]*right:/s)
    expect(css).not.toMatch(/\.moduleStyleRemoveBtn\s*\{[^}]*translateY\(-50%\)/s)
  })

  it('uses the same neutral remove affordance for module-owned style rows', async () => {
    const { readFileSync } = await import('fs')
    const composerSource = readFileSync(
      new URL('../../editor/components/PropertiesPanel/ClassComposer.tsx', import.meta.url),
      'utf-8',
    )
    const css = readFileSync(
      new URL('../../editor/components/PropertiesPanel/ClassComposer.module.css', import.meta.url),
      'utf-8',
    )

    expect(composerSource).not.toContain('dangerHover')
    expect(composerSource).toContain('<CloseIcon size={16}')
    expect(css).toMatch(/\.moduleStyleRemoveBtn\.moduleStyleRemoveBtn\s*\{[^}]*color:\s*var\(--editor-text-secondary\)/s)
    expect(css).toMatch(/\.moduleStyleRemoveBtn\.moduleStyleRemoveBtn:hover[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.06\)/s)
    expect(css).not.toContain('editor-danger')
  })
})
