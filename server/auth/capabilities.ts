import { Type, type Static } from '@core/utils/typeboxHelpers'

export const CoreCapabilitySchema = Type.Union([
  Type.Literal('site.read'),
  Type.Literal('site.edit'),
  Type.Literal('pages.edit'),
  Type.Literal('pages.publish'),
  Type.Literal('content.create'),
  Type.Literal('content.edit.own'),
  Type.Literal('content.edit.any'),
  Type.Literal('content.publish.own'),
  Type.Literal('content.publish.any'),
  Type.Literal('content.manage'),
  Type.Literal('media.manage'),
  Type.Literal('runtime.manage'),
  Type.Literal('plugins.manage'),
  Type.Literal('users.manage'),
  Type.Literal('roles.manage'),
  Type.Literal('audit.read'),
])

export type CoreCapability = Static<typeof CoreCapabilitySchema>

export const CORE_CAPABILITIES: CoreCapability[] = [
  'site.read',
  'site.edit',
  'pages.edit',
  'pages.publish',
  'content.create',
  'content.edit.own',
  'content.edit.any',
  'content.publish.own',
  'content.publish.any',
  'content.manage',
  'media.manage',
  'runtime.manage',
  'plugins.manage',
  'users.manage',
  'roles.manage',
  'audit.read',
]

export interface SystemRoleDefinition {
  id: string
  slug: string
  name: string
  description: string
  capabilities: CoreCapability[]
}

const editorCapabilities: CoreCapability[] = [
  'site.read',
  'site.edit',
  'pages.edit',
  'pages.publish',
  'content.create',
  'content.edit.own',
  'content.publish.own',
  'media.manage',
]

export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    id: 'owner',
    slug: 'owner',
    name: 'Owner',
    description: 'Permanent first-site owner with full system access.',
    capabilities: CORE_CAPABILITIES,
  },
  {
    id: 'admin',
    slug: 'admin',
    name: 'Admin',
    description: 'Full admin access.',
    capabilities: CORE_CAPABILITIES,
  },
  {
    id: 'editor',
    slug: 'editor',
    name: 'Editor',
    description: 'Can edit and publish site pages and content.',
    capabilities: editorCapabilities,
  },
  {
    id: 'content-manager',
    slug: 'content-manager',
    name: 'Content Manager',
    description: 'Can manage content entries and media.',
    capabilities: [
      'site.read',
      'content.create',
      'content.edit.any',
      'content.publish.any',
      'content.manage',
      'media.manage',
    ],
  },
  {
    id: 'viewer',
    slug: 'viewer',
    name: 'Viewer',
    description: 'Read-only admin access.',
    capabilities: ['site.read'],
  },
  {
    id: 'subscriber',
    slug: 'subscriber',
    name: 'Subscriber',
    description: 'Reserved for future public member accounts.',
    capabilities: [],
  },
]

export function isCoreCapability(value: unknown): value is CoreCapability {
  return typeof value === 'string' && CORE_CAPABILITIES.includes(value as CoreCapability)
}

export function normalizeCapabilities(value: unknown): CoreCapability[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<CoreCapability>()
  for (const item of value) {
    if (isCoreCapability(item)) seen.add(item)
  }
  return [...seen].sort((a, b) => CORE_CAPABILITIES.indexOf(a) - CORE_CAPABILITIES.indexOf(b))
}

export function roleHasCapability(capabilities: readonly CoreCapability[], capability: CoreCapability): boolean {
  return capabilities.includes(capability)
}
