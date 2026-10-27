export type Route =
  | { name: 'welcome' }
  | { name: 'settings' }
  | { name: 'home'; repo: string }
  | { name: 'note'; repo: string; id: string; hash: string }
  | { name: 'graph'; repo: string; mode: string; depth: number; from?: string }
  | { name: 'practice'; repo: string; scope: string };

export function parseLocation(loc: Pick<Location, 'pathname' | 'search' | 'hash'> = location): Route {
  const q = new URLSearchParams(loc.search);
  if (loc.pathname === '/settings') return { name: 'settings' };
  const m = /^\/r\/([a-z0-9-]+)(\/.*)?$/.exec(loc.pathname);
  if (!m) return { name: 'welcome' };
  const repo = m[1] ?? '';
  const rest = m[2] ?? '';
  const note = /^\/n\/([a-z0-9.-]+)\/?$/.exec(rest);
  if (note) return { name: 'note', repo, id: note[1] ?? '', hash: decodeURIComponent(loc.hash.replace(/^#/, '')) };
  if (rest === '/graph') return { name: 'graph', repo, mode: q.get('mode') ?? 'global', depth: Math.min(3, Math.max(1, Number(q.get('depth')) || 1)), from: q.get('from') ?? undefined };
  if (rest === '/practice') return { name: 'practice', repo, scope: q.get('scope') ?? 'all' };
  return { name: 'home', repo };
}

type Listener = (route: Route, previous: Route | undefined) => void;
let listener: Listener | undefined;
let last: Route | undefined;

function emit(): void {
  const route = parseLocation();
  const previous = last;
  last = route;
  listener?.(route, previous);
}

export function startRouter(fn: Listener): void {
  listener = fn;
  window.addEventListener('popstate', emit);
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest('a');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith('/content/') || url.pathname.startsWith('/api/')) return;
    e.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  });
  emit();
}

export function navigate(path: string, replace = false): void {
  const url = new URL(path, location.href);
  const target = url.pathname + url.search + url.hash;
  if (target !== location.pathname + location.search + location.hash) {
    if (replace) history.replaceState(null, '', target);
    else history.pushState(null, '', target);
  }
  emit();
}
