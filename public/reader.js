const el = document.getElementById('article-data');
if (el) init(JSON.parse(el.textContent));

function init(data) {
  const { categoryOrder: categories, articles } = data;
  if (!categories.length) return;

  const mql = matchMedia('(min-width: 768px)');
  const isDesktop = () => mql.matches;

  const state = { view: 'headlines', catIdx: 0, artIdx: -1 };

  const stripEl = document.querySelector('.category-strip');
  const listEl = document.querySelector('.headline-list');
  const viewEl = document.querySelector('.article-view');
  const viewInner = viewEl.querySelector('.article-view-inner');
  const announcer = document.getElementById('announcer');
  const escapeDiv = document.createElement('div');

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
  const readSlugs = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
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
    btn.addEventListener('click', () => {
      if (!isDesktop() && state.view === 'article') closeArticle();
      switchCategory(i);
    });
    stripEl.append(btn);
    return btn;
  };

  const tabEls = categories.map(buildTab);

  // --- Render ---

  const updateStrip = () => {
    tabEls.forEach((tab, i) => {
      tab.ariaSelected = i === state.catIdx ? 'true' : 'false';
      const allRead = articles[categories[i]].every(a => readSlugs.has(a.slug));
      tab.classList.toggle('all-read', allRead);
    });
  };

  const buildHeadlines = () => {
    listEl.innerHTML = '';
    for (const [i, a] of currentList().entries()) {
      const div = document.createElement('div');
      div.className = 'headline-item';
      div.classList.toggle('selected', i === state.artIdx);
      if (readSlugs.has(a.slug)) div.classList.add('read');
      const localTime = new Date(a.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      div.innerHTML = `<h2>${esc(a.title)}</h2><time datetime="${a.date}">${localTime}</time>`;
      div.addEventListener('click', () => {
        showClickHint();
        state.artIdx = i;
        updateSelection();
        openArticle();
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

  const renderArticle = () => {
    const a = currentArticle();
    viewInner.innerHTML = `
      <header class="article-header">
        <span class="category">${esc(a.category)}</span>
        <h1>${esc(a.title)}</h1>
        <div class="meta">
          <time>${a.dateFormatted} · ${a.timeFormatted}</time>
          <span class="separator">&middot;</span>
          <a href="${esc(a.sourceUrl)}">${esc(a.source)}</a>
        </div>
      </header>
      <div class="article-body">${a.bodyHtml}</div>`;
  };

  // --- Navigation ---

  const switchCategory = (idx) => {
    state.catIdx = idx;
    state.artIdx = isDesktop() ? 0 : -1;
    updateStrip();

    listEl.classList.add('switching');
    setTimeout(() => {
      buildHeadlines();
      listEl.classList.remove('switching');
      if (isDesktop()) openArticle();
    }, 60);

    announce(`${categories[idx]} category`);
  };

  const openArticle = () => {
    if (state.artIdx < 0) return;
    const article = currentArticle();
    markRead(article.slug);
    listEl.children[state.artIdx]?.classList.add('read');
    updateStrip();
    renderArticle();

    state.view = 'article';
    viewEl.hidden = false;
    const historyState = { catIdx: state.catIdx, artIdx: state.artIdx };

    if (isDesktop()) {
      history.replaceState(historyState, '', `#${article.slug}`);
      announce(`Reading: ${article.title}`);
      return;
    }

    // Mobile: modal behavior
    document.body.classList.add('view-article');
    viewEl.style.animation = 'none';
    viewEl.offsetHeight;
    viewEl.style.animation = '';

    history.pushState(historyState, '', `#${article.slug}`);

    const h1 = viewEl.querySelector('h1');
    h1?.setAttribute('tabindex', '-1');
    h1?.focus();

    announce(`Reading: ${article.title}`);
  };

  const closeArticle = () => {
    if (isDesktop()) return;

    state.view = 'headlines';
    document.body.classList.remove('view-article');
    viewEl.hidden = true;
    updateSelection();

    if (location.hash) history.pushState(null, '', location.pathname);
    listEl.children[state.artIdx]?.focus();
  };

  // --- Keyboard ---

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (!keyboardAware && (e.key.startsWith('Arrow') || 'hjkl'.includes(e.key))) dismissHints();

    const desktop = isDesktop();
    const key = e.key;

    if (desktop || state.view === 'headlines') {
      switch (key) {
        case 'ArrowLeft': case 'h':  e.preventDefault(); switchCategory(wrap(state.catIdx - 1, categories.length)); break;
        case 'ArrowRight': case 'l': e.preventDefault(); switchCategory(wrap(state.catIdx + 1, categories.length)); break;
        case 'ArrowUp': case 'k':
          e.preventDefault();
          state.artIdx = state.artIdx < 0 ? currentList().length - 1 : wrap(state.artIdx - 1, currentList().length);
          updateSelection();
          if (desktop) openArticle();
          break;
        case 'ArrowDown': case 'j':
          e.preventDefault();
          state.artIdx = state.artIdx < 0 ? 0 : wrap(state.artIdx + 1, currentList().length);
          updateSelection();
          if (desktop) openArticle();
          break;
        case 'Enter':
          if (!desktop) { e.preventDefault(); openArticle(); }
          break;
      }
    } else if (state.view === 'article') {
      switch (key) {
        case 'Escape':                e.preventDefault(); closeArticle(); break;
        case 'ArrowLeft':  case 'h':  e.preventDefault(); closeArticle(); switchCategory(wrap(state.catIdx - 1, categories.length)); break;
        case 'ArrowRight': case 'l':  e.preventDefault(); closeArticle(); switchCategory(wrap(state.catIdx + 1, categories.length)); break;
      }
    }
  });

  // --- Touch ---

  let touchStartX = 0;
  let touchStartY = 0;

  document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (isDesktop()) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const absDx = Math.abs(dx);
    if (absDx < 50 || Math.abs(e.changedTouches[0].clientY - touchStartY) > absDx * 0.6) return;

    if (state.view === 'article' && touchStartX < 30 && dx > 0) {
      closeArticle();
    } else if (state.view === 'headlines') {
      switchCategory(wrap(state.catIdx + (dx < 0 ? 1 : -1), categories.length));
    }
  }, { passive: true });

  // --- History ---

  addEventListener('popstate', () => {
    if (state.view !== 'article') return;
    state.view = 'headlines';
    document.body.classList.remove('view-article');
    viewEl.hidden = true;
    updateSelection();
  });

  // --- Resize ---

  mql.addEventListener('change', (e) => {
    if (e.matches) {
      // Entered desktop
      document.body.classList.remove('view-article');
      if (state.artIdx < 0) {
        state.artIdx = 0;
        updateSelection();
      }
      openArticle();
    } else {
      // Entered mobile
      if (state.view === 'article') {
        document.body.classList.add('view-article');
        viewEl.hidden = false;
        history.pushState({ catIdx: state.catIdx, artIdx: state.artIdx }, '', `#${currentArticle().slug}`);
      } else {
        viewEl.hidden = true;
      }
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
        openArticle();
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
    } catch (e) { /* silent */ }
  };

  setInterval(silentRefresh, REFRESH_INTERVAL);

  // --- Init ---

  buildHeadlines();
  if (!navigateToHash() && isDesktop()) {
    state.artIdx = 0;
    updateSelection();
    openArticle();
  }
}
