/**
 * Central site configuration for the Metrika product landing.
 * Change URLs here — do not hardcode across components.
 */
window.METRIKA_SITE = Object.freeze({
  productName: 'Metrika Home',
  version: '0.5.0',
  versionLabel: 'Home [0.5]',
  taglineRu: 'Локальный складской учёт для Windows',
  taglineEn: 'Local warehouse inventory for Windows',
  githubUrl: 'https://github.com/krwg/metrika',
  docsUrl: './USER_GUIDE.md',
  architectureUrl: './ARCHITECTURE.md',
  releasesUrl: 'https://github.com/krwg/metrika/releases/tag/v0.5.0',
  /** Direct Windows installer when published under the release tag */
  downloadUrl: 'https://github.com/krwg/metrika/releases/download/v0.5.0/Metrika-Setup-0.5.0.exe',
  downloadLabel: 'Metrika-Setup-0.5.0.exe',
  platforms: Object.freeze(['windows']),
  /** Interactive UI preview (desktop only) */
  demoUrl: './demo/',
  demoEnabled: true,
  license: 'GPL-3.0',
  author: 'krwg',
  year: 2026,
});
