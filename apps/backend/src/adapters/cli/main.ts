import { createBackendRuntime } from "../../composition/createBackendRuntime.js";
import { runCli } from "./runCli.js";

const code = await runCli(process.argv.slice(2), createBackendRuntime(), {
  stdout: process.stdout,
  stderr: process.stderr,
});
process.exit(code);
