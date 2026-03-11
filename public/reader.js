const el = document.getElementById('article-data');
if (el) init(JSON.parse(el.textContent));

function init(data) {
  const { categoryOrder: categories, articles } = data;
  if (!categories.length) return;

  const mql = matchMedia('(min-width: 641px)');
  const isDesktop = () => mql.matches;

  const state = { catIdx: 0, artIdx: -1 };

  const stripEl = document.querySelector('.category-strip');
  const listEl = document.querySelector('.headline-list');
  const viewEl = document.querySelector('.article-view');
  const viewInner = viewEl.querySelector('.article-view-inner');
  const announcer = document.getElementById('announcer');
  const escapeDiv = document.createElement('div');
  const isStaticPage = viewEl.hasAttribute('data-page');

  // Update status in footer
  const statusEl = document.querySelector('footer .update-status');
  function updateStatus() {
    const ts = window.__lastCycle;
    if (!ts || !statusEl) return;
    const now = Date.now(), ago = now - new Date(ts).getTime();
    const h = Math.floor(ago / 36e5), m = Math.floor((ago % 36e5) / 6e4);
    const agoStr = h > 0 ? h + 'h ago' : (m < 2 ? 'just now' : m + ' min ago');
    statusEl.textContent = 'Updated ' + agoStr;
  }
  updateStatus();
  setInterval(updateStatus, 60000);

  const announce = (msg) => {
    announcer.textContent = '';
    setTimeout(() => { announcer.textContent = msg; }, 50);
  };

  const esc = (s) => { escapeDiv.textContent = s; return escapeDiv.innerHTML; };
  const currentList = () => articles[categories[state.catIdx]];
  const currentArticle = () => currentList()[state.artIdx];

  // --- Read state (localStorage) ---

  const STORAGE_KEY = 'zuhd-read';
  const allSlugs = new Set(Object.values(articles).flat().map(a => a.slug));
  const readSlugs = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').filter(s => allSlugs.has(s)));
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...readSlugs]));
  const markRead = (slug) => {
    readSlugs.add(slug);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...readSlugs]));
    updateTabDots();
  };

  const updateTabDots = () => {
    categories.forEach((cat, i) => {
      const allRead = articles[cat].every(a => readSlugs.has(a.slug));
      if (allRead) tabEls[i].dataset.allRead = '';
      else delete tabEls[i].dataset.allRead;
    });
  };

  // --- Build category tabs ---

  const buildTab = (cat, i) => {
    const btn = document.createElement('button');
    btn.className = 'category-tab';
    btn.role = 'tab';
    btn.ariaSelected = i === state.catIdx ? 'true' : 'false';
    btn.textContent = cat;
    btn.addEventListener('click', () => switchCategory(i));
    stripEl.append(btn);
    return btn;
  };

  const tabEls = categories.map(buildTab);

  // --- Render ---


  const updateStrip = () => {
    tabEls.forEach((tab, i) => {
      tab.ariaSelected = i === state.catIdx ? 'true' : 'false';
    });
    tabEls[state.catIdx]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: isDesktop() ? 'smooth' : 'instant' });
  };

  const buildHeadlines = () => {
    listEl.replaceChildren();
    for (const [i, a] of currentList().entries()) {
      const div = document.createElement('div');
      div.className = 'headline-item';
      div.tabIndex = 0;
      div.role = 'button';
      div.classList.toggle('selected', i === state.artIdx);
      if (readSlugs.has(a.slug)) div.classList.add('read');
      const displayDate = a.addedAt ? new Date(a.addedAt) : new Date(a.date);
      const now = new Date();
      // Compare in UTC so "today" means the same calendar day regardless of browser timezone
      const isToday = displayDate.getUTCFullYear() === now.getUTCFullYear() && displayDate.getUTCMonth() === now.getUTCMonth() && displayDate.getUTCDate() === now.getUTCDate();
      const timeLabel = isToday
        ? displayDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
        : displayDate.toLocaleDateString([], { day: 'numeric', month: 'short', timeZone: 'UTC' });
      div.innerHTML = `<h2>${esc(a.title)}</h2><time datetime="${displayDate.toISOString()}">${timeLabel}</time>`;
      div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); div.click(); }
      });
      div.addEventListener('click', () => {
        if (isStaticPage) { location.href = '/#' + a.slug; return; }
        if (!isDesktop() && state.artIdx === i && div.querySelector('.article-expand')) {
          collapseArticle();
          return;
        }
        state.artIdx = i;
        updateSelection();
        openArticle(true);
      });
      listEl.append(div);
    }
  };

  const updateSelection = () => {
    for (const [i, item] of [...listEl.children].entries()) {
      item.classList.toggle('selected', i === state.artIdx);
    }
    const selected = listEl.children[state.artIdx];
    if (selected && isDesktop()) selected.scrollIntoView({ block: 'nearest' });
  };

  // --- Navigation ---

  const switchCategory = (idx) => {
    state.catIdx = idx;
    state.artIdx = isDesktop() ? 0 : -1;
    updateStrip();

    buildHeadlines();
    if (isDesktop()) openArticle(true);

    document.title = 'zuhd.news';
    announce(`${categories[idx]} category`);
  };

  const collapseArticle = () => {
    const expand = listEl.querySelector('.article-expand');
    if (expand) expand.remove();
    state.artIdx = -1;
    updateSelection();
  };

  const openArticle = (userInitiated = false) => {
    if (state.artIdx < 0) return;
    const article = currentArticle();
    if (userInitiated) {
      markRead(article.slug);
      listEl.children[state.artIdx]?.classList.add('read');
    }

    if (isDesktop()) {
      viewInner.innerHTML = `<div class="article-view-header"><h2>${esc(article.title)}</h2></div><div class="article-body">${article.bodyHtml}</div>`;
      viewInner.classList.remove('fade-in');
      void viewInner.offsetWidth;
      viewInner.classList.add('fade-in');
      viewEl.hidden = false;
      viewEl.scrollTop = 0;
      document.title = article.title + ' — zuhd.news';
      history.pushState({ catIdx: state.catIdx, artIdx: state.artIdx }, '', `#${article.slug}`);
      announce(`Reading: ${article.title}`);
      return;
    }

    // Mobile: accordion expand below headline
    const existing = listEl.querySelector('.article-expand');
    if (existing) existing.remove();

    const expand = document.createElement('div');
    expand.className = 'article-expand';
    expand.innerHTML = `<div class="article-body">${article.bodyHtml}</div>`;

    const item = listEl.children[state.artIdx];
    item?.append(expand);
    requestAnimationFrame(() => {
      item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    announce(`Reading: ${article.title}`);
  };

  // --- Keyboard ---

  const ac = new AbortController();
  const sig = ac.signal;

  let lastKey = '';
  let lastKeyTime = 0;

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;

    const desktop = isDesktop();
    const key = e.key;
    const now = Date.now();

    // gg — go to first article (within 500ms)
    if (key === 'g') {
      if (lastKey === 'g' && now - lastKeyTime < 500) {
        e.preventDefault();
        state.artIdx = 0;
        updateSelection();
        if (desktop) openArticle(true);
        lastKey = '';
        return;
      }
      lastKey = 'g';
      lastKeyTime = now;
      return;
    }
    lastKey = '';

    switch (key) {
      case 'ArrowLeft': case 'h':  e.preventDefault(); if (state.catIdx > 0) switchCategory(state.catIdx - 1); break;
      case 'ArrowRight': case 'l': e.preventDefault(); if (state.catIdx < categories.length - 1) switchCategory(state.catIdx + 1); break;
      case 'ArrowUp': case 'k':
        e.preventDefault();
        if (state.artIdx < 0) { state.artIdx = currentList().length - 1; }
        else if (state.artIdx > 0) { state.artIdx--; }
        else if (state.catIdx > 0) {
          state.catIdx--;
          updateStrip();
          buildHeadlines();
          state.artIdx = currentList().length - 1;
          updateSelection();
          if (desktop) openArticle(true);
          announce(`${categories[state.catIdx]} category`);
          break;
        } else break;
        updateSelection();
        if (desktop) openArticle(true);
        break;
      case 'ArrowDown': case 'j':
        e.preventDefault();
        if (state.artIdx < 0) { state.artIdx = 0; }
        else if (state.artIdx < currentList().length - 1) { state.artIdx++; }
        else if (state.catIdx < categories.length - 1) {
          switchCategory(state.catIdx + 1);
          break;
        } else break;
        updateSelection();
        if (desktop) openArticle(true);
        break;
      case 'G':
        e.preventDefault();
        state.artIdx = currentList().length - 1;
        updateSelection();
        if (desktop) openArticle(true);
        break;
      case 'o':
        if (state.artIdx >= 0) {
          const a = currentArticle();
          if (a.sourceUrl) window.open(a.sourceUrl, '_blank', 'noopener');
        }
        break;
      case 'Enter':
        if (!desktop) { e.preventDefault(); openArticle(true); }
        break;
      case 'Escape':
        if (!desktop) { e.preventDefault(); collapseArticle(); }
        break;
    }
  }, { signal: sig });

  // --- Touch ---

  let touchStartX = 0;
  let touchStartY = 0;
  let touchedStrip = false;

  document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchedStrip = e.target.closest('.category-strip') !== null;
  }, { passive: true, signal: sig });

  document.addEventListener('touchend', (e) => {
    if (isDesktop()) return;
    if (touchedStrip) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const absDx = Math.abs(dx);
    if (absDx < 50 || Math.abs(e.changedTouches[0].clientY - touchStartY) > absDx * 0.6) return;

    const next = state.catIdx + (dx < 0 ? 1 : -1);
    if (next >= 0 && next < categories.length) switchCategory(next);
  }, { passive: true, signal: sig });

  // --- Resize ---

  mql.addEventListener('change', (e) => {
    if (e.matches) {
      collapseArticle();
      state.artIdx = 0;
      updateSelection();
      buildHeadlines();
      openArticle(true);
    } else {
      viewEl.hidden = true;
      buildHeadlines();
    }
  }, { signal: sig });

  // --- Deep Link ---

  const navigateToHash = () => {
    const hash = location.hash.slice(1);
    if (!hash) return false;

    for (const [ci, cat] of categories.entries()) {
      const idx = articles[cat].findIndex(a => a.slug === hash);
      if (idx !== -1) {
        state.catIdx = ci;
        state.artIdx = idx;
        updateStrip();
        buildHeadlines();
        openArticle(true);
        return true;
      }
    }
    return false;
  };

  window.addEventListener('popstate', () => {
    if (!navigateToHash()) document.title = 'zuhd.news';
  }, { signal: sig });

  // --- Silent Refresh ---

  const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

  const silentRefresh = async () => {
    try {
      const res = await fetch('/', { cache: 'no-cache', signal: AbortSignal.timeout(10000) });
      if (!res.ok) return;
      const html = await res.text();
      const match = html.match(/<script type="application\/json" id="article-data">([\s\S]*?)<\/script>/);
      if (!match) return;

      const newData = JSON.parse(match[1]);
      const newSlugs = new Set();
      for (const cat of newData.categoryOrder) {
        for (const a of newData.articles[cat]) newSlugs.add(a.slug);
      }

      // Check if content actually changed
      const currentSlugs = new Set();
      for (const cat of categories) {
        for (const a of articles[cat]) currentSlugs.add(a.slug);
      }

      if (newSlugs.size === currentSlugs.size && [...newSlugs].every(s => currentSlugs.has(s))) return;

      // Swap data, preserve position
      categories.length = 0;
      categories.push(...newData.categoryOrder);
      for (const key of Object.keys(articles)) delete articles[key];
      Object.assign(articles, newData.articles);

      // Rebuild UI
      stripEl.replaceChildren();
      tabEls.length = 0;
      tabEls.push(...categories.map(buildTab));

      // Clamp indices
      if (state.catIdx >= categories.length) state.catIdx = 0;
      const list = currentList();
      if (state.artIdx >= list.length) state.artIdx = Math.max(0, list.length - 1);

      buildHeadlines();
      if (isDesktop() && state.artIdx >= 0) openArticle();

      // Update cycle timestamp from refreshed page
      const tsMatch = html.match(/window\.__lastCycle="([^"]+)"/);
      if (tsMatch) { window.__lastCycle = tsMatch[1]; updateStatus(); }
    } catch (e) { /* silent */ }
  };

  setInterval(silentRefresh, REFRESH_INTERVAL);

  // --- Sticky strip scroll indicator (mobile only) ---

  if (!isDesktop()) {
    const scrollObserver = new IntersectionObserver(
      ([e]) => stripEl.classList.toggle('scrolled', !e.isIntersecting),
      { threshold: 1 }
    );
    const sentinel = document.createElement('div');
    sentinel.style.height = '1px';
    stripEl.before(sentinel);
    scrollObserver.observe(sentinel);
  }

  // --- Init ---

  buildHeadlines();
  updateStrip();
  updateTabDots();
  if (isStaticPage) {
    // Static pages (about, sources, privacy): show page content, don't auto-select
    viewEl.hidden = false;
    if (!isDesktop()) { stripEl.hidden = true; listEl.hidden = true; }
  } else if (!navigateToHash() && isDesktop()) {
    state.artIdx = 0;
    updateSelection();
    openArticle(false);
  }
}
