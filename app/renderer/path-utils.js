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
  // Compare paths using a canonical separator so the prefix match works on any
  // platform, but reconstruct the result preserving the native separators of the
  // original paths (Linux keeps '/', Windows keeps '\\'). normalizePathValue must
  // not be used for reconstruction or it would corrupt POSIX paths into backslash
  // paths that no longer exist on disk.
  const toCanonical = (input) => String(input || '').replace(/\\/g, '/');
  const canonValue = toCanonical(value);
  const canonFrom = toCanonical(folderFrom);
  const valueLower = canonValue.toLowerCase();
  const fromLower = canonFrom.toLowerCase();

  if (valueLower === fromLower) {
    return folderTo;
  }

  const prefix = fromLower.endsWith('/') ? fromLower : `${fromLower}/`;
  if (!valueLower.startsWith(prefix)) {
    return value;
  }

  // canonValue and value have the same length (1:1 separator swap), so slicing the
  // original value at the prefix length yields the remainder with native separators.
  const remainder = value.slice(prefix.length);
  const separator = folderTo.includes('\\') && !folderTo.includes('/') ? '\\' : '/';
  const base = folderTo.replace(/[\\/]+$/, '');
  return `${base}${separator}${remainder}`;
}

export function stripExtension(name) {
  return String(name || '').replace(/\.[^/.]+$/, '');
}
