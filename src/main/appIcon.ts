import { app, nativeImage } from 'electron';
import fs from 'fs';
import path from 'path';

export function resolveAppIconPath(...candidates: string[]) {
  const roots = [
    path.join(app.getAppPath(), 'build'),
    path.join(process.resourcesPath || '', 'build'),
    path.join(__dirname, '../../build'),
    path.join(process.cwd(), 'build'),
  ];
  for (const root of roots) {
    for (const name of candidates) {
      const full = path.join(root, name);
      if (fs.existsSync(full)) return full;
    }
  }
  return null;
}

export function loadAppIcon(preferTray = false) {
  const candidates = preferTray
    ? ['icon-tray.png', 'icon.png', 'icon.ico']
    : ['icon.ico', 'icon.png', 'icon-tray.png'];
  const iconPath = resolveAppIconPath(...candidates);
  if (!iconPath) return nativeImage.createEmpty();
  const icon = nativeImage.createFromPath(iconPath);
  if (preferTray && !icon.isEmpty() && (icon.getSize().width > 32 || icon.getSize().height > 32)) {
    return icon.resize({ width: 16, height: 16, quality: 'best' });
  }
  return icon;
}
