# Security Policy

Metrika is a **local-first** desktop application for Windows. The primary assets are the SQLite database on the user’s disk and access to the app windows on that machine.

## Supported versions

| Version | Supported |
| --- | --- |
| 0.5.x (Home) | Yes — current development line |
| Older local builds | Best-effort only; please reproduce on 0.5.x when possible |

## Threat model (summary)

| Risk | Mitigation / boundary |
| --- | --- |
| Data leaving via “the cloud” | Daily use does not require an account or hosted server |
| Arbitrary code from the UI | Renderer talks through a narrow preload bridge — no full Node/`fs` in the page |
| Accidental data loss | Full DB export/import; automatic safety copy before import |
| Local network exposure | Optional local APIs (MIAPI, CRM remote) bind only when enabled, on that host, under the operator’s control |

## What Metrika is not

- Not a certified EDO / УКЭП operator or signing appliance.
- Not a disk-encryption product — BitLocker (or equivalent) is an OS responsibility.
- Not a replacement for Windows domain / enterprise access policy.

## Reporting a vulnerability

Please **do not** open a public issue with a working exploit.

1. Prefer a private [GitHub Security Advisory](https://github.com/krwg/metrika/security/advisories/new) for this repository, or contact the maintainer via [krwg](https://github.com/krwg).
2. Include:
   - Metrika version (`package.json` / About in-app)
   - OS build
   - Steps to reproduce
   - Impact (confidentiality, integrity, availability)
3. Allow reasonable time for a fix before public disclosure.

We will acknowledge reports and aim to ship a fix or clear mitigation notes for the supported 0.5.x line.

## Data location

| Item | Path (Windows) |
| --- | --- |
| Application database | `%APPDATA%\metrika\metrika.db` |
| Import safety copies | `backups` next to the app data directory |

For critical inventory, keep backups on separate media — not only on the working disk.
