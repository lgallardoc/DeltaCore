import { copyFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let csvArgument;
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
  } else if (csvArgument === undefined) {
    csvArgument = args[index];
  } else {
    throw new Error("Indique como máximo una ruta CSV");
  }
}

const csvPath = path.resolve(root, csvArgument ?? "scripts/az7dbflags.csv");
const dbPath = path.resolve(
  root,
  dbArgument ?? process.env.DELTACORE_SQLITE_PATH ?? "apps/backend/data/deltacore.db",
);
if (!existsSync(csvPath) || !existsSync(dbPath)) {
  console.error("Uso: npm run update:dictionary-flags -- [<az7dbflags.csv>] [--db <deltacore.db>] [--dry-run]");
  process.exit(1);
}

const definitions = parseFlagCsv(readFileSync(csvPath, "utf8"));
const db = dryRun
  ? new DatabaseSync(dbPath, { readOnly: true })
  : new DatabaseSync(dbPath);
db.exec("PRAGMA busy_timeout = 10000");
const tableColumns = db.prepare("PRAGMA table_info(biz_data_dictionary_columns)").all();
if (!tableColumns.some((column) => column.name === "is_flag")) {
  db.close();
  throw new Error("biz_data_dictionary_columns.is_flag no existe; inicializa la aplicación antes de actualizar el diccionario");
}

const localColumns = db.prepare(
  `SELECT d.id AS dictionaryId, UPPER(d.table_name) AS tableName,
          UPPER(c.column_name) AS columnName, c.is_flag AS isFlag
   FROM biz_data_dictionaries d
   JOIN biz_data_dictionary_columns c ON c.dictionary_id = d.id`,
).all();
const localByPair = new Map(
  localColumns.map((column) => [`${column.tableName}\0${column.columnName}`, column]),
);
const updates = [];
const alreadyMarked = [];
const missing = [];
for (const [table, field] of definitions) {
  const local = localByPair.get(`${table}\0${field}`);
  if (!local) {
    missing.push(`${table}.${field}`);
  } else if (Number(local.isFlag) === 1) {
    alreadyMarked.push(`${table}.${field}`);
  } else {
    updates.push({ id: local.dictionaryId, table, field });
  }
}

console.log(`CSV: ${csvPath}`);
console.log(`SQLite: ${dbPath}`);
console.log(`Pares solicitados: ${definitions.length}`);
console.log(`Se marcarán como FLG: ${updates.length}`);
console.log(`Ya estaban marcados: ${alreadyMarked.length}`);
console.log(`Tabla/campo no encontrado (omitido): ${missing.length}`);
for (const pair of missing) console.log(`  ${pair}`);
if (dryRun || updates.length === 0) {
  db.close();
  console.log(dryRun ? "Dry run: no se modificó la base de datos." : "No hay cambios que aplicar.");
  process.exit(0);
}

const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const backupPath = `${dbPath}.bak.${timestamp}`;
const setFlag = db.prepare(
  `UPDATE biz_data_dictionary_columns SET is_flag = 1
   WHERE dictionary_id = ? AND UPPER(column_name) = ? AND COALESCE(is_flag, 0) <> 1`,
);

try {
  db.exec("BEGIN IMMEDIATE");
  copyFileSync(dbPath, backupPath);
  for (const update of updates) {
    const result = setFlag.run(update.id, update.field);
    if (result.changes !== 1) {
      throw new Error(`No se pudo actualizar ${update.table}.${update.field}`);
    }
  }
  db.exec("COMMIT");
  console.log(`Actualización aplicada: ${updates.length} campo(s) marcados como FLG.`);
  console.log(`Respaldo: ${backupPath}`);
} catch (error) {
  db.exec("ROLLBACK");
  console.error(`Actualización revertida: ${error instanceof Error ? error.message : String(error)}`);
  console.error(`Respaldo conservado: ${backupPath}`);
  process.exitCode = 1;
} finally {
  db.close();
}

function parseFlagCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const header = lines.shift()?.split(",").map((value) => value.trim().toUpperCase());
  if (!header || header.length !== 2 || header[0] !== "TABLA" || header[1] !== "CAMPO") {
    throw new Error("Cabecera CSV inválida. Se esperaba: TABLA,CAMPO");
  }
  const definitions = [];
  const seen = new Set();
  for (const [index, line] of lines.entries()) {
    const values = line.split(",").map((value) => value.trim().toUpperCase());
    if (values.length !== 2 || values.some((value) => !/^[A-Z0-9_@$#]+$/.test(value))) {
      throw new Error(`Línea CSV ${index + 2}: tabla/campo inválido`);
    }
    const [table, field] = values;
    const key = `${table}\0${field}`;
    if (seen.has(key)) {
      throw new Error(`Línea CSV ${index + 2}: definición duplicada para ${table}.${field}`);
    }
    seen.add(key);
    definitions.push([table, field]);
  }
  return definitions;
}