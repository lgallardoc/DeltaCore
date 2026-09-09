import { describe, expect, it, vi } from "vitest";
import type { BackendRuntime } from "../../composition/createBackendRuntime.js";
import { runCli } from "./runCli.js";

describe("runCli", () => {
  it("prints help and exits 0", async () => {
    const stdout: string[] = [];
    const code = await runCli(["help"], {} as BackendRuntime, {
      stdout: { write: (s) => void stdout.push(s) },
      stderr: { write: vi.fn() },
    });
    expect(code).toBe(0);
    expect(stdout.join("")).toContain("schema-compare");
  });
});
