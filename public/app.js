const $ = s => document.querySelector(s);
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = {
  items: [],
  query: '',
  favs: new Set(JSON.parse(localStorage.getItem('screenroom-favs') || '[]'))
};
const progressKey = 'screenroom-progress';
const readProgress = () => {
  try { return JSON.parse(localStorage.getItem(progressKey) || '{}'); } catch { return {}; }
};

function toast(t) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = t;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

/* Group episodes into series */
function seriesList() {
  const g = new Map();
  state.items.filter(i => i.kind === 'episode').forEach(i => {
    const n = i.seriesTitle || 'Untitled Series';
    if (!g.has(n)) {
      g.set(n, {
        kind: 'series',
        id: 'series:' + n,
        title: n,
        episodes: [],
        genre: i.genre,
        year: i.year,
        color: i.color,
        synopsis: i.synopsis,
        createdAt: i.createdAt
      });
    }
    const s = g.get(n);
    s.episodes.push(i);
    if ((i.createdAt || '') > (s.createdAt || '')) s.createdAt = i.createdAt;
    if (!s.posterId && i.hasPoster) s.posterId = i.id;
  });
  g.forEach(s => s.episodes.sort((a, b) => (a.season - b.season) || (a.episode - b.episode)));
  return [...g.values()];
}

const movies = () => state.items.filter(i => i.kind === 'movie');
const cards = () => [...movies(), ...seriesList()].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
const posterOf = x => x.kind === 'series' ? x.posterId : (x.hasPoster ? x.id : null);
const metaText = x => x.kind === 'series' ? (x.episodes.length + ' episode' + (x.episodes.length === 1 ? '' : 's')) : [x.year, x.runtime].filter(Boolean).join(' · ');

/* Render single movie/series poster card */
function cardHTML(x, pct) {
  const pid = posterOf(x);
  const art = pid
    ? `<img class="poster-img" loading="lazy" src="/api/poster/${pid}" alt="${esc(x.title)}">`
    : `<div class="poster-ph" style="background:linear-gradient(135deg, ${esc(x.color || '#e50914')}, #111827);">
         <b>${esc(x.title)}</b>
         <small>${esc(x.genre || (x.kind === 'series' ? 'Series' : 'Movie'))}</small>
       </div>`;

  const saved = state.favs.has(x.id);
  const progressHTML = pct != null ? `<div class="resume-bar"><i style="width:${pct}%"></i></div>` : '';

  return `
    <article class="card" tabindex="0" data-id="${esc(x.id)}">
      ${art}
      <div class="card-overlay">
        <div class="overlay-btns">
          <button class="btn-circle play" data-play="${esc(x.id)}" aria-label="Play">▶</button>
          <button class="btn-circle" data-fav="${esc(x.id)}" aria-label="Save to My List">${saved ? '✓' : '＋'}</button>
        </div>
        <div class="overlay-title">${esc(x.title)}</div>
        <div class="overlay-meta">${esc(x.genre || '')} ${metaText(x) ? '· ' + esc(metaText(x)) : ''}</div>
      </div>
      ${progressHTML}
    </article>
  `;
}

/* Render Netflix-style horizontal row */
function rowHTML(title, list, pcts) {
  if (!list.length) return '';
  return `
    <section class="row">
      <div class="row-header">
        <h2 class="row-title">${esc(title)}</h2>
      </div>
      <div class="track-wrapper">
        <button class="arrow l" aria-label="Scroll left">‹</button>
        <div class="track">
          ${list.map((x, i) => cardHTML(x, pcts ? pcts[i] : null)).join('')}
        </div>
        <button class="arrow r" aria-label="Scroll right">›</button>
      </div>
    </section>
  `;
}

function byGenre(list) {
  const g = new Map();
  list.forEach(x => {
    const k = x.genre || 'Featured';
    (g.get(k) || g.set(k, []).get(k)).push(x);
  });
  return [...g.entries()];
}

function continueWatchingList() {
  const p = readProgress();
  return state.items
    .filter(x => p[x.id] && p[x.id].time > 10 && (!p[x.id].duration || p[x.id].time < p[x.id].duration - 20))
    .sort((a, b) => p[b.id].updated - p[a.id].updated)
    .slice(0, 10)
    .map(x => ({
      x,
      pct: p[x.id].duration ? Math.min(100, (p[x.id].time / p[x.id].duration) * 100) : 0
    }));
}

