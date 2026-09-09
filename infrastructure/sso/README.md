# Keycloak (lab)

Host port: `KEYCLOAK_HTTP_PORT` in the repo-root `.env` (default `8080`). Compose maps that port to container `8080`.

```bash
# from repo root
npm run start:infra
# or
docker compose --env-file ../../.env -f docker-compose.yml up -d
```

Admin console: `http://localhost:${KEYCLOAK_HTTP_PORT}` (`KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`).

Realm import: `deltacore-realm.json`. Redirect URIs are static (`http://localhost:5173`). If `VITE_DEV_PORT` changes, edit the JSON and recreate the container so `--import-realm` runs again.

SPA routes after login: `/compare`, `/dictionary`, `/catalog`, `/jobs`.
