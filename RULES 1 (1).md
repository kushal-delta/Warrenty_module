# Project Management 2.0 — Project Rules

## 1. Schema

- **Table names**: PascalCase, **plural** — `Users`, `Companies`, `ProjectTasks`
- **Primary key**: same name as table (singular) + `Id` — e.g. `Users` → `UserId`
- **Line/detail tables**: append `Lns` — e.g. `UserLns`, `TaskLns`
- **Mandatory audit columns on every table**:
  ```ts
  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  ```
- `InsertedByUserId` and `LastUpdatedByUserId` **must always reference `Users.UserId`**
- All timestamps stored in **UTC with timezone** (`withTimezone: true`) — no local time, no bare dates
- **Display only**: always format dates/times for the UI using the selected company's timezone — never render raw UTC to the user
- **`formatDate` usage**: always pass `withTime = true` (second argument) when displaying timestamp fields (`InsertedOn`, `LastUpdatedOn`, `LockedOn`, `DeletedOn`, or any `*On` audit column) in tables, dialogs, or any UI element. Date-only fields (`StartDate`, `EndDate`, `EffectiveFrom`, `EffectiveTo`) should be called without the flag.
- **`EffectiveFrom` / `EffectiveDate` default**: whenever a create form has an `EffectiveFrom` or `EffectiveDate` field, it must default to `dayjs()` (today) on open. Never leave it blank on a new record.
- **Date inputs**: always use `<SmartDatePicker>` from `@/components/ui/smart-date-picker` instead of Ant Design's `<DatePicker>` directly.
- **`SortOrder` / display-order columns are 1-based — start at 1, never 0.** Any ordering column (a master's `SortOrder`, a parent↔child link's display order, sequence positions, etc.) begins at 1. New records default to `1`; the "next" position is `max(existing) + 1`. When mapping an array to ordered rows, use `index + 1`, not `index`. Applies to both the create/edit forms and the API defaults.

---

## 2. API Routes

- All endpoints defined in the **Zustand store** as a top-level `API` const:
  ```ts
  const API = {
    GET: "/api/module/resource",
    ADD: "/api/module/resource/add",
    UPDATE: "/api/module/resource/update",
    DELETE: "/api/module/resource/delete",
  };
  ```
- All API calls made **only through store methods** — never call fetch/axios directly from components
- Use **axios** for all HTTP calls (no raw `fetch`)

---

## 3. State & Data Flow

- All server state lives in **Zustand stores**
- Components call store methods — stores call APIs — APIs return data back through the store
- No direct API calls or local `useState` for server data in components

---

## 4. UI & Styling

- **Tailwind CSS** for layout, spacing, and utilities
- **Ant Design (antd)** for all interactive components (Table, Form, Modal, Select, Button, etc.)
- Consistent professional theme across the entire project — no one-off inline color overrides
- No mixing of component libraries for the same element type
- **Strictly use Tailwind CSS for all layouts and spacing:** Do NOT use Ant Design's grid system (`Row`, `Col`) or built-in padding/margin properties. Use Tailwind's grid and spacing utility classes instead.
- **Component Sizing:** Do NOT use `size="large"` for Ant Design components. Keep component sizes standard and unified.
- **No Ellipses / Truncating in Tables:** Never use ellipses (`...` or `truncate` class) in tables for critical text like location names, zone names, or MBR/Cluster names. Always use proper text wrapping (`whitespace-normal break-words leading-tight`) to keep the content fully visible and readable for the user.

---

## 5. Inline Create (+ Button Pattern)

- Whenever a form has a dropdown that references another entity, provide a **`+` icon button** next to it
- Clicking `+` opens a **Modal** to create that entity inline without leaving the form
- On successful creation, the new value is selected automatically in the dropdown

---

## 6. Logging

- Audit logs are saved via `saveAuditLog` (all helpers funnel through it)
- Audit logs are written in development and production so activity history can be verified locally

---

## 7. Foreign Key Delete Behaviour

**Rule: every FK in this project uses `onDelete: "restrict"` unless listed as an explicit exception below.**

`restrict` means Postgres will block the parent delete if any child row exists. The user must delete child records first — the DB never silently removes or nullifies them.

### Allowed exceptions

| `onDelete` value | When to use                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `"set null"`     | Audit columns only — `InsertedByUserId`, `LastUpdatedByUserId`, `LockedByUserId`. Deleting a user must not block deletion of every record they ever touched. |
| `"restrict"`     | Everything else — all business FKs.                                                                                                                          |
| `"cascade"`      | **Never.** Do not use cascade anywhere in this project.                                                                                                      |

### App-layer responsibility

When a delete is blocked by Postgres (FK violation), the API must return a clear error telling the user **which child records must be deleted first**, not a raw DB error.

---

## 8. API Design — POST-Only, Optimised, Minimal API Calls

- **All API endpoints must use `POST` method only** — no GET, PUT, DELETE, or PATCH.
- For reads, the action (`get`, `search`) is encoded in the URL path; any filter/query params are sent in the request body.
- For deletes, the ID is sent in the request body, not via URL segments or query params.
- **Optimisation is mandatory on every endpoint:**
  - Single DB round-trip per endpoint wherever possible.
  - Use `inArray` + Map (never per-row queries) for resolving user names or related records.
  - Use `returning()` on insert/update — never re-fetch the same row.
  - Bulk endpoints must use a single `insert().values([...])` call — never loop inserts.
  - Bulk deduplication must be done in JS before hitting the DB, not via multiple DB calls.
- **Bulk upload is required on every master module** — every master must expose a `/bulk-upload` POST endpoint alongside the standard add/get/update/delete endpoints.
- **Minimum API calls from frontend** — design APIs and Zustand stores so that each user action triggers the fewest possible network calls:
  - Combine related data into one endpoint wherever logical (e.g. a project `get` should return client, members, and status summary in the same response, not three separate calls).
  - On page load, batch all bootstrap data into one or two calls — never fire N calls for N records.
  - For forms that create a parent + children (e.g. Project + Milestones + Tasks), provide a single `/add-full` endpoint that accepts the full object graph and inserts everything in one DB transaction.
  - Avoid polling; prefer loading full state once and updating via local store mutations after write operations.
- **Frontend bulk upload UI requirements (every master):**
  - Professional Ant Design `Steps` component showing: Upload File → Validate → Preview → Confirm.
  - Template download button (generates correct CSV/XLSX column headers for that master).
  - `Upload` component with `beforeUpload` validation (file type, size limit).
  - Preview table (`Table`) showing parsed rows with row-level validation status before submission.
  - Result summary after upload: inserted / skipped / failed counts.

---

## 9. API Inventory — What Is Already Built

Use this section to avoid re-creating existing endpoints.

### Auth (`/api/Auth/...`)

| Endpoint                        | Method   | Purpose            |
| ------------------------------- | -------- | ------------------ |
| `login`                         | POST     | Login, returns JWT |
| `logout`                        | POST     | Logout             |
| `refresh-token`                 | POST     | Refresh JWT        |
| `addUser`                       | POST     | Create user        |
| `updateUser`                    | POST     | Update user        |
| `deleteUser`                    | POST     | Delete user        |
| `getUser`                       | GET      | Get user by id     |
| `forms`                         | GET/POST | List forms         |
| `forms/add`                     | POST     | Add form           |
| `forms/update`                  | POST     | Update form        |
| `forms/delete`                  | POST     | Delete form        |
| `form-rights/get`               | GET      | Get rights         |
| `form-rights/add`               | POST     | Add right          |
| `form-rights/update`            | POST     | Update right       |
| `form-rights/delete`            | POST     | Delete right       |
| `form-rights/bulk`              | POST     | Bulk assign rights |
| `form-rights/bulk-assign-users` | POST     | Bulk assign users  |
| `form-rights/checkAccess`       | POST     | Check access       |
| `form-rights/form`              | GET      | Rights for a form  |
| `form-rights/user`              | GET      | Rights for a user  |

### Audit Log (`/api/audit-log/...`)

| Endpoint   | Purpose            |
| ---------- | ------------------ |
| `add`      | Write audit entry  |
| `get`      | Get single log     |
| `by-table` | Logs by table name |
| `by-user`  | Logs by user       |

### Utilities

| Endpoint                     | Purpose              |
| ---------------------------- | -------------------- |
| `/api/geo`                   | Geo lookup           |
| `/api/upload`                | File upload          |
| `/api/delete-file`           | File delete          |
| `/api/manageDocument/add`    | Attach document      |
| `/api/manageDocument/delete` | Remove document      |
| `/api/utils/pincode-lookup`  | Pincode → city/state |

### Masters — Company (`/api/masters/company/...`)

`add` · `get` · `update` · `delete`

### Masters — Currency (`/api/masters/currency/...`)

`add` · `get` · `update` · `delete`

### Masters — Departments (`/api/masters/departments/...`)

`add` · `get` · `update` · `delete`

### Masters — Fiscal Years (`/api/masters/fiscal-years/...`)

`add` · `get` · `update` · `delete`

### Masters — States (`/api/masters/states/...`)

`add` · `get` · `update` · `delete` · `bulk-upload`

### Masters — System Parameters (`/api/masters/systemParameters/...`)

`add` · `get` · `update` · `delete`

### Masters — Unit of Measure (`/api/masters/unit-of-measure/...`)

`add` · `get` · `update` · `delete`

### RA Bill (`/api/pms/ra-bill/...`)

`add` · `get` · `update` · `delete` · `change-status` · `boq-preview`

---

## 10. Tree Tables — Keyboard Navigation

Any Ant Design `<Table>` that renders hierarchical/tree data (parent-child rows with expand/collapse) **must** implement keyboard navigation via `onRow`:

| Key               | Behaviour                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `↓` / `↑`         | Move focus to next / previous **visible** row                                               |
| `→`               | Expand current row's children                                                               |
| `←`               | Collapse current row **and all its descendants** — never leave stale expanded keys in state |
| `Enter` / `Space` | Toggle expand / collapse                                                                    |
| `E`               | Open edit dialog for focused row                                                            |
| `N`               | Open add-child dialog under focused row                                                     |

**Implementation rules:**

- Wrap the `<Table>` in a `<div ref={tableRef}>` — do NOT pass `ref` to `<Table>` itself (it returns a component instance, not a DOM node).
- Add `tabIndex={0}` + `onFocus` + `onKeyDown` via `onRow` so every row is keyboard-reachable.
- Maintain `visibleRowKeys` — a flat ordered array of row keys that are currently visible (i.e. respects expanded state). Use this for up/down navigation.
- On collapse (`←` or toggle), always remove the row key **and all descendant keys** from `expandedRowKeys` using a `collapseWithDescendants` helper. Never only remove the parent key alone.
- Focus the target row with `tableRef.current?.querySelector('tr[data-row-key="<key>"]')?.focus()`.
- Add a `.lg-row-focused td` CSS rule (or equivalent) to visually highlight the focused row.
- `SmartDatePicker` accepts free-text in any format (`1-apr-22`, `apr-22`, `01/04/2022`, `01.04.2023`, etc.) and resolves to the correct date on Enter/blur. Never import `DatePicker` from `antd` in form components.

---

## 11. Map Component Usage

**Rule: Use `ProjectLocationMap` for all map plotting and location searching.**

- Whenever you need to display a map, plot coordinates, or allow the user to search for a location and drop a pin, you **must** reuse the `<ProjectLocationMap>` component (found in `components/project-location-map.jsx`).
- **Do not** install new map libraries or create redundant map components. The existing component is fully featured, supporting trackpad/mouse gestures, reverse geocoding, zooming, and editable states.

---

## 12. DPR Column Value Type — Lock After Data Entry

**Rule: Once a DPR dynamic column has existing data entries against it, its `ValueType` must never be changed.**

- On any UI that renders a DPR column configuration (type picker, dropdown, or any edit control for `ValueType`), **disable the type selector** if the column already has recorded DPR entries (`hasEntries: true` on the column object).
- Show a locked tooltip: _"Value type cannot be changed — this column already has recorded entries."_
- This applies to both the activity master config screen and any inline edit surface.
- On the **API side**, any `update` endpoint that saves DPR column config must check whether entries exist for that column. If entries exist and the incoming `ValueType` differs from the stored one, **reject the request** with HTTP 400 and the message: `"Cannot change value type for column '<Label>' — it already has recorded entries."` — never silently overwrite the type.
- The backend check is the authoritative guard; the UI lock is a convenience layer only.

---

## 13. DPR — BOQ & WBS Activity Linkage Rules

**Rule: DPR entries inherit type, accumulation and column definitions from the linked WBS Activity. BOQ links govern quantity/unit context.**

Key invariants to preserve in all future DPR work:

1. **DprType and DprProgressType are owned by the WBS Activity**, not the DPR entry. When a user selects an activity in the DPR form, these fields must auto-populate from `WBSActivities.DprType` / `WBSActivities.DprProgressType` and be displayed as read-only badges ("from WBS"). Never allow overriding them at the entry level.

2. **DprColumns belong to the WBS Activity**. They are defined in `WBSActivityDprColumns` and must be loaded by joining through the activity. Always fetch `DprColumns` alongside activities (via parallel query + Map enrichment), never via per-entry subqueries.

