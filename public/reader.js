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

  // --- Build category tabs (once) ---

  const tabEls = categories.map((cat, i) => {
    const btn = document.createElement('button');
    btn.className = 'category-tab';
    btn.role = 'tab';
    btn.ariaSelected = i === 0 ? 'true' : 'false';
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      if (!isDesktop() && state.view === 'article') closeArticle();
      switchCategory(i);
    });
    stripEl.append(btn);
    return btn;
  });

  // --- Render ---

  const updateStrip = () => {
    tabEls.forEach((tab, i) => { tab.ariaSelected = i === state.catIdx ? 'true' : 'false'; });
  };

  const buildHeadlines = () => {
    listEl.innerHTML = '';
    for (const [i, a] of currentList().entries()) {
      const div = document.createElement('div');
      div.className = 'headline-item';
      div.classList.toggle('selected', i === state.artIdx);
      div.innerHTML = `<h2>${esc(a.title)}</h2><time datetime="${a.date}">${a.dateFormatted} · ${a.timeFormatted}</time>`;
      div.addEventListener('click', () => {
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
          <span>Source: <a href="${esc(a.sourceUrl)}">${esc(a.source)}</a></span>
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
    renderArticle();

    if (isDesktop()) {
      state.view = 'article';
      viewEl.hidden = false;
      history.replaceState({ catIdx: state.catIdx, artIdx: state.artIdx }, '', `#${currentArticle().slug}`);
      announce(`Reading: ${currentArticle().title}`);
      return;
    }

    // Mobile: modal behavior
    state.view = 'article';
    document.body.classList.add('view-article');
    viewEl.hidden = false;
    viewEl.style.animation = 'none';
    viewEl.offsetHeight;
    viewEl.style.animation = '';

    history.pushState({ catIdx: state.catIdx, artIdx: state.artIdx }, '', `#${currentArticle().slug}`);

    const h1 = viewEl.querySelector('h1');
    h1?.setAttribute('tabindex', '-1');
    h1?.focus();

    announce(`Reading: ${currentArticle().title}`);
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

    const desktop = isDesktop();

    if (desktop || state.view === 'headlines') {
      switch (e.key) {
        case 'ArrowLeft':  e.preventDefault(); switchCategory(wrap(state.catIdx - 1, categories.length)); break;
        case 'ArrowRight': e.preventDefault(); switchCategory(wrap(state.catIdx + 1, categories.length)); break;
        case 'ArrowUp':
          e.preventDefault();
          state.artIdx = state.artIdx < 0 ? currentList().length - 1 : wrap(state.artIdx - 1, currentList().length);
          updateSelection();
          if (desktop) openArticle();
          break;
        case 'ArrowDown':
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
      switch (e.key) {
        case 'Escape':     e.preventDefault(); closeArticle(); break;
        case 'ArrowLeft':  e.preventDefault(); closeArticle(); switchCategory(wrap(state.catIdx - 1, categories.length)); break;
        case 'ArrowRight': e.preventDefault(); closeArticle(); switchCategory(wrap(state.catIdx + 1, categories.length)); break;
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

  // --- Init ---

  buildHeadlines();
  if (!navigateToHash() && isDesktop()) {
    state.artIdx = 0;
    updateSelection();
    openArticle();
  }
}
