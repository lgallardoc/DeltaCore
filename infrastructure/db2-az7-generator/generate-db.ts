import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

interface LibreriaRow {
  Librerías: string;
  Descripción?: string;
}

interface TablaRow {
  Librería: string;
  Tabla: string;
  "Tipo de Tabla": string;
  "Cantidad de Columnas"?: number;
  "Longitud Tabla"?: number;
  Descripción?: string;
}

interface CampoRow {
  Librería: string;
  Tabla: string;
  Campo: string;
  "Tipo de Campo": string;
  Longitud: number;
  "Descripción de Campo"?: string;
}

const EXCEL_FILE = "Catalogo de Datos DB2-AZ7 V1.0.xlsx";
const OUTPUT_DIR = path.join(__dirname, "sql");
const DBNAME = "AZ7DB";
const MOCK_ROWS_PER_TABLE = 5;

function sanitize(val: unknown): string {
  return String(val || "").trim();
}

function mapDb2Type(tipo: string, longitud: number): string {
  const len = Number(longitud) || 10;
  const t = tipo.toUpperCase().trim();

  switch (t) {
    case "CHAR":
      return len > 254 ? `VARCHAR(${Math.min(len, 32672)})` : `CHAR(${len})`;
    case "VARCHAR":
      return `VARCHAR(${Math.min(len, 32672)})`;
    case "NUMERIC":
    case "DECIMAL": {
      const prec = Math.min(Math.max(len, 1), 31);
      return `DECIMAL(${prec}, 0)`;
    }
    case "INTEGER":
      return "INTEGER";
    case "DATE":
      return "DATE";
    case "TIME":
      return "TIME";
    case "TIMESTMP":
      return "TIMESTAMP";
    default:
      return "VARCHAR(100)";
  }
}

