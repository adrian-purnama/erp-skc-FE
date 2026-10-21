export type AdminUser = {
  id: string
  email: string
  isBlocked: boolean
  roles: string[]
}

export type AdminUserDetail = AdminUser & {
  accountCreatedAt: string
}

export type AdminRole = {
  key: string
  name: string
  description: string
  permissions: string[]
  includes: string[]
  effectivePermissions: string[]
  isSystem: boolean
  assignedUserCount: number
  activeSuperAdminCount: number
}

export type AdminPermission = {
  key: string
  label: string
  category: string
  status: 'active' | 'deprecated' | 'unused'
  manual: boolean
  routes: Array<{ method: string; path: string }>
  implies: string[]
}
