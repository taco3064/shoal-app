const DEFAULT_LOCAL_SERVICE_URL = 'http://127.0.0.1:8787';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function resolveJoinServiceUrl(
  serviceUrl: string,
  locationLike:
    | Pick<Location, 'hostname' | 'protocol'>
    | undefined = typeof window === 'undefined' ? undefined : window.location,
) {
  if (serviceUrl.trim()) {
    return serviceUrl;
  }

  if (
    locationLike
    && locationLike.protocol.startsWith('http')
    && LOCAL_HOSTS.has(locationLike.hostname)
  ) {
    return DEFAULT_LOCAL_SERVICE_URL;
  }

  return '';
}
