export const ITEM_TYPES = ['material', 'labour'] as const

export type ItemType = (typeof ITEM_TYPES)[number]

export type TreeFolderNode = {
  type: 'folder'
  id: string
  code: string
  name: string
  children: TreeNode[]
}

export type TreeItemNode = {
  type: 'item'
  id: string
  itemId: string
  name: string
  description: string
  itemType: ItemType
  categoryIds: string[]
  isActive: boolean
}

export type ItemCategoryOut = {
  id: string
  name: string
}

export type TreeNode = TreeFolderNode | TreeItemNode

export type FolderOut = {
  id: string
  code: string
  name: string
  parentId: string | null
}

export type ItemUomRow = {
  id?: string
  uomId: string
  isBase: boolean
  /** Related factor vs base; null = not related. */
  conversionFactor: string | null
  sortOrder?: number
  symbol?: string
  name?: string
}

export type ItemTarifRow = {
  id?: string
  effectiveDate: string
  amount: string
}

export type ItemOut = {
  id: string
  itemId: string
  name: string
  description: string
  itemType: ItemType
  folderId: string | null
  categoryIds: string[]
  baseUomId: string | null
  vendorIds: string[]
  isActive: boolean
  uoms: ItemUomRow[]
  tarifs: ItemTarifRow[]
  currentTarif: ItemTarifRow | null
}

/** Today as YYYY-MM-DD in local calendar (UI badge). */
export function todayYmdLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** PeopleSoft current row: max effectiveDate <= asOf. */
export function pickCurrentTarif(
  rows: ItemTarifRow[],
  asOfYmd: string = todayYmdLocal(),
): ItemTarifRow | null {
  let best: ItemTarifRow | null = null
  for (const row of rows) {
    if (row.effectiveDate > asOfYmd) continue
    if (!best || row.effectiveDate > best.effectiveDate) best = row
  }
  return best
}

export type ItemListRow = {
  id: string
  itemId: string
  name: string
  description: string
  itemType: ItemType
  folderId: string | null
  categoryIds: string[]
  folderPath: string
  isActive: boolean
}

/** Flatten folders for parent pickers (id + path label). */
export function flattenFolders(
  nodes: TreeNode[],
  prefix = '',
): Array<{ id: string; label: string }> {
  const result: Array<{ id: string; label: string }> = []
  for (const node of nodes) {
    if (node.type !== 'folder') continue
    const label = prefix ? `${prefix} / ${node.code}` : node.code
    result.push({ id: node.id, label: `${label} — ${node.name}` })
    result.push(...flattenFolders(node.children, label))
  }
  return result
}

/** Human-readable folder path using names only (e.g. "ITEM / Metal Materials"). */
export function folderNamePath(
  nodes: TreeNode[],
  folderId: string | null,
): string {
  if (folderId === null) return 'Root'

  function walk(
    list: TreeNode[],
    path: string[],
  ): string[] | null {
    for (const node of list) {
      if (node.type !== 'folder') continue
      const next = [...path, node.name]
      if (node.id === folderId) return next
      const found = walk(node.children, next)
      if (found) return found
    }
    return null
  }

  const parts = walk(nodes, [])
  return parts?.join(' / ') ?? 'Selected folder'
}

/** Folder picker options labeled by name path (e.g. "ITEM / Metal Materials"). */
export function flattenFolderNameOptions(
  nodes: TreeNode[],
  pathPrefix = '',
): Array<{ id: string; label: string }> {
  const result: Array<{ id: string; label: string }> = []
  for (const node of nodes) {
    if (node.type !== 'folder') continue
    const label = pathPrefix ? `${pathPrefix} / ${node.name}` : node.name
    result.push({ id: node.id, label })
    result.push(...flattenFolderNameOptions(node.children, label))
  }
  return result
}

/** Flatten items for the item-master data table. */
export function flattenItems(
  nodes: TreeNode[],
  folderPath = '',
  folderId: string | null = null,
): ItemListRow[] {
  const result: ItemListRow[] = []
  for (const node of nodes) {
    if (node.type === 'folder') {
      const nextPath = folderPath
        ? `${folderPath} / ${node.code}`
        : node.code
      result.push(...flattenItems(node.children, nextPath, node.id))
      continue
    }
    result.push({
      id: node.id,
      itemId: node.itemId,
      name: node.name,
      description: node.description,
      itemType: node.itemType ?? 'material',
      folderId,
      categoryIds: node.categoryIds ?? [],
      folderPath: folderPath || 'Root',
      isActive: node.isActive !== false,
    })
  }
  return result
}

export function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.type === 'folder') {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}
