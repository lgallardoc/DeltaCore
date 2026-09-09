import type { IComparisonEngine, IOdbcConnection } from "@deltacore/shared";
import cors from "cors";
import express, { type Request, type Response } from "express";
import type { AccessIdentity } from "../../domain/AccessIdentity.js";
import type { CatalogExplorer, TableColumn } from "../../application/CatalogExplorer.js";
import {
  runRowCompareJob,
  runSchemaCompareJob,
  runVolumeCompareJob,
} from "../../application/CompareJobRunner.js";
import type { SqliteDictionaryStore } from "../../infrastructure/sqlite/SqliteDictionaryStore.js";
import type { SqliteRbacStore } from "../../infrastructure/sqlite/SqliteRbacStore.js";

type DataSourceListItem = {
  dsn: string;
  name: string;
  engine: string;
  searchPath: string[];
};

export function createApp(deps: {
  engine: IComparisonEngine;
  openConnection: (dsn: string) => Promise<IOdbcConnection>;
  rbac: SqliteRbacStore;
  catalog: CatalogExplorer;
  dictionaries: SqliteDictionaryStore;
  listDataSources: () => DataSourceListItem[];
  verifyToken: (token: string) => Promise<AccessIdentity>;
  corsOrigin?: string;
}) {
  const app = express();
  app.use(
    cors({ origin: deps.corsOrigin ?? process.env.CORS_ORIGIN ?? "http://localhost:5173" }),
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/rbac/modules/:moduleName", async (req, res) => {
    try {
      const identity = await identityFromRequest(req, deps.verifyToken);
      const userId = deps.rbac.ensureUser(identity);
      res.json(deps.rbac.permissionsFor(userId, req.params.moduleName));
    } catch {
      res.status(401).json({
        canView: false,
        canRead: false,
        canWrite: false,
      });
    }
  });

  app.get("/api/data-sources", async (req, res) => {
    await withAuth(req, res, deps.verifyToken, async () => {
      res.json({ sources: deps.listDataSources() });
    });
  });

  app.get("/api/catalog/schemas", async (req, res) => {
    await withAuth(req, res, deps.verifyToken, async () => {
      const dsn = queryString(req, "dsn");
      if (!dsn) {
        res.status(400).json({ error: "dsn is required" });
        return;
      }
      res.json(await deps.catalog.listSchemas(dsn));
    });
  });

  app.get("/api/catalog/tables", async (req, res) => {
    await withAuth(req, res, deps.verifyToken, async () => {
      const dsn = queryString(req, "dsn");
      if (!dsn) {
        res.status(400).json({ error: "dsn is required" });
        return;
      }
      const table = queryString(req, "table");
      const allSchemas = queryString(req, "allSchemas") === "1";
      res.json(
        await deps.catalog.listTables(dsn, table ? [table] : [], { allSchemas }),
      );
    });
  });

  app.get("/api/catalog/describe", async (req, res) => {
    await withAuth(req, res, deps.verifyToken, async () => {
      const dsn = queryString(req, "dsn");
      const table = queryString(req, "table");
      if (!dsn || !table) {
        res.status(400).json({ error: "dsn and table are required" });
        return;
      }
      res.json(
        await deps.catalog.describeTable(dsn, table, queryString(req, "schema")),
      );
    });
  });

  app.get("/api/dictionary", async (req, res) => {
    await withAuth(req, res, deps.verifyToken, async () => {
      const table = queryString(req, "table");
      const schema = queryString(req, "schema");
      const dsn = queryString(req, "dsn");
      if (!table) {
        res.status(400).json({ error: "table is required" });
        return;
      }
      res.json(
        await resolveDictionary(deps.dictionaries, deps.catalog, {
          table,
          schema,
          dsn,
        }),
      );
    });
  });

  app.put("/api/dictionary", async (req, res) => {
    await withAuth(req, res, deps.verifyToken, async () => {
      const body = (req.body ?? {}) as {
        schema?: unknown;
        table?: unknown;
        sourceDsn?: unknown;
        columns?: unknown;
      };
      const schema = asTrimmed(body.schema);
      const table = asTrimmed(body.table);
      if (!schema || !table || !Array.isArray(body.columns)) {
        res.status(400).json({ error: "schema, table and columns are required" });
        return;
      }
      const columns = body.columns.flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }
        const row = item as Record<string, unknown>;
        const columnName = asTrimmed(row.columnName ?? row.column_name);
        if (!columnName) {
          return [];
        }
        return [
          {
            columnNo: asTrimmed(row.columnNo ?? row.column_no),
            columnName,
            description: asTrimmed(row.description),
            dataType: asTrimmed(row.dataType ?? row.data_type),
            length: asTrimmed(row.length),
            scale: asTrimmed(row.scale),
            nullable: asTrimmed(row.nullable),
            isKey: Boolean(row.isKey ?? row.is_key),
          },
        ];
      });
      res.json(
        deps.dictionaries.save({
          schema,
          table,
          sourceDsn: asTrimmed(body.sourceDsn),
          columns,
        }),
      );
    });
  });

  app.post("/api/jobs/:jobId/schema-compare", async (req, res) => {
    await withAuth(req, res, deps.verifyToken, async () => {
      const body = (req.body ?? {}) as {
        sourceDsn?: unknown;
        targetDsn?: unknown;
        tables?: unknown;
      };
      const sourceDsn = asTrimmed(body.sourceDsn);
      const targetDsn = asTrimmed(body.targetDsn);
      if (!sourceDsn || !targetDsn) {
        res.status(400).json({ error: "sourceDsn and targetDsn are required" });
        return;
      }
      const tables = Array.isArray(body.tables)
        ? body.tables.filter((item): item is string => typeof item === "string")
        : [];
      res.json(
        await runSchemaCompareJob(deps.engine, deps.openConnection, {
          sourceDsn,
          targetDsn,
          tables,
        }),
      );
    });
  });

  app.post("/api/jobs/:jobId/volume-compare", async (req, res) => {
    await withAuth(req, res, deps.verifyToken, async () => {
      const body = (req.body ?? {}) as {
        sourceDsn?: unknown;
        targetDsn?: unknown;
        table?: unknown;
        sourceSchema?: unknown;
        targetSchema?: unknown;
      };
      const sourceDsn = asTrimmed(body.sourceDsn);
      const targetDsn = asTrimmed(body.targetDsn);
      const table = asTrimmed(body.table);
      if (!sourceDsn || !targetDsn || !table) {
        res.status(400).json({
          error: "sourceDsn, targetDsn and table are required",
        });
        return;
      }
      res.json(
        await runVolumeCompareJob(deps.engine, deps.openConnection, {
          sourceDsn,
          targetDsn,
          patternId: table,
          sourceSchema: asTrimmed(body.sourceSchema) || undefined,
          targetSchema: asTrimmed(body.targetSchema) || undefined,
        }),
      );
    });
  });

  app.post("/api/jobs/:jobId/row-compare", async (req, res) => {
    await withAuth(req, res, deps.verifyToken, async () => {
      const body = (req.body ?? {}) as {
        sourceDsn?: unknown;
        targetDsn?: unknown;
        table?: unknown;
        sourceSchema?: unknown;
        targetSchema?: unknown;
        keyColumns?: unknown;
        keys?: unknown;
        limit?: unknown;
        sampleSize?: unknown;
      };
      const sourceDsn = asTrimmed(body.sourceDsn);
      const targetDsn = asTrimmed(body.targetDsn);
      const table = asTrimmed(body.table);
      if (!sourceDsn || !targetDsn || !table) {
        res.status(400).json({
          error: "sourceDsn, targetDsn and table are required",
        });
        return;
      }
      const keyColumns =
        parseKeyColumns(body.keyColumns ?? body.keys) ??
        deps.dictionaries.get(asTrimmed(body.sourceSchema), table)?.keyColumns;
      res.json(
        await runRowCompareJob(deps.engine, deps.openConnection, {
          sourceDsn,
          targetDsn,
          table,
          sourceSchema: asTrimmed(body.sourceSchema) || undefined,
          targetSchema: asTrimmed(body.targetSchema) || undefined,
          keyColumns,
          limit: typeof body.limit === "number" ? body.limit : undefined,
          sampleSize: typeof body.sampleSize === "number" ? body.sampleSize : undefined,
        }),
      );
    });
  });

  return app;
}