3. **BOQ linkage**: WBS activities may reference BOQ items (via the BOQ tables). When displaying DPR progress for a Volume-type activity, the unit of measurement (e.g. m³, m, nos) should resolve from the linked BOQ item's unit if present. Do not hardcode units — derive them from `BOQ.Unit` or `WBSActivityDprColumns.Options` (`unit:X` sentinel).

4. **Quantity validation**: For Volume-type entries, the `ProgressValue` represents work done in that entry's unit. The total cumulative progress across all entries for an activity+location should never silently exceed the BOQ planned quantity. Surface a warning (not a hard block) in the UI when the cumulative total approaches or exceeds the BOQ planned quantity.

4a. **Volume entry new-entry default (Rollover Rule)**: When creating a new DPR entry for a Volume activity on a chainage location, the `ProgressValue` field must auto-fill with the **remaining** quantity, not the full tentative length:
   - `default_value = max(0, tentative_length − already_done)`
   - `already_done` is computed per chainage range (from + to node pair) and per activity+location:
     - `Cumulative` progress type: `already_done` = `ProgressValue` of the **most recent submitted** entry for that exact chainage range.
     - `Sequential` progress type: `already_done` = **sum** of all submitted `ProgressValue` entries for that chainage range.
   - When **editing** an existing entry, the auto-fill must NOT override the saved value — only fire when the user explicitly changes the chainage node selectors after the form is open. Use a `userChangedChainageRef` (React ref) to track this: set `false` on open, `true` on any chainage Select `onChange`.

5. **Sequential vs Cumulative**: Sequential means each entry records the day's independent work quantity. Cumulative means each entry is the running total. This distinction is read from `DprProgressType` on the activity and must be shown clearly in the DPR report (column "Prog. Type").

---

## 23. Project BOQ Versioning — Scope Linkage Carry-Forward

**Rule: When a new Project BOQ version is created, all existing WBS scope links must be automatically carried forward for BOQ items that survive into the new version.**

Key invariants:

1. **ItemId reuse**: When a new BOQ version is uploaded or imported from tender, items that match by `BOQItemNo` reuse the same `ItemId` UUID. This is intentional — it preserves the link between scope and the physical item across versions.

2. **`WBSGroupBoqItemLns.VersionId` must be migrated**: The scope link table has a `VersionId` column. After inserting the new version's items, the upload/import route must query all `WBSGroupBoqItemLns` rows from the previous version whose `ProjectBoqItemId` is still in the new version, and re-insert them with the new `VersionId`. This must happen **inside the same transaction** as the item insert.

3. **`WBSActivityAreaLns` must also be migrated**: Area links carry `ProjectBoqItemId` and `VersionId`. When creating a new BOQ version, query all `WBSActivityAreaLns` rows from the previous version whose `ProjectBoqItemId` is still present in the new version (matched by `BOQItemNo` → same `ItemId`), and re-insert them with the new `VersionId`. This must happen inside the same transaction as the item insert — same pattern as `WBSGroupBoqItemLns` carry-forward.

4. **Both upload paths must carry forward links**: The carry-forward logic must be present in both `/api/pms/project/boq/upload` (Excel upload) and `/api/pms/project/boq/import-from-tender` (tender copy). Never add a third BOQ version creation path without also adding the carry-forward.

5. **Scope removal (unlink)**: The `/api/pms/project/boq/unlink-scope` endpoint deletes `WBSGroupBoqItemLns` rows for specific `boqItemIds` in the current `versionId`. It must validate the items belong to the project/version and are leaves. FK violations (DPR entries exist) must return a clear 409 error.

---

## 16. Confirmation Modals — Use Dedicated Modal, Not Modal.confirm

**Rule: Never use Ant Design's `Modal.confirm()` for destructive or multi-step confirmation flows. Always use a state-controlled `<Modal>` component.**

- Use `const [confirmOpen, setConfirmOpen] = React.useState(false)` to drive the modal open state.
- The trigger button sets `confirmOpen` to `true`. The modal's `onCancel` closes it.
- The confirm modal must show: what will be affected (list the items), a warning `<Alert>`, and clearly labelled Cancel / confirm buttons.
- The confirm button should be `danger` + `type="primary"` with a `loading` prop wired to the store's loading flag.
- `Modal.confirm()` is banned because: it is not server-component safe, cannot be styled consistently, and does not support async loading states on the OK button.

---

## 17. BOQ Scope Linkage — Location and WBS Selection Rules

**Rule: When linking BOQ scope, only DPR locations are valid, and WBS activity selection must be strict (no auto-cascade).**

1. **DPR Locations only**: The Site Location selection panel must default to "DPR Only" filter ON. Only locations where `IsDprLocation = true` may be linked as scope — the API enforces this server-side (rejects non-DPR locations). The UI filter defaults to `isDprFilter = true` so the user cannot accidentally select non-DPR nodes.

2. **Both trees must use `checkStrictly={true}`**: Both the WBS Activity tree and the Site Location tree must use `checkStrictly={true}`. Without it, checking any node auto-cascades to all its ancestors AND descendants, causing unintended selections. The user must explicitly check each node they want. Group nodes (WBS) are excluded from `activityIds` via `key.startsWith("group-")`. Non-DPR parent nodes (Location) are stripped by the `selectedDprLocationIds` memo even if accidentally checked.

3. **What gets linked**:
   - `WBSGroupBoqItemLns`: BOQ leaf item × WBS group (derived from the selected activities). ALL activities in a group share one group link — the group is the unit of BOQ linkage. Linking any activity in a group links the whole group to the BOQ item.
   - `WBSActivityAreaLns`: Selected activity × selected DPR location. Only the explicitly selected activities and DPR locations are linked — no implicit expansion to other activities in the same group.

4. **Display vs selection**: The scope detail view shows only activities that have at least one `WBSActivityAreaLns` entry — activities in a linked group with zero location links are hidden. The location count reflects unique locations across those visible activities only.

5. **UI dedup before API**: The `selectedDprLocationIds` memo filters `selectedLocationIds` to only IDs present in `flatLocations` where `IsDprLocation = true`. This strips parent/non-DPR nodes that Ant Design cascade-check may have added. Always send `selectedDprLocationIds` to the API, never the raw `selectedLocationIds`.

6. **`selectedCount` prop on `TreeSelectionPanel`**: When the displayed selection count differs from `checkedKeys.length` (e.g. DPR-only count vs total checked including parent nodes), pass `selectedCount` explicitly to override the header badge.

---

## 18. BOQ Scope — GET Query Scoping

**Rule: `WBSActivityAreaLns` must always be fetched scoped to the current version's BOQ item IDs — never with no WHERE clause.**

- The GET route uses `inArray(WBSActivityAreaLns.ProjectBoqItemId, boqItemIds) AND WBSActivityAreaLns.VersionId = version.VersionId` to scope area links. This is safe without a prior activity query since `ProjectBoqItemId` is now on the table.
- This keeps the two-round structure: Round 1 fetches items/groups/activities/locations in parallel; Round 2 fetches area links using the BOQ item IDs from Round 1.
- `toScopeSummary` only includes activities that have `areaRowsByActivityId.get(activityId)?.length > 0`. Activities in a linked group with no area links are excluded from the summary — they were never explicitly selected by the user.
- `ActivityCount` on the group summary reflects only activities with area links, not all activities in the group.

---

## 19. BOQ Table — Checkbox Cascade With Filters

**Rule: Parent-checkbox cascade must operate on `filteredRows` (the currently visible set), never on the full unfiltered item list.**

