import { copyFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const positional = [];
let dbArgument;
let dryRun = false;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--dry-run") {
    dryRun = true;
  } else if (args[index] === "--db") {
    dbArgument = args[index + 1];
    if (!dbArgument || dbArgument.startsWith("--")) {
      throw new Error("--db requiere la ruta de una base SQLite");
    }
    index += 1;
  } else if (args[index].startsWith("--")) {
    throw new Error(`Opción no reconocida: ${args[index]}`);
  } else {
    positional.push(args[index]);
  }
}
if (positional.length > 1) throw new Error("Indique como máximo una ruta CSV");
const csvPath = path.resolve(root, positional[0] ?? "scripts/az7dbkeys.csv");
const dbPath = path.resolve(
  root,
  dbArgument ?? process.env.DELTACORE_SQLITE_PATH ?? "apps/backend/data/deltacore.db",
);

if (!existsSync(csvPath) || !existsSync(dbPath)) {
  console.error("Uso: npm run update:dictionary-keys -- [<az7dbkeys.csv>] [--db <deltacore.db>] [--dry-run]");
  process.exit(1);
}

const definitions = parseKeyCsv(readFileSync(csvPath, "utf8"));
const db = dryRun
  ? new DatabaseSync(dbPath, { readOnly: true })
  : new DatabaseSync(dbPath);
const columns = db.prepare(
  `SELECT d.id AS dictionaryId, UPPER(d.table_name) AS tableName,
          UPPER(c.column_name) AS columnName, c.sort_order AS sortOrder
   FROM biz_data_dictionaries d
   JOIN biz_data_dictionary_columns c ON c.dictionary_id = d.id
   ORDER BY UPPER(d.table_name), c.sort_order, UPPER(c.column_name)`,
).all();
const dictionaries = new Map();
for (const column of columns) {
  const dictionary = dictionaries.get(column.dictionaryId) ?? {
    id: column.dictionaryId,
    table: column.tableName,
    columns: [],
  };
  dictionary.columns.push({ name: column.columnName, sortOrder: column.sortOrder });
  dictionaries.set(column.dictionaryId, dictionary);
}

const dictionariesByTable = new Map();
for (const dictionary of dictionaries.values()) {
  if (dictionariesByTable.has(dictionary.table)) {
    throw new Error(`Hay más de un diccionario local para ${dictionary.table}. No se aplicaron cambios.`);
  }
  dictionariesByTable.set(dictionary.table, dictionary);
}

const plan = [];
const missingColumns = [];
let csvTablesMatched = 0;
let fallbackTables = 0;
let plannedKeyColumns = 0;

for (const dictionary of dictionaries.values()) {
  const csvKeys = definitions.get(dictionary.table);
  let keys;
  if (csvKeys) {
    csvTablesMatched += 1;
    const availableColumns = new Set(dictionary.columns.map((column) => column.name));
    const absent = [...csvKeys.keys()].filter((name) => !availableColumns.has(name));
    if (absent.length) {
      missingColumns.push(`${dictionary.table}: ${absent.join(", ")}`);
      continue;
    }
    keys = [...csvKeys.entries()]
      .map(([name, keyOrder]) => ({ name, keyOrder }))
      .sort((left, right) => left.keyOrder - right.keyOrder);
  } else {
    fallbackTables += 1;
    keys = [...dictionary.columns]
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
      .map((column, index) => ({ name: column.name, keyOrder: index + 1 }));
  }
  plannedKeyColumns += keys.length;
  plan.push({ dictionary, keys });
}

const csvTablesWithoutDictionary = [...definitions.keys()]
  .filter((table) => !dictionariesByTable.has(table));

if (missingColumns.length) {
  db.close();
  console.error("Columnas de PK del CSV ausentes en diccionarios locales:");
  for (const missing of missingColumns) console.error(`  ${missing}`);
  console.error("No se aplicaron cambios. Actualiza primero esos diccionarios.");
  process.exit(1);
}

