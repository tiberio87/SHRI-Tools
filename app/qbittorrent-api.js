'use strict';

// WebAPI 2.16.0 (qBittorrent 5.3+) replaces skip_checking with seedMode.
// Checking the WebAPI version avoids assuming application-version mappings.
function getQbitSeedingParameterName(webApiVersion) {
  const version = String(webApiVersion || '').trim();
  const match = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(version);
  if (!match) {
    throw new Error(`Versione WebAPI qBittorrent non riconosciuta: "${version}".`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 2 || (major === 2 && minor >= 16)
    ? 'seedMode'
    : 'skip_checking';
}

module.exports = { getQbitSeedingParameterName };
