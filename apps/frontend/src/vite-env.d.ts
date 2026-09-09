/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_PORT?: string;
  readonly VITE_API_PROXY_TARGET?: string;
  readonly VITE_KEYCLOAK_URL?: string;
  readonly VITE_KEYCLOAK_REALM?: string;
  readonly VITE_KEYCLOAK_CLIENT_ID?: string;
  readonly VITE_DB2_ODBC_DSN?: string;
  readonly VITE_SCHEMA_COMPARE_TABLES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
