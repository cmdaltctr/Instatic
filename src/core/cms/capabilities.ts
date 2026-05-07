export const CORE_CAPABILITIES = [
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
] as const

export type CoreCapability = typeof CORE_CAPABILITIES[number]
