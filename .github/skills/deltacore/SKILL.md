---
name: deltacore
description: "Use when: changing, debugging, or validating DeltaCore's React comparison UI, data dictionary persistence, CatalogExplorer, SQLite, IBM i/Db2 SQL dialects, unixODBC diagnostics, or Keycloak-protected HTTP API."
argument-hint: "Describe the DeltaCore feature, failure, or workflow to work on"
---

# DeltaCore Development

## Architecture Rules

- Keep HTTP and CLI adapters thin; application logic belongs in `ComparisonEngine` or `CatalogExplorer`.
- SQL lives in `apps/backend/src/infrastructure/sql-dialects/<engine>/`. Select IBM i QSYS2 templates with `DB2_CATALOG=ibmi`; keep Db2 LUW SYSCAT SQL in `db2/`.
- Preserve the `packages/shared` contract whenever a result crosses backend and frontend.
- SQLite dictionary metadata belongs to `SqliteDictionaryStore`; add conditional migrations for columns needed by existing databases.
- Never expose ODBC connection strings, users, or passwords in API errors. Include DSN, safe connection attempt names, SQLSTATE, and driver diagnostic text when available.

## Frontend Rules

- Use `StatusProvider` for transient information, success, warning, and error messages. Banners close manually or after 3 seconds.
- Use a bottom banner for complete SQL/ODBC details; do not truncate diagnostic strings.
- Preserve caller state when a view opens an editor; use the `SmartBackState` pattern.
- When one page invokes another and the destination has a **Volver** button, it must return to the invoking view, not a fixed route. Pass the origin and required selection/filter state through router navigation state, then restore it on return. Use browser history only as a fallback when there is no explicit caller state.
- Apply shared table focus/selection styles instead of component-specific invisible selection state.
- Keep all frontend buttons at the shared standard height. Use internal scrolling for large tables instead of expanding setup views vertically.

## Schema Comparison

1. Analyze origin and target live catalogs with `schema-compare.sql`; do not preload dictionary columns for the summary.
2. Process a multi-table UI Schema request one table at a time and show progress from completed tables.
3. Return a `schemaComparison` entry for every field in the union of origin/target fields, including type, length, scale, and status.
4. Resolve a summary table description from the source dictionary first, then the live source catalog.
5. Load full field details from `GET /api/catalog/describe` for both DSNs only when the user selects **Ver**. Prefer a source field description and use target only as fallback.

## Volume and Row Comparison

1. Load local dictionaries for the selected origin DSN and let users select tables from that list; do not request table/schema/key manually from the compare form.
2. Sort selected dictionaries first. Disable execution until at least one dictionary is selected.
3. Render Schema, Volume, and Row results as consolidated tables with one row per selected table.
4. For IBM i Volume queries, return both `COUNT(*)` and `QSYS2.SYSTABLESTAT.DATA_SIZE`; display records and sizes with `es-CL` formatting.
5. Preserve all Row Delta category details within the requested limit. Link nonzero category counts to a detail page; highlight each changed field and identify source versus target values.
6. Pass a `SmartBackState.compare` snapshot into row-detail links so **Volver** restores DSNs, mode, limit, selected tables, and results.

## Validation

Run focused tests first, then validate the touched packages:

```bash
npx vitest run src/application/ComparisonEngine.spec.ts
npm run build
```

For frontend-only work, run:

```bash
cd apps/frontend
npx tsc -p tsconfig.json --noEmit
npm run build
```