function generateRandomValue(tipo: string, longitud: number, rowIndex: number): string {
  const len = Number(longitud) || 10;
  const t = tipo.toUpperCase().trim();

  switch (t) {
    case "CHAR":
    case "VARCHAR": {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      const effectiveLen = Math.min(len, 12);
      let val = "";
      for (let i = 0; i < effectiveLen; i++) {
        val += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return `'${val}'`;
    }
    case "NUMERIC":
    case "DECIMAL": {
      const maxVal = Math.pow(10, Math.min(len, 9)) - 1;
      const num = Math.floor(Math.random() * maxVal) + 1;
      return `${num}`;
    }
    case "INTEGER":
      return `${rowIndex * 10 + Math.floor(Math.random() * 9) + 1}`;
    case "DATE": {
      const year = 2024 + Math.floor(Math.random() * 3);
      const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
      const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
      return `'${year}-${month}-${day}'`;
    }
    case "TIME": {
      const hour = String(Math.floor(Math.random() * 24)).padStart(2, "0");
      const min = String(Math.floor(Math.random() * 60)).padStart(2, "0");
      const sec = String(Math.floor(Math.random() * 60)).padStart(2, "0");
      return `'${hour}.${min}.${sec}'`;
    }
    case "TIMESTMP": {
      const year = 2024 + Math.floor(Math.random() * 3);
      const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
      const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
      return `'${year}-${month}-${day}-12.00.00.000000'`;
    }
    default:
      return `'TEST'`;
  }
}

function run(): void {
  const excelPath = path.join(__dirname, EXCEL_FILE);
  if (!fs.existsSync(excelPath)) {
    throw new Error(
      `No se encontró ${EXCEL_FILE} en ${__dirname}. Copiá el catálogo Excel a esa ruta.`,
    );
  }

  console.log(`Abriendo ${EXCEL_FILE}...`);
  const workbook = XLSX.readFile(excelPath);

  const sheetLibs = XLSX.utils.sheet_to_json<LibreriaRow>(
    workbook.Sheets["1.Librerias"],
  );
  const librerias = sheetLibs.map((r) => sanitize(r["Librerías"])).filter(Boolean);
  console.log(`Librerías identificadas (${librerias.length}):`, librerias);

  const sheetTabs = XLSX.utils.sheet_to_json<TablaRow>(
    workbook.Sheets["2.Tablas_Vistas_DB2_AZ7"],
  );
  const physicalTables = new Set<string>();
  sheetTabs.forEach((r) => {
    const lib = sanitize(r["Librería"]);
    const tabla = sanitize(r["Tabla"]);
    const tipo = sanitize(r["Tipo de Tabla"]).toUpperCase();
    if (librerias.includes(lib) && tipo === "FISICO" && tabla) {
      physicalTables.add(`${lib}.${tabla}`);
    }
  });
  console.log(`Tablas físicas encontradas en hoja 2: ${physicalTables.size}`);

  const sheetCols = XLSX.utils.sheet_to_json<CampoRow>(
    workbook.Sheets["4.Definicion de Campos_AZ7"],
  );
  const tablesMap = new Map<string, { lib: string; tabla: string; cols: CampoRow[] }>();

  sheetCols.forEach((r) => {
    const lib = sanitize(r["Librería"]);
    const tabla = sanitize(r["Tabla"]);
    const campo = sanitize(r["Campo"]);
    const tipo = sanitize(r["Tipo de Campo"]);
    const long = Number(r["Longitud"]) || 10;
    const key = `${lib}.${tabla}`;

    if (physicalTables.has(key) && campo && tipo) {
      if (!tablesMap.has(key)) {
        tablesMap.set(key, { lib, tabla, cols: [] });
      }
      tablesMap.get(key)!.cols.push({
        Librería: lib,
        Tabla: tabla,
        Campo: campo,
        "Tipo de Campo": tipo,
        Longitud: long,
      });
    }
  });

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const ddlLines: string[] = [];
  ddlLines.push(`-- Script de Generacion DDL - Db2 AZ7`);
  ddlLines.push(`CONNECT TO ${DBNAME};\n`);

  for (const lib of librerias) {
    ddlLines.push(`CREATE SCHEMA "${lib}";`);
  }
  ddlLines.push("");

  for (const [key, tData] of tablesMap.entries()) {
    ddlLines.push(`-- Tabla: ${key}`);
    ddlLines.push(`CREATE TABLE "${tData.lib}"."${tData.tabla}" (`);

    const colDefs = tData.cols.map((c) => {
      const db2Type = mapDb2Type(c["Tipo de Campo"], c["Longitud"]);
      return `    "${c["Campo"]}" ${db2Type}`;
    });

    ddlLines.push(colDefs.join(",\n"));
    ddlLines.push(`);\n`);
  }

  ddlLines.push(`COMMIT;`);
  ddlLines.push(`CONNECT RESET;`);

  const ddlFile = path.join(OUTPUT_DIR, "01_create_schema.sql");
  fs.writeFileSync(ddlFile, ddlLines.join("\n"), "utf8");
  console.log(`DDL generado exitosamente en: ${ddlFile} (${tablesMap.size} tablas)`);

  const dmlLines: string[] = [];
  dmlLines.push(`-- Script de Carga de Datos Aleatorios - Db2 AZ7`);
  dmlLines.push(`CONNECT TO ${DBNAME};\n`);

  let totalInserts = 0;
  for (const [key, tData] of tablesMap.entries()) {
    const colNames = tData.cols.map((c) => `"${c["Campo"]}"`).join(", ");

    for (let rowIdx = 1; rowIdx <= MOCK_ROWS_PER_TABLE; rowIdx++) {
      const values = tData.cols
        .map((c) => generateRandomValue(c["Tipo de Campo"], c["Longitud"], rowIdx))
        .join(", ");

      dmlLines.push(
        `INSERT INTO "${tData.lib}"."${tData.tabla}" (${colNames}) VALUES (${values});`,
      );
      totalInserts++;
    }
  }

  dmlLines.push(`COMMIT;`);
  dmlLines.push(`CONNECT RESET;`);

  const dmlFile = path.join(OUTPUT_DIR, "02_insert_mock_data.sql");
  fs.writeFileSync(dmlFile, dmlLines.join("\n"), "utf8");
  console.log(`DML generado exitosamente en: ${dmlFile} (${totalInserts} inserts generados)`);
}

run();
