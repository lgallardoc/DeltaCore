import type { EngineType, ISqlQueryProvider } from "@deltacore/shared";
import path from "node:path";
import type { ITextFileReader } from "../../domain/ports/ITextFileReader.js";

const PLACEHOLDER = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function db2DialectFolder(): "db2" | "db2-ibmi" {
  return (process.env.DB2_CATALOG ?? "luw").toLowerCase() === "ibmi"
    ? "db2-ibmi"
    : "db2";
}

export class SqlQueryProvider implements ISqlQueryProvider {
  constructor(
    private readonly dialectsRoot: string,
    private readonly files: ITextFileReader,
  ) {}

  buildQuery(
    engine: EngineType,
    feature: string,
    params: Record<string, string>,
  ): string {
    const filePath = this.resolveFeaturePath(engine, feature);
    const template = this.files.readTextSync(filePath);
    return interpolate(template, params, filePath);
  }

  private resolveFeaturePath(engine: EngineType, feature: string): string {
    if (engine === "db2") {
      const preferred = path.join(
        this.dialectsRoot,
        db2DialectFolder(),
        `${feature}.sql`,
      );
      const fallback = path.join(this.dialectsRoot, "db2", `${feature}.sql`);
      if (this.canRead(preferred)) {
        return preferred;
      }
      return fallback;
    }
    return path.join(this.dialectsRoot, engine, `${feature}.sql`);
  }

  private canRead(absolutePath: string): boolean {
    try {
      this.files.readTextSync(absolutePath);
      return true;
    } catch {
      return false;
    }
  }
}

export function interpolate(
  template: string,
  params: Record<string, string>,
  source = "sql",
): string {
  const missing = new Set<string>();
  const rendered = template.replace(PLACEHOLDER, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) {
      missing.add(name);
      return "";
    }
    return params[name];
  });
  if (missing.size > 0) {
    throw new Error(
      `Missing SQL variables in ${source}: ${[...missing].join(", ")}`,
    );
  }
  return rendered;
}
