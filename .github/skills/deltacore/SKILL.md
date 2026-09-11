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
- Apply shared table focus/selection styles instead of component-specific invisible selection state.

## Schema Comparison

1. Analyze origin and target live catalogs with `schema-compare.sql`; do not preload dictionary columns for the summary.
2. Process a multi-table UI Schema request one table at a time and show progress from completed tables.
3. Return a `schemaComparison` entry for every field in the union of origin/target fields, including type, length, scale, and status.
4. Resolve a summary table description from the source dictionary first, then the live source catalog.
5. Load full field details from `GET /api/catalog/describe` for both DSNs only when the user selects **Ver**. Prefer a source field description and use target only as fallback.

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