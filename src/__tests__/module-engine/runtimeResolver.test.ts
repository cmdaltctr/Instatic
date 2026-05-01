import { describe, expect, it } from 'bun:test'
import { createModuleImportMap, resolveDependencyUrl } from '../../core/module-engine/runtimeResolver'
import type { AnyModuleDefinition } from '../../core/module-engine/types'

function makeModule(dependencies: AnyModuleDefinition['dependencies']): AnyModuleDefinition {
  return {
    id: 'test.runtime-deps',
    name: 'Runtime deps',
    category: 'Test',
    version: '1.0.0',
    trusted: true,
    canHaveChildren: false,
    schema: {},
    defaults: {},
    dependencies,
    component: () => null,
    render: () => ({ html: '<div></div>' }),
  }
}

describe('runtime dependency resolver', () => {
  it('resolves runtime dependencies to CDN ESM URLs without app-level installs', () => {
    expect(
      resolveDependencyUrl({ name: 'three', version: '^0.184.0', dev: false }),
    ).toBe('https://esm.sh/three@0.184.0?bundle')
  })

  it('creates import-map entries for package root and subpaths', () => {
    const importMap = createModuleImportMap(makeModule({ three: '^0.184.0' }))

    expect(importMap.imports.three).toBe('https://esm.sh/three@0.184.0?bundle')
    expect(importMap.imports['three/']).toBe('https://esm.sh/three@0.184.0/')
  })

  it('does not expose dev dependencies to the editor runtime import map', () => {
    const importMap = createModuleImportMap(makeModule({
      three: '^0.184.0',
      typescript: { version: '^5.3.0', dev: true },
    }))

    expect(importMap.imports.three).toBeDefined()
    expect(importMap.imports.typescript).toBeUndefined()
  })

  it('prefers the site manifest version over the module default range', () => {
    const importMap = createModuleImportMap(
      makeModule({ three: '^0.184.0' }),
      {
        packageJson: {
          dependencies: { three: '^0.185.0' },
          devDependencies: {},
        },
      },
    )

    expect(importMap.imports.three).toBe('https://esm.sh/three@0.185.0?bundle')
  })

  it('can require dependencies to exist in the site manifest before resolving them', () => {
    const importMap = createModuleImportMap(
      makeModule({ three: '^0.184.0' }),
      {
        packageJson: {
          dependencies: {},
          devDependencies: {},
        },
        strictSiteManifest: true,
      },
    )

    expect(importMap.imports.three).toBeUndefined()
    expect(importMap.imports['three/']).toBeUndefined()
  })

  it('does not resolve runtime dependencies from devDependencies in strict manifest mode', () => {
    const importMap = createModuleImportMap(
      makeModule({ three: '^0.184.0' }),
      {
        packageJson: {
          dependencies: {},
          devDependencies: { three: '^0.185.0' },
        },
        strictSiteManifest: true,
      },
    )

    expect(importMap.imports.three).toBeUndefined()
  })
})
