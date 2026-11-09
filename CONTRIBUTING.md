# Contributing

Thanks for considering a contribution to **Metrika**.

English is the canonical language for repository docs (`README.md`, this file, `SECURITY.md`). Keep `README.ru.md` in sync when you change structure or product claims.

## Before you start

- Read [README.md](README.md) and [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md).
- Prefer a focused change over a large unrelated refactor.
- For warehouse / scanner / onboarding / tests / docs — open a PR.
- For large architecture shifts — open an issue first.

## Setup

Requirements: Windows 10/11, Node.js 20+, npm.

```powershell
git clone https://github.com/krwg/metrika.git
cd metrika
npm install
npm run rebuild
npm run dev
```

`rebuild` is required so native modules (`better-sqlite3`, `serialport`) match Electron.

## Workflow

1. Fork the repo (or create a branch from `main`).
2. Make a focused change.
3. Run the self-tests for the contour you touched:

   ```powershell
   npm run test:crm
   npm run test:miapi
   npm run test:tsd
   # or
   npm run test:all
   ```

4. Open a Pull Request that explains:
   - **Why** the change is needed
   - **How** to verify it
   - Any intentional behavior changes or limits

## Code and PR guidelines

- TypeScript — avoid `any` unless there is a clear reason.
- Match existing UI patterns and themes in `src/renderer/App.css`.
- Do not commit `dist/`, `release/`, `node_modules/`, logs, or local `.db` files.
- Do not include secrets, personal databases, or private working notes (`listtodo`, audit dumps, scratch scripts).
- Keep commits free of credentials and machine-local paths that are not part of the product.

## Good first areas

| Area | Examples |
| --- | --- |
| Warehouse core | Catalog, bins, stock moves, scanner UX |
| Onboarding | Empty warehouse → first receive in minutes |
| Reliability | COM profiles, backups, self-tests |
| Docs | README accuracy, guides, screenshots |

## License

By submitting a contribution, you agree to license it under the [GNU GPL v3](LICENSE).
