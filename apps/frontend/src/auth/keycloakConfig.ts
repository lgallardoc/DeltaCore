export const keycloakConfig = {
  url: import.meta.env.VITE_KEYCLOAK_URL ?? "http://localhost:8080",
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? "DeltaCoreRealm",
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? "deltacore-frontend-client",
};