async function withAuth(
  req: Request,
  res: Response,
  verifyToken: (token: string) => Promise<AccessIdentity>,
  run: () => Promise<void>,
): Promise<void> {
  try {
    await identityFromRequest(req, verifyToken);
    await run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "missing bearer token") {
      res.status(401).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
}

function queryString(req: Request, name: string): string {
  const value = req.query[name];
  return typeof value === "string" ? value.trim() : "";
}

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseKeyColumns(value: unknown): string[] | undefined {
  if (typeof value === "string") {
    const keys = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return keys.length > 0 ? keys : undefined;
  }
  if (Array.isArray(value)) {
    const keys = value.filter((item): item is string => typeof item === "string");
    return keys.length > 0 ? keys : undefined;
  }
  return undefined;
}

async function resolveDictionary(
  dictionaries: SqliteDictionaryStore,
  catalog: CatalogExplorer,
  input: { table: string; schema: string; dsn: string },
) {
  const saved = dictionaries.get(input.schema, input.table);
  if (saved) {
    return saved;
  }
  if (!input.dsn) {
    return {
      origin: "missing" as const,
      schema: input.schema.toUpperCase(),
      table: input.table.toUpperCase(),
      sourceDsn: "",
      columns: [] as ReturnType<SqliteDictionaryStore["save"]>["columns"],
      keyColumns: [] as string[],
    };
  }
  const live = await catalog.describeTable(
    input.dsn,
    input.table,
    input.schema || undefined,
  );
  return {
    origin: "catalog" as const,
    schema: live.schema,
    table: live.table,
    sourceDsn: input.dsn,
    columns: live.columns.map((column: TableColumn) => ({
      columnNo: column.columnNo,
      columnName: column.columnName,
      description: column.description,
      dataType: column.dataType,
      length: column.length,
      scale: column.scale,
      nullable: column.nullable,
      isKey: false,
    })),
    keyColumns: [] as string[],
  };
}

async function identityFromRequest(
  req: Request,
  verifyToken: (token: string) => Promise<AccessIdentity>,
): Promise<AccessIdentity> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    throw new Error("missing bearer token");
  }
  return verifyToken(token);
}
