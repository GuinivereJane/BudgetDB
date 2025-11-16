# Repository Guidelines

## Project Structure & Module Organization
`backend/` (Express + TypeORM) ingests PDFs and exposes the `/api` routes defined in `src/index.ts`; entities live in `src/entities/` and the parser logic in `src/parsers/`. `frontend/` (Vite + React) renders the upload workflow under `src/`, with entrypoints `main.tsx` and `App.tsx`. Compose everything via `docker-compose.yml`, overriding service settings through `.env` files instead of editing the manifest. Build output lands in each package’s `dist/` directory and should remain ignored.

## Build, Test, and Development Commands
Install dependencies with `npm install` inside `backend/` and `frontend/`. Use `npm run dev` in each folder for hot reload (backend on :8000, frontend on :5173). Run `npm run build` to emit production bundles, then `npm start` (backend) or `npm run preview` (frontend) for type-safe smoke tests. For a production-like stack, execute `docker-compose up --build` from the repo root.

## Coding Style & Naming Conventions
Use TypeScript + ES modules with two-space indentation and single quotes (see `backend/src/index.ts`). Keep React components and TypeORM entities in `PascalCase`, helper functions in `camelCase`, and split code by responsibility (`entities/Statement.ts`, `parsers/rbcStatementParser.ts`). Prefer typed interfaces over `any`, rely on async/await, and run `tsc --noEmit` before opening a PR; formatting is manual, so avoid noisy whitespace changes.

## Testing Guidelines
Rely on manual verification today: check `GET /api/health`, upload a sample PDF via the UI or `curl -F file=@sample.pdf http://localhost:8000/api/statements/upload`, and confirm `GET /api/statements` plus `/api/statements/monthly` reflect the new data. When altering parsing rules, test one inflow and one outflow and compare the UI totals against the statement. Place any new automated tests beside the code (`parsers/__tests__/…`) and call out coverage in your PR description.

## Commit & Pull Request Guidelines
Match the short, imperative commit style already in history (e.g., `Fix backend TypeScript build`). Keep commits focused and note schema changes or data resets in the body where applicable. PRs should state the problem, summarize the solution, list test commands + outcomes, link issues, and attach UI screenshots when visuals change. Never upload real statements; rely on sanitized or synthetic PDFs.

## Security & Configuration Tips
Load secrets from `.env` files consumed by `backend/src/config.ts` and keep them out of git. Ensure `DATABASE_URL`, `ALLOWED_ORIGINS`, and `VITE_API_BASE_URL` agree across services, and call out port or origin changes in your PR. Redact account numbers or personal identifiers before sharing console output or logs.
