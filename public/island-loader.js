// Island lazy loader. Attached globally on every page. Any element with
// `data-island="<name>"` becomes an activation trigger; the matching
// module at /islands/<name>.js is dynamically imported on first click
// and its `mount(container, props)` runs. Props come from `data-*`
// attributes (data-island → removed; all other data-* become props).
//
// Island modules are bundled from public/islands/*.ts via esbuild at
// build time (see scripts/build/islands.js). Each module exports a
// named `mount` function. Teardown is not needed here — native <dialog>
// close removes the content from view; memory reclaim happens when the
// page unloads.

(() => {
  // Cache key for the island bundles, carried on this script's own URL by the
  // build. Cloudflare Pages pins `.js` to its own four-hour max-age and
  // `_headers` cannot lower it, so without a version in the URL a code deploy
  // would keep serving the previous bundle from the shared edge cache long
  // after it shipped. `import.meta.url` is the tag's src, query and all, so no
  // extra global or inline script is needed to pass it in.
  const V = (() => {
    try {
      const v = new URL(import.meta.url).searchParams.get('v');
      return v ? `?v=${encodeURIComponent(v)}` : '';
    } catch {
      return '';
    }
  })();
  const islandUrl = (name) => `/islands/${name}.js${V}`;

  // Track triggers whose mount is currently in flight (prevents double-
  // mount on rapid double-click). Once the imported module has run, the
  // trigger is removed so it can be re-clicked after the sheet closes.
  const inFlight = new WeakSet();

  const parseProps = (trigger) => {
    const props = {};
    for (const { name, value } of trigger.attributes) {
      if (!name.startsWith('data-') || name === 'data-island') continue;
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      props[key] = value;
    }
    return props;
  };

  const activate = async (trigger) => {
    if (inFlight.has(trigger)) return;
    inFlight.add(trigger);
    const name = trigger.getAttribute('data-island');
    if (!name || !/^[a-z0-9-]+$/.test(name)) {
      inFlight.delete(trigger);
      return;
    }
    const container = document.createElement('div');
    container.className = 'island-container';
    container.dataset.island = name;
    document.body.appendChild(container);
    try {
      const mod = await import(islandUrl(name));
      mod.mount?.(container, parseProps(trigger));
    } catch (err) {
      console.error(`[island:${name}]`, err);
      container.remove();
    } finally {
      inFlight.delete(trigger);
    }
  };

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest?.('[data-island]');
    if (!trigger) return;
    // Let the browser handle modified clicks (Cmd/Ctrl-click, middle-click,
    // shift-click) so users can still open the underlying href in a new
    // tab/window. Same for non-primary mouse buttons.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    activate(trigger);
  });

  // Programmatic mount. Islands can open another island by dispatching:
  //   document.dispatchEvent(new CustomEvent('zuhd:mount-island', {
  //     detail: { name: 'entity-sheet', props: { id: 'brent' } }
  //   }))
  // This keeps each island standalone — none of them need to reach into
  // the loader directly.
  document.addEventListener('zuhd:mount-island', async (e) => {
    const { name, props } = e.detail || {};
    if (!name || !/^[a-z0-9-]+$/.test(name)) return;
    const container = document.createElement('div');
    container.className = 'island-container';
    container.dataset.island = name;
    document.body.appendChild(container);
    try {
      const mod = await import(islandUrl(name));
      mod.mount?.(container, props || {});
    } catch (err) {
      console.error(`[island:${name}]`, err);
      container.remove();
    }
  });

  // Auto-mount pattern: any `[data-island-auto]` container boots the
  // named island immediately on DOMContentLoaded instead of waiting for
  // a click. Used by the ambient-globe on the homepage.
  const autoMounted = new WeakSet();
  const autoMount = async () => {
    const autos = document.querySelectorAll('[data-island-auto]');
    for (const node of autos) {
      if (autoMounted.has(node)) continue;
      autoMounted.add(node);
      const name = node.getAttribute('data-island-auto');
      if (!name || !/^[a-z0-9-]+$/.test(name)) continue;
      try {
        const mod = await import(islandUrl(name));
        const props = {};
        for (const { name: n, value } of node.attributes) {
          if (!n.startsWith('data-') || n === 'data-island-auto') continue;
          const key = n.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          props[key] = value;
        }
        mod.mount?.(node, props);
      } catch (err) {
        console.error(`[island:${name}]`, err);
        autoMounted.delete(node);
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount, { once: true });
  } else {
    autoMount();
  }

})();
