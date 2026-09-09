import { afterEach, describe, expect, it } from "vitest";
import { connectionStringForDsn, ibmCliLibFileName } from "./odbcEnv.js";

describe("connectionStringForDsn", () => {
  const envKeys = [
    "DB2_ODBC_DSN",
    "DB2_NAME",
    "DB2_HOSTNAME",
    "DB2_HOST_PORT",
    "DB2_USER",
    "DB2_PASSWORD",
  ] as const;
  const snapshot = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  );

  afterEach(() => {
    for (const key of envKeys) {
      const value = snapshot[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("builds TCPIP string for the lab DSN", () => {
    process.env.DB2_ODBC_DSN = "AZ7DB";
    process.env.DB2_NAME = "AZ7DB";
    process.env.DB2_HOSTNAME = "127.0.0.1";
    process.env.DB2_HOST_PORT = "50000";
    process.env.DB2_USER = "db2inst1";
    process.env.DB2_PASSWORD = "secret";
    expect(connectionStringForDsn("AZ7DB")).toBe(
      "DATABASE=AZ7DB;HOSTNAME=127.0.0.1;PORT=50000;UID=db2inst1;PWD=secret;PROTOCOL=TCPIP",
    );
  });

  it("uses DSN= for unknown names", () => {
    process.env.DB2_ODBC_DSN = "AZ7DB";
    expect(connectionStringForDsn("OTHER")).toBe("DSN=OTHER;");
  });
});

describe("ibmCliLibFileName", () => {
  it("honors IBM_DB_LIB", () => {
    const prev = process.env.IBM_DB_LIB;
    process.env.IBM_DB_LIB = "libdb2.so";
    expect(ibmCliLibFileName()).toBe("libdb2.so");
    if (prev === undefined) {
      delete process.env.IBM_DB_LIB;
    } else {
      process.env.IBM_DB_LIB = prev;
    }
  });
});
