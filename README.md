<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Project rules

项目协作、业务不变量、UI 规范、测试、数据安全和生产上线要求统一记录在：

- [AGENTS.md](AGENTS.md)：开发和自动化协作时必须遵守的短规约。
- [docs/PROJECT_RULES.md](docs/PROJECT_RULES.md)：完整项目规约和 Definition of Done。
- [docs/UI_DESIGN_RULES.md](docs/UI_DESIGN_RULES.md)：颜色、字号、布局、组件和 UI 验收规则。
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：真实架构、数据流和部署拓扑。

View your app in AI Studio: https://ai.studio/apps/453b1174-1381-468d-9087-8cb9449a90bb

## Run Locally

**Prerequisites:** Node.js, PostgreSQL


1. Install dependencies:
   `npm install`
2. Create a PostgreSQL database and set `DATABASE_URL` in `.env`.
3. Run the API:
   `npm run dev:api`
4. Run the frontend:
   `npm run dev`

## Production Ports

The production API is fixed to port `3001`. Keep these files consistent:

- `.env`: `API_PORT=3001`
- `ecosystem.config.cjs`: PM2 process config
- Nginx site: `/api/` proxies to `http://127.0.0.1:3001`
- `docs/PORTS.md`: server-wide port registry

## Architecture

System architecture, data flow, deployment topology, and maintenance conventions are documented in:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## PostgreSQL

The backend persists business data in PostgreSQL. `data/app-state.json` is no longer the primary database.

Example:

```bash
createdb gpu_erp
export DATABASE_URL="postgresql://localhost:5432/gpu_erp"
npm run dev:api
```

On first startup, if `data/app-state.json` exists, the API imports it into PostgreSQL once. Disable this with:

```bash
POSTGRES_IMPORT_LEGACY_JSON=false
```

## Production backup

Production uses `scripts/pg_backup.sh` from cron. It creates a PostgreSQL custom-format dump, verifies it with `pg_restore --list`, and only then publishes it to the backup directory. Set `BACKUP_RETENTION_DAYS` to control retention (default: 30 days).

Restore testing should be performed against a separate PostgreSQL database; never restore over the live database without a confirmed maintenance plan.