- `collectLeafKeysUnder(node, allItems)` takes `allItems` as its flat-list fallback. Always pass `filteredRows` — not `items` — so cascade only selects leaves that are visible in the current filter view.
- The "Not Linked" scope filter must include ancestor rows (same logic as "Linked" filter) so parent rows remain visible and cascade-checkable. Filtering to leaves-only breaks cascade entirely.
- Both `rowSelection.onChange` and `renderCell` must use `filteredRows` for `collectLeafKeysUnder`. If `onChange` uses the full tree and `renderCell` uses filtered rows, they will disagree and produce inconsistent selection state.
- Scope filters (`linked`/`unlinked`) return `buildTree(keyedList)` — a hierarchical result so `node.children` is populated and `collectLeafKeysUnder` uses the fast `children` path. Level filter and search return a flat list (no tree needed since hierarchy isn't shown).

---

## 20. BOQ Scope Linkage — Remove Linkage

**Rule: The "Remove Linkage" button is only shown when at least one selected leaf item has `scopeSummary.isLinked === true`.**

- Unlink confirmation uses a dedicated `<Modal>` (see Rule 24) with a chip list of affected BOQ item numbers and a warning Alert.
- The unlink API (`POST /api/pms/project/boq/unlink-scope`) deletes `WBSGroupBoqItemLns` rows for the given `boqItemIds` scoped to the current `versionId`. It does NOT touch `WBSActivityAreaLns` — location links are shared and not removed on unlink.
- After successful unlink, call `onScopeSaved?.()` to trigger a BOQ data refresh so the scope column updates immediately.
- FK violation (code `23503`) means DPR entries exist against the linked activities — return HTTP 409 with a clear message. Never silently swallow this error.

---

## 21. BOQ Scope Linkage — Re-link Behaviour (Merge vs Replace All)

**Rule: Opening the Link BOQ Scope modal for already-linked items must pre-populate existing selections. Saves merge by default; Replace All must be explicitly triggered.**

1. **Pre-populate on open**: When the linker modal opens and the selected BOQ items already have `scopeSummary.isLinked === true`, both the WBS Activity tree and the Site Location tree must be pre-checked with the existing linked activity IDs and location IDs (union across all selected items). Pre-population runs after both trees finish loading.

2. **Default mode — Merge**: Saving in the default mode only inserts new `WBSActivityAreaLns` pairs. Existing rows are preserved. The API receives `replaceAll: false` (default). The modal shows an amber warning banner:

   > _"Previously selected WBS activities and locations are pre-filled and will be preserved. To start fresh, click Replace All Selection."_

3. **Replace All mode**: The user must click the **Replace All Selection** button to enter this mode. The button turns the banner red and clears all current tree selections so the user must explicitly re-pick. In this mode the API receives `replaceAll: true`, which deletes all `WBSActivityAreaLns` rows for every activity in the affected WBS groups (not just the selected activities — sibling activities in the same group are also cleared), then inserts only the newly selected pairs. The Save button label changes to **Replace All & Save** and renders as a danger button.

4. **Cancel Replace**: Clicking the button again while in Replace All mode reverts to Merge mode and restores the original pre-populated selections.

5. **API contract**:
   - `replaceAll: false` → merge: fetch existing area links for `validActivityIds`, insert only new pairs, never delete.
   - `replaceAll: true` → fetch ALL activities in `validGroupIds`, delete their area links, then insert selected pairs.
   - `WBSGroupBoqItemLns` (BOQ↔group links) are always append-only (never deleted by a re-link save) in both modes.

6. **No silent overwrites**: Never silently replace existing scope. The amber/red banner is mandatory whenever `hasExistingScope === true`.

## 22. Smart Date & Time Pickers

**Always use `SmartDatePicker` and `SmartTimePicker`** from `@/components/ui/smart-date-picker` and `@/components/ui/smart-time-picker` instead of Ant Design's raw `DatePicker` or `TimePicker` anywhere in the project.

- `SmartDatePicker` accepts free-text input in any common date format (e.g. `1 Apr 25`, `01/04/2025`, `apr-25`, `01-04-25`) and parses it on blur/Enter.
- `SmartTimePicker` accepts free-text time input (e.g. `5:40`, `530`, `5:40pm`, `1730`) and parses it on blur/Enter. No OK confirmation required (`needsConfirm={false}`).
- Both are drop-in replacements — all standard Ant Design DatePicker/TimePicker props pass through.
- Do **not** use `<DatePicker>` or `<TimePicker>` from antd directly in forms or data-entry UIs. Use the smart variants.

---

## 23. DPR — WBS Hierarchy Progress Computation

**Rule: DPR-based progress must roll up through the full WBS hierarchy and be shown on both the DPR entry page and the DPR report.**

### Progress Computation Rules

1. **Per-location effective progress** (leaf unit of computation):
   - `Cumulative` activity: take the **most recent** `ProgressValue` entry for that activity+location pair.
   - `Sequential` activity: take the **sum** of all `ProgressValue` entries for that activity+location pair.

2. **Activity progress** = average of effective progress values across its scoped locations.
   - If the activity has `LinkedLocationIds` (from BOQ scope), only those locations are included in the average.
   - If no scope is set (project-wide), average across all locations that have entries.
   - `Volume`-type activities derive a **percentage** for WBS rollup via: `min(100, total_done ÷ tentative_total × 100)`, where `tentative_total` = sum of `TentativeLength` across all chainage lines in the activity's linked locations. If no tentative data is available, the Volume activity is excluded from rollup (returns `null`).

3. **Parent activity progress** = weighted average of children's rolled-up progress using each child's `WorkPercentage`.
   - If total child `WorkPercentage` sums to 0, fall back to simple average.
   - Cap all percentage progress values at 100%.

4. **WBS Group progress** = weighted average of root-level activity progress by `WorkPercentage`.

5. **Overall project progress** = simple average of all WBS group progresses.

### API Implementation Rules

6. **Use DB-level aggregation, never raw row transfer.** When computing DPR progress, call `fetchDprProgressAggregates()` (in `app/api/pms/dpr/computeDprProgress.js`). This uses PostgreSQL `DISTINCT ON` (Cumulative) and `GROUP BY SUM` (Sequential) to return one row per `(WBSActivityId, ProjectLocationId)` — never fetch all raw `DprEntries` rows for progress computation. This is mandatory at 10k+ entries.

7. **Progress data is always all-time** (not date-windowed). The UI date window filters entries shown in tables; progress rollup must always use all historical entries. These are two separate queries in every DPR endpoint.

8. **Every DPR mutation endpoint** (add, update, delete) must return `wbsProgress` and `groups` in its response so the UI updates immediately without a separate refetch.

9. **`wbsProgress` response shape**:

   ```json
   {
     "activityProgress": { "<activityId>": 45.5 },
     "activityRollup": { "<activityId>": 42.3 },
     "groupProgress": { "<groupId>": 38.1 },
     "overallProgress": 18.0
   }
   ```

   - `activityProgress` = leaf-level progress (before hierarchy rollup)
   - `activityRollup` = rolled-up progress including children (used for display)

### Progress Computation Formula (CRITICAL — do not change without reading this)

The **WorkPercentage** field on a `WBSActivity` represents that activity's contribution fraction out of 100 to its parent (not normalised against siblings). The formula at every level is:

```
parent_progress = Σ (child_progress × child_WorkPercentage) / 100
```

Example:

- HELLO ACTIVITY ONE leaf at 100% DPR progress, WorkPercentage = 30
- EXCVATION (parent of HELLO) rollup = 100 × 30 / 100 = **30%**
- HEAD WORK group (roots: EXCVATION wp=30, RCC wp=60, MASONRY wp=0, …)
  - = (30 × 30 + 0 × 60 + …) / 100 = **9%** when only EXCVATION has progress
  - = (100 × 30 + 100 × 60) / 100 = **90%** when both EXCVATION and RCC complete

**Fallback**: if all children have WorkPercentage = 0, use simple average instead.

Do NOT divide by `sum(child.WorkPercentage)` — that was the bug that caused 33.3% instead of 9%.

### UI Display Rules

10. **DPR entry page** must show a collapsible `WbsProgressPanel` above the location/activity split. It shows:
    - Overall project progress bar at a glance (collapsed view)
    - Per-group progress bars with root-activity breakdown (expanded view)
    - Progress updates live after every save/delete without page reload.
    - Each group card is **clickable** and opens a `WbsGroupDrilldownModal` showing the full recursive activity hierarchy with per-node contribution details.

11. **DPR report page** must show a collapsible `WbsProgressSection` between the summary cards and the data table. It displays the same hierarchy using `reportGroups`, `reportAllActivities`, and `reportWbsProgress` from the store.

12. **Colour thresholds for progress bars**:
    - ≥ 80% → emerald/teal gradient
    - ≥ 50% → teal/cyan gradient
    - ≥ 20% → amber/orange gradient
    - < 20% → red gradient

13. **WBS Group drilldown modal** (`WbsGroupDrilldownModal` in `components/dpr-manager.jsx`):
    - Opens when user clicks a group card in `WbsProgressPanel`.
    - Shows the full recursive hierarchy: group → root activities → children → grandchildren (unlimited depth via `ActivityDrillRow`).
    - Each node displays: name, WorkPercentage weight badge (`wt X%`), actual rollup progress, and **contribution to parent** (`→ X%` = `child_progress × child_wp / 100`).
    - **Volume activities** are included and shown with a `VOL` badge. Their progress is derived as `done ÷ tentative × 100%`. An expandable node-level breakdown shows each chainage range with done/tentative quantities and a mini progress bar. The list supports search and scroll for 200+ nodes.
    - Colour coding: teal cards for groups, green for parent activities, orange for leaf activities (no children).
    - Includes a formula legend at the bottom explaining Sequential vs Cumulative, Volume %, parent rollup, and group progress.
    - Leaf nodes show raw DPR `activityProgress` (pre-rollup) below the bar.

---

## 24. DPR — API Performance at Scale (10k+ Entries)

**Rule: DPR endpoints must stay fast at 100k+ entries. Never do row-level work in JS that can be done in the DB.**

1. **Paginate always**: The report endpoint uses `PAGE_SIZE = 50`. Never return unbounded result sets.

2. **No per-row subqueries**: Resolve activity names, location names, and DPR columns using `inArray` + Map lookups — never via per-row nested queries.

3. **Progress aggregation at DB level**: Use `DISTINCT ON` + `SUM GROUP BY` via `fetchDprProgressAggregates()`. Never pull raw `DprEntries` rows to JS to compute progress sums or max dates.

4. **Use `returning()` on insert/update**: Never re-fetch a record you just wrote — use `RETURNING` to get the new row back in the same statement.

5. **Parallel round-trips**: Always use `Promise.all([...])` for independent queries in the same handler. The DPR GET endpoint must not have sequential round-trips for locations, activities, DPR columns, area links, entries, and groups — these must all fire in parallel.

6. **Two-phase pattern**: Where one query feeds another (e.g. entry IDs → values lookup), use exactly two `await` rounds:
   - Round 1: all independent queries in parallel.
   - Round 2: queries that depend on Round 1 results (e.g. `inArray(entryIds, ...)` for DPR values).
     Never go beyond two rounds in a single endpoint.

7. **Index coverage**: Every `WHERE` clause in a DPR query must hit an indexed column. The schema already has indexes on `DprEntries.(ProjectId, EntryDate, ProjectLocationId, WBSActivityId)`. Do not add filters on un-indexed columns without also adding the index to the schema.

---

## 25. DPR — Entry Rules & Validation

**Rule: Progress values must respect the accumulation type. Submissions and reversions must maintain progress integrity.**

1. **Cumulative entries**: Each entry records the running total to date. A new entry's `ProgressValue` must be ≥ the latest submitted entry's value — progress cannot decrease. Show a contextual hint: _"Current progress: X% as of DD MMM YYYY · New entry must be ≥ X%."_ Block save with a clear toast if violated.

2. **Sequential entries**: Each entry records work done that day only. The sum of all submitted entries + the new entry must not exceed 100%. Show a running total hint: _"Running total: X% · Max you can add: Y%."_ Block save with a clear toast if exceeded.

3. **Multiple entries on the same date are allowed** — the DB unique constraint `(EntryDate, ProjectLocationId, WBSActivityId)` was intentionally dropped. Do not re-add it.

4. **`ActivityStatus` field (HOLD / WIP / COMPLETED)**: Every DPR entry must have a work status. It is stored in `DprEntries.ActivityStatus` (varchar 20, default `WIP`). Valid values: `HOLD`, `WIP`, `COMPLETED`. The `normalizeDprEntryPayload` function validates and defaults to `WIP`. Show this in all entry tables as a `ActivityStatusBadge` component (coloured pill). Display it in the entry detail modal.

5. **Editing a submitted entry**: Saving edits to a submitted entry automatically reverts it to draft (`IsSubmitted = false`). This is enforced server-side in the update route. The edit button tooltip must say _"Edit (will revert to draft)"_ and the success toast must say _"Entry updated and reverted to draft"_.

6. **Submitted entries can be deleted** — no guard at API or UI level.

---

## 26. DPR — Entry Detail Modal & Sheet Filtering

**Rule: Clicking any DPR entry row in the `ActivityLocationSheet` must open a detail modal. The sheet must support filtering by Work Status and dynamic column values.**

1. **Row click → detail modal**: The `ActivityLocationSheet` table uses `onRow` with an `onClick` handler. Clicks on buttons, checkboxes, or popovers are excluded via `e.target.closest("button, .ant-btn, .ant-checkbox, ...")`. The `DprEntryDetailModal` shows all entry fields: date, progress, work status, submission status, accumulation type, local issues, remarks, and all dynamic column values in a 2-column grid.

2. **Detail modal actions**: Edit (closes modal, opens entry drawer), Mark Submitted / Revert to Draft toggle, Delete (with Popconfirm).

3. **Dynamic columns in table**: The `ActivityLocationSheet` table always includes dynamic columns (`dynamicCols`) built from the union of `DprColumns` across all `locationEntries`. They appear between the core columns and the Work Status/Status fixed columns.

4. **Sheet filters**: The filter toolbar must include:
   - Status toggle group: All / Submitted / Drafts
   - Date range picker (single `DatePicker.RangePicker`)
   - Work Status filter: All / WIP / HOLD / COMPLETED (dropdown or toggle)
   - Per dynamic-column filters: dropdown per column, built from distinct values present in `locationEntries`

5. **`SmartDatePicker` vs `DatePicker.RangePicker`**: For single date fields use `SmartDatePicker`. For date range filters in the DPR sheet, use Ant Design's `DatePicker.RangePicker` directly (the smart wrapper does not support range mode).

---

## 27. DPR — Scope Linkage Is the Single Source of Truth

**Rule: `WBSActivityAreaLns` is the authoritative gate for which activities appear in DPR and which entries can be created. Scope removal is final — it removes the activity from DPR immediately.**

### Display rules

1. The DPR GET endpoint must show **only** activities that have at least one `WBSActivityAreaLns` row (i.e. are in `scopedActivityIds`). Never extend this set with "activities that have existing entries" — the scope link is the gate, not entry history.

2. DPR locations shown are similarly restricted to those in `scopedLocationIds` when scope exists. No exceptions for "locations with entries".

3. **`WBSActivityAreaLns` is the sole gate — no permissive fallback.** If no rows exist for the project's activities (scope removed or never configured), `enrichedActivities = []` and `dprLocations = []`. The UI will show an empty state. There is no "show all when no scope" fallback.

### Entry creation rules

4. The DPR ADD endpoint must verify that `WBSActivityAreaLns` contains a row for `(WBSActivityId, ProjectLocationId)` before inserting. If the project has any area links and this pair is missing, return HTTP 400: _"Cannot add DPR entry — this activity is not linked to this location in the current project scope."_

5. This check is done in two steps (sequential): first confirm the project has scope at all (`anyProjectAreaLink`), then confirm the specific pair is linked (`pairLink`). This avoids a false block when no scope has been configured.

### Unlink rules

6. The BOQ scope unlink endpoint (`POST /api/pms/project/boq/unlink-scope`) must **block** the unlink if any `DprEntries` rows exist for activities in the area links being deleted. Return HTTP 409: _"Cannot remove scope linkage — DPR entries already exist for activities in these WBS groups. Delete all DPR entries for those activities first."_

7. When an unlink succeeds (no entries), it must **also delete** all `WBSActivityAreaLns` rows scoped to the given `boqItemIds` + `versionId` — directly via `WHERE ProjectBoqItemId IN (...) AND VersionId = ?`. No group traversal needed. This must be inside the same transaction as the `WBSGroupBoqItemLns` deletion.

8. These two operations (BOQ-group link deletion + area link deletion) must be in a single DB transaction so they either both succeed or both fail.

---

## 28. BOQ Scope Linkage — Slot-wise Per-Location Activity Assignment

**Rule: Each DPR site location has its own independent set of WBS activities. A BOQ scope save stores explicit (activity, location) pairs — not a cross-product of all activities × all locations.**

### Motivation

The previous model applied the same M activities to all N selected locations (M×N rows). The slot-wise model lets you configure "at Location A, do Activities 1+2; at Location B, do Activities 3+4" independently.

### UI rules (`BoqScopeLinkerModal`)

1. **Left panel — Location tree (checkable + selectable)**: Checking a DPR location creates a slot for it. Checking a non-DPR parent cascades to add all DPR descendants as slots. Clicking a location label (without toggling its checkbox) switches the active slot in the right panel without adding/removing it. Non-DPR parent nodes show for hierarchy context but are not added to slots when checked (only their DPR descendants are). `checkStrictly={true}` with custom cascade via `collectDprDescendantKeys`. Each DPR node shows a green activity-count badge when its slot has configured activities, or a grey dot when empty.

2. **Right panel — WBS Activity tree (check mode)**: Always scoped to the active slot's location. Checking/unchecking activities only updates that location's slot. A toast warning fires if the user checks an activity without an active location selected.

3. **Slot state**: `slots: Map<locationId, activityTreeKeys[]>`. A slot entry is created as soon as a location is clicked (even if no activities selected yet). Only slots that are DPR locations AND have ≥1 valid activity ID reach the API (`configuredSlots`).

4. **Pre-population on reopen**: Derived by inverting `scopeSummary.activities[].linkedLocations` — for each unique location in the scope, collect which activities have that location in their `linkedLocations`. This produces the correct per-slot view from the stored `WBSActivityAreaLns` data.

5. **Replace All**: Clears all slots (`setSlots(new Map())`). On revert, restores from `existingSlots`. `previousActivityIds` passed to API = union of all activity IDs across all `existingSlots`.

6. **Slot summary panel**: Shows each configured slot as `[Location] → [Activity tags]`. Empty slots (location with no activities) are excluded.

### API rules (`POST /api/pms/project/boq/link-scope`)

7. **Body format**: `{ projectId, versionId, currentUserId, boqItemIds, slots: [{locationId, activityIds}], replaceAll, previousActivityIds }`. The old `activityIds` + `locationIds` flat arrays are removed.

8. **Area link creation**: For each BOQ item, for each slot, for each activityId in the slot — insert one `WBSActivityAreaLns(activityId, locationId, boqItemId, versionId)` row. No cross-product. `ProjectBoqItemId` and `VersionId` are mandatory — they scope the link to the exact BOQ item that created it.

9. **BOQ group link creation** (`WBSGroupBoqItemLns`): Unchanged — still derived from the union of all activities' WBS groups across all slots. The group is the BOQ linkage unit; slot granularity lives in area links only.

10. **Validation**: All locationIds in slots must be valid DPR locations in the project. All activityIds in slots must be valid WBS activities in the project. Invalid IDs are silently skipped (not an error) to handle stale UI state.

### DPR rules (no code change needed)

11. **DPR GET**: Already correct — `enrichedActivities[].LinkedLocationIds` lists exactly the locations linked to each activity via `WBSActivityAreaLns`. With slot-wise data, different activities have different `LinkedLocationIds`, producing the correct per-site filter automatically.

12. **DPR entry drawer — activity filter**: When a location is selected, the activity dropdown already filters to `a.LinkedLocationIds.includes(effectiveLocation.ProjectLocationId)`. This correctly shows only the activities configured for that site.

13. **DPR entry drawer — progress type**: The activity form already adapts to `selectedActivity.DprType` — Volume activities show the volume/measurement input; Percentage activities show the percentage slider. No code change needed.

14. **DPR ADD scope guard**: Still enforced — `WBSActivityAreaLns` must contain `(activityId, locationId)` before a DPR entry is accepted. The guard is unchanged and works correctly with slot-wise data.

---

## 30. Proniq SQL Server Sync — Column Mapping Rules

**Rule: Every write to a PostgreSQL table listed below must be mirrored to its SQL Server counterpart in `GCKCInventory`. All sync functions live in `lib/proniqDb.js` and are gated by `PRONIQ_MSSQL_ENABLED=true`. Errors are caught and logged — never thrown to the caller.**

### Trigger points

| Operation | Function |
|---|---|
| `POST /api/pms/tenders/add` | `saveProniqTender(tender)` |
| `POST /api/pms/tenders/update` | `saveProniqTender(updatedTender)` |
| `POST /api/pms/project/add` | `saveProniqProject(...)` |
| `POST /api/pms/project/update` | `saveProniqProject(...)` |
| Auto-project from awarded tender (`createProjectFromAwardedTender` in `_utils.js`) | `saveProniqProject(...)` |
| `POST /api/pms/project-location/add` + `/update` | `saveProniqProjectArea(...)` |
| `POST /api/pms/project/boq/upload` | `saveProniqTenderBoqItems(...)` + `saveProniqTenderSubItems(...)` |
| `POST /api/pms/project/boq/import-from-tender` | `saveProniqTenderBoqItems(...)` + `saveProniqTenderSubItems(...)` |

BOQ sync only fires when `project.TenderId` is non-null — `ProniqTenderId` is NOT NULL in both BOQ tables.

---

### TenderDetails (PostgreSQL) → ProniqTenders (SQL Server)

Strategy: **UPSERT** (IF EXISTS UPDATE ELSE INSERT). Only `No`, `Dt`, `NameOfWork`, `IncludingGST`, `LastUpdatedOn`, `LastUpdatedByUserId` are refreshed on update.

| PostgreSQL column | SQL Server column | SQL type | Notes |
|---|---|---|---|
| `TenderDetailId` | `ProniqTenderId` | uniqueidentifier PK | |
| `No` | `No` | varchar(100) | |
| `Date` | `Dt` | datetime | |
| `ProjectTenderName` | `NameOfWork` | varchar(max) | |
| `Gst` | `IncludingGST` | bit | `1` if Gst non-null and > 0, else `0` |
| `InsertedOn` | `InsertedOn` | datetime NOT NULL | INSERT only |
| `InsertedByUserId` | `InsertedByUserId` | uniqueidentifier | INSERT only |
| `LastUpdatedOn` | `LastUpdatedOn` | datetime NOT NULL | always refreshed to `now()` |
| `LastUpdatedByUserId` | `LastUpdatedByUserId` | uniqueidentifier | always refreshed |

---

### ProjectBoqItems (PostgreSQL) → ProniqTenderLns (SQL Server)

Strategy: **full replacement** — DELETE all rows for `ProniqTenderId`, then bulk INSERT via `sql.Table`. Runs for the active BOQ version after every upload or import.

| PostgreSQL column | SQL Server column | Notes |
|---|---|---|
| `ItemId` | `ProniqTenderLnId` | PK; reused across BOQ versions when BOQItemNo matches |
| project's `TenderId` | `ProniqTenderId` | FK → ProniqTenders |
| `ParentItemId` | `ParentTenderLnId` | **added column** — n-level hierarchy; NULL for root nodes |
| `LnNo` | `LnNo` | |
| `BOQItemNo` | `BOQItmNo` | truncated to 100 chars |
| `Description` | `TenderItemName` | nvarchar(max) |
| `QtyPrimary` | `Qty` | primary quantity |
| `QtyPrimary` | `QtyPriUM` | same value — stored twice per SQL Server schema |
| `QtyAlternate` | `QtyAltUM` | |
| `Rate` | `Rate` | |
| `BreakupOfPaymentPct` | `BreakUpPayment` | |
| `AmountBeforeTax` | `RateAmount` | |
| `PrimaryUnitId` | `PriUMId` | uniqueidentifier; NULL if value is not a valid UUID |
| `AlternateUnitId` | `AltUMId` | uniqueidentifier; NULL if value is not a valid UUID |
| `ConversionFactor` | `UMConvVal` | |
| `InsertedOn` | `InsertedOn` | |
| `InsertedByUserId` | `InsertedByUserId` | |
| `LastUpdatedOn` | `LastUpdatedOn` | always `now()` |
| `LastUpdatedByUserId` | `LastUpdatedByUserId` | always `currentUserId` |
| _(no mapping)_ | `RevisedQty`, `AccessQty`, `AccessPer`, `RevisedDate` | left NULL |

---

### ProjectBoqSubItems (PostgreSQL) → ProniqTenderSubItmsLns (SQL Server)

Strategy: **full replacement** — DELETE all rows for `ProniqTenderId`, then bulk INSERT. `ProniqTenderSubItmsLnId` is regenerated each sync; `ProniqTenderSubLns` is not used.

| PostgreSQL column | SQL Server column | Notes |
|---|---|---|
| _(generated)_ | `ProniqTenderSubItmsLnId` | `crypto.randomUUID()` each sync |
| `ItemId` | `ProniqTenderLnId` | FK → ProniqTenderLns parent item |
| project's `TenderId` | `ProniqTenderId` | FK → ProniqTenders |
| `LnNo` | `LnNo` | |
| `MaterialId` | `ItmId` | cross-DB ItmId from `GCKCInventory.Itms`; NULL if not a valid UUID |
| `Qty` | `Qty` | |
| `UnitId` | `PriUMId` | cross-DB UMId; NULL if not a valid UUID |
| `InsertedOn` | `InsertedOn` | |
| `InsertedByUserId` | `InsertedByUserId` | |
| `LastUpdatedOn` | `LastUpdatedOn` | always `now()` |
| `LastUpdatedByUserId` | `LastUpdatedByUserId` | always `currentUserId` |
| _(no mapping)_ | `TypeOfCodeId` | left NULL |

---

### Projects (PostgreSQL) → ProniqProjects (SQL Server) — existing

| `ProjectId` | `ProniqProjectId` | PK |
| `TenderId` | `ProniqTenderId` | FK → ProniqTenders; nullable |
| `ProjectName` | `ProjectName` | |

---

### ProjectLocations (PostgreSQL) → ProniqProjectAreas (SQL Server) — existing

| `ProjectLocationId` | `ProniqProjectAreaId` | PK |
| `ProjectId` | `ProniqProjectId` | FK → ProniqProjects |
| `LocationName` | `AreaName` | |

---

## Last Selected Project (Persistent)

- The last project selected by the user is stored in `useProjectStore` as `lastProjectId` and persisted to `localStorage` under the key `pms_last_project_id`.
- **Every PMS page** with a project selector (DPR, WBS, Project Areas, DPR Report) **must** restore from `lastProjectId` on mount — only fall back to `projects[0]` if no valid saved value exists.
- **On every project select change**, call `setLastProjectId(id)` from `useProjectStore` alongside the local state setter.
- Never use a raw `useState(null)` + `projects[0]` fallback alone — always check `lastProjectId` first.
- The `setLastProjectId` action writes to both Zustand state and `localStorage` atomically — do not write `localStorage` manually in pages.
| `LocationTypeText` | `AreaType` | |

---

## 29. Sub Contractor Billing — Module Rules

**Rule: Sub Contractor Bills are raised against Work Orders (WOs) from the SQL Server cross-DB. DPR progress is the source of truth for milestone eligibility. Bills are immutable once Approved.**

### WO-Project Linkage

1. Work Orders are fetched from the SQL Server `GCKCInventory` database by matching `WOs.TenderId` to `Projects.TenderId`. This is the sole auto-link mechanism — no manual project assignment table.
2. When a project has no `TenderId`, the WO section shows an empty state with a prompt to link a tender.
3. `WOs` and `WOLns` data is **never copied** to PostgreSQL — always queried live via cross-DB on page load. Cross-DB references are stored as `varchar(36)` columns (`WOId`, `WOLnId`, `SubContId`).

### DPR-WO Matching

4. DPR entries are matched to a WO by comparing `DprEntries.SubcontractorId` (case-insensitive) to `WOs.SubContId` (cast to text). When `SubContId` is null on the WO, no DPR filter is applied and all project DPR entries are shown.
5. DPR progress shown in the billing UI is always read from `fetchDprProgressAggregates()` — never raw row counts.

### Payment Terms

6. Payment terms are stored in `SubContractorWOPaymentTerms`, keyed by `(ProjectId, WOId)`. TermNo must be unique within a WO. Terms are ordered by TermNo.
7. `MilestoneType` is `PERCENTAGE` (0–100, % of work done) or `QUANTITY` (absolute units, e.g., meters). `MilestoneValue` stores the threshold.
8. `PaymentBasisType` is `PCT_OF_WO_VALUE` (PaymentPct % of WO's GrandTotalAmt) or `QTY_X_RATE` (CurrentBilledQty × rate from WOLns).
9. Term status lifecycle: `PENDING → ELIGIBLE → BILLED → PAID`. ELIGIBLE is set automatically when DPR progress meets the milestone. BILLED is set when a bill is raised with `LinkedPaymentTermId`. PAID is manual.

### Bill Status Lifecycle

10. Lifecycle: `DRAFT → SUBMITTED → APPROVED → PAID`. Only DRAFT bills can be edited or deleted. Deleting a DRAFT bill must also delete its `SubContractorBillLns` and `SubContractorBillAdjustments` children in the same transaction (the only place cascade-like behavior is allowed, done at app layer — FK is still `restrict` in DB).
11. Approving a bill sets its linked payment term to `BILLED`. Reverting to DRAFT resets the term to `ELIGIBLE`.

### Amount Display — CR / LAKH Toggle

12. **All monetary amounts in the billing UI must support a CR/LAKH toggle.** A single `showFormatted` boolean state (per page, not per field) controls display mode:
    - `showFormatted = true`: show `₹ X.XX Cr` (≥ 1 Cr) or `₹ X.XX L` (≥ 1 L) — tooltip shows the full actual number.
    - `showFormatted = false`: show full number with Indian commas (`₹ X,XX,XX,XXX`) — tooltip shows `₹ X.XX Cr / L`.
    - A single toggle button in the page header switches the mode for the entire page.
    - Thresholds: ≥ 1,00,00,000 → Cr; ≥ 1,00,000 → L; below → no abbreviation.

### GST Calculation

13. `GSTType` is `IGST` or `CGST_SGST`. When `IGST`: only `IGSTPct` and `IGSTAmount` are set; `CGSTPct/SGSTPct/CGSTAmount/SGSTAmount` are null. When `CGST_SGST`: CGST and SGST are stored separately; `IGSTPct/IGSTAmount` are null.
14. GST is computed on `SubTotal` = WorkAmount + MaterialAmount (if contractor supply) + AdditionalChargesAmount − |LiquidatedDamagesAmount|.
15. `GrandTotal` = SubTotal + TaxAmount.

### Adjustments

16. `AdjType = ADDITIONAL_CHARGE`: Amount is positive (increases bill). `AdjType = LIQUIDATED_DAMAGE`: Amount is stored as a **negative** number (decreases bill). The UI must display LD as a deduction (red, prefixed with `−`).

### Cross-DB Queries

17. All WO/WOLn cross-DB queries go through `lib/crossDb.js` helper functions (`getWorkOrdersByTenderId`, `getWorkOrderLineItems`). Never write inline SQL Server queries in API routes.
18. Cross-DB errors must be caught and returned as empty arrays (never crash the page). Show a warning banner when WO data fails to load.

---

## 31. RA Bill — Module Rules

**Rule: RA Bills are raised by the contractor TO the project owner/client against the project BOQ. DPR progress is reference-only (not enforced). Bills are immutable once Approved.**

### Tables

| Table | Purpose |
|---|---|
| `RABills` | Bill header — one per RA bill raised for a project |
| `RABillLns` | Line items — one per BOQ leaf item included in the bill |
| `RABillAdjustments` | Charges and deductions (signed ± amounts) |

### Bill Number

1. `BillNo` is generated atomically from the `Sequences` table with `DocumentType = "RABill"`. Format: `RA/0001`, `RA/0002`, … (configured via `Prefix`, `Separator`, `PaddingLength`). Always use the atomic `UPDATE … RETURNING` pattern — never `MAX()+1`.

### Bill Header Fields (formal government document)

2. Required bill-header fields for the government RA bill document:
   - `BillDate`, `SubmissionDate` (optional) — timestamps with timezone
   - `BillPeriodFrom`, `BillPeriodTo` — date range covered
   - `ContractReference` — Agreement No. / WO No. / tender reference
   - `LedgerInfo` — ledger or account reference
   - `StipulatedDateOfCommencement`, `StipulatedDateOfCompletion` — contract dates
   - `DateOfActualCompletion`, `DateOfMeasurement` — actual execution dates
   - `Remarks` — free-text remarks
   - `PreparedByUserId`, `CheckedByUserId` — FK → `Users.UserId` (set null on delete)

### BOQ Line Items

3. Line items reference the **active BOQ version** (`ProjectBoqVersions.Status = "Active"`). Only **leaf items** (`IsLeaf = true`) generate bill lines. Parent/group rows are shown as visual section separators only.
4. For each leaf item, `PreviousBilledQty` is computed as the sum of `CurrentBilledQty` from all prior `SUBMITTED/APPROVED/PAID` `RABillLns` for the same `ProjectBoqItemId`. It is **recomputed on every save** — never taken from the client.
5. `DprProgressPct` is a snapshot of the DPR progress percentage at bill creation time (via `fetchDprProgressAggregates()` + `computeDprProgress()`). It is **read-only reference** — not used to block or compute `CurrentBilledQty`.
6. `CurrentBilledQty` is entered by the user. `Amount = CurrentBilledQty × Rate`.

### Adjustments

7. `AdjType = ADDITIONAL_CHARGE` or `LIQUIDATED_DAMAGE`. Both allow **signed amounts** (positive or negative) — unlike sub-contractor billing, LD can be either direction. The UI shows the signed value; backend stores it as-is.
8. `SubTotal = WorkAmount + AdditionalChargesAmount + LiquidatedDamagesAmount` (all signed).

### GST Calculation (same as Sub Contractor Billing — Rule 29.13–15)

9. `GSTType` is `IGST` or `CGST_SGST`. Computed on `SubTotal`. `GrandTotal = SubTotal + TaxAmount`.

### Bill Status Lifecycle

10. Lifecycle: `DRAFT → SUBMITTED → APPROVED → PAID`. Only `DRAFT` bills can be edited or deleted.
11. Allowed transitions: `DRAFT → SUBMITTED`, `SUBMITTED → APPROVED`, `APPROVED → PAID`, `SUBMITTED → DRAFT` (revert to draft). Enforced by `change-status` API via `VALID_TRANSITIONS` map.
12. Deleting a DRAFT bill must delete `RABillAdjustments` and `RABillLns` first (app-layer, FK is `restrict` in DB), then `RABills`. Never use DB-level cascade.

### API Routes

| Endpoint | Purpose |
|---|---|
| `POST /api/pms/ra-bill/add` | Create bill (auto-generates BillNo from Sequences) |
| `POST /api/pms/ra-bill/update` | Update DRAFT bill (re-computes PreviousBilledQty) |
| `POST /api/pms/ra-bill/delete` | Delete DRAFT bill (app-layer child deletion) |
| `POST /api/pms/ra-bill/get` | Fetch all bills for a project with lines + adjustments |
| `POST /api/pms/ra-bill/change-status` | Transition bill status |
| `POST /api/pms/ra-bill/boq-preview` | Fetch active BOQ items enriched with PreviousBilledQty + DprProgressPct for bill form |

### Amount Display (same as Rule 29.12)

13. All monetary amounts use the page-level `showFormatted` CR/LAKH toggle. Reuse `formatAmount` / `formatAmountTooltip` from `components/sub-contractor-billing/bill-summary-panel.jsx`.

---

## 32. DPR — ActivityStatus ↔ ProgressValue Consistency Rules

**Rule: `ActivityStatus` must always be consistent with the effective cumulative progress. Applies to Percentage-type activities only (Volume entries are exempt).**

### Enforcement (both UI and save-handler)

1. **At 100% → must be COMPLETED**: When the effective total progress reaches 100%, `ActivityStatus` is automatically set to `COMPLETED` and the Select is disabled. Saving with any other status at 100% is blocked with: _"Progress is at 100% — status must be set to COMPLETED."_

2. **Below 100% → cannot be COMPLETED**: The `COMPLETED` option is disabled in the Select when effective progress < 100%. Saving `COMPLETED` below 100% is blocked with: _"Cannot mark as COMPLETED — progress is only X%. Reach 100% first."_

3. **Volume activities are exempt**: No status-progress coupling for Volume entries. The user sets status freely.

### Effective progress calculation per accumulation type

- **Cumulative**: `effectiveTotal = ProgressValue` (the new entry IS the running total).
- **Sequential**: `effectiveTotal = sequentialRunningTotal + ProgressValue` (add today's work to the sum of all prior submitted entries).

### DprType and DprProgressType lock (after entries exist)

4. **`DprType` and `DprProgressType` on a WBS Activity cannot be changed once any DPR entries exist for that activity.** The API endpoints `/api/pms/wbs/activity/update` and `/api/pms/wbs/activity/bulk-edit` both check entry count and reject with HTTP 400 if entries exist and either field is changing. The UI (`wbs-manager.jsx`) disables both Radio.Groups and shows a lock banner when `activity.hasEntries === true`. The `hasEntries` flag is computed by `fetchWbsGraph` via a single COUNT aggregate and attached to every activity in the response.

---

## 33. DPR — Activity Status Sheet

**Rule: The Activity Status Sheet in the DPR Report page shows all project DPR locations as rows and BOQ-scoped activities as columns, with each cell showing the effective ActivityStatus + progress percentage as of the selected date.**

1. **All DPR locations are shown** (`IsDprLocation = true`) regardless of whether they have BOQ scope linkage or any DPR entries. Cells without entries show a dash.

2. **Activity columns** are the BOQ-dual-gate scoped activities only (must have both `WBSGroupBoqItemLns` + `WBSActivityAreaLns`). Columns are grouped under their WBS group header.

3. **Effective status per cell** respects accumulation type:
   - `Cumulative`: latest entry's `ActivityStatus` as of `AsOfDate` (prefer submitted over draft on same date).
   - `Sequential`: highest priority status across all entries as of `AsOfDate` (`COMPLETED > WIP > HOLD`).

4. **Progress percentage per cell** also respects accumulation type:
   - `Cumulative`: latest entry's `ProgressValue` (capped at 100).
   - `Sequential`: sum of all `ProgressValue` entries (capped at 100).

5. **Summary rows** (TOTAL COMPLETED / WIP / HOLD / TOTAL) show count + percentage of linked locations only. The percentage denominator is `linkedTotal` = count of locations with a `WBSActivityAreaLns` row for that activity.

6. **Date picker** re-fetches data for the selected "as of" date. Changing the date triggers a new API call.

7. **API**: `POST /api/pms/dpr/activity-status-sheet` — accepts `{ ProjectId, AsOfDate }`. Single two-round query: Round 1 fetches structural data in parallel; Round 2 fetches entries filtered to `AsOfDate`.

---

## 34. Pipe Status Summary Report

**Rule: The Pipe Status Summary is a cumulative all-time progress report for pipe laying, grouped by SubWork → Details (pipe diameter), with a total row per SubWork.**

### Data sources

1. **SubWork** = the parent `ProjectLocation.LocationName` of each pipe DPR location. Pipe DPR locations are identified by walking up the location hierarchy to find a `LocationTypeText` in `["Rising Main", "Leading Main", "Leading Main - MBR"]`.

2. **Details** = per distinct `PipeDiameter` from `ProjectLocationChainageLns` within a SubWork. Each unique diameter gets one details row. Unknown diameter → shown as "—".

3. **Tender Qty (km)** = sum of `ProjectBoqItems.QtyPrimary` for all BOQ items linked to the location via `WBSActivityAreaLns`, distributed proportionally across chainage lines by `TentativeLength`. Displayed in km (divide metres by 1000).

4. **Supply Till Date (km)** = sourced from **EPR (Equipment/Material Progress Report)**, NOT from DPR entries. This field is currently shown as 0 / placeholder until the EPR module is built. Do NOT attempt to derive it from `DprEntries`. When EPR is implemented, wire it here.

5. **Laying Till Date (km)** = sum of all approved `DprEntries` with `DprType="Volume"` and `MeasurementType="Length"` up to `AsOfDate`.

6. **Balance to Lay (km)** = `Tender Qty − Laying Till Date`. Can be negative (over-run).

7. **% Laying Done** = `min(100, Laying Till Date / Tender Qty × 100)`. Same formula as WBS Volume progress in `computeDprProgress.js`. Use colour thresholds: ≥80% teal, ≥50% cyan, ≥20% amber, <20% red.

### Display rules

8. Table rows per SubWork: one **SubWork header row** (teal bg, full width), N **detail rows** (one per diameter), one **TOTAL row** (light teal bg, bold, sums all detail rows in that SubWork).

9. **As of Date** picker (using `SmartDatePicker`) controls the cumulative cutoff. Defaults to today. Changing the date re-fetches from the API.

10. **"Revised Design Qty" column is intentionally omitted** — the field `RevisedDesignQty` exists in the DB but is not yet populated. Skip this column until explicitly requested.

### API

11. `POST /api/pms/dpr/pipe-status-summary` — accepts `{ ProjectId, AsOfDate }`. Two-round query (same pattern as WPR report). Returns `{ subWorks, asOfDate }`.

### Store

12. State keys: `pssSubWorks`, `pssAsOfDate`, `isPssLoading`. Action: `fetchPipeStatusSummary({ ProjectId, AsOfDate })`.

### Tab

13. Registered as tab key `"pipe-summary"` in `DprReportPage`, rendered by `<PipeStatusSummaryTab selectedProjectId={...} />`. Tab label: "Pipe Status Summary". Icon: `BarChart2`.

---

## 35. Denormalised `*Text` Snapshots — Rename Must Cascade

**Rule: Any `*Text` column that mirrors a label from a master table is a denormalised snapshot. The rename endpoint of that master MUST cascade the new label into every dependent snapshot column. Never let stored snapshots drift from their source master.**

### Why this rule exists

Transactional rows store both an FK (`*Id`) and a label snapshot (`*Text`) for fast list reads without a JOIN. Without a cascade, renaming a master leaves stale labels on every row that ever referenced it — the UI shows "Zone" forever even after the parameter is renamed to "Zone 123". This is a recurring bug class, not a one-off.

### The cascade pattern

1. **Central registry**: All `parameterType → [{ table, idCol, textCol }]` mappings live in `lib/services/masterRenameCascade.js`. Adding a new snapshot column means adding **one entry there** — never sprinkling UPDATE statements across endpoints.

2. **Trigger point**: Every master update endpoint that can rename the displayed label must call the matching cascade helper **inside the same handler**, after the master row update, before the audit log. The cascade runs all dependent UPDATEs in parallel.

3. **Fires only on actual rename**: Cascade only when the label field (`Property`, `Name`, etc.) is in the changed set — never on every update.

4. **Errors propagate**: Cascade failures throw to the caller so the master rename can be rolled back. Never swallow.

### Current cascade map (keep this list in sync with `masterRenameCascade.js`)

| Master (`Parameters.ParameterType`) | Cascade target |
|---|---|
| `PROJECT_LOCATION_TYPE` | `ProjectLocations.LocationTypeText` (via `LocationTypeId`) |
| `CHAINAGE_LENGTH_UNIT` | `ProjectLocationChainageLns.LengthUnitText` (via `LengthUnitId`) |
| `PROJECT_TYPE` | `Projects.ProjectTypeText` (via `ProjectTypeId`) |
| `PRIORITY` | `Projects.PriorityText` (via `PriorityId`) |
| `STATUS` | `Projects.StatusText` (via `StatusId`) |
| `BOQ_TYPE` | `Projects.BoqTypeText` (via `BoqTypeId`) |
| `CATEGORY` / `Category` | `TenderDetails.TenderCategoryText` (via `TenderCategoryId`) |
| `TENDER_STATUS` | `TenderDetails.TenderStatusText` (via `TenderStatusId`) |

### What is NOT a cascade target

- **Free-text fields** like `TenderStateText`, `SiteContactName`, `Address` — these are user-typed strings with no FK, so there is no master to cascade from.
- **Snapshot columns with no `*Id` sibling** — if the row only stores the text and no FK, there is no way to find dependent rows. These are intentional frozen captures (e.g., subcontractor name on a DPR entry) and must be left alone.
- **Tender filing labels that should be legally frozen** — if business rules require a label to remain as it was at submission time (immutable government document), do NOT add it to the cascade map. Leave it as a true snapshot. When in doubt, ask before adding.

### When adding a new snapshot column

1. Confirm the column is genuinely a denormalised label and not a frozen historical capture.
2. Add the FK column (`*Id`) alongside it — a snapshot without an FK cannot be cascaded.
3. Add an index on the FK so the cascade UPDATE stays fast.
4. Add the mapping entry to `lib/services/masterRenameCascade.js`.
5. Update this rule's table.

### UI fallback for legacy stale rows

UI components MAY additionally resolve `*Text` live from the master at render time (build a `Map<Id, label>` from the master store, prefer it, fall back to the stored snapshot). This is a defensive layer for rows written before the cascade existed. It is **not a substitute** for the cascade — new snapshots must always be kept in sync at write time.

---

## 36. Sidebar Icons — New Application / Route Must Register an Icon

**Rule: Whenever a new application or menu route is added to the `applications[]` array in `lib/store/useUserStore.js`, you must also register a relevant icon for it in the sidebar's icon resolver. Never leave a new menu item on the generic `FileText` fallback.**

### How sidebar icons resolve

Sidebar menu items render `item.icon || getDefaultIcon(item.title)` (see `RenderMenuItem` in `components/sidebar.jsx`). `getDefaultIcon(title)` matches a **case-insensitive substring of the menu item's `title`** against an ordered list of branches and returns a `lucide-react` icon. If no branch matches, it falls back to the generic `FileText` icon — which looks unfinished and indistinguishable from other modules.

### Required steps when adding a new application/route

1. **Import** a suitable icon from `lucide-react` at the top of `components/sidebar.jsx` (add it to the existing icon import block — do not create a second import statement). Skip if the icon is already imported.
2. **Add a branch** to `getDefaultIcon(title)` keyed off a distinctive lowercase substring of the menu item's `title`, e.g.:
   ```js
   if (titleLower.includes("work order")) return ClipboardList
   if (titleLower.includes("procurement")) return ShoppingCart
   ```
   Add a branch for the **parent group** title as well as each **leaf** route that needs its own icon.
3. **Pick an icon that represents the module** — follow the existing mappings as a style guide (e.g. `Gauge` for dashboard, `FileSignature` for tender, `HardHat` for project, `ScrollText` for RA bill).

### Conventions

- Keep menu `title` values distinctive enough to map cleanly — avoid substrings that collide with an existing branch (branches are evaluated top-to-bottom; first match wins).
- The centralised `getDefaultIcon` mapping is the **preferred** convention so all icon logic lives in one place. You *may* instead set an explicit `icon` property on the menu-item object in `useUserStore.js` (the renderer prefers `item.icon`), but only do this for a one-off; default to extending `getDefaultIcon`.
- This step is part of registering the application — see `Flows/New-Application-Flow.md` (Part A). A new app/route is not "done" until its icon is registered.

---

## 37. Tables — Working Page-Size, Filtering & Tag Colours

**Rule: Every Ant Design `<Table>` must have a page-size changer that actually works, sensible filtering, and meaningful tag colours. Verify the page-size change every time — it is a recurring bug.**

### Page size MUST be uncontrolled (the recurring bug)

- **Never pass a fixed `pageSize` in the `pagination` object** (e.g. `pagination={{ pageSize: 10, showSizeChanger: true }}`). A bare `pageSize` prop is **controlled** — when the user picks "20 / page" antd fires the change but immediately reverts to the hard-coded value, so the size changer looks broken.
- **Use `defaultPageSize` instead** (uncontrolled), or fully control it with `pageSize` **plus** an `onShowSizeChange`/`onChange` handler that updates state. Default to `defaultPageSize`.
  ```js
  // ✅ works
  pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: ["10","20","50","100"], showTotal: (t) => `${t} items` }}
  // ❌ size changer reverts — looks broken
  pagination={{ pageSize: 10, showSizeChanger: true }}
  ```
- **Verification is mandatory:** after building or editing ANY table, confirm by actually changing the page size (10 → 20 → 50) that the row count updates and stays. Do not assume — check it each time. Re-check whenever you touch a table's pagination.

### Filtering

- Every list/table must offer **proper filtering where it makes sense** — at minimum a text search, plus toolbar `Select` filters for the obvious dimensions (status/active, type/category, parent group, etc.). Mirror the Project Area toolbar pattern (search + "All X" selects). Filters compute the `dataSource` via a `useMemo` — never refetch per keystroke.
- Default each filter to its "All" option; combine filters with AND.

### Filter options must be DYNAMIC and show COUNTS

- **Derive filter `Select` options from the actual data, not from a static enum list.** Only list values that are actually present in the current dataset — never show a category that has zero rows (e.g. don't list "Service" in the Type filter if no product is a Service).
- **Show a count on every option**, including the leading "All": `All Types (16)`, `Trading (5)`, `Active (14)`, `Inactive (2)`. Counts are computed over the dataset (recomputed via `useMemo` as data changes).
- Centralise this: the product master uses `facetOptions(items, getValue, { allLabel, labelFor })` and `statusOptions(items)` from `components/configuration/product-master/ui.js`. Reuse that pattern; don't hand-roll static option arrays.

### Tag colours

- Status/type/enum columns must render as **coloured `<Tag>`s**, not bare grey tags. Map each enum value to a stable colour (keep the map in one place, e.g. a shared `ui.js`). Examples used by the product master: Active → `green`, Inactive → `red`; product types → green/orange/blue/purple/gold/geekblue; spec data types → default/blue/purple/cyan/gold.
- Keep the colour mapping consistent across every table that shows the same enum.

### Reuse

- Centralise the table header theme, pagination factory, and colour maps in a shared helper (the product master uses `components/configuration/product-master/ui.js` → `TABLE_CLASS`, `makePagination(noun)`, colour maps). Reuse rather than re-deriving per table.

---

## 38. Boolean toggles in forms

**Rule: Never put text inside a `Switch`. Use the shared `ToggleCard` for boolean flags in master/config forms.**

- **Never use `Switch` `checkedChildren` / `unCheckedChildren`** to render text ("Yes"/"No", "Active"/"Inactive", "Auto"/"Manual", etc.) inside a switch. The in-switch label is banned project-wide.
- **Use the shared `ToggleCard`** (`components/ui/toggle-card.jsx`) for boolean flags in master/config forms — a bordered card with an icon + bold title + small description and a plain (unlabelled) `Switch`. The card highlights teal (`border-[#a0d5cc] bg-[#e0f5f1]`, icon `#389383`) when ON.
  ```jsx
  import ToggleCard from "@/components/ui/toggle-card"
  import { ShieldCheck } from "lucide-react"
  // inside a <Form form={form}>…
  <ToggleCard form={form} name="GstExempt" icon={ShieldCheck} title="GST Exempt" desc="Item is exempt from GST." />
  ```
  Props: `{ form, name, icon (lucide component, optional), title, desc (optional), size ("default"|"small", default "default"), disabled (optional) }`.
- **For a simple inline boolean**, a plain unlabelled `<Switch/>` with a normal `Form.Item label` is acceptable — but **never** put text inside the switch itself.
- **Canonical example**: the product-master `ToggleCard` usage for the GST flags in `components/configuration/product-master/product-dialog.jsx` (Tax & Compliance section).

---

## 39. Always auto-fill via lookup APIs (no manual typing of derivable fields)

**Rule: Any field whose value can be resolved from an authoritative API/lookup must be auto-filled — never free-typed. The lookup trigger fires automatically on a complete/valid value, with no separate "fetch" button.**

- **GSTIN** fields MUST auto-fetch via `lib/services/gstLookup` (`lookupGstin`, route `/api/utils/gst-verification`) to fill legal name, PAN, state, and address. The GSTIN field leads any party form — enter it first and let the rest populate.
- **IFSC** fields MUST use `components/ui/ifsc-input.jsx` (`IfscInput`) → Razorpay (`lib/services/ifscLookup`) to auto-fill Bank Name + Branch. IFSC comes first in a bank block, before the derived fields.
- **Postal/PIN code** fields MUST use `components/ui/pincode-input.jsx` (`PincodeInput`) → India Post (`lib/services/pincodeLookup`) to auto-fill City + State + Country.
- **State** MUST be a dropdown sourced from `lib/utils/gstStateCodes` (`gstStateOptions`); the numeric State Code is derived via `getGSTInfoByStateName` — never free-typed.
- **General principle**: any field derivable from an authoritative API/lookup (GSTIN, IFSC, PIN, State) must be auto-filled/selected, not manually typed. Triggers run on a complete/valid value (e.g. 6 PIN digits, a valid IFSC, a 15-char GSTIN) — never behind an extra "fetch" button.

## 40. System-Parameter dropdowns — store the Id, resolve the label live (no snapshot)

**Rule: When a form field's choices come from a System Parameter list, persist ONLY the `*Id` (the `SystemParameters.ParameterId`). Resolve the display label live from the loaded parameters at read time. Do NOT store a denormalised label copy for these fields.**

### Why

A live `Id → Property` resolution means a parameter rename in **Configuration → System Parameter** reflects **everywhere instantly**, with zero cascade code and no risk of drift. This is the preferred default for master-record dropdowns (e.g. `Suppliers.SupplierCategoryId`).

### How

1. **Schema**: one nullable `uuid` column FK-ing `SystemParameters.ParameterId` with `onDelete: "restrict"` (e.g. `SupplierCategoryId`). No paired `*Text` column.
2. **Form**: the `<Select>` binds `name="<Field>Id"`, options are `{ value: p.ParameterId, label: p.Property }` (sorted by `SortOrder`). Load the list via `useSystemParametersStore().fetchParameters()` on open. Any derived UI (e.g. show "Job Work Type" when category is "Job Worker") keys off the **resolved label**, not the Id.
3. **API**: persist only `<Field>Id` (the Id string) in `_utils`. `.select()` returns it; the client resolves the name.
4. **List/table & filters**: build a `Map<ParameterId, Property>` from the loaded params and render/ filter by Id (label via the map). Bulk import maps an incoming label → Id via a `name→Id` map and warns if unmatched.

### Relationship to §35

§35 (store `*Id` + `*Text` snapshot + cascade) is reserved for **high-volume transactional rows** where list reads must avoid a per-row lookup (tenders, projects, DPR). For **master-record dropdowns**, prefer §40 (Id-only, live resolution) — simpler and self-syncing. Do not add a `*Text` snapshot for a §40 field, and do not add it to `masterRenameCascade.js`.

---

## 41. Edition / Module Gating — One Env Flag, Three Layers, FK-Closed

**Rule: Whether an optional module (ERP/Accounts masters, future settings, etc.) ships in a given build is controlled by a single env flag, with ONE source of truth in `lib/erp.js`. Gating happens in exactly three places — sidebar, user form-rights, and schema-push — and the kept (always-shipped) schema must never FK-reference an excluded table.**

This lets the same codebase ship as the full product or as a slimmer edition (e.g. "Proniq-only", no ERP/Accounts) without forking. The first instance is the **ERP gate**; add future gated modules the same way.

### Single source of truth — `lib/erp.js`

All gating constants/helpers live here so the client UI, server routes, AND `drizzle.config.ts` read the same values. It is plain ESM (no `@/` alias) so `drizzle.config.ts` can `import './lib/erp.js'`.

- `ERP_ENABLED` — `String(process.env.NEXT_PUBLIC_ERP_ENABLED ?? "true").toLowerCase() !== "false"`. **Default ENABLED**; only an explicit `false` turns the module off. Use `NEXT_PUBLIC_` so it is inlined client-side AND readable in Node/drizzle. The flag applies to **everyone, including admin** (it is an edition gate, not a per-user right).
- `ERP_CONFIG_PATHS` — route prefixes hidden from sidebar + form-rights when off.
- `ERP_APP_IDS` — whole `applications[]` entries hidden when off (e.g. `ierp`).
- `ERP_ONLY_TABLES` — DB tables NOT pushed when off (drizzle `tablesFilter` exclusions).
- `isErpConfigPath(path)` and `gateErpApplications(apps)` — the helpers the three layers call.

### The three gating layers (all driven by `lib/erp.js`)

1. **Sidebar / home apps** — `lib/store/useUserStore.js` wraps its `applications` array in `gateErpApplications([...])`. This drops gated apps + ERP menu items at the source, so both the home application-selection screen and the sidebar hide them, for all roles. (The existing per-user `filterApplicationsByRights` still runs on top.)
2. **User form-rights** — `components/user/user-form-rights.jsx` filters the forms list with `forms.filter(f => !isErpConfigPath(f.Path))` so admins can't assign rights to hidden modules.
3. **Schema push** — `drizzle.config.ts` sets `tablesFilter: ERP_ENABLED ? undefined : ERP_ONLY_TABLES.map(t => "!"+t)` (negation-only filter = "all tables except these"). When off, `npm run push` does not create the excluded tables.

### FK-closure rule (critical)

The **kept** schema (everything still pushed) must be **FK-closed**: a kept table may not `.references()` an excluded table. If it does, push fails creating the kept table.
- Concrete: `Companies.BaseCurrencyId → Currencies`, and Companies stays (the Proniq project form uses `CompanyIds`). Therefore **Currencies stays pushed** even though it is hidden in the UI. UI-hiding and schema-exclusion are **separable** — a table can be hidden from menus/rights yet still exist because a kept table depends on it.
- Before adding a table to `ERP_ONLY_TABLES`, grep for `references(() => <Table>` in all kept schemas (core master + `projectManagement` + any always-on app). If a kept table references it, keep it pushed and only hide it in the UI.

### Adding a future gated module (Account module, more settings/forms)

1. Add its menu entry/app to `useUserStore` as normal, and register its config route(s) + sidebar icon (§36).
2. Add the route prefix(es) to `ERP_CONFIG_PATHS` (or, for a brand-new gate, add a parallel `ACCOUNTS_*` set + helper in `lib/erp.js` and a second flag like `NEXT_PUBLIC_ACCOUNTS_ENABLED` — same three-layer wiring).
3. Add its tables to `ERP_ONLY_TABLES` (or the new gate's table list), **after** verifying FK-closure as above.
4. Nothing else: the three layers auto-gate. Document the flag in `.env` with a one-line comment.

### Notes / limits

- Gating is sidebar + form-rights + schema-push only. It does **not** block direct navigation to a gated route URL or hard-guard the gated API routes — add a redirect/guard if a build must be tamper-resistant.
- `drizzle.config.ts` changes can only be verified with an actual `npm run push` / `drizzle-kit generate` against a DB — the Next build does not exercise the drizzle config.

---

## 42. Document Management — Generic Table, Storage Config, Stage Tagging & Revisions

**Rule: every file upload in the app goes through the one generic document pipeline (`ManageDocuments` + `/api/manageDocument/*`). Never build a module-specific documents table or a second upload endpoint.**

### One generic table — `RecordId` + `ReferenceId`, never module-specific columns

- `ManageDocuments` is the single documents table for ALL modules. `RecordId` (uuid, no FK) points at the owning record (a Drawing/QAP record, a Work Order, …).
- `ReferenceId` (uuid, nullable, no FK) is the **generic upload context**: for Drawing/QAP it stores the `TenderWorkflowId` (the stage the document was uploaded on). Other modules store their own context id in the **same column** — do NOT add new `<Module>SomethingId` columns to `ManageDocuments`.
- Label resolution for `ReferenceId` happens at read time in `/api/manageDocument` (e.g. stage → `StageName`/`StageGroupName` via `TenderWorkflows` + `SystemParameters`). Snapshots of those labels are never stored on the document row (see §40).

### Storage configuration — singleton, server-resolved, lock-after-first-upload

- `DocumentStorageSettings` is a **singleton** row: `StorageType` = `DMS | S3 | LOCAL` (+ `LocalBasePath` for LOCAL). Managed only from **Configuration → Document Storage** (`/configuration/document-storage`).
- The upload route (`/api/manageDocument/upload`) resolves the destination via `getEffectiveStorageType()` from `lib/services/documentStorageService.js`. **Never hardcode a storage destination in a feature.** Default when unset: DMS if configured, else S3.
- Every inserted document row records the storage actually used in `StorageType`.
- **Lock rule:** once `ManageDocuments` has ≥ 1 row, changing the storage configuration is **admin-only**, enforced server-side (403 for non-admins) — existing `FileUrl`s point at the old location and would otherwise split silently. The config UI must surface the lock state; upload UIs must show a "Documents are saved to: …" banner from the settings GET.
- The config page must offer **Test Storage** (`/api/configuration/document-storage/test`) before saving: LOCAL/S3 write + read-back + delete a probe file; DMS reachability check.
- **POST-only exception:** `/api/manageDocument/file/[name]` is a GET because it is content delivery (like the DMS `/api/files/...` URLs), not an API action. It must only ever accept a bare basename (reject any path component / `..`).

### Revisions — replace, never overwrite

- A document family = the original row (root, `ParentDocumentId` null) + its revisions (`ParentDocumentId` = root `DocumentId`). `RevisionNo` is 1-based and increments per family; **exactly one row per family has `IsLatest = true`**.
- "Replace" = POST `/api/manageDocument/add` with `ReplacesDocumentId`; the server deactivates the family and inserts the new active revision (carrying the old `ReferenceId` unless a new one is sent). Duplicate-filename validation only applies to `IsLatest = true` rows so a revision can keep its name.
- Deleting the active revision must **re-activate the most recent remaining revision** (handled in `/api/manageDocument/delete`).
- Lists, cards and counts show **active documents only** (`IsLatest = true`); older revisions are exposed nested under the active doc ("N previous revisions" expand). Board-card enrichment (`enrichDrawingQapRows`) filters on `IsLatest`.
- Document UIs (Manage Documents dialog, record drawer Documents tab) group documents **stage-wise** by `ReferenceId` (resolved label, "General" for null) and show Rev badges; the record drawer History tab shows per-stage document counters.

### Link documents & revision deletion (addendum)

- **LINK documents:** a document can be an external link (`StorageType = "LINK"`): only `FileName` + `FileUrl` are stored, nothing is written to our storage, and physical-delete is a no-op. Attached via the shared `components/AddDocumentLinkModal.jsx` (Document Management dialog + record forms). Treat LINK like any other document everywhere (revisions, stage tagging, counters, audit). Tag colour: cyan.
- **Revision-aware deletion:** deleting a document that has revisions must offer: only the current file (previous revision re-activates), the whole family (`Mode: "family"` on `/api/manageDocument/delete`), or a user-selected subset. All deleted files are physically removed from their storage.
- **Cascade on record delete:** any endpoint that deletes a record owning documents MUST call `deleteDocumentsForRecord({ recordId, userId, request })` from `lib/services/manageDocumentService.js` — it removes every revision's physical file from its storage (DMS via the integration delete endpoint, S3 via DeleteObject, LOCAL via unlink; LINK rows are metadata-only) and then deletes the rows, with one audit entry. Never leave orphaned ManageDocuments rows or stranded files.

## 43. Server-Assigned Codes — Show the Number, Never "Assigned on Save"

Every register whose identifier is assigned by the server — `MC-001` (Machines), `T-001` (Technicians), `BR-001` (Breakdown Reasons), `MCL-0001` (Maintenance Calls) — follows the SAME four-part shape. A new one that skips a part is not a variation, it is a bug.

1. **The server owns the number.** It is claimed inside the insert's transaction, under `pg_advisory_xact_lock` keyed on `(PlantId || '<slug>', FiscalYearId)`, and it is the **lowest unused** number in that register — not `count + 1`, so a deleted row's number is reused instead of leaving a permanent gap. See `claimMachineCode()` / `claimBreakdownReasonCode()` / `claimCallNo()`. The lock key carries the master's own prefix so two registers never wait on each other.

2. **The update route strips it.** `delete values.Code` (or `CallNo`) before writing, so a hand-made request cannot change an identifier that printed documents already quote. Leaving it off the form is not enough.

3. **The form SHOWS it, disabled.** A blank form must open with the number it will almost certainly receive, in the same disabled field it will occupy once saved, plus `extra: "Provisional — confirmed when you save."`. A placeholder such as *"Assigned on save"* or an empty box is **not acceptable** — it gives the user nothing to check the saved result against.

4. **The preview is a client-side mirror.** One small module per code in `lib/utils/` (`machineCode.js`, `technicianCode.js`, `breakdownReasonCode.js`, `callNo.js`) exporting `format<X>()` and `nextFree<X>(rows)`, applying the same lowest-unused rule as the server. It may be one behind if somebody else saves first; that is fine and expected — the field is not editable, so nothing the user typed depends on it.

On a `MasterScreen` master this is the `defaults` callback (`(rows) => ({ Code: nextFreeXCode(rows), … })`); on a bespoke page it is `form.setFieldsValue` inside `openCreate`. Either way it must re-run when the list changes, so the next blank form previews the NEXT number and Reset does not leave a stale one on screen.

## 44. Entry Drawers — One Header Component, One Width

Every form in this app is a drawer over its register. All of them use the SAME header and the SAME width; a form that styles its own is a form that has started drifting into a second product.

- **Header:** `components/common/drawer-header.jsx`. Pass `closable={false}`, `styles={{ header: DRAWER_HEADER_STYLE }}` and the whole strip as `title={<DrawerHeader … />}`. Never use antd's `title` + `extra` pair: antd draws its own close button to the **left** of the title, which is how forms ended up with two close buttons. Window controls belong together on the right.
- **Width:** `width={maximized ? "100%" : DRAWER_WIDTH}` — the constant from the same module (`min(1380px, 100%)`). Never type a number. The forms are four-column grids; a drawer that is 1080 on one screen and 1380 on the next makes the same grid break at different points, which reads as two different layouts. The `min(…, 100%)` half matters: a bare `1380` pushes the drawer's own right edge — and the close button with it — off a narrower laptop.
- **Contents:** `icon` (the screen's own mark, same one the sidebar uses — RULES §36), `title`, a one-line `subtitle` saying what the form is for, and `meta` chips via `<DrawerChip>`. Use `tone="solid"` for the single fact that identifies the record (its code or number) and the default outline for the rest, so the row has one focal point. Good `meta` content: the record's code, its status, and any count a save or close rule turns on — e.g. a call shows `3/4 photos` and its running total, where they can be read without scrolling to the section that owns them.
- The gradient comes from `--theme-gradient-from/to`, read at paint time, so a re-themed deployment gets its own colours with nothing to change here.

**This applies to every new form from now on**, master and transaction alike, and to the shared `MasterScreen` drawer that every master inherits.

## 45. Date & Time Fields — `SmartDatePicker`, 12-Hour, Never a Raw `DatePicker`

- Every date field in the app is `components/ui/smart-date-picker.jsx`, never antd's `DatePicker` directly (RULES §1). It accepts what a fast typist enters — `22`, `t`, `1-apr-26` — and refuses anything ambiguous rather than guessing.
- For a date **and** time, pass `showTime`. Do **not** also pass `format`: the component defaults a date-time field to `DD/MM/YYYY hh:mm A` with a 12-hour AM/PM column. Passing `showTime` without a matching `format` used to collect a time and then display only the date, leaving the operator no way to see what they had chosen.
- The typed-text parser knows the full displayed format, so a date-time can be typed as well as picked, and re-committing the text already in the box cannot change it. A date shortcut (`t`) in a date-time field keeps the time already set rather than resetting to midnight.
- 12-hour is the default because that is how a shift is spoken about on a shop floor. A screen that genuinely needs 24-hour passes its own `format` and `showTime={{ use12Hours: false, format: "HH:mm" }}`.

## 46. Popups Inside Drawers & Modals — One `getPopupContainer`, Never Per Field

Selects, date pickers and dropdowns are PORTALS. antd's default is to append them to `document.body`, which is wrong inside a drawer for two reasons that compound:

- **z-index.** The drawer sits at 1000 and the dropdown at 1150, and the drawer's own z-index makes it a stacking context — so nothing inside it can ever paint above a body-level portal. An open dropdown covered the drawer's header and no CSS on the header could win. Raising the drawer above 1150 only inverts the bug: the dropdown then hides behind the drawer.
- **Scrolling.** The drawer body scrolls; a body-level portal does not belong to it, so an open dropdown drifts away from its own field.

The fix is global and already in place — `components/antd-popup-container.jsx` wraps the app in a `ConfigProvider` whose `getPopupContainer` portals into the nearest `.ant-drawer-body` / `.ant-modal-body`, falling back to `document.body` everywhere else. The popup is then clipped by the panel (so it cannot reach the header) and scrolls with its field.

- **Do NOT set `getPopupContainer` on individual components.** That is the habit this replaced: every future `<Select>` inside a drawer would have to remember, and the one that forgot would reproduce the bug exactly.
- The hosts carry `position: relative` in `app/globals.css` — an absolutely-positioned popup anchors to the nearest POSITIONED ancestor, and antd leaves both `static`. Removing that rule sends every in-drawer dropdown to the wrong place.
- Adding a host to the selector list is fine when a new scrollable panel appears. Do not add narrow containers (a `.ant-form-item`, a table cell) — the popup would be clipped to the height of one field.

## 47. Failed Saves — Say WHICH Field, Never "Could Not Save"

A save fails in two unrelated ways, and catching both in one `catch` reports them as one:

- **The form refused it.** `form.validateFields()` REJECTS with `{ errorFields }` naming exactly which fields are wrong and why.
- **The server refused it.** axios throws with `response.data.error` — a sentence.

Printing a fallback for both turned the first kind into "Could not save this call", which tells the operator nothing: it could not be saved because THEY had not filled in the problem description, and the form already knew that.

Every save handler routes its failure through `reportFormError(error, { form, fallback })` from `lib/utils/formErrors.js`:

- a validation rejection → the **field's own message** in the toast ("Problem description is required"), plus "N other fields still need attention." when there is more, and the form scrolls to the first bad field;
- anything else → the server's sentence, falling back to the screen's own wording.

Rules for new forms:

- **Never leave `validateFields()` uncaught.** An uncaught rejection is an unhandled promise rejection with no message anywhere except red text under a field that may be scrolled off-screen. Four screens in this app were doing exactly that.
- **Never print `error.message`** to the operator — that is where internals ("Cannot read properties of undefined") leak into the UI. Server sentence, then fallback.
- Write every rule's `message` from the operator's point of view, because it IS the toast: "Damage severity is required", not "Required".
- `scrollToField` uses `behavior: "auto"`. A smooth scroll is animated by the compositor and silently does nothing when it is not running (unfocused window, reduced-motion); the point of the line is that the operator ends up looking at the field, so it has to actually move.

## 48. Operational Status Is DERIVED, Never a Column

`IsActive` answers one question: is this row part of the register? It is a deliberate on/off somebody sets, and it was standing in for a different question the screen was really being asked — **is this machine running right now?**

That second question has no column, and must not get one. The answer is what the machine's open maintenance calls and in-progress PMs ADD UP TO, and it changes the moment one of them is raised or closed, from a completely different screen. A `Status` column on `Machines` would be correct until the next call closed and quietly wrong from then on, with nothing watching. Same reasoning as the PM schedule's Overdue / Due Today, which are computed on read (§ PM).

How it is built, and the shape to copy for any other "what state is this in" field:

- **One module owns the vocabulary.** `lib/constants/machineStatus.js` — the states, `machineState(row)` (the precedence), the antd tag colour per state, the row-tint class per state, and a one-line `machineStateReason(row)` for the tooltip. `lib/constants/pmStatus.js` is the same shape for PMs. A screen never invents its own colour for a state.
- **Counted in SQL, with correlated sub-selects — not joins.** A machine with four open calls must stay ONE row; joining multiplies it by every match and inflates the register's own count.
- **Precedence is explicit and most-specific first**, because a machine is often several at once: Inactive → At Vendor → Breakdown → Under Maintenance → Running.
- **Draft does not count.** A call counts against its machine once it has been RAISED (`Status NOT IN (Draft, Closed)`). A half-typed form must never turn a running machine red.
- **The badge says WHY.** Every state tag carries a tooltip naming the count behind it ("1 maintenance call is open against this machine"). A badge that cannot be questioned is a badge nobody trusts the second time it looks wrong.
- **Everything that repeats the status reads the same derived value** — the stat cards, the filter, the row tint, the drawer chip and the Excel/PDF export. An "Active 12" card above a table of red rows is the screen telling two stories at once.
- **Row tints are real CSS classes in `app/globals.css`, not Tailwind utilities on `rowClassName`.** antd paints a background on every `td`, which covers anything set on the `tr`, so the CELLS have to be repainted (`.ant-table-tbody > tr.machine-row-breakdown > td`), with `!important`, plus a `:hover` rule so the row still answers the pointer.
- **Tailwind only emits a class it has SEEN in a scanned file.** `tailwind.config.ts` scans `lib/**` for exactly this reason — the colour maps live there.

## 49. One Session Token, Two Transports — Cookie and Bearer

The session is a JWT signed with `JWT_SECRET`. It reaches the server two ways, and **only `readAuthToken()` in `lib/auth/token.js` decides which**:

- **`authToken` cookie** — the web app. The browser attaches it without being asked.
- **`Authorization: Bearer <token>`** — the mobile app. A native HTTP client holds the token it was handed at login and sends it itself; it has no cookie jar worth relying on.

Rules:

- **Never read the cookie directly.** `request.cookies.get("authToken")` in a route is a route that mobile cannot call. Every server-side read goes through `readAuthToken(request)` — `sessionFromRequest()`, `middleware.js` and `/api/Auth/refresh-token` are the only three places that need it, and they all already do.
- **The header wins when both are present.** A WebView has a cookie from an earlier browser sign-in AND the header the app attaches; the header is what the client chose for *this* request, so a stale cookie must not quietly act as a different user.
- **`readAuthToken` only answers "where is it", never "is it valid".** Verification stays in `jwtVerify` at each call site, so adding a transport can never loosen a check.
- **Keep `lib/auth/token.js` dependency-free.** `middleware.js` runs on the Edge runtime and cannot import anything that reaches the database.
- **Anything that issues a token returns it BOTH ways** — `Set-Cookie` for the browser and `user.token` in the body for a client that stores it itself. `createAuthSessionResponse()` and the refresh route both do.
- **An API request is answered, never redirected.** The middleware sends a page to `/login` and answers anything under `/api/` with `401 { error, code: "UNAUTHENTICATED" }`. A `fetch` follows a redirect, receives the sign-in page and reports 200 with a body of HTML — so an expired session surfaced as `response.json()` throwing on `"<!DOCTYPE"` rather than as an expired session. A native client has no browser to send anywhere at all.

## 50. Never Route an Upload Body Through Middleware

`middleware.js` runs on the **Edge runtime**, and a request routed through it has its body proxied through that sandbox — which cuts off at about 10 MiB.

Measured: a 25 MB `PUT` to `/api/upload/local` arrived as **10,485,167 bytes**. The route wrote exactly what it received and answered **200**. So every video over ~10 MB uploaded "successfully" and then would not play, because an MP4 keeps its `moov` atom at the END of the file — a clip missing its tail is a clip missing everything that says how to decode it. The fault surfaced days later, on playback, as "the preview is broken".

Rules:

- **Exclude any body-streaming upload path from the middleware matcher.** `/api/upload/local` is excluded for exactly this reason.
- **An excluded route checks its own session.** `sessionFromRequest(request)` at the top — auth that lives in a matcher regex is one regex edit away from being gone, and "middleware covers it" is not a thing a reader of the route can verify.
- **Compare what was written against `Content-Length`, and fail if they differ.** A stream can end early without erroring: a proxy in front, a dropped connection, a sandbox limit. Answering 200 for a short write is the worst outcome available — the upload looks done and the file is silently corrupt. `/api/upload/local` deletes the partial file and answers `502` with a sentence that says to try again.
- This applies to anything else that streams a large body in later — a bulk import, a backup restore. If the body can be big, it does not go through middleware.

## 51. A Field Backed by an External Catalog Still Takes Free Text

The "Item / Spare" grid and "Item Sent" field on the Breakdown Call Register now suggest from the company's ERP product catalog (DeltaiERP, `lib/services/productCatalog.js`) — but neither field was changed to a strict `Select`. Both are antd `AutoComplete`: real suggestions, and still whatever the operator types.

**Why not a Select that forces a match.** The ERP's 5,274 rows are what the ERP knows about, not what the plant actually consumes. A locally fabricated bracket, a part bought once from a roadside vendor, a description written before someone gets around to coding it in the ERP — none of that has a row. Forcing selection-only would mean the form refuses to record a real repair because someone else's catalog is incomplete, which is exactly the trap §47 already names for required fields: a dropdown must never become a wall between the operator and what actually happened.

**How the catalog itself is handled — the shape to copy for any other external, read-mostly reference list:**

- **Cached server-side, not fetched per request.** The upstream call returns ~950 KB and measured about a second; asking for that on every keystroke of every open drawer would be the wrong kind of "live" for data that does not change minute to minute. `lib/services/productCatalog.js` holds it in memory for `CACHE_TTL_MS` (15 minutes) and every request in between is served from there.
- **Concurrent callers share one fetch.** A cold cache asked by eight spare rows, several browser tabs, or a herd of requests right after a restart must produce ONE upstream call, not one per asker — an `inFlight` promise, not a `loading` flag, is what makes that true.
- **A failed refresh serves the stale cache rather than failing the screen.** The upstream is someone else's server on someone else's uptime; one timeout must not empty a catalog that has worked all day for everyone using it right now. Only a cold start with no cache yet and a failed fetch is a real error, and that is what gets reported.
- **The client caches it too, once per page load**, and only fetches it lazily when a drawer that actually shows the field opens — not on every visit to a list screen nobody may ever expand. `lib/hooks/useProductCatalog.js` is the shape: a module-level cache plus a shared in-flight promise, same reasoning as the server side, one layer up.
- **The route is gated the same way `/api/maintenance-call/get` is** — `requireAnyRight` against every screen that actually shows the field, not a blanket "signed in is enough". A lookup endpoint is still an endpoint.

## 52. A Business Rule Is a Row, Not a Constant — and Never a Cached One

"Minimum four photographs", "1.5× for overtime", "warn past 5% over estimate" were literals in source files. Each is now a row in `BusinessRules`, set per plant on Masters → Business Rule Configuration, and read at the point of enforcement through `loadBusinessRules()`.

**The registry is `lib/constants/businessRules.js`** — plain data, no database import, so the screen and the server share one definition of what each rule is, what it defaults to, how its value coerces, and **where it is enforced**. Rules for adding one:

- **One object in the registry, and nothing else.** Values live in a key/value table, so a new rule needs no migration. The registry carries the type; `coerceRuleValue()` is the single place a stored string becomes a number or a boolean.
- **The default is always what the app shipped with.** A plant that has never opened the screen must behave exactly as it did before the rule existed. `resolveRules()` overlays stored values onto `DEFAULT_RULES`, so every caller gets a complete object and nobody null-checks.
- **Reset deletes the row; it does not store the default.** A stored 4 is "this plant decided 4"; an absent row is "this plant takes what ships". If the shipped default later moves, those two must part company.
- **`appliesTo` is mandatory and is printed on screen, verbatim.** A configuration screen that shows eight numbers without saying what they do is how a plant ends up with rules nobody trusts. Mark each one `blocking` or advisory too — "minimum photographs" and "daily budget" look identical in a list and behave nothing alike.
- **Per PLANT, deliberately not per financial year.** A rule is policy, not bookkeeping. Scoping to a year would silently revert every rule on 1 April, with nothing in the audit log.

**Never cache the rules in module memory.** There was a Map keyed by plant with a TTL and an invalidation call in the save route. It was wrong: Next gives route handlers their own module instances, so the Map the save route invalidated was not the Map the detail route read. Measured — saving `MinDamagePhotos = 6` left `/api/maintenance-call/detail` still enforcing 2, with the screen showing 6. In production the same thing happens across instances for a simpler reason: separate processes, separate memory.

The cost of not caching is one indexed `SELECT` of at most a handful of short rows — cheaper than the photograph count `closeBlockers()` already runs beside it. A stale dropdown is a nuisance; a stale RULE is a close enforcing a number the plant no longer runs to. The same trap is still sitting in `lib/services/productCatalog.js`, where it is survivable; weigh it that way every time.

**Not everything belongs behind a rule.** A technician's clock still running blocks a close regardless of configuration — that is an unfinished cycle, not a policy question, and closing over one bakes a wrong number into the call's cost forever.

**A screen never keeps its own copy of a rule.** `MIN_PHOTOS = 4` sat at the top of the call register and again at the top of Damage & Photos; the day-wise costing screen POSTED its budget to the server, which then used it to decide which days were breaches. All three are gone. Every register that enforces a rule now ships `rules` in its own response — `/api/maintenance-call/get`, `/api/outside-repair/{get,detail}`, `/api/costing/day-wise/get` — and the screen reads the number back from there, seeded with `DEFAULT_RULES` so the first paint is right.

Two reasons, and the second is the one that matters:

- A screen counting to 4 while `closeBlockers()` counts to 6 promises a close it cannot deliver. The operator attaches four photographs, sees a green tick, presses Save & Close and is refused — by a number nothing on screen ever showed.
- A threshold the browser posts is not a threshold. The day-wise route took `DailyBudget` from the request body, so anything holding a token could decide which days breached budget. The rule is now read server-side from the plant and the client is told what it was.

A rule whose minimum is 0 must survive being set to 0: budget 0 means "this plant does not track a daily budget", never "every day is a breach". Check that in the enforcement, not the screen.

## 53. A Sync That Cannot Tell "Again" From "New" Will Duplicate

`syncOutsideRepairFromCall()` copies a call's dispatch fields into `OutsideRepairs` on every save. It looked for a leg still `At Vendor`, and inserted when it found none. That made a call with a FINISHED outside repair impossible to close:

1. raise the call with `IsOutsideRepair` — leg OR-0009 goes At Vendor
2. the part comes back, Receipt Approval approves it — OR-0009 Approved
3. press **Save & Close**. The client saves first; the sync finds no At Vendor leg and inserts OR-0010 At Vendor
4. the close half runs `closeBlockers`, sees a leg that is not approved, refuses — because of the row the save half just created
5. press it again. Go to 3.

Measured: one save after approval, two legs, HTTP 409 reading *"1 outside-repair receipt is not approved yet"*. The same hole raised duplicates a step earlier: a leg sitting at `Received` is not `At Vendor` either, so saving while a receipt was pending quietly raised a second leg for the same trip.

**The rule a one-way sync needs is three branches, not two:**

- **no row** → insert. The first dispatch.
- **latest row not in its terminal state** → update in place. At Vendor, Received and Rejected are one trip still in flight, and the parent stays the write-owner until the child is locked.
- **latest row terminal** → the trip is finished. Insert ONLY if the parent now describes a genuinely different thing — here a different item, vendor or gate pass, compared trimmed and case-folded. Saving the same record again must never re-send a part that is already back on the shelf.

The old code's comment claimed it did the third branch: *"after a previous leg was Approved and a NEW item is being sent"*. It could not, because it compared nothing — it inferred "new item" from the absence of an active leg, and "the user pressed save again" produces exactly that absence.

**Two lessons that generalise.** First, when a write is idempotent by intent, the thing that makes it idempotent has to be a comparison of CONTENT, not the absence of a row in one particular state — states multiply, and every new one is another hole. Second, a save path and a validate path that run in sequence from one button must not be able to invalidate each other: if pressing a button makes its own postcondition unreachable, no amount of retrying fixes it, and the user is left pressing it forever.
