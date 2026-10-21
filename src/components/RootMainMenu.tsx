import { Link, useRouterState } from '@tanstack/react-router'
import { ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '#/context/authContext'
import {
  ROOT_MAIN_MENU,
  filterMenuTree,
  folderIdsForPath,
  isRootMenuFolder,
  menuLinkForLeaf,
  type RootMenuNode,
} from '#/lib/rootMainMenu'
import { cn } from '#/lib/utils'

type RootMainMenuProps = {
  onNavigate?: () => void
  className?: string
}

const rowClass =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium no-underline transition'

export default function RootMainMenu({
  onNavigate,
  className,
}: RootMainMenuProps) {
  const { can } = useAuth()
  const { pathname, search } = useRouterState({
    select: (s) => ({
      pathname: s.location.pathname,
      search: s.location.search as Record<string, unknown>,
    }),
  })
  const nodes = useMemo(() => filterMenuTree(ROOT_MAIN_MENU, can), [can])

  const [expanded, setExpanded] = useState(
    () => new Set(folderIdsForPath(nodes, pathname)),
  )

  useEffect(() => {
    const ids = folderIdsForPath(nodes, pathname)
    if (ids.length === 0) return
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.add(id)
      return next
    })
  }, [pathname, nodes])

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <nav
      aria-label="Root Main Menu"
      className={cn('flex flex-col gap-0.5', className)}
    >
      {nodes.map((node) => (
        <MenuNodeView
          key={node.id}
          node={node}
          depth={0}
          pathname={pathname}
          search={search}
          expanded={expanded}
          onToggle={toggle}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  )
}

function MenuNodeView({
  node,
  depth,
  pathname,
  search,
  expanded,
  onToggle,
  onNavigate,
}: {
  node: RootMenuNode
  depth: number
  pathname: string
  search: Record<string, unknown>
  expanded: Set<string>
  onToggle: (id: string) => void
  onNavigate?: () => void
}) {
  const pad = { paddingLeft: `${0.5 + depth * 0.75}rem` }

  if (isRootMenuFolder(node)) {
    const open = expanded.has(node.id)
    const FolderIcon = open ? FolderOpen : Folder
    return (
      <div>
        <button
          type="button"
          className={cn(rowClass, 'text-[var(--ink)] hover:bg-[var(--surface)]')}
          style={pad}
          aria-expanded={open}
          onClick={() => onToggle(node.id)}
        >
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 text-[var(--muted)] transition-transform',
              open && 'rotate-90',
            )}
            aria-hidden
          />
          <FolderIcon
            className="size-4 shrink-0 text-[var(--muted)]"
            aria-hidden
          />
          <span className="truncate">{node.label}</span>
        </button>
        {open ? (
          <div className="flex flex-col gap-0.5">
            {node.children.map((child) => (
              <MenuNodeView
                key={child.id}
                node={child}
                depth={depth + 1}
                pathname={pathname}
                search={search}
                expanded={expanded}
                onToggle={onToggle}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  const active =
    pathname === node.match || pathname.startsWith(`${node.match}/`)
  const link = menuLinkForLeaf(node, { pathname, search })

  return (
    <Link
      to={link.to}
      params={link.params}
      search={link.search}
      onClick={onNavigate}
      className={cn(
        rowClass,
        active
          ? 'bg-[var(--surface)] text-[var(--ink)]'
          : 'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]',
      )}
      style={pad}
    >
      <span className="size-3.5 shrink-0" aria-hidden />
      <FileText className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{node.label}</span>
    </Link>
  )
}
