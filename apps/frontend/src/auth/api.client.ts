import axios from "axios";
import { keycloak } from "./keycloak";

const httpPrefix = import.meta.env.VITE_HTTP_PREFIX?.replace(/\/$/, "") ?? "";

export const apiClient = axios.create({
  baseURL: `${httpPrefix}/api`,
});

apiClient.interceptors.request.use(async (config) => {
  if (keycloak.authenticated) {
    await keycloak.updateToken(70);
  }
  if (keycloak.token) {
    config.headers.Authorization = `Bearer ${keycloak.token}`;
  }
  return config;
});
