export function pad2(value) {
  const num = parseInt(value, 10);
  if (Number.isNaN(num)) {
    return '';
  }
  return String(num).padStart(2, '0');
}

export function sanitizeName(name) {
  return String(name || '')
    .replace(/\?/g, '')
    .replace(/:/g, '')
    .replace(/[<>"/\\|*]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\.+/g, '.')
    .replace(/[. ]+$/g, '')
    .trim();
}

export function getPathBaseName(filePath) {
  const parts = String(filePath || '').split(/[/\\]/);
  return parts[parts.length - 1] || '';
}

export function getParentPath(filePath) {
  const value = String(filePath || '');
  if (!value) {
    return '';
  }
  const separator = value.includes('\\') ? '\\' : '/';
  const parts = value.split(/[/\\]/);
  parts.pop();
  return parts.join(separator);
}

export function normalizePathValue(value) {
  return String(value || '').replace(/\//g, '\\');
}

export function isSamePath(left, right) {
  return normalizePathValue(left).toLowerCase() === normalizePathValue(right).toLowerCase();
}

export function applyFolderRenamePath(value, folderFrom, folderTo) {
  if (!value || !folderFrom || !folderTo) {
    return value;
  }
  const normValue = normalizePathValue(value);
  const normFrom = normalizePathValue(folderFrom);
  const normTo = normalizePathValue(folderTo);
  const valueLower = normValue.toLowerCase();
  const fromLower = normFrom.toLowerCase();

  if (valueLower === fromLower) {
    return normTo;
  }

  const prefix = fromLower.endsWith('\\') ? fromLower : `${fromLower}\\`;
  if (valueLower.startsWith(prefix)) {
    return `${normTo}\\${normValue.slice(prefix.length)}`;
  }
  return value;
}

export function stripExtension(name) {
  return String(name || '').replace(/\.[^/.]+$/, '');
}
