const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function endpointURL(value, origin) {
  if (!String(value || '').trim()) return null;
  try {
    const url = new URL(String(value).trim(), origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    url.search = '';
    return url;
  } catch { return null; }
}

/** Local play always uses the local authority; a public page needs explicit configuration. */
export function resolveWarConnection({ location, configuredEndpoint = '' }) {
  const params = new URLSearchParams(location.search || '');
  if (params.has('crewqa')) return { endpoint: '', mode: 'qa' };
  const localPage = LOOPBACK_HOSTS.has(String(location.hostname).toLowerCase());
  const selected = localPage
    ? params.get('server') || `${location.origin}/war-api`
    : configuredEndpoint;
  const url = endpointURL(selected, location.origin);
  if (!url) return { endpoint: '', mode: 'unconfigured' };
  return {
    endpoint: url.href.replace(/\/$/, ''),
    mode: LOOPBACK_HOSTS.has(url.hostname.toLowerCase()) ? 'local' : 'remote',
  };
}
