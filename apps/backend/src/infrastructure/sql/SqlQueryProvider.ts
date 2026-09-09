import type { EngineType, ISqlQueryProvider } from "@deltacore/shared";
import path from "node:path";
import type { ITextFileReader } from "../../domain/ports/ITextFileReader.js";

const PLACEHOLDER = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

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
    const filePath = path.join(this.dialectsRoot, engine, `${feature}.sql`);
    const template = this.files.readTextSync(filePath);
    return interpolate(template, params, filePath);
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
