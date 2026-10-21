# Graph Report - frontend  (2026-10-20)

## Corpus Check
- 121 files · ~63,671 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 832 nodes · 2064 edges · 43 communities (27 shown, 16 thin omitted)
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
- register.tsx
- index.tsx
- AGENTS.md
- prettier.config.js
- vite.config.ts
- ProjectCalendarPanel.tsx
- cn
- VendorForm.tsx
- ProjectForm.tsx
- AppConfigForm.tsx
- AuditViewerForm.tsx
- CustomerForm.tsx
- permissions.tsx
- index.tsx
- auditDiff.ts
- utils.ts
- index.tsx
- index.tsx
- index.tsx
- login.tsx
- route.tsx
- index.tsx
- index.tsx
- frappe-gantt-css.d.ts

## God Nodes (most connected - your core abstractions)
1. `cn()` - 143 edges
2. `FileRoutesByPath` - 38 edges
3. `useAuth()` - 34 edges
4. `apiFetch()` - 32 edges
5. `requirePermissionBeforeLoad()` - 27 edges
6. `useDebouncedValue()` - 23 edges
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

## Communities (43 total, 16 thin omitted)

### Community 0 - "ItemMasterForm.tsx"
Cohesion: 0.08
Nodes (33): emptyTarifRow(), emptyUomRow(), emptyVendorRow(), FolderForm(), ItemForm(), ItemMasterForm(), ItemSelection(), MoveForm() (+25 more)

### Community 1 - "cn"
Cohesion: 0.05
Nodes (76): acceptForKind(), auditDeletedLine(), auditUploadedLine(), formatBytes(), formatWhen(), ProjectDocumentsPanel(), Props, VersionRow() (+68 more)

### Community 2 - "useAuth"
Cohesion: 0.05
Nodes (51): FilterChip, Props, RoleEditor(), slugify(), ShrinkDbForm(), LoginForm(), LoginResponse, PasswordInput() (+43 more)

### Community 3 - "ProjectForm.tsx"
Cohesion: 0.08
Nodes (44): ProjectDashboard(), Props, contactRecordToRows(), emptyContactRow(), ProjectEditor(), ProjectPhaseSteps(), Props, ProjectSideNavPanel() (+36 more)

### Community 4 - "routeTree.gen.ts"
Cohesion: 0.04
Nodes (52): AdminAppConfigRoute, AdminAuditRoute, AdminIndexRoute, AdminPermissionsRoute, AdminRolesIndexRoute, AdminRolesKeyRoute, AdminRolesNewRoute, AdminRouteRoute (+44 more)

### Community 5 - "devDependencies"
Cohesion: 0.04
Nodes (45): eslint, devDependencies, eslint, prettier, @tanstack/devtools-vite, @tanstack/eslint-config, @tanstack/react-devtools, @tanstack/react-router-devtools (+37 more)

### Community 6 - "RootMainMenu.tsx"
Cohesion: 0.11
Nodes (24): MenuNodeView(), RootMainMenu(), RootMainMenuProps, ModeTab(), RootMainMenuShell(), RootMainMenuShellInner(), readCollapsed(), SideNavContext (+16 more)

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
Nodes (13): Route, Route, Route, Route, Route, Route, Route, Route (+5 more)

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

### Community 24 - "ProjectCalendarPanel.tsx"
Cohesion: 0.08
Nodes (60): DateField(), EditorState, emptyEditor(), eventToEditor(), formatYmdLabel(), joinLocal(), LEGEND_TONES, localDateToYmd() (+52 more)

### Community 25 - "cn"
Cohesion: 0.11
Nodes (28): Props, TenderProjectPicker(), AlertDialogMedia(), AlertDialogOverlay(), Combobox(), ComboboxOption, ComboboxProps, Command() (+20 more)

### Community 26 - "VendorForm.tsx"
Cohesion: 0.13
Nodes (24): StatusPill(), emptyForm, FieldErrors, emptyEmail(), emptyPhone(), Props, STATUS_FILTER_OPTIONS, StatusFilter (+16 more)

### Community 27 - "ProjectForm.tsx"
Cohesion: 0.15
Nodes (14): CustomerList(), ContactRow, ProjectList(), Props, Props, ListSearchInput(), ListTable(), ListTableColumn (+6 more)

### Community 28 - "AppConfigForm.tsx"
Cohesion: 0.17
Nodes (13): Footer(), AppConfigData, AppConfigForm(), ToggleRow(), Header(), Branding, BrandingContext, BrandingContextValue (+5 more)

### Community 29 - "AuditViewerForm.tsx"
Cohesion: 0.21
Nodes (15): ActionBadge(), AuditViewerForm(), copyText(), DateFilterField(), IdChip(), localDateToYmd(), ymdToLocalDate(), actionLabel() (+7 more)

### Community 30 - "CustomerForm.tsx"
Cohesion: 0.21
Nodes (14): CustomerEditor(), emptyEmail(), emptyPhone(), Props, STATUS_FILTER_OPTIONS, StatusFilter, CustomerDetail, CustomerEmail (+6 more)

### Community 31 - "permissions.tsx"
Cohesion: 0.18
Nodes (12): Select(), SelectContent(), SelectItem(), SelectLabel(), SelectScrollDownButton(), SelectScrollUpButton(), SelectSeparator(), SelectTrigger() (+4 more)

### Community 32 - "index.tsx"
Cohesion: 0.20
Nodes (4): VendorForm(), Route, Route, Route

### Community 33 - "auditDiff.ts"
Cohesion: 0.32
Nodes (7): DiffBody(), ValueView(), DiffRow, fieldDiff(), formatAuditValue(), isObjectIdString(), stable()

### Community 34 - "utils.ts"
Cohesion: 0.57
Nodes (4): Button(), buttonVariants, Calendar(), CalendarDayButton()

## Knowledge Gaps
- **241 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+236 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `ItemMasterForm.tsx`, `cn`, `useAuth`, `ProjectForm.tsx`, `utils.ts`, `RootMainMenu.tsx`, `ProjectCalendarPanel.tsx`, `VendorForm.tsx`, `ProjectForm.tsx`, `AppConfigForm.tsx`, `AuditViewerForm.tsx`, `CustomerForm.tsx`, `permissions.tsx`?**
  _High betweenness centrality (0.325) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `devDependencies`?**
  _High betweenness centrality (0.164) - this node is a cross-community bridge._
- **Why does `CalendarDayButton()` connect `utils.ts` to `cn`, `dependencies`?**
  _High betweenness centrality (0.163) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _241 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ItemMasterForm.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08130081300813008 - nodes in this community are weakly interconnected._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.05236091631603553 - nodes in this community are weakly interconnected._
- **Should `useAuth` be split into smaller, more focused modules?**
  _Cohesion score 0.05225576111652061 - nodes in this community are weakly interconnected._