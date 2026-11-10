const path = require('path');
const fs = require('fs');

/** Embed icon.ico into the Windows exe (needed when signAndEditExecutable is false). */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const iconPath = path.join(context.packager.projectDir, 'build', 'icon.ico');

  if (!fs.existsSync(exePath)) {
    console.warn('[afterPack] exe not found:', exePath);
    return;
  }
  if (!fs.existsSync(iconPath)) {
    console.warn('[afterPack] icon not found:', iconPath);
    return;
  }

  const { rcedit } = require('rcedit');
  console.log('[afterPack] embedding icon into', exeName);
  await rcedit(exePath, {
    icon: iconPath,
    'version-string': {
      CompanyName: 'krwg',
      FileDescription: 'Metrika',
      ProductName: 'Metrika',
      InternalName: 'Metrika',
    },
  });
};
