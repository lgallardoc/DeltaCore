# Db2 AZ7 lab

Mock Autoriza7 catalog in Docker Db2 LUW. Ports and credentials come from the **repo-root** `.env` (`DB2_HOST_PORT`, `DB2_CONTAINER_PORT`, `DB2_NAME`, `DB2_PASSWORD`).

```bash
npm install
npm run generate
npm run build:docker
# Prefer from repo root: npm start / npm run start:infra
# Or: npm run up   (reads DB2_* from the environment)
```

Apple Silicon: `--platform linux/amd64`, image `icr.io/db2_community/db2`.
