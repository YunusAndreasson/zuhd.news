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
  const v = new URL(import.meta.url).searchParams.get('v');
  const V = v ? `?v=${encodeURIComponent(v)}` : '';
  const islandUrl = (name) => `/islands/${name}.js${V}`;

  // Track triggers whose mount is currently in flight (prevents double-
  // mount on rapid double-click). Once the imported module has run, the
  // trigger is removed so it can be re-clicked after the sheet closes.
  const inFlight = new WeakSet();

  // Every `data-*` on the node except the one that named the island, dash-case
  // rewritten to camelCase. `skip` is that one attribute — `data-island` on a
  // click trigger, `data-island-auto` on an auto-mount container. The two paths
  // each had their own copy of this loop with a different name hardcoded.
  const parseProps = (node, skip) => {
    const props = {};
    for (const { name, value } of node.attributes) {
      if (!name.startsWith('data-') || name === skip) continue;
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      props[key] = value;
    }
    return props;
  };

  // Mount a named island into a fresh container appended to <body>.
  //
  // Both entry points below did this inline — the click path and the
  // `zuhd:mount-island` event path — with the same name validation, the same
  // container, the same dynamic import and the same "remove the container if
  // the module throws" cleanup. The name check is the part worth having once:
  // `name` reaches `import()` as a URL segment, so the character class is what
  // keeps a `data-island` attribute from naming a path.
  const mountNamed = async (name, props) => {
    if (!name || !/^[a-z0-9-]+$/.test(name)) return;
    const container = document.createElement('div');
    container.className = 'island-container';
    container.dataset.island = name;
    document.body.appendChild(container);
    try {
      const mod = await import(islandUrl(name));
      mod.mount?.(container, props);
    } catch (err) {
      console.error(`[island:${name}]`, err);
      container.remove();
    }
  };

  const activate = async (trigger) => {
    if (inFlight.has(trigger)) return;
    inFlight.add(trigger);
    try {
      await mountNamed(trigger.getAttribute('data-island'), parseProps(trigger, 'data-island'));
    } finally {
      inFlight.delete(trigger);
    }
  };

  document.addEventListener('click', (e) => {
    const trigger = e.target instanceof Element && e.target.closest('[data-island]');
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
    await mountNamed(name, props || {});
  });

  // Auto-mount pattern: any `[data-island-auto]` container boots the
  // named island immediately on DOMContentLoaded instead of waiting for
  // a click. Used by the ambient-globe on the homepage.
  const autoMounted = new WeakSet();
  // Each container boots independently. Awaiting them in sequence made a second
  // auto-island wait on the first island's module download for no reason —
  // these have no ordering relationship, and the map's bundle is the big one.
  const autoMount = () => {
    for (const node of document.querySelectorAll('[data-island-auto]')) {
      if (autoMounted.has(node)) continue;
      autoMounted.add(node);
      const name = node.getAttribute('data-island-auto');
      // Auto-mount cannot go through `mountNamed`: the container is already in
      // the document and is the island's own element, so there is nothing to
      // create and nothing to remove on failure.
      if (!name || !/^[a-z0-9-]+$/.test(name)) continue;
      import(islandUrl(name))
        .then((mod) => mod.mount?.(node, parseProps(node, 'data-island-auto')))
        .catch((err) => {
          console.error(`[island:${name}]`, err);
          autoMounted.delete(node);
        });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount, { once: true });
  } else {
    autoMount();
  }

})();
