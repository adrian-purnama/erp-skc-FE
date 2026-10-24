export const PROJECT_ID_KEY = 'projectId'

export type RootMenuLeaf = {
  id: string
  label: string
  to: string
  match: string
  permission?: string
  /** Carry current project across this leaf’s navigation */
  carryProjectId?: boolean
  /** When carryProjectId + id present, use this path (e.g. dashboard detail) */
  toWithProjectId?: string
}

export type RootMenuFolder = {
  id: string
  label: string
  children: RootMenuNode[]
}

export type RootMenuNode = RootMenuFolder | RootMenuLeaf

export function isRootMenuFolder(node: RootMenuNode): node is RootMenuFolder {
  return 'children' in node
}

export const ROOT_MAIN_MENU: RootMenuNode[] = [
  {
    id: 'projects',
    label: 'Projects',
    children: [
      {
        id: 'project-dashboard',
        label: 'Project Dashboard',
        to: '/dashboard/projects',
        match: '/dashboard/projects',
        permission: 'project.view',
        carryProjectId: true,
        toWithProjectId: '/dashboard/projects/$projectId',
      },
      {
        id: 'tender',
        label: 'Tender',
        children: [
          {
            id: 'tender-documents',
            label: 'Tender Document',
            to: '/dashboard/tender/documents',
            match: '/dashboard/tender/documents',
            permission: 'project.view',
            carryProjectId: true,
          },
          {
            id: 'tender-calendar',
            label: 'Tender Calendar',
            to: '/dashboard/tender/calendar',
            match: '/dashboard/tender/calendar',
            permission: 'project.view',
            carryProjectId: true,
          },
        ],
      },
      {
        id: 'internal',
        label: 'Internal',
        children: [
          {
            id: 'internal-shop-drawing-boq',
            label: 'Shop Drawing BOQ',
            to: '/dashboard/internal/shop-drawing-boq',
            match: '/dashboard/internal/shop-drawing-boq',
            permission: 'project.view',
            carryProjectId: true,
          },
          {
            id: 'internal-rab',
            label: 'RAB',
            to: '/dashboard/internal/rab',
            match: '/dashboard/internal/rab',
            permission: 'project.view',
            carryProjectId: true,
          },
          {
            id: 'internal-quotation',
            label: 'Quotation',
            to: '/dashboard/internal/quotation',
            match: '/dashboard/internal/quotation',
            permission: 'quotation.view',
            carryProjectId: true,
          },
        ],
      },
    ],
  },
  {
    id: 'master-data',
    label: 'Master Data',
    children: [
      {
        id: 'customers',
        label: 'Customer Master Data',
        to: '/dashboard/customers',
        match: '/dashboard/customers',
        permission: 'customer.view',
      },
      {
        id: 'vendors',
        label: 'Vendor Master Data',
        to: '/dashboard/vendors',
        match: '/dashboard/vendors',
        permission: 'vendor.view',
      },
      {
        id: 'uom',
        label: 'Unit of Measure',
        to: '/dashboard/uom',
        match: '/dashboard/uom',
        permission: 'uom.view',
      },
      {
        id: 'term-of-payment',
        label: 'Terms of Payment',
        to: '/dashboard/term-of-payment',
        match: '/dashboard/term-of-payment',
        permission: 'termOfPayment.view',
      },
      {
        id: 'item-master',
        label: 'Item Master Data',
        to: '/dashboard/item-master',
        match: '/dashboard/item-master',
        permission: 'itemMaster.view',
      },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    children: [
      {
        id: 'admin-config',
        label: 'Config',
        to: '/admin/app-config',
        match: '/admin/app-config',
        permission: 'admin.config.view',
      },
      {
        id: 'admin-users',
        label: 'Users',
        to: '/admin/users',
        match: '/admin/users',
        permission: 'admin.user.view',
      },
      {
        id: 'admin-roles',
        label: 'Roles',
        to: '/admin/roles',
        match: '/admin/roles',
        permission: 'admin.role.view',
      },
      {
        id: 'admin-permissions',
        label: 'Permissions',
        to: '/admin/permissions',
        match: '/admin/permissions',
        permission: 'admin.role.view',
      },
      {
        id: 'admin-audit',
        label: 'Audit Log',
        to: '/admin/audit',
        match: '/admin/audit',
        permission: 'admin.audit.view',
      },
      {
        id: 'admin-shrink-db',
        label: 'Shrink DB',
        to: '/admin/shrink-db',
        match: '/admin/shrink-db',
        permission: 'admin.shrinkDb.run',
      },
    ],
  },
]

export function filterMenuTree(
  nodes: RootMenuNode[],
  can: (key: string) => boolean,
): RootMenuNode[] {
  const out: RootMenuNode[] = []

  for (const node of nodes) {
    if (isRootMenuFolder(node)) {
      const children = filterMenuTree(node.children, can)
      if (children.length > 0) {
        out.push({ ...node, children })
      }
      continue
    }

    if (!node.permission || can(node.permission)) {
      out.push(node)
    }
  }

  return out
}

/** Folder ids that contain the active leaf for the current pathname. */
export function folderIdsForPath(
  nodes: RootMenuNode[],
  pathname: string,
  ancestors: string[] = [],
): string[] {
  for (const node of nodes) {
    if (isRootMenuFolder(node)) {
      const found = folderIdsForPath(node.children, pathname, [
        ...ancestors,
        node.id,
      ])
      if (found.length > 0) return found
      continue
    }
    if (pathname === node.match || pathname.startsWith(`${node.match}/`)) {
      return ancestors
    }
  }
  return []
}

const PROJECT_DETAIL_PATH =
  /^\/dashboard\/projects\/([^/]+)(?:\/|$)/

/** Resolve current project from path (`/dashboard/projects/:id`) or `?projectId=`. */
export function projectIdFromLocation(
  pathname: string,
  search: Record<string, unknown>,
): string | undefined {
  const fromPath = PROJECT_DETAIL_PATH.exec(pathname)?.[1]
  if (fromPath && fromPath !== 'new') return fromPath

  const raw = search[PROJECT_ID_KEY]
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return undefined
}

export type MenuLinkLocation = {
  pathname: string
  search: Record<string, unknown>
}

export type MenuLeafLink = {
  to: string
  params?: { projectId: string }
  search?: { projectId: string }
}

/** Build Link props for a menu leaf, carrying projectId when opted in. */
export function menuLinkForLeaf(
  leaf: RootMenuLeaf,
  location: MenuLinkLocation,
): MenuLeafLink {
  if (!leaf.carryProjectId) {
    return { to: leaf.to }
  }

  const projectId = projectIdFromLocation(location.pathname, location.search)
  if (!projectId) {
    return { to: leaf.to }
  }

  if (leaf.toWithProjectId) {
    return {
      to: leaf.toWithProjectId,
      params: { projectId },
    }
  }

  return {
    to: leaf.to,
    search: { projectId },
  }
}
