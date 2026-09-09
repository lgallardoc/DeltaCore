import axios from "axios";
import { keycloak } from "./keycloak";

export const apiClient = axios.create({
  baseURL: "/api",
});

apiClient.interceptors.request.use(async (config) => {
  if (keycloak.authenticated && keycloak.isTokenExpired(30)) {
    await keycloak.updateToken(70);
  }
  if (keycloak.token) {
    config.headers.Authorization = `Bearer ${keycloak.token}`;
  }
  return config;
});
