import type { IComparisonEngine, IOdbcConnection } from "@deltacore/shared";
import cors from "cors";
import express, { type Request } from "express";
import type { AccessIdentity } from "../../domain/AccessIdentity.js";
import type { SqliteRbacStore } from "../../infrastructure/sqlite/SqliteRbacStore.js";

export function createApp(deps: {
  engine: IComparisonEngine;
  openConnection: (dsn: string) => Promise<IOdbcConnection>;
  rbac: SqliteRbacStore;
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

  app.post("/api/jobs/:jobId/schema-compare", async (req, res) => {
    const body = (req.body ?? {}) as {
      sourceDsn?: unknown;
      targetDsn?: unknown;
      tables?: unknown;
    };
    const sourceDsn = typeof body.sourceDsn === "string" ? body.sourceDsn.trim() : "";
    const targetDsn = typeof body.targetDsn === "string" ? body.targetDsn.trim() : "";
    if (!sourceDsn || !targetDsn) {
      res.status(400).json({
        error: "sourceDsn and targetDsn are required",
      });
      return;
    }

    let source: IOdbcConnection | undefined;
    let target: IOdbcConnection | undefined;
    try {
      source = await deps.openConnection(sourceDsn);
      target = await deps.openConnection(targetDsn);
      const tables = Array.isArray(body.tables)
        ? body.tables.filter((t): t is string => typeof t === "string")
        : [];
      const result = await deps.engine.executeSchemaCompare(source, target, tables);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "schema compare failed";
      res.status(500).json({ error: message });
    } finally {
      await source?.close().catch(() => undefined);
      await target?.close().catch(() => undefined);
    }
  });

  return app;
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
