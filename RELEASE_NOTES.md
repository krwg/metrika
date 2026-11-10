# Metrika Home [0.5]

**First public release** · Windows · Free & open source ([GPL-3.0](LICENSE))

Your warehouse, on your PC — no cloud account, no monthly subscription, no demo users.

---

## Overview

**Metrika Home** is a desktop inventory app for people who keep real parts on real shelves.

Scan a barcode, put the item in a bin, find it again in seconds. Build kits from a bill of materials. See what is running low before you run out. Everything stays in a local database on your computer — Metrika works offline by design.

Home [0.5] is the first public edition: ready for workshops, labs, small warehouses, and home component stores.

| If you… | Metrika helps you… |
| --- | --- |
| Run a workshop or lab | Keep modules, cables, and spares findable |
| Assemble products to order | Reserve parts, pick by cell, finish the kit |
| Buy in small batches | Plan replenishment from real usage |
| Prefer local tools | Work without signing up or syncing to the cloud |

## What’s in this build

- **Empty first launch** — the organization list starts blank; nothing is pre-seeded  
- **Your administrator** — when you add an organization you set name, login, and password yourself  
- **New Metrika Home icon** — shortcut, taskbar, tray, and installer use the same mark  
- **Installer naming** — product **Metrika Home**, file `Metrika-Home-Setup-0.5.0.exe`, English install path  
- Full local warehouse contour: catalog, bins, scanner receive, stocktake, assembly, CSV, labels, backup  

## What you can do

### Know what you have — and where it is
Build a catalog with barcodes, SKUs, and categories. Map a warehouse into bins. Open the storage map and see which cells are full, empty, or nearly full.

### Put stock away with a scanner
Scan the item, scan the bin — in either order — and Metrika adds one piece and writes the move. Receive, issue, and transfer stock without digging through menus.

### Count and correct
Walk the aisles, enter what you see, and fix differences against the books in one pass.

### Assemble without chaos
Create an order, attach a parts list, reserve stock in the right cells, pick with a handheld terminal flow, then write off the kit when the job is done.

### Buy smarter
Track suppliers and purchase orders, see partial deliveries, and export a replenishment plan based on recent usage.

### Stay in control of your data
Import items from CSV. Print labels. Export a full backup before you experiment. Your inventory file lives on your machine.

### Work as a small team (on one PC)
Organizations, users, and roles are available when more than one person uses the same workplace — still local, still offline-first.

<p align="center">
  <img src="https://raw.githubusercontent.com/krwg/metrika/v0.5.0/docs/assets/readme/logo.png" alt="Metrika Home icon" width="96" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/krwg/metrika/v0.5.0/docs/assets/readme/preview-overview.svg" alt="Metrika overview" width="720" />
</p>
<p align="center"><sub>Overview — stock at a glance and everyday operations</sub></p>

<p align="center">
  <img src="https://raw.githubusercontent.com/krwg/metrika/v0.5.0/docs/assets/readme/preview-locations.svg" alt="Metrika storage map" width="720" />
</p>
<p align="center"><sub>Storage — address map of bins and zones</sub></p>

<p align="center">
  <img src="https://raw.githubusercontent.com/krwg/metrika/v0.5.0/docs/assets/readme/preview-assembly.svg" alt="Metrika assembly project" width="720" />
</p>
<p align="center"><sub>Projects — parts list, availability, and reserves</sub></p>

## Get Metrika Home

1. Download **[Metrika-Home-Setup-0.5.0.exe](https://github.com/krwg/metrika/releases/download/v0.5.0/Metrika-Home-Setup-0.5.0.exe)** (~81 MB).  
2. Install and open **Metrika Home**.  
3. Click **Add…**, create an organization, and set **your** administrator (name, login, password).  
4. Create a warehouse and a few bins.  
5. Add items (manually or via CSV).  
6. Optionally connect a USB barcode scanner in Settings.

**First useful hour:** map one shelf → import or create 20 items → scan item + bin to place stock → open Overview and confirm counts.

Windows may show a SmartScreen warning on first launch (the installer is not code-signed yet). Choose *More info* → *Run anyway* if you trust the download from this GitHub release.

If you already installed an earlier 0.5 build on this PC and still see old sample organizations, delete `%APPDATA%\metrika` and start again — that folder is local user data, not shipped inside the EXE.

<details>
<summary>Optional: verify the download (SHA-256)</summary>

`2585202ab7cbef0517cf97fe3360a12e2810801fb231600fc07dfc2663c75465`

</details>

## Good to know

- Available for **Windows 10 and 11** in this release.  
- Interface: **Russian and English**.  
- Data stays on your PC — ideal when you do not want inventory in someone else’s cloud.  
- Browser preview: **[online demo](https://krwg.github.io/metrika/demo/)** (catalog, bins, scan-to-place). The desktop app remains the full product.  
- Guides: [Getting started](https://github.com/krwg/metrika/blob/v0.5.0/docs/GETTING_STARTED.md) · [User guide](https://github.com/krwg/metrika/blob/v0.5.0/docs/USER_GUIDE.md)

## What’s next

- Smoother first-run experience (empty warehouse → first receive in minutes)  
- Better scanner device profiles  
- Polished updates and installer experience  
- Richer browser demo and onboarding polish  
- Richer printouts and optional tools for connecting other systems — without forcing the cloud

## License

Metrika is free software under the [GNU GPL v3](LICENSE): use it, share it, and improve it.

Questions and ideas → [GitHub Issues](https://github.com/krwg/metrika/issues) · Maintainer: [krwg](https://github.com/krwg)
