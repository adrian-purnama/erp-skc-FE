import { ChevronDown, Folder } from 'lucide-react'
import type { TreeNode } from '#/lib/itemMaster'
import { cn } from '#/lib/utils'

/** Folder-only nav that sets a folder filter (no item rows, no CRUD). */
export function FolderNav({
  nodes,
  depth = 0,
  expanded,
  selectedFolderId,
  onToggle,
  onSelectFolder,
}: {
  nodes: TreeNode[]
  depth?: number
  expanded: Set<string>
  selectedFolderId: string | null
  onToggle: (id: string) => void
  onSelectFolder: (id: string) => void
}) {
  const folders = nodes.filter((n) => n.type === 'folder')
  if (folders.length === 0) return null

  return (
    <ul
      className={cn(
        'm-0 flex list-none flex-col gap-0.5 p-0',
        depth > 0 && 'ml-3 border-l border-(--line) pl-1.5',
      )}
    >
      {folders.map((node) => {
        if (node.type !== 'folder') return null
        const open = expanded.has(node.id)
        const selected = selectedFolderId === node.id
        const hasChildFolders = node.children.some((c) => c.type === 'folder')
        return (
          <li key={node.id}>
            <div className="flex items-stretch gap-0.5">
              <button
                type="button"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-(--muted) hover:bg-(--surface) hover:text-(--ink)"
                aria-label={open ? 'Collapse folder' : 'Expand folder'}
                aria-expanded={open}
                disabled={!hasChildFolders}
                onClick={() => onToggle(node.id)}
              >
                {hasChildFolders ? (
                  <ChevronDown
                    className={cn(
                      'size-3.5 transition-transform duration-150',
                      open ? 'rotate-0' : '-rotate-90',
                    )}
                    aria-hidden
                  />
                ) : (
                  <span className="size-3.5" />
                )}
              </button>
              <button
                type="button"
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition',
                  selected
                    ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] font-medium text-(--accent)'
                    : 'hover:bg-(--surface)',
                )}
                onClick={() => onSelectFolder(node.id)}
              >
                <Folder
                  className={cn(
                    'size-4 shrink-0',
                    selected ? 'text-(--accent)' : 'text-(--muted)',
                  )}
                  aria-hidden
                />
                <span className="min-w-0 truncate">
                  <span className="font-mono">{node.code}</span>
                  <span
                    className={
                      selected ? 'text-(--accent)/70' : 'text-(--muted)'
                    }
                  >
                    {' '}
                    —{' '}
                  </span>
                  {node.name}
                </span>
              </button>
            </div>
            {open ? (
              <FolderNav
                nodes={node.children}
                depth={depth + 1}
                expanded={expanded}
                selectedFolderId={selectedFolderId}
                onToggle={onToggle}
                onSelectFolder={onSelectFolder}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
