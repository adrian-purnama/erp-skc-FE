import type { ReactNode } from 'react'
import {
  FolderKanban,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import RootMainMenu from '#/components/RootMainMenu'
import { Button } from '#/components/ui/button'
import { SideNavProvider, useSideNav } from '#/context/sideNavContext'
import { cn } from '#/lib/utils'

export default function RootMainMenuShell({ children }: { children: ReactNode }) {
  return (
    <SideNavProvider>
      <RootMainMenuShellInner>{children}</RootMainMenuShellInner>
    </SideNavProvider>
  )
}

function RootMainMenuShellInner({ children }: { children: ReactNode }) {
  const {
    collapsed,
    setCollapsed,
    mode,
    setMode,
    detailsSlot,
    hasDetails,
  } = useSideNav()

  return (
    <div className="flex min-h-[calc(100dvh-57px)] w-full text-(--ink)">
      <div className="sticky top-[57px] z-20 hidden h-[calc(100dvh-57px)] shrink-0 md:flex">
        <div
          className={cn(
            'flex flex-col bg-white transition-[width] duration-200',
            collapsed ? 'w-12' : 'w-64',
          )}
        >
          <div className="flex flex-col gap-1 border-b border-(--line) px-2 py-2">
            <div
              className={cn(
                'flex items-center',
                collapsed ? 'justify-center' : 'justify-end',
              )}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => setCollapsed(!collapsed)}
                aria-label={collapsed ? 'Expand side nav' : 'Collapse side nav'}
                title={collapsed ? 'Expand' : 'Collapse'}
              >
                {collapsed ? (
                  <PanelLeftOpen className="size-4" aria-hidden />
                ) : (
                  <PanelLeftClose className="size-4" aria-hidden />
                )}
              </Button>
            </div>

            {!collapsed && hasDetails ? (
              <div className="flex flex-col gap-0.5 rounded-md bg-(--surface) p-0.5">
                <ModeTab
                  active={mode === 'menu'}
                  onClick={() => setMode('menu')}
                  label="Menu"
                  icon={<Menu className="size-3.5" aria-hidden />}
                />
                <ModeTab
                  active={mode === 'details'}
                  onClick={() => setMode('details')}
                  label="Project"
                  icon={<FolderKanban className="size-3.5" aria-hidden />}
                />
              </div>
            ) : null}
          </div>

          {!collapsed ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3">
              {hasDetails && mode === 'details' ? (
                detailsSlot
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                  <p className="mb-1 px-2 text-xs font-medium tracking-wide text-(--muted) uppercase">
                    Root Main Menu
                  </p>
                  <RootMainMenu />
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div
          className="w-px shrink-0 self-stretch bg-[color-mix(in_srgb,var(--ink)_16%,transparent)]"
          aria-hidden
        />
      </div>

      <div className="min-w-0 flex-1 bg-(--surface)">{children}</div>
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-xs font-medium transition',
        active
          ? 'bg-white text-(--ink) shadow-sm'
          : 'text-(--muted) hover:text-(--ink)',
      )}
      aria-pressed={active}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}
