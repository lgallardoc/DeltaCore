export function quoteSchemaList(schemas: string[]): string {
  if (schemas.length === 0) {
    throw new Error("No search path (*LIBL) defined for this data source.");
  }
  return schemas
    .map((schema) => {
      if (!/^[A-Za-z0-9_]+$/.test(schema)) {
        throw new Error(`Invalid schema name: ${schema}`);
      }
      return `'${schema}'`;
    })
    .join(",");
}

export function sqlIdent(name: string): string {
  const ident = name.trim().toUpperCase();
  if (!/^[A-Za-z0-9_@$#]+$/.test(ident)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return ident;
}
