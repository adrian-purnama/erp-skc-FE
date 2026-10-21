# Graph Report - frontend  (2026-10-20)

## Corpus Check
- 121 files · ~64,745 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 835 nodes · 2087 edges · 29 communities (22 shown, 7 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 39 edges (avg confidence: 0.52)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- ItemMasterForm.tsx
- cn
- useAuth
- ProjectForm.tsx
- routeTree.gen.ts
- devDependencies
- RootMainMenu.tsx
- dependencies
- compilerOptions
- requirePermissionBeforeLoad.ts
- authContext.tsx
- FileRoutesByPath
- components.json
- Building For Production
- router.tsx
- index.tsx
- reset-password.tsx
- forgot-password.tsx
- AGENTS.md
- prettier.config.js
- vite.config.ts
- ProjectCalendarPanel.tsx
- cn
- VendorForm.tsx
- AppConfigForm.tsx
- index.tsx
- index.tsx
- frappe-gantt-css.d.ts

## God Nodes (most connected - your core abstractions)
1. `cn()` - 143 edges
2. `FileRoutesByPath` - 38 edges
3. `useAuth()` - 34 edges
4. `apiFetch()` - 31 edges
5. `requirePermissionBeforeLoad()` - 27 edges
6. `useDebouncedValue()` - 25 edges
7. `Button()` - 22 edges
8. `ProjectCalendarPanel()` - 18 edges
9. `paginate()` - 17 edges
10. `compilerOptions` - 17 edges

## Surprising Connections (you probably didn't know these)
- `CalendarDayButton()` --references--> `react`  [EXTRACTED]
  src/components/ui/calendar.tsx → package.json
- `ModeTab()` --calls--> `cn()`  [EXTRACTED]
  src/components/RootMainMenuShell.tsx → src/lib/utils.ts
- `ToggleRow()` --calls--> `cn()`  [EXTRACTED]
  src/components/forms/AppConfigForm.tsx → src/lib/utils.ts
- `TreeList()` --calls--> `cn()`  [EXTRACTED]
  src/components/forms/ItemMasterForm.tsx → src/lib/utils.ts
- `ItemSelection()` --calls--> `cn()`  [EXTRACTED]
  src/components/forms/ItemMasterForm.tsx → src/lib/utils.ts

## Import Cycles
- None detected.

## Communities (29 total, 7 thin omitted)

### Community 0 - "ItemMasterForm.tsx"
Cohesion: 0.08
Nodes (33): emptyTarifRow(), emptyUomRow(), emptyVendorRow(), FolderForm(), ItemForm(), ItemMasterForm(), ItemSelection(), MoveForm() (+25 more)

### Community 1 - "cn"
Cohesion: 0.05
Nodes (60): ActionBadge(), AuditViewerForm(), copyText(), DateFilterField(), DiffBody(), IdChip(), localDateToYmd(), ValueView() (+52 more)

### Community 2 - "useAuth"
Cohesion: 0.05
Nodes (55): FilterChip, Props, RoleEditor(), slugify(), Footer(), AppConfigData, AppConfigForm(), ToggleRow() (+47 more)

### Community 3 - "ProjectForm.tsx"
Cohesion: 0.08
Nodes (47): ProjectDashboard(), Props, contactRecordToRows(), ContactRow, emptyContactRow(), ProjectEditor(), Props, ProjectPhaseSteps() (+39 more)

### Community 4 - "routeTree.gen.ts"
Cohesion: 0.04
Nodes (55): Route, Route, AdminAppConfigRoute, AdminAuditRoute, AdminIndexRoute, AdminPermissionsRoute, AdminRolesIndexRoute, AdminRolesKeyRoute (+47 more)

### Community 5 - "devDependencies"
Cohesion: 0.04
Nodes (45): eslint, devDependencies, eslint, prettier, @tanstack/devtools-vite, @tanstack/eslint-config, @tanstack/react-devtools, @tanstack/react-router-devtools (+37 more)

### Community 6 - "RootMainMenu.tsx"
Cohesion: 0.13
Nodes (22): MenuNodeView(), RootMainMenu(), RootMainMenuProps, ModeTab(), RootMainMenuShellInner(), readCollapsed(), SideNavContext, SideNavContextValue (+14 more)

### Community 7 - "dependencies"
Cohesion: 0.05
Nodes (37): class-variance-authority, clsx, cmdk, cn, date-fns, frappe-gantt, lucide-react, dependencies (+29 more)

### Community 8 - "compilerOptions"
Cohesion: 0.07
Nodes (27): DOM, DOM.Iterable, ES2022, eslint.config.js, prettier.config.js, **/*.ts, **/*.tsx, vite/client (+19 more)

### Community 9 - "requirePermissionBeforeLoad.ts"
Cohesion: 0.20
Nodes (4): CustomerForm(), Route, Route, Route

### Community 11 - "FileRoutesByPath"
Cohesion: 0.11
Nodes (12): AuthProvider(), bootstrapAuth(), canAnyFromUser(), canFromUser(), requirePermissionBeforeLoad(), Route, Route, Route (+4 more)

### Community 12 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 13 - "Building For Production"
Cohesion: 0.12
Nodes (15): Adding A Route, Adding Links, API Routes, Building For Production, Data Fetching, Demo files, Getting Started, Learn More (+7 more)

### Community 14 - "router.tsx"
Cohesion: 0.25
Nodes (6): getRouter(), Register, @tanstack/react-router, Register, routeTree, startInstance

### Community 15 - "index.tsx"
Cohesion: 0.20
Nodes (4): ProjectForm(), Route, Route, Route

### Community 16 - "reset-password.tsx"
Cohesion: 0.08
Nodes (12): Route, Route, Route, Route, ResetPasswordSearch, Route, Route, Route (+4 more)

### Community 24 - "ProjectCalendarPanel.tsx"
Cohesion: 0.08
Nodes (60): DateField(), EditorState, emptyEditor(), eventToEditor(), formatYmdLabel(), joinLocal(), LEGEND_TONES, localDateToYmd() (+52 more)

### Community 25 - "cn"
Cohesion: 0.06
Nodes (67): ExcludedProject, auditDeletedLine(), auditUploadedLine(), formatBytes(), formatWhen(), ProjectDocumentsPanel(), Props, VersionRow() (+59 more)

### Community 26 - "VendorForm.tsx"
Cohesion: 0.06
Nodes (66): CustomerEditor(), CustomerList(), emptyEmail(), emptyPhone(), Props, STATUS_FILTER_OPTIONS, StatusFilter, ProjectList() (+58 more)

### Community 28 - "AppConfigForm.tsx"
Cohesion: 0.11
Nodes (9): RootMainMenuShell(), Route, Route, ADMIN_ACCESS, AdminLayout(), breadcrumbFor(), Route, Route (+1 more)

### Community 32 - "index.tsx"
Cohesion: 0.20
Nodes (4): VendorForm(), Route, Route, Route

## Knowledge Gaps
- **243 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+238 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `ItemMasterForm.tsx`, `cn`, `useAuth`, `ProjectForm.tsx`, `RootMainMenu.tsx`, `authContext.tsx`, `ProjectCalendarPanel.tsx`, `VendorForm.tsx`?**
  _High betweenness centrality (0.324) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `devDependencies`?**
  _High betweenness centrality (0.163) - this node is a cross-community bridge._
- **Why does `CalendarDayButton()` connect `cn` to `dependencies`?**
  _High betweenness centrality (0.162) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _243 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ItemMasterForm.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08130081300813008 - nodes in this community are weakly interconnected._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.05456095481670929 - nodes in this community are weakly interconnected._
- **Should `useAuth` be split into smaller, more focused modules?**
  _Cohesion score 0.053946053946053944 - nodes in this community are weakly interconnected._