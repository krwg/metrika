# GitHub Release metadata — Home [0.5]

| Field | Value |
| --- | --- |
| **Title** | Metrika Home [0.5] — First Public Release |
| **Tag** | `v0.5.0` |
| **Target** | `main` |
| **Prerelease** | No — first official public baseline of the Home line |
| **Latest** | Yes |
| **Canonical notes** | [RELEASE_NOTES.md](../RELEASE_NOTES.md) (English) |
| **Russian notes** | [RELEASE_NOTES.ru.md](../RELEASE_NOTES.ru.md) |
| **Changelog** | [CHANGELOG.md](../CHANGELOG.md) |

## Recommended assets

| Asset | Notes |
| --- | --- |
| `Metrika-Home-Setup-0.5.0.exe` | Windows NSIS installer (x64), unsigned |
| `Metrika-Home-Setup-0.5.0.exe.blockmap` | electron-builder blockmap (optional) |
| `Metrika-Home-Setup-0.5.0.sha256` | SHA-256 of the installer (`docs/assets/readme/`) |
| Source archive | GitHub auto-generated from tag `v0.5.0` |

No macOS / Linux packages in this release.

## First-run contract

- Fresh install opens an empty organization list.
- Creating an organization requires the user to set administrator name, login, and password.
- `%APPDATA%\metrika\` holds local registry/warehouse data and is not packaged inside the installer.
