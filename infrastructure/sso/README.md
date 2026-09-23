# Keycloak (lab)

Bind address and host port are `KEYCLOAK_BIND_ADDRESS` and
`KEYCLOAK_HTTP_PORT` in the repo-root `.env` (defaults `127.0.0.1:8080`).
Compose maps that endpoint to container port `8080`.

```bash
# from repo root
npm run start:infra
# or
docker compose --env-file ../../.env -f docker-compose.yml up -d
```

Admin console: `http://localhost:${KEYCLOAK_HTTP_PORT}` (`KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`).

Realm import: `deltacore-realm.json`. Redirect URIs are static (`http://localhost:5173`). If `VITE_DEV_PORT` changes, edit the JSON and recreate the container so `--import-realm` runs again.

## Clients

| Client | Type | Purpose | Secret |
| --- | --- | --- | --- |
| `deltacore-frontend-client` | Public, Authorization Code + PKCE S256 | Browser login | Never |

The API validates incoming user JWTs using the issuer's JWKS. It does not use a
client secret.

SPA routes after login: `/compare`, `/dictionary`, `/catalog`, `/jobs`.