/* Main render function */
function render() {
  const root = $('#rows');
  const all = cards();
  let html = '';

  if (state.query) {
    const q = state.query;
    const matches = all.filter(x => (x.title + ' ' + (x.genre || '') + ' ' + (x.synopsis || '')).toLowerCase().includes(q));
    if (matches.length) {
      html = `
        <div class="row-header" style="padding-top:10px;">
          <h2 class="row-title">Search results for “${esc(q)}”</h2>
        </div>
        <div class="grid-view">${matches.map(x => cardHTML(x)).join('')}</div>
      `;
    } else {
      html = `
        <div class="empty-state">
          <h3>No titles found</h3>
          <p>We couldn't find any matches for “${esc(q)}”. Try searching another title or genre.</p>
        </div>
      `;
    }
  } else if (!all.length) {
    html = `
      <div class="empty-state">
        <h3>Your movie library is ready</h3>
        <p>Sign in to the Admin studio at <code>/admin</code> to upload your first movie or show.</p>
      </div>
    `;
  } else {
    // 1. Continue Watching
    const cont = continueWatchingList();
    if (cont.length) {
      html += rowHTML('Continue Watching', cont.map(i => i.x), cont.map(i => i.pct));
    }

    // 2. My List (Favorites)
    const favItems = all.filter(x => state.favs.has(x.id));
    if (favItems.length) {
      html += rowHTML('My List', favItems);
    }

    // 3. Recently Added (All latest titles)
    html += rowHTML('Trending & Latest', all.slice(0, 15));

    // 4. Movies by Genre
    byGenre(movies()).forEach(([genre, list]) => {
      html += rowHTML(genre, list);
    });

    // 5. Series & Shows
    const sList = seriesList();
    if (sList.length) {
      html += rowHTML('TV Shows & Series', sList);
    }
  }

  root.innerHTML = html;
}

/* Helpers */
function findItem(id) {
  return id.startsWith('series:') ? seriesList().find(s => s.id === id) : state.items.find(i => i.id === id);
}

function toggleFav(id) {
  if (state.favs.has(id)) {
    state.favs.delete(id);
    toast('Removed from My List');
  } else {
    state.favs.add(id);
    toast('Added to My List');
  }
  localStorage.setItem('screenroom-favs', JSON.stringify([...state.favs]));
  render();
}

/* Event Listeners */
$('#rows').addEventListener('click', e => {
  // Arrow scroll
  const ar = e.target.closest('.arrow');
  if (ar) {
    const track = ar.parentElement.querySelector('.track');
    track.scrollBy({ left: (ar.classList.contains('l') ? -1 : 1) * track.clientWidth * 0.75, behavior: 'smooth' });
    return;
  }

  // Favorite button
  const favBtn = e.target.closest('[data-fav]');
  if (favBtn) {
    e.stopPropagation();
    toggleFav(favBtn.dataset.fav);
    return;
  }

  // Play button on card
  const playBtn = e.target.closest('[data-play]');
  if (playBtn) {
    e.stopPropagation();
    const item = findItem(playBtn.dataset.play);
    if (!item) return;
    if (item.kind === 'series') openDetails(item);
    else playItem(item, true);
    return;
  }

  // Click card to open modal details
  const card = e.target.closest('.card');
  if (card) {
    openDetails(findItem(card.dataset.id));
  }
});

// Remote & keyboard navigation
$('#rows').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const card = e.target.closest('.card');
    if (card) openDetails(findItem(card.dataset.id));
  }
});

