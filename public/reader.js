const el = document.getElementById('article-data');
if (el) init(JSON.parse(el.textContent));

function init(data) {
  const { categoryOrder: categories, articles } = data;
  if (!categories.length) return;

  const mql = matchMedia('(min-width: 768px)');
  const isDesktop = () => mql.matches;

  const state = { catIdx: 0, artIdx: -1 };

  const stripEl = document.querySelector('.category-strip');
  const listEl = document.querySelector('.headline-list');
  const viewEl = document.querySelector('.article-view');
  const viewInner = viewEl.querySelector('.article-view-inner');
  const announcer = document.getElementById('announcer');
  const escapeDiv = document.createElement('div');

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
  const wrap = (idx, len) => ((idx % len) + len) % len;

  // --- Read state (localStorage) ---

  const STORAGE_KEY = 'zuhd-read';
  const allSlugs = new Set(Object.values(articles).flat().map(a => a.slug));
  const readSlugs = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').filter(s => allSlugs.has(s)));
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...readSlugs]));
  const markRead = (slug) => {
    readSlugs.add(slug);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...readSlugs]));
  };

  // --- Keyboard hint system ---

  const HINT_KEY = 'zuhd-kb';
  let keyboardAware = localStorage.getItem(HINT_KEY) === '1';
  let hintShown = false;

  if (!keyboardAware && isDesktop()) document.body.classList.add('show-key-hints');

  const dismissHints = () => {
    keyboardAware = true;
    localStorage.setItem(HINT_KEY, '1');
    document.body.classList.remove('show-key-hints');
    document.querySelector('.key-hint')?.remove();
  };

  const showClickHint = () => {
    if (hintShown || keyboardAware || !isDesktop()) return;
    hintShown = true;
    const hint = document.createElement('p');
    hint.className = 'key-hint';
    hint.textContent = 'try \u2191\u2193 arrow keys';
    document.querySelector('header')?.append(hint);
    hint.addEventListener('animationend', () => hint.remove());
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
    listEl.innerHTML = '';
    for (const [i, a] of currentList().entries()) {
      const div = document.createElement('div');
      div.className = 'headline-item';
      div.tabIndex = 0;
      div.role = 'button';
      div.classList.toggle('selected', i === state.artIdx);
      if (readSlugs.has(a.slug)) div.classList.add('read');
      const displayDate = a.addedAt ? new Date(a.addedAt) : new Date(a.date);
      const localTime = displayDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      div.innerHTML = `<h2>${esc(a.title)}</h2><time datetime="${displayDate.toISOString()}">${localTime}</time>`;
      div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); div.click(); }
      });
      div.addEventListener('click', () => {
        showClickHint();
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

    if (isDesktop()) {
      listEl.classList.add('switching');
      setTimeout(() => {
        buildHeadlines();
        listEl.classList.remove('switching');
        openArticle(true);
      }, 60);
    } else {
      buildHeadlines();
    }

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
      updateStrip();
    }

    if (isDesktop()) {
      const a = article;
      viewInner.innerHTML = `
        <header class="article-header">
          <h1>${esc(a.title)}</h1>
          <div class="meta">
            <time>${a.dateFormatted} · ${a.timeFormatted}</time>
          </div>
        </header>
        <div class="article-body">${a.bodyHtml}</div>`;
      viewEl.hidden = false;
      history.replaceState({ catIdx: state.catIdx, artIdx: state.artIdx }, '', `#${article.slug}`);
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

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (!keyboardAware && (e.key.startsWith('Arrow') || 'hjkl'.includes(e.key))) dismissHints();

    const desktop = isDesktop();
    const key = e.key;

    switch (key) {
      case 'ArrowLeft': case 'h':  e.preventDefault(); switchCategory(wrap(state.catIdx - 1, categories.length)); break;
      case 'ArrowRight': case 'l': e.preventDefault(); switchCategory(wrap(state.catIdx + 1, categories.length)); break;
      case 'ArrowUp': case 'k':
        e.preventDefault();
        state.artIdx = state.artIdx < 0 ? currentList().length - 1 : wrap(state.artIdx - 1, currentList().length);
        updateSelection();
        if (desktop) openArticle(true);
        break;
      case 'ArrowDown': case 'j':
        e.preventDefault();
        state.artIdx = state.artIdx < 0 ? 0 : wrap(state.artIdx + 1, currentList().length);
        updateSelection();
        if (desktop) openArticle(true);
        break;
      case 'Enter':
        if (!desktop) { e.preventDefault(); openArticle(true); }
        break;
      case 'Escape':
        if (!desktop) { e.preventDefault(); collapseArticle(); }
        break;
    }
  });

  // --- Touch ---

  let touchStartX = 0;
  let touchStartY = 0;
  let touchedStrip = false;

  document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchedStrip = e.target.closest('.category-strip') !== null;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (isDesktop()) return;
    if (touchedStrip) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const absDx = Math.abs(dx);
    if (absDx < 50 || Math.abs(e.changedTouches[0].clientY - touchStartY) > absDx * 0.6) return;

    switchCategory(wrap(state.catIdx + (dx < 0 ? 1 : -1), categories.length));
  }, { passive: true });

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
  });

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

  // --- Silent Refresh ---

  const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

  const silentRefresh = async () => {
    try {
      const res = await fetch('/', { cache: 'no-cache' });
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
      stripEl.innerHTML = '';
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

  // --- Init ---

  buildHeadlines();
  updateStrip();
  if (!navigateToHash() && isDesktop()) {
    state.artIdx = 0;
    updateSelection();
    openArticle(true);
  }
}
