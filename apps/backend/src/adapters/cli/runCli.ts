import type { JobResult } from "@deltacore/shared";
import {
  runRowCompareJob,
  runSchemaCompareJob,
  runVolumeCompareJob,
} from "../../application/CompareJobRunner.js";
import type { BackendRuntime } from "../../composition/createBackendRuntime.js";
import { formatDescribeTable, formatFindTable, formatSchemaList, formatTableList } from "./formatCatalog.js";
import { CLI_HELP, CliUsageError, parseCli } from "./parseCli.js";

export async function runCli(
  argv: string[],
  runtime: BackendRuntime,
  io: { stdout: { write: (s: string) => void }; stderr: { write: (s: string) => void } },
): Promise<number> {
  try {
    const command = parseCli(argv);
    if (command.name === "help") {
      io.stdout.write(CLI_HELP);
      return 0;
    }

    if (command.name === "list-schemas") {
      const payload = await runtime.catalog.listSchemas(command.dsn);
      io.stdout.write(
        command.json
          ? `${JSON.stringify(payload)}\n`
          : formatSchemaList(payload),
      );
      return 0;
    }

    if (command.name === "list-tables" || command.name === "find-table") {
      const payload = await runtime.catalog.listTables(command.dsn, command.tables, {
        allSchemas: command.allSchemas,
      });
      const text =
        command.name === "find-table" || command.tables.length > 0
          ? formatFindTable({ ...payload, queryTables: command.tables })
          : formatTableList(payload);
      io.stdout.write(command.json ? `${JSON.stringify(payload)}\n` : text);
      if (command.name === "find-table" && payload.tables.length === 0) {
        return 1;
      }
      return 0;
    }

    if (command.name === "describe-table") {
      const payload = await runtime.catalog.describeTable(
        command.dsn,
        command.table,
        command.schema,
      );
      io.stdout.write(
        command.json
          ? `${JSON.stringify(payload)}\n`
          : formatDescribeTable(payload),
      );
      return payload.columns.length === 0 ? 1 : 0;
    }

    let result: JobResult;
    if (command.name === "schema-compare") {
      result = await runSchemaCompareJob(runtime.engine, runtime.openConnection, command);
    } else if (command.name === "volume-compare") {
      result = await runVolumeCompareJob(runtime.engine, runtime.openConnection, command);
    } else {
      result = await runRowCompareJob(runtime.engine, runtime.openConnection, command);
    }

    io.stdout.write(
      `${JSON.stringify(result, null, command.json ? undefined : 2)}\n`,
    );
    if (result.status === "ERROR") {
      return 1;
    }
    if (result.status === "DIFFERENCE") {
      return 2;
    }
    return 0;
  } catch (error) {
    if (error instanceof CliUsageError) {
      io.stderr.write(`${error.message}\n\n${CLI_HELP}`);
      return 1;
    }
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message}\n`);
    return 1;
  }
}