/* Modal Details */
function openDetails(x) {
  if (!x) return;
  const series = x.kind === 'series';
  const pid = posterOf(x);

  $('#detailsArt').style.backgroundImage = pid
    ? `url(/api/poster/${pid})`
    : `linear-gradient(135deg, ${x.color || '#e50914'}, #0f172a)`;

  $('#detailsTitle').textContent = x.title;
  $('#detailsMeta').innerHTML = `
    <span>${esc(x.genre || (series ? 'Series' : 'Movie'))}</span>
    <span>${esc(metaText(x))}</span>
  `;
  $('#detailsSynopsis').textContent = x.synopsis || 'Enjoy streaming with the family in high definition.';

  const list = $('#episodeList');
  list.innerHTML = '';
  const playBtn = $('#detailsPlay');

  if (series) {
    playBtn.onclick = () => {
      closeDetails();
      if (x.episodes.length) playItem(x.episodes[0], true);
    };
    const seasons = {};
    x.episodes.forEach(e => (seasons[e.season] || (seasons[e.season] = [])).push(e));
    list.innerHTML = Object.keys(seasons).sort((a, b) => a - b).map(s => `
      <div class="season-heading">Season ${s}</div>
      ${seasons[s].map(e => `
        <div class="episode-row" data-ep="${e.id}">
          <div class="ep-num">${e.episode}</div>
          <div class="ep-info">
            <b>${esc(e.title)}</b>
            <small>${esc(e.runtime || 'Episode')} ${e.synopsis ? '· ' + esc(e.synopsis) : ''}</small>
          </div>
        </div>
      `).join('')}
    `).join('');

    list.onclick = ev => {
      const row = ev.target.closest('[data-ep]');
      if (row) {
        closeDetails();
        playItem(state.items.find(i => i.id === row.dataset.ep), true);
      }
    };
  } else {
    playBtn.onclick = () => {
      closeDetails();
      playItem(x, true);
    };
  }

  const favBtn = $('#detailsList');
  const updateFavUI = () => {
    favBtn.textContent = state.favs.has(x.id) ? '✓' : '＋';
  };
  updateFavUI();
  favBtn.onclick = () => {
    toggleFav(x.id);
    updateFavUI();
  };

  $('#detailsBackdrop').classList.add('open');
}

function closeDetails() {
  $('#detailsBackdrop').classList.remove('open');
}

document.querySelectorAll('[data-close-details]').forEach(b => b.onclick = closeDetails);
$('#detailsBackdrop').onclick = e => {
  if (e.target === $('#detailsBackdrop')) closeDetails();
};

/* Video Player */
function playItem(item, resume) {
  if (!item) return;
  const v = $('#videoPlayer');
  const overlay = $('#playerOverlay');

  $('#playerTitle').textContent = (item.kind === 'episode' ? `${item.seriesTitle} · S${item.season}:E${item.episode} ` : '') + item.title;
  v.src = '/api/video/' + item.id;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  v.load();

  v.onloadedmetadata = () => {
    const p = readProgress()[item.id];
    if (resume && p && p.time < v.duration - 20) {
      v.currentTime = p.time;
    }
    v.play().catch(() => {});
  };

  v.ontimeupdate = () => {
    if (v.currentTime > 3) {
      const a = readProgress();
      a[item.id] = { time: v.currentTime, duration: v.duration || 0, updated: Date.now() };
      localStorage.setItem(progressKey, JSON.stringify(a));
    }
  };

  v.onended = () => {
    const a = readProgress();
    delete a[item.id];
    localStorage.setItem(progressKey, JSON.stringify(a));
    closePlayer();
  };

  if (overlay.requestFullscreen) {
    overlay.requestFullscreen().catch(() => {});
  }
}

function closePlayer() {
  const v = $('#videoPlayer');
  v.pause();
  v.removeAttribute('src');
  v.load();
  $('#playerOverlay').classList.remove('open');
  $('#playerOverlay').setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  render();
}

$('#closePlayer').onclick = closePlayer;

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if ($('#playerOverlay').classList.contains('open')) closePlayer();
    else closeDetails();
  }
});

/* Search input */
$('#searchInput').oninput = e => {
  state.query = e.target.value.toLowerCase().trim();
  render();
};

/* Load catalog */
async function load() {
  try {
    const r = await fetch('/api/catalog', { credentials: 'same-origin' });
    if (r.status === 401) {
      location.href = '/enter';
      return;
    }
    if (!r.ok) throw Error();
    state.items = await r.json();
    render();
  } catch {
    $('#rows').innerHTML = `
      <div class="empty-state">
        <h3>Could not load library</h3>
        <p>Please refresh the browser or check server connectivity.</p>
      </div>
    `;
  }
}

load();
