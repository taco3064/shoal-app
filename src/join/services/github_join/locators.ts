export function encodeLocator(locator: string): string {
  const parts = locator.split('/');

  if (parts.length !== 2 || parts.some((part) => !/^[\w.-]+$/.test(part))) {
    throw new Error('Invalid authoritative repository locator.');
  }

  return parts.map(encodeURIComponent).join('/');
}

export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
