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
  isActive: boolean
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
  folderId: string | null
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
  folderId: string | null
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
      folderId,
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
