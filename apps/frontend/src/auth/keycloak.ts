import Keycloak from "keycloak-js";
import { keycloakConfig } from "./keycloakConfig";

export const keycloak = new Keycloak({
  url: keycloakConfig.url,
  realm: keycloakConfig.realm,
  clientId: keycloakConfig.clientId,
});

let initPromise: Promise<boolean> | null = null;

export function initKeycloak(): Promise<boolean> {
  if (!initPromise) {
    initPromise = keycloak.init({
      onLoad: "check-sso",
      silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
      pkceMethod: "S256",
      checkLoginIframe: false,
    });
  }
  return initPromise;
}