console.log(`CSV: ${path.resolve(csvPath)}`);
console.log(`SQLite: ${dbPath}`);
console.log(`Tablas con PK definidas en CSV y diccionario local: ${csvTablesMatched}`);
console.log(`Tablas sin definición en CSV, todas sus columnas serán PK: ${fallbackTables}`);
console.log(`Tablas del CSV sin diccionario local (omitidas): ${csvTablesWithoutDictionary.length}`);
console.log(`Columnas que quedarán marcadas como PK: ${plannedKeyColumns}`);

if (dryRun) {
  db.close();
  console.log("Dry run: no se modificó la base de datos.");
  process.exit(0);
}

const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const backupPath = `${dbPath}.bak.${timestamp}`;
copyFileSync(dbPath, backupPath);

const clearKeys = db.prepare(
  "UPDATE biz_data_dictionary_columns SET is_key = 0, key_order = NULL WHERE dictionary_id = ?",
);
const setKey = db.prepare(
  `UPDATE biz_data_dictionary_columns
   SET is_key = 1, key_order = ?
   WHERE dictionary_id = ? AND UPPER(column_name) = ?`,
);

try {
  db.exec("BEGIN IMMEDIATE");
  for (const { dictionary, keys } of plan) {
    clearKeys.run(dictionary.id);
    for (const key of keys) {
      const result = setKey.run(key.keyOrder, dictionary.id, key.name);
      if (result.changes !== 1) {
        throw new Error(`No se pudo actualizar ${dictionary.table}.${key.name}`);
      }
    }
  }
  const actualKeyColumns = db.prepare(
    "SELECT COUNT(*) AS count FROM biz_data_dictionary_columns WHERE is_key = 1",
  ).get().count;
  if (actualKeyColumns !== plannedKeyColumns) {
    throw new Error(`Validación posterior fallida: esperadas ${plannedKeyColumns} PK, encontradas ${actualKeyColumns}`);
  }
  db.exec("COMMIT");
  console.log(`Actualización aplicada. Columnas PK verificadas: ${actualKeyColumns}`);
  console.log(`Respaldo: ${backupPath}`);
} catch (error) {
  db.exec("ROLLBACK");
  console.error(`Actualización revertida: ${error instanceof Error ? error.message : String(error)}`);
  console.error(`Respaldo conservado: ${backupPath}`);
  process.exitCode = 1;
} finally {
  db.close();
}

function parseKeyCsv(text) {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  const header = rows.shift()?.map((value) => value.trim().toUpperCase());
  const expectedHeader = ["TABLA_NAME", "COLUMN_NAME", "NUMBER_SECUENCE_KEY"];
  if (!header || expectedHeader.some((name, index) => header[index] !== name)) {
    throw new Error(`Cabecera CSV inválida. Se esperaba: ${expectedHeader.join(",")}`);
  }

  const definitions = new Map();
  for (const [index, row] of rows.entries()) {
    if (row.length !== 3) throw new Error(`Línea CSV ${index + 2}: se esperaban 3 columnas`);
    const [tableValue, columnValue, orderValue] = row.map((value) => value.trim());
    const table = tableValue.toUpperCase();
    const column = columnValue.toUpperCase();
    const keyOrder = Number(orderValue);
    if (!table || !column || !Number.isSafeInteger(keyOrder) || keyOrder < 1) {
      throw new Error(`Línea CSV ${index + 2}: tabla, columna o secuencia inválida`);
    }
    const keys = definitions.get(table) ?? new Map();
    if (keys.has(column) && keys.get(column) !== keyOrder) {
      throw new Error(`Línea CSV ${index + 2}: definición duplicada para ${table}.${column}`);
    }
    for (const [otherColumn, otherOrder] of keys) {
      if (otherColumn !== column && otherOrder === keyOrder) {
        throw new Error(`Línea CSV ${index + 2}: secuencia ${keyOrder} duplicada en ${table}`);
      }
    }
    keys.set(column, keyOrder);
    definitions.set(table, keys);
  }
  return definitions;
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("CSV termina dentro de un campo entrecomillado");
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((value) => value.trim())) rows.push(row);
  }
  return rows;
}