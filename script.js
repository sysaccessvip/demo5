/**
 * script.js — Plantilla de arranque (sin lógica del reproductor)
 * - Aquí puedes pegar tu código JS completamente distinto.
 * - Incluye utilidades: carga dinámica de scripts/estilos, bus simple y helpers SW.
 */

/* ========== UTILIDADES ========== */

// Namespace global para acceder desde consola
window._app = window._app || {};
const APP = window._app;

// Cargar script dinámicamente (útil para módulos grandes)
APP.loadScript = function(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    if (opts.module) s.type = 'module';
    if (opts.defer) s.defer = true;
    s.async = !!opts.async;
    s.onload = () => resolve(s);
    s.onerror = (e) => reject(e);
    document.body.appendChild(s);
  });
};

// Cargar CSS dinámicamente
APP.loadCSS = function(url) {
  return new Promise((resolve, reject) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = url;
    l.onload = () => resolve(l);
    l.onerror = (e) => reject(e);
    document.head.appendChild(l);
  });
};

// Bus simple de eventos para desacoplar módulos
APP.bus = (function() {
  const map = new Map();
  return {
    on: (ev, fn) => { (map.get(ev) || map.set(ev,[])).get ? null : null; (map.get(ev) || map.set(ev,[])); map.get(ev).push(fn); },
    off: (ev, fn) => { const arr = map.get(ev) || []; map.set(ev, arr.filter(x=>x!==fn)); },
    emit: (ev, data) => { (map.get(ev) || []).slice().forEach(fn => { try{ fn(data); }catch(e){ console.warn('bus handler', e); } }); }
  };
})();

/* ========== SERVICE WORKER HELPERS ========== */

APP.sendToSW = async function(msg) {
  if(!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return null;
  return new Promise((resolve) => {
    const msgChan = new MessageChannel();
    msgChan.port1.onmessage = (ev) => resolve(ev.data);
    navigator.serviceWorker.controller.postMessage(msg, [msgChan.port2]);
  });
};

// Ejemplos:
// APP.sendToSW({type:'CACHE_URLS', payload:['/ruta1','/ruta2']});
// APP.sendToSW({type:'CLEAR_CACHES'});

/* ========== STORAGE SIMPLE ==========
   Útil para guardar configuración/localState de tu otro código.
*/
APP.storage = {
  get: (k, fallback=null) => {
    try { const t = localStorage.getItem(k); return t ? JSON.parse(t) : fallback; } catch(e){ return fallback; }
  },
  set: (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){ console.warn('storage set', e); }
  },
  remove: (k) => { localStorage.removeItem(k); }
};

const CONFIG = {
    YT_MAX_RESULTS: 25,
    API_KEYS: [
        "AIzaSyCzu-Mqx22V83ktalXksUnC1AhtZwzyb-0",
        "AIzaSyBM-uvKMHe5GxNuMpWB45-RWVUGYOGwEyQ",
        "AIzaSyAd6JdvYn7YGMfSY9EaJtCEUGd11tKa6ZI",
        "AIzaSyBr2nxeKaN1q07fMV59zrLEOQx9dzYBsMI",
        "AIzaSyBbnepAY-irFm35H7Qu0NrwISzLCThkBKM",
        "AIzaSyAujlR4Gig8puLuzM-amckcwu5sbMRvIR0",
        "AIzaSyBiGJ9JeOdkrUI7x-qQHyrHpUJAxcwRTvI",
        "AIzaSyC_UCUc3zcffX5_IOPFpqbJyXmUYxKOg9U",
        "AIzaSyC7FYbsVmGA0LnepHG7t_xPOR0mEkQ1jiE",
        "AIzaSyBLTPa7EUAmnJZMq4sYBT97x4HY3--YHws",
        "AIzaSyDWAi-0_oqg5GHwEoE0_LnSLSV_nsfs1SI",
        "AIzaSyBJ6zZI3BFvBd02EcdsJFE7dLdZ-f7RV9c",
        "AIzaSyD_9Flh18VT4hJ0OkEIS3TCECJ4vIOcfC0",
        "AIzaSyC3_rIZ5deseDbte7auVOo7oUDjopEMaBg",
        "AIzaSyA9jC-p2NtbeppL8x0YKQqNkrdOggt3Q48"
    ],
    STORAGE_PREFIX: 'mp_'
};

const state = {
    visiblePlayer: null,
    hiddenPlayer: null,
    playersReady: false,
    pendingPlay: null,       // { videoId, autoplay }
    queuedTrack: null,      // { video, queue, queueIndex } when players not ready
    currentKeyIndex: 0,
    currentTrack: null,
    currentQueue: [],
    currentQueueIndex: 0,
    favorites: [],
    libraries: [],
    recents: [],
    currentPage: 'home',
    isShuffle: false,
    isLoop: false,
    transferInProgress: false,
    isPlaying: false,
    lastPage: 'home',
    isSeeking: false,
    progressInterval: null,
    touchStartY: 0,
    touchMoveY: 0
};

// ==== DOM refs ====
const dom = {
    sidebar: document.getElementById('sidebar'),
    sidebarBackdrop: document.getElementById('sidebar-backdrop'),
    openSidebarBtn: document.getElementById('open-sidebar-btn'),
    closeSidebarBtn: document.getElementById('close-sidebar-btn'),
    navLinks: document.querySelectorAll('.nav-link'),
    pageContainer: document.getElementById('page-container'),
    pages: document.querySelectorAll('.page'),
    homeTitle: document.getElementById('home-title'),
    searchInput: document.getElementById('search-input'),
    searchButton: document.getElementById('search-button'),
    searchPlaylistsButton: document.getElementById('search-playlists-button'),
    categoryButtons: document.querySelectorAll('.category-btn'),
    popularMusicContainer: document.getElementById('popular-music-container'),
    resultsContainer: document.getElementById('results-container'),
    favoritesContainer: document.getElementById('favorites-container'),
    playlistsContainer: document.getElementById('playlists-container'),
    libraryContainer: document.getElementById('library-container'),
    recentsContainer: document.getElementById('recents-container'),
    homeCategoriesSection: document.getElementById('home-categories-section'),
    homePlaylistsSection: document.getElementById('home-playlists-section'),
    homePopularSection: document.getElementById('home-popular-section'),
    fullPlayer: document.getElementById('full-player'),
    minimizePlayerBtn: document.getElementById('minimize-player-btn'),
    playerVideoContainer: document.getElementById('player-video-container'),
    playerTitle: document.getElementById('player-title'),
    playerArtist: document.getElementById('player-artist'),
    favBtnFull: document.getElementById('fav-btn-full'),
    favIconFull: document.getElementById('fav-icon-full'),
    libraryOptionsBtn: document.getElementById('library-options-btn'),
    playerBgImage: document.getElementById('player-bg-image'),
    playPauseBtn: document.getElementById('play-pause-btn'),
    playIcon: document.getElementById('play-icon'),
    pauseIcon: document.getElementById('pause-icon'),
    nextBtn: document.getElementById('next-btn'),
    prevBtn: document.getElementById('prev-btn'),
    shuffleBtn: document.getElementById('shuffle-btn'),
    loopBtn: document.getElementById('loop-btn'),
    miniPlayer: document.getElementById('mini-player'),
    maximizePlayerBtn: document.getElementById('maximize-player-btn'),
    miniPlayerThumb: document.getElementById('mini-player-thumb'),
    miniPlayerTitle: document.getElementById('mini-player-title'),
    miniPlayerArtist: document.getElementById('mini-player-artist'),
    miniPlayPauseBtn: document.getElementById('mini-play-pause-btn'),
    miniPlayIcon: document.getElementById('mini-play-icon'),
    miniPauseIcon: document.getElementById('mini-pause-icon'),
    playerIframeWrapper: document.getElementById('player-iframe-wrapper'),
    ytVisibleHolder: document.getElementById('yt_visible'),
    ytHiddenHolder: document.getElementById('yt_hidden_holder'),
    toastRoot: document.getElementById('toast-root'),
    playlistPage: document.getElementById('page-playlist-details'),
    playlistHeader: document.getElementById('playlist-header'),
    playlistStickyHeader: document.getElementById('playlist-sticky-header'),
    playlistStickyTitle: document.getElementById('playlist-sticky-title'),
    playlistTitle: document.getElementById('playlist-title'),
    playlistChannel: document.getElementById('playlist-channel'),
    playlistSongsContainer: document.getElementById('playlist-songs-container'),
    playlistBackBtn: document.getElementById('playlist-back-btn'),
    playerProgressBar: document.getElementById('player-progress-bar'),
    playerCurrentTime: document.getElementById('player-current-time'),
    playerTotalDuration: document.getElementById('player-total-duration'),
    playerQueuePanel: document.getElementById('player-queue-panel'),
    showQueuePanelBtn: document.getElementById('show-queue-panel-btn'),
    queueTriggerArea: document.getElementById('queue-trigger-area'),
    playerQueueHandle: document.getElementById('player-queue-handle'),
    playerQueueList: document.getElementById('player-queue-list'),
    playerMainView: document.getElementById('player-main-view'),
    fullscreenBtn: document.getElementById('fullscreen-btn')
};

// === YouTube API loader ===
(function loadYT(){
    if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(tag);
    } else if (window.YT && window.YT.Player) {
        if (typeof window.onYouTubeIframeAPIReady === 'function') window.onYouTubeIframeAPIReady();
    }
})();

// Create players with safer playerVars (iv_load_policy, origin)
window.onYouTubeIframeAPIReady = function() {
    try {
        const commonPlayerVars = {
            playsinline: 1,
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            iv_load_policy: 3,
            origin: location.origin
        };

        state.visiblePlayer = new YT.Player(dom.ytVisibleHolder, {
            height: '100%',
            width: '100%',
            playerVars: commonPlayerVars,
            events: {
                'onReady': onVisibleReady,
                'onStateChange': onPlayerStateChange,
                'onError': (e) => console.warn("visiblePlayer error", e)
            }
        });

        state.hiddenPlayer = new YT.Player(dom.ytHiddenHolder, {
            height: '1',
            width: '1',
            playerVars: commonPlayerVars,
            events: {
                'onReady': onHiddenReady,
                'onStateChange': onPlayerStateChange,
                'onError': (e) => console.warn("hiddenPlayer error", e)
            }
        });
    } catch (e) {
        console.error("YT create error:", e);
    }
};

function onVisibleReady() { checkPlayersReady(); }
function onHiddenReady() { checkPlayersReady(); }

function checkPlayersReady() {
    if (!state.visiblePlayer || !state.hiddenPlayer) return;
    state.playersReady = true;

    try {
        const iframeV = state.visiblePlayer.getIframe();
        const iframeH = state.hiddenPlayer.getIframe();
        if (iframeV) iframeV.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
        if (iframeH) iframeH.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
    } catch (e) {}

    resizePlayers();

    // If there were pending plays queued before players were ready:
    if (state.pendingPlay) {
        const p = state.pendingPlay;
        state.pendingPlay = null;
        loadAndPlayById(p.videoId, p.autoplay);
    }
    if (state.queuedTrack) {
        const { video, queue, queueIndex } = state.queuedTrack;
        state.queuedTrack = null;
        playTrack(video, queue, queueIndex);
    }
}

function onPlayerStateChange(event) {
    const active = getActivePlayer();
    if (event.target !== active) {
        // ignore state change coming from inactive player
        return;
    }
    const s = event.data;
    if (s === YT.PlayerState.PLAYING) {
        setPlayIcon(false);
        state.isPlaying = true;
        showMiniPlayerAfterPlay();
        startProgressInterval();
    } else if (s === YT.PlayerState.PAUSED || s === YT.PlayerState.CUED) {
        setPlayIcon(true);
        state.isPlaying = false;
        stopProgressInterval();
    } else if (s === YT.PlayerState.ENDED) {
        stopProgressInterval();
        playNext();
    }
}

// ==== Helpers ====
function getApiKey() { return CONFIG.API_KEYS[state.currentKeyIndex % CONFIG.API_KEYS.length]; }
function rotateApiKey(){ state.currentKeyIndex = (state.currentKeyIndex + 1) % CONFIG.API_KEYS.length; console.warn('Rotando API key ->', state.currentKeyIndex); }
function buildApiUrl(endpoint, params) { const BASE_URL = 'https://www.googleapis.com/youtube/v3'; const url = new URL(`${BASE_URL}${endpoint}`); for (const key in params) url.searchParams.set(key, params[key]); return url; }

async function fetchWithRetry(url, retries = 3) {
    if (retries === 0) throw new Error("API retries exhausted.");
    url.searchParams.set('key', getApiKey());
    try {
        const res = await fetch(url);
        if (!res.ok) {
            const errorData = await res.json().catch(()=>({error:{message:'unknown', code: res.status}}));
            const errorCode = errorData.error?.code;
            if (errorCode === 403 || errorCode === 400) {
                rotateApiKey();
                url.searchParams.set('key', getApiKey());
                return fetchWithRetry(url, retries - 1);
            } else {
                throw new Error(errorData.error?.message || res.statusText);
            }
        }
        return await res.json();
    } catch (err) {
        console.error("fetch error:", err);
        return fetchWithRetry(url, retries - 1);
    }
}

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

function updateProgressBar() {
    if (state.isSeeking || !state.playersReady) return;
    const player = getActivePlayer();
    try {
        const currentTime = player.getCurrentTime();
        const duration = player.getDuration();
        if (isFinite(currentTime) && isFinite(duration) && duration > 0) {
            dom.playerCurrentTime.textContent = formatTime(currentTime);
            dom.playerTotalDuration.textContent = formatTime(duration);
            dom.playerProgressBar.max = duration;
            dom.playerProgressBar.value = currentTime;
            const progressPercent = (currentTime / duration) * 100;
            dom.playerProgressBar.style.setProperty('--progress-percent', `${progressPercent}%`);
        }
    } catch (e) {}
}
function startProgressInterval() { stopProgressInterval(); state.progressInterval = setInterval(updateProgressBar, 250); }
function stopProgressInterval() { clearInterval(state.progressInterval); state.progressInterval = null; }

function showLoading(container){ container.innerHTML = `<div class="flex justify-center items-center p-10"><div class="loader"></div></div>`; }
function toggleHomeSections(show) { dom.homeCategoriesSection.classList.toggle('hidden', !show); dom.homePlaylistsSection.classList.toggle('hidden', !show); dom.homePopularSection.classList.toggle('hidden', !show); }

function updatePlayingIndicator() {
    if (!state.currentTrack) {
        document.querySelectorAll('.video-item-title').forEach(title => {
            title.classList.remove('text-blue-500', 'font-bold');
            title.classList.add('font-medium');
        });
        return;
    }
    const videoId = typeof state.currentTrack.id === 'object' ? state.currentTrack.id.videoId : state.currentTrack.id;
    document.querySelectorAll('.video-item-title').forEach(title => {
        title.classList.remove('text-blue-500', 'font-bold');
        title.classList.add('font-medium');
    });
    const playingItems = document.querySelectorAll(`.video-item[data-video-id="${videoId}"]`);
    if (playingItems.length === 0) return;
    playingItems.forEach(item => {
        const title = item.querySelector('.video-item-title');
        if (title) {
            title.classList.add('text-blue-500', 'font-bold');
            title.classList.remove('font-medium');
        }
    });
}

function renderVideoList(container, items, listType = 'search', listId = null) {
    if (!items || items.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center">No se encontraron resultados.</p>';
        return;
    }
    container.innerHTML = items.map((item, index) => {
        const videoId = typeof item.id === 'object' ? item.id.videoId : item.id;
        const snippet = item.snippet;
        if (!snippet) return '';
        const showDeleteBtn = (listType === 'recents') || (listType === 'library' && listId) || (listType === 'favorites');
        const deleteIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`;
        return `<div class="flex items-center p-2 rounded-lg hover:bg-gray-800 video-item-wrapper">
            <div class="flex-1 flex items-center truncate cursor-pointer video-item" data-index="${index}" data-video-id="${videoId}">
                <img src="${snippet.thumbnails?.default?.url || 'https://placehold.co/120x90/000000/ffffff?text=?'}" alt="${snippet.title}" class="w-16 h-16 object-cover rounded-md mr-4">
                <div class="flex-1 truncate">
                    <p class="font-medium truncate video-item-title">${snippet.title}</p>
                    <p class="text-sm text-gray-400 truncate">${snippet.channelTitle}</p>
                </div>
            </div>
            ${showDeleteBtn ? `<button class="item-delete-btn ml-2" data-video-id="${videoId}" data-list-type="${listType}" data-list-id="${listId || ''}" title="Quitar de la lista">${deleteIcon}</button>` : ''}
        </div>`;
    }).join('');

    // attach listeners
    container.querySelectorAll('.video-item').forEach(itemEl => {
        itemEl.addEventListener('click', () => {
            const index = parseInt(itemEl.dataset.index);
            // When user clicks - play immediate
            playTrack(items[index], items, index);
        });
    });

    container.querySelectorAll('.item-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const videoId = btn.dataset.videoId;
            const type = btn.dataset.listType;
            const listId = btn.dataset.listId;
            if (type === 'recents') removeFromRecents(videoId);
            else if (type === 'library') removeFromLibrary(videoId, listId);
            else if (type === 'favorites') removeFromFavorites(videoId);
        });
    });

    updatePlayingIndicator();
}

function renderFavorites() {
    if (state.favorites.length === 0) {
        dom.favoritesContainer.innerHTML = '<p class="text-gray-400 text-center">Aún no tienes favoritos. Presiona el ♥️ en una canción para añadirla.</p>';
        return;
    }
    renderVideoList(dom.favoritesContainer, state.favorites, 'favorites');
}

function renderPlaylistList(container, playlists) {
    if (!playlists || playlists.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center">No se encontraron playlists.</p>';
        return;
    }
    container.innerHTML = playlists.map(pl => {
        const sn = pl.snippet || {};
        const playlistId = (pl.id && pl.id.playlistId) ? pl.id.playlistId : (typeof pl.id === 'string' ? pl.id : (pl.playlistId || ''));
        return `<div class="bg-gray-800 p-3 rounded cursor-pointer playlist-item" data-playlist-id="${playlistId}" title="${sn.title}">
            <img src="${sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || 'https://placehold.co/320x180/000/fff?text=?'}" class="w-full h-36 object-cover rounded mb-2">
            <div class="text-sm font-medium truncate">${sn.title}</div>
            <div class="text-xs text-gray-400 truncate">${sn.channelTitle}</div>
        </div>`;
    }).join('');

    container.querySelectorAll('.playlist-item').forEach(el => {
        el.addEventListener('click', async () => {
            const playlistId = el.dataset.playlistId;
            if (!playlistId) {
                dom.resultsContainer.innerHTML = `<p class="text-red-400">ID de playlist inválido.</p>`;
                return;
            }
            await fetchPlaylistItemsAndRender(playlistId);
        });
    });
}

function showPage(pageId) {
    if (state.currentPage !== pageId) state.lastPage = state.currentPage;
    dom.pages.forEach(page => page.classList.toggle('active', page.id === `page-${pageId}`));
    state.currentPage = pageId;
    const activePageEl = document.getElementById(`page-${pageId}`);
    if (activePageEl) activePageEl.scrollTop = 0;
    if (pageId === 'favorites') renderFavorites();
    else if (pageId === 'home') {
        dom.homeTitle.textContent = 'Inicio';
        dom.resultsContainer.innerHTML = '';
        toggleHomeSections(true);
    } else if (pageId === 'recents') renderRecents();
    else if (pageId === 'library') renderLibrariesPage();
}

function toggleSidebar(show) {
    if (show) {
        dom.sidebarBackdrop.classList.remove('hidden');
        dom.sidebar.classList.remove('-translate-x-full');
    } else {
        dom.sidebarBackdrop.classList.add('hidden');
        dom.sidebar.classList.add('-translate-x-full');
    }
}

// ==== updatePlayerUI (con background) ====
function updatePlayerUI(track) {
    if (!track || !track.snippet) {
        if (dom.playerBgImage) {
            dom.playerBgImage.style.backgroundImage = 'none';
        }
        dom.playerTitle.textContent = 'Título de la Canción';
        dom.playerArtist.textContent = 'Nombre del Artista';
        dom.miniPlayerTitle.textContent = 'No hay nada sonando';
        dom.miniPlayerArtist.textContent = '...';
        dom.miniPlayerThumb.src = 'https://placehold.co/40x40/000000/FFFFFF?text=?';
        updateFavoriteIcon();
        return;
    }

    const snippet = track.snippet;
    const title = snippet.title;
    const artist = snippet.channelTitle;
    const thumb = snippet.thumbnails?.default?.url || 'https://placehold.co/40x40/000000/FFFFFF?text=?';

    const bgThumb = snippet.thumbnails?.maxres?.url ||
                    snippet.thumbnails?.high?.url ||
                    snippet.thumbnails?.medium?.url ||
                    thumb;

    if (dom.playerBgImage) {
        dom.playerBgImage.style.backgroundImage = `url('${bgThumb}')`;
    }

    dom.playerTitle.textContent = title;
    dom.playerArtist.textContent = artist;
    dom.miniPlayerTitle.textContent = title;
    dom.miniPlayerArtist.textContent = artist;
    dom.miniPlayerThumb.src = thumb;
    updateFavoriteIcon();
}

function showFullPlayer() {
    dom.fullPlayer.classList.remove('translate-y-full');
    dom.miniPlayer.classList.add('translate-y-full','opacity-0');
    setTimeout(()=> resizePlayers(), 80);
}
function showMiniPlayerAfterPlay() {
    dom.miniPlayer.classList.remove('translate-y-full','opacity-0');
}
function showMiniPlayer() {
    dom.fullPlayer.classList.add('translate-y-full');
    dom.miniPlayer.classList.remove('translate-y-full','opacity-0');
    hideQueuePanel();
}

function setPlayIcon(isPaused) {
    dom.playIcon.classList.toggle('hidden', !isPaused);
    dom.pauseIcon.classList.toggle('hidden', isPaused);
    dom.miniPlayIcon.classList.toggle('hidden', !isPaused);
    dom.miniPauseIcon.classList.toggle('hidden', isPaused);
}

function updateFavoriteIcon() {
    if (!state.currentTrack) return;
    const videoId = typeof state.currentTrack.id === 'object' ? state.currentTrack.id.videoId : state.currentTrack.id;
    const isFav = state.favorites.some(fav => (typeof fav.id === 'object' ? fav.id.videoId : fav.id) === videoId);
    if (isFav) dom.favIconFull.classList.add('fill-red-500','text-red-500');
    else dom.favIconFull.classList.remove('fill-red-500','text-red-500');
}

function updateShuffleLoopIcons() {
    dom.shuffleBtn.classList.toggle('text-blue-500', state.isShuffle);
    dom.loopBtn.classList.toggle('text-blue-500', state.isLoop);
}

function resizePlayers() {
    try {
        if (state.visiblePlayer && state.visiblePlayer.getIframe) {
            const iframe = state.visiblePlayer.getIframe();
            const w = dom.playerVideoContainer.clientWidth;
            const h = dom.playerVideoContainer.clientHeight;
            if (typeof state.visiblePlayer.setSize === 'function') state.visiblePlayer.setSize(w, h);
            if (iframe) {
                iframe.style.width = '100%';
                iframe.style.height = '100%';
            }
        }
    } catch(e){ console.warn('resizePlayers error', e); }
}
window.addEventListener('resize', () => { resizePlayers(); });

function getActivePlayer() {
    // prefer hidden when document.hidden to allow background play
    if (document.hidden) {
        return state.hiddenPlayer || state.visiblePlayer;
    }
    return state.visiblePlayer || state.hiddenPlayer;
}

// ==== Core playback functions (suaves para minimizar prerolls) ====
function loadAndPlayById(videoId, autoplay = true) {
    if (!videoId || !state.playersReady) {
        state.pendingPlay = { videoId, autoplay };
        return;
    }

    const target = getActivePlayer();
    const other = (target === state.visiblePlayer) ? state.hiddenPlayer : state.visiblePlayer;

    try {
        // Pause other gently (no immediate stop)
        try { if (other && other.pauseVideo) other.pauseVideo(); } catch(e){}

        // Prefer cueVideoById to prepare without forcing a reload
        if (typeof target.cueVideoById === 'function') {
            target.cueVideoById({ videoId, startSeconds: 0 });
            if (autoplay) {
                // small delay to let player buffer
                setTimeout(() => {
                    try { target.playVideo(); } catch (e) { console.warn("play after cue failed", e); }
                }, 150);
            }
        } else if (typeof target.loadVideoById === 'function') {
            // fallback
            target.loadVideoById({ videoId, startSeconds: 0 });
            if (autoplay) setTimeout(()=>{ try{ target.playVideo(); }catch(e){} }, 100);
        }
    } catch (e) {
        console.error("Error loadAndPlayById:", e);
    }
}

function playTrack(video, queue = [], queueIndex = 0) {
    const videoId = typeof video.id === 'object' ? video.id.videoId : video.id;
    if (!videoId) {
        console.error("No videoId:", video);
        return;
    }

    // If players not ready, queue it for later (but update UI)
    if (!state.playersReady) {
        state.queuedTrack = { video, queue, queueIndex };
        updatePlayerUI(video);
        showFullPlayer();
        setPlayIcon(true);
        return;
    }

    state.currentTrack = video;
    state.currentQueue = queue;
    state.currentQueueIndex = queueIndex;
    state.queuedTrack = null;

    addToRecents(video);
    updatePlayerUI(video);

    // Use loadAndPlayById - it will cue then play
    loadAndPlayById(videoId, true);

    // If the document is visible, show full player to the user; else we keep in background
    if (!document.hidden) showFullPlayer();

    updatePlayingIndicator();
}

function togglePlayPause() {
    if (!state.playersReady && state.queuedTrack) {
        const { video, queue, queueIndex } = state.queuedTrack;
        playTrack(video, queue, queueIndex);
        return;
    }

    const active = getActivePlayer();
    if (!active || !state.currentTrack) return;
    try {
        const st = (typeof active.getPlayerState === 'function') ? active.getPlayerState() : -1;
        if (st === YT.PlayerState.PLAYING) active.pauseVideo();
        else active.playVideo();
    } catch(e) { console.warn("togglePlayPause error", e); }
}

function playNext() {
    if (!state.currentQueue.length) return;
    if (state.isLoop) {
        playTrack(state.currentTrack, state.currentQueue, state.currentQueueIndex);
        return;
    }
    let nextIndex = state.isShuffle ? Math.floor(Math.random() * state.currentQueue.length) : (state.currentQueueIndex + 1) % state.currentQueue.length;
    playTrack(state.currentQueue[nextIndex], state.currentQueue, nextIndex);
}

function playPrev() {
    if (!state.currentQueue.length) return;
    let prevIndex = state.isShuffle ? Math.floor(Math.random() * state.currentQueue.length) : (state.currentQueueIndex - 1 + state.currentQueue.length) % state.currentQueue.length;
    playTrack(state.currentQueue[prevIndex], state.currentQueue, prevIndex);
}

function toggleShuffle() { state.isShuffle = !state.isShuffle; updateShuffleLoopIcons(); }
function toggleLoop() { state.isLoop = !state.isLoop; updateShuffleLoopIcons(); }

function populateQueuePanel() {
    const queue = state.currentQueue;
    const container = dom.playerQueueList;
    if (!queue.length) {
        container.innerHTML = '<p class="text-gray-400 text-center p-4">No hay nada en la cola.</p>';
        return;
    }
    container.innerHTML = queue.map((item, index) => {
        const snippet = item.snippet;
        if (!snippet) return '';
        const isPlaying = (index === state.currentQueueIndex);
        const titleClass = isPlaying ? 'text-blue-500 font-bold' : 'font-medium';
        return `<div class="flex items-center p-2 rounded-lg hover:bg-gray-700 cursor-pointer queue-item" data-index="${index}">
            <img src="${snippet.thumbnails?.default?.url || 'https://placehold.co/40x40/000/fff?text=?'}" alt="${snippet.title}" class="w-10 h-10 object-cover rounded-md mr-3">
            <div class="flex-1 truncate">
                <p class="${titleClass} truncate">${snippet.title}</p>
                <p class="text-sm text-gray-400 truncate">${snippet.channelTitle}</p>
            </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.queue-item').forEach(itemEl => {
        itemEl.addEventListener('click', () => {
            const index = parseInt(itemEl.dataset.index);
            playTrack(state.currentQueue[index], state.currentQueue, index);
        });
    });
}

function showQueuePanel() { populateQueuePanel(); dom.playerQueuePanel.classList.add('visible'); }
function hideQueuePanel() { dom.playerQueuePanel.classList.remove('visible'); }

// Fullscreen toggle
async function toggleFullScreen() {
    const container = dom.playerVideoContainer;
    try {
        if (!document.fullscreenElement) {
            if (container.requestFullscreen) await container.requestFullscreen();
            else if (container.webkitRequestFullscreen) await container.webkitRequestFullscreen();
            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock('landscape').catch(err => {
                    console.log("No se pudo bloquear la orientación a horizontal:", err);
                });
            }
        } else {
            if (document.exitFullscreen) await document.exitFullscreen();
            if (screen.orientation && screen.orientation.unlock) {
                screen.orientation.unlock();
            }
        }
    } catch(e) {
        console.error("Error al cambiar a pantalla completa:", e);
        showToast("La pantalla completa no es compatible.");
    }
}

// Favorites / libraries / recents
function loadFavorites() {
    const favs = localStorage.getItem(`${CONFIG.STORAGE_PREFIX}favorites`);
    if (favs) state.favorites = JSON.parse(favs);
}
function saveFavorites() { localStorage.setItem(`${CONFIG.STORAGE_PREFIX}favorites`, JSON.stringify(state.favorites)); }

function toggleFavorite() {
    if (!state.currentTrack) return;
    const videoId = typeof state.currentTrack.id === 'object' ? state.currentTrack.id.videoId : state.currentTrack.id;
    const favIndex = state.favorites.findIndex(fav => (typeof fav.id === 'object' ? fav.id.videoId : fav.id) === videoId);
    if (favIndex > -1) {
        state.favorites.splice(favIndex,1);
        showToast('Eliminado de Favoritos');
    } else {
        state.favorites.push(state.currentTrack);
        showToast('Añadido a Favoritos');
    }
    saveFavorites();
    updateFavoriteIcon();
    if (state.currentPage === 'favorites') renderFavorites();
}

function removeFromFavorites(videoId) {
    const favIndex = state.favorites.findIndex(fav => (typeof fav.id === 'object' ? fav.id.videoId : fav.id) === videoId);
    if (favIndex > -1) {
        state.favorites.splice(favIndex, 1);
        saveFavorites();
        renderFavorites();
        showToast('Eliminado de Favoritos');
        if (state.currentTrack) {
            const currentVideoId = typeof state.currentTrack.id === 'object' ? state.currentTrack.id.videoId : state.currentTrack.id;
            if (currentVideoId === videoId) updateFavoriteIcon();
        }
    }
}

function loadLibraries() {
    const raw = localStorage.getItem(`${CONFIG.STORAGE_PREFIX}libraries`);
    if (raw) state.libraries = JSON.parse(raw);
    else state.libraries = [];
}
function saveLibraries() { localStorage.setItem(`${CONFIG.STORAGE_PREFIX}libraries`, JSON.stringify(state.libraries)); }

function createLibrary(name) {
    if (!name || !name.trim()) return null;
    const id = `lib_${Date.now()}`;
    const lib = { id, name: name.trim(), items: [] };
    state.libraries.push(lib);
    saveLibraries();
    if(state.currentPage === 'library') renderLibrariesPage();
    showToast(`Biblioteca "${lib.name}" creada`);
    return lib;
}

function deleteLibrary(libraryId) {
    state.libraries = state.libraries.filter(lib => lib.id !== libraryId);
    saveLibraries();
    renderLibrariesPage();
    showToast('Biblioteca eliminada');
}

function removeFromLibrary(videoId, libraryId) {
    const lib = state.libraries.find(x => x.id === libraryId);
    if (!lib) return;
    lib.items = lib.items.filter(it => (typeof it.id === 'object' ? it.id.videoId : it.id) !== videoId);
    saveLibraries();
    renderVideoList(dom.resultsContainer, lib.items, 'library', lib.id);
    showToast(`Eliminado de "${lib.name}"`);
}

function renderLibrariesPage() {
    const container = dom.libraryContainer;
    if (!container) return;
    if (!state.libraries.length) {
        container.innerHTML = `<p class="text-gray-400 text-center">No has creado ninguna biblioteca. Usa el menú (⋯) en una canción para crear una.</p>`;
        return;
    }
    container.innerHTML = state.libraries.map(lib => `
        <div class="bg-gray-800 p-4 rounded-lg mb-3 flex justify-between items-center library-item-wrapper">
            <div class="flex-1 flex items-center cursor-pointer library-item" data-library-id="${lib.id}">
                <div>
                    <h3 class="text-lg font-semibold">${lib.name}</h3>
                    <p class="text-sm text-gray-400">${lib.items.length} canciones</p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-500 ml-auto mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
            </div>
            <button class="item-delete-btn" data-library-id="${lib.id}" title="Eliminar biblioteca">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
        </div>
    `).join('');

    container.querySelectorAll('.library-item').forEach(el => el.addEventListener('click', () => {
        const libId = el.dataset.libraryId;
        const lib = state.libraries.find(x => x.id === libId);
        if (!lib) return;
        showPage('home');
        toggleHomeSections(false);
        dom.homeTitle.textContent = `Biblioteca: ${lib.name}`;
        if (!lib.items.length) {
            dom.resultsContainer.innerHTML = `<p class="text-gray-400 text-center">Biblioteca "${lib.name}" vacía.</p>`;
        } else {
            renderVideoList(dom.resultsContainer, lib.items, 'library', lib.id);
        }
    }));

    container.querySelectorAll('.item-delete-btn').forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const libId = btn.dataset.libraryId;
        const libName = state.libraries.find(l=>l.id===libId)?.name || 'esta biblioteca';
        openConfirmModal(`¿Seguro que quieres eliminar la biblioteca "${libName}"? Esta acción no se puede deshacer.`, () => deleteLibrary(libId));
    }));
}

function addCurrentTrackToLibrary(libraryId) {
    if (!state.currentTrack) { showToast('No hay canción seleccionada.'); return; }
    const lib = state.libraries.find(x => x.id === libraryId);
    if (!lib) { showToast('Biblioteca no encontrada.'); return; }
    const videoId = typeof state.currentTrack.id === 'object' ? state.currentTrack.id.videoId : state.currentTrack.id;
    const exists = lib.items.some(it => (typeof it.id === 'object' ? it.id.videoId : it.id) === videoId);
    if (exists) { showToast('La canción ya está en la biblioteca.'); return; }
    lib.items.push(state.currentTrack);
    saveLibraries();
    if(state.currentPage === 'library') renderLibrariesPage();
    showToast(`Añadido a "${lib.name}"`);
}

function loadRecents() {
    const raw = localStorage.getItem(`${CONFIG.STORAGE_PREFIX}recents`);
    if (raw) state.recents = JSON.parse(raw);
    else state.recents = [];
}
function saveRecents() { localStorage.setItem(`${CONFIG.STORAGE_PREFIX}recents`, JSON.stringify(state.recents)); }

function addToRecents(video) {
    try {
        const id = typeof video.id === 'object' ? video.id.videoId : video.id;
        if (!id) return;
        state.recents = state.recents.filter(it => ((typeof it.id === 'object' ? it.id.videoId : it.id) !== id));
        state.recents.unshift(video);
        if (state.recents.length > 50) state.recents.length = 50;
        saveRecents();
    } catch(e){ console.warn('addToRecents error', e); }
}

function removeFromRecents(videoId) {
    state.recents = state.recents.filter(it => (typeof it.id === 'object' ? it.id.videoId : it.id) !== videoId);
    saveRecents();
    renderRecents();
    showToast('Eliminado de Recientes');
}

function renderRecents() {
    if (!state.recents.length) {
        dom.recentsContainer.innerHTML = '<p class="text-gray-400 text-center">No has reproducido canciones todavía.</p>';
        return;
    }
    renderVideoList(dom.recentsContainer, state.recents, 'recents');
}

// ===== Fetching YT data =====
async function fetchPopularMusic() {
    showLoading(dom.popularMusicContainer);
    try {
        const url = buildApiUrl('/videos', {part: 'snippet,contentDetails,statistics',chart: 'mostPopular',videoCategoryId: '10',regionCode: 'US',maxResults: CONFIG.YT_MAX_RESULTS});
        const data = await fetchWithRetry(url);
        renderVideoList(dom.popularMusicContainer, data.items || []);
    } catch (error) {
        console.error("Error al cargar música popular:", error);
        dom.popularMusicContainer.innerHTML = `<p class="text-red-400">Error al cargar la música popular.</p>`;
    }
}

async function fetchVideosByQuery(query) {
    toggleHomeSections(false);
    showLoading(dom.resultsContainer);
    dom.homeTitle.textContent = `Resultados para: "${query}"`;
    try {
        const url = buildApiUrl('/search', {part: 'snippet',q: query,type: 'video',videoCategoryId: '10',maxResults: CONFIG.YT_MAX_RESULTS});
        const data = await fetchWithRetry(url);
        renderVideoList(dom.resultsContainer, data.items || []);
    } catch (error) {
        console.error("Error al buscar videos:", error);
        dom.resultsContainer.innerHTML = `<p class="text-red-400">Error al buscar videos.</p>`;
    }
}

async function fetchPlaylistsByQuery(query) {
    showLoading(dom.playlistsContainer);
    try {
        const url = buildApiUrl('/search', {part: 'snippet',q: query,type: 'playlist',maxResults: 12});
        const data = await fetchWithRetry(url);
        renderPlaylistList(dom.playlistsContainer, data.items || []);
    } catch (err) {
        console.error('Error playlists:', err);
        dom.playlistsContainer.innerHTML = `<p class="text-red-400">Error al cargar playlists.</p>`;
    }
}

async function fetchPlaylistItemsAndRender(playlistId) {
    showLoading(dom.playlistSongsContainer);
    showPage('playlist-details');
    try {
        const url = buildApiUrl('/playlistItems', { part: 'snippet,contentDetails', playlistId, maxResults: CONFIG.YT_MAX_RESULTS });
        const data = await fetchWithRetry(url);
        const items = (data.items || []).map(it => ({ id: { videoId: it.contentDetails.videoId }, snippet: it.snippet }));
        if (data.items.length > 0) {
            const firstItem = data.items[0].snippet;
            const coverArt = firstItem.thumbnails?.maxres?.url || firstItem.thumbnails?.high?.url || 'https://placehold.co/640x480/0f1724/ffffff?text=Playlist';
            dom.playlistHeader.style.backgroundImage = `url('${coverArt}')`;
            dom.playlistTitle.textContent = firstItem.playlistTitle || "Playlist";
            dom.playlistStickyTitle.textContent = firstItem.playlistTitle || "Playlist";
            dom.playlistChannel.textContent = `Por: ${firstItem.videoOwnerChannelTitle || 'Desconocido'}`;
            renderVideoList(dom.playlistSongsContainer, items);
        } else {
            dom.playlistTitle.textContent = "Playlist Vacía";
            dom.playlistStickyTitle.textContent = "Playlist Vacía";
            dom.playlistSongsContainer.innerHTML = `<p class="text-gray-400 text-center">Esta playlist no contiene videos.</p>`;
        }
    } catch (err) {
        console.error('Error playlist items:', err);
        dom.playlistTitle.textContent = 'Error';
        dom.playlistStickyTitle.textContent = 'Error';
        dom.playlistSongsContainer.innerHTML = `<p class="text-red-400">Error al cargar los videos de la playlist.</p>`;
    }
}

// ===== Modals & UI small helpers =====
function openConfirmModal(message, onConfirm) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'confirm-modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<h3 class="text-lg font-semibold">Confirmar Acción</h3><p class="text-gray-300 my-4">${message}</p><div class="flex gap-2 mt-4 justify-end"><button id="modal-confirm-yes" class="px-3 py-1 bg-red-600 rounded">Sí, eliminar</button><button id="modal-confirm-no" class="px-3 py-1 bg-gray-600 rounded">Cancelar</button></div>`;
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    const close = () => { if (backdrop.parentNode) document.body.removeChild(backdrop); };
    modal.querySelector('#modal-confirm-no').addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if(e.target === backdrop) close(); });
    modal.querySelector('#modal-confirm-yes').addEventListener('click', () => { onConfirm(); close(); });
}

function openLibraryOptionsModal() {
    if (!state.currentTrack) { showToast('No hay canción seleccionada.'); return; }
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'library-options-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<h3>Opciones de Biblioteca</h3><div id="modal-content"><p class="text-xs text-gray-400 mb-2">Añade esta canción a una biblioteca existente o crea una nueva.</p></div><div id="library-list-modal" class="max-h-40 overflow-y-auto my-3"></div><div id="create-library-form" class="hidden mt-3"><label class="text-xs text-gray-400">Nombre de la nueva biblioteca</label><input id="modal-create-library-input" class="w-full bg-gray-700 rounded p-2 mt-2" placeholder="Ej: Mix de Rock" /><div class="flex gap-2 mt-2 justify-end"><button id="modal-create-confirm" class="px-3 py-1 bg-blue-600 rounded">Crear y Añadir</button><button id="modal-create-cancel-form" class="px-3 py-1 bg-gray-600 rounded">Cancelar</button></div></div><div id="modal-main-actions" class="flex gap-2 mt-4 justify-end"><button id="modal-add-to-lib-btn" class="px-3 py-1 bg-blue-600 rounded">Añadir</button><button id="modal-new-lib-btn" class="px-3 py-1 bg-green-600 rounded">Crear Nueva</button><button id="modal-cancel-btn" class="px-3 py-1 bg-gray-600 rounded">Cerrar</button></div>`;
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    const content = modal.querySelector('#library-list-modal'), createForm = modal.querySelector('#create-library-form'), mainActions = modal.querySelector('#modal-main-actions'), addBtn = modal.querySelector('#modal-add-to-lib-btn');

    if (!state.libraries.length) {
        content.innerHTML = `<p class="text-sm text-gray-300">No hay bibliotecas locales. Debes crear una.</p>`;
        addBtn.classList.add('hidden');
    } else {
        const select = document.createElement('select');
        select.className = 'w-full bg-gray-700 text-white rounded p-2';
        select.id = 'modal-library-select';
        select.innerHTML = state.libraries.map(lib => `<option value="${lib.id}">${lib.name} (${lib.items.length})</option>`).join('');
        content.appendChild(select);
    }

    const close = () => { if (backdrop.parentNode) document.body.removeChild(backdrop); };
    modal.querySelector('#modal-cancel-btn').addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    modal.querySelector('#modal-new-lib-btn').addEventListener('click', () => { createForm.classList.remove('hidden'); mainActions.classList.add('hidden'); content.classList.add('hidden'); });
    modal.querySelector('#modal-create-cancel-form').addEventListener('click', () => { createForm.classList.add('hidden'); mainActions.classList.remove('hidden'); content.classList.remove('hidden'); });
    modal.querySelector('#modal-create-confirm').addEventListener('click', () => {
        const input = modal.querySelector('#modal-create-library-input'), name = input.value.trim();
        if (name) {
            const newLib = createLibrary(name);
            if (newLib) addCurrentTrackToLibrary(newLib.id);
            close();
        } else showToast('Ingresa un nombre válido.');
    });
    modal.querySelector('#modal-add-to-lib-btn').addEventListener('click', () => {
        if (!state.libraries.length) return;
        const selectEl = document.getElementById('modal-library-select');
        if (!selectEl) return;
        addCurrentTrackToLibrary(selectEl.value);
        close();
    });
}

function showToast(text, ms = 2500) {
    try {
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = text;
        dom.toastRoot.appendChild(t);
        setTimeout(()=> {
            t.style.transition = 'opacity 300ms';
            t.style.opacity = '0';
            setTimeout(()=> { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
        }, ms);
    } catch(e){ console.warn('toast error', e); }
}

// ===== Visibility change transfer (suave, usa cue) =====
function handleVisibilityChange() {
    if (!state.playersReady || !state.currentTrack || state.transferInProgress) return;
    const videoId = typeof state.currentTrack.id === 'object' ? state.currentTrack.id.videoId : state.currentTrack.id;
    if (!videoId) return;

    let source, target;
    if (document.hidden) {
        source = state.visiblePlayer;
        target = state.hiddenPlayer;
    } else {
        source = state.hiddenPlayer;
        target = state.visiblePlayer;
    }

    try {
        const srcState = (source && source.getPlayerState) ? source.getPlayerState() : -1;
        const isPlaying = (srcState === YT.PlayerState.PLAYING);
        const isPaused = (srcState === YT.PlayerState.PAUSED);

        if (isPlaying || isPaused) {
            const currentTime = (source.getCurrentTime) ? source.getCurrentTime() : 0;
            state.transferInProgress = true;

            if (target && typeof target.cueVideoById === 'function') {
                try {
                    target.cueVideoById({ videoId, startSeconds: currentTime });

                    if (isPlaying) {
                        // play on target after slight delay
                        setTimeout(() => {
                            try { target.playVideo(); } catch(e) { console.warn("target.playVideo error", e); }
                        }, 150);
                    } else {
                        setTimeout(() => {
                            try { target.pauseVideo(); } catch(e) {}
                        }, 150);
                    }

                    // stop source once target is settled
                    setTimeout(() => {
                        try { if (source && source.stopVideo) source.stopVideo(); } catch(e) {}
                        state.transferInProgress = false;
                    }, 700);
                } catch (err) {
                    console.error("Error al transferir con cueVideoById:", err);
                    try { if (target && typeof target.loadVideoById === 'function') target.loadVideoById({ videoId, startSeconds: currentTime }); } catch(e){}
                    setTimeout(()=> { state.transferInProgress = false; }, 700);
                }
            } else {
                // fallback load
                try {
                    if (target && typeof target.loadVideoById === 'function') {
                        target.loadVideoById({ videoId, startSeconds: currentTime });
                        if (isPlaying) setTimeout(()=>{ try{ target.playVideo(); }catch(e){} },150);
                    }
                } catch(e) { console.warn("Transfer fallback error", e); }
                setTimeout(()=> { state.transferInProgress = false; }, 700);
            }
        }
    } catch (e) {
        console.error("Error en handleVisibilityChange:", e);
        state.transferInProgress = false;
    }
}

// ===== Init & event wiring =====
function initApp() {
    // Sidebar
    dom.openSidebarBtn.addEventListener('click', () => toggleSidebar(true));
    dom.closeSidebarBtn.addEventListener('click', () => toggleSidebar(false));
    dom.sidebarBackdrop.addEventListener('click', () => toggleSidebar(false));

    dom.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showPage(e.currentTarget.dataset.page);
            toggleSidebar(false);
        });
    });

    // Search
    dom.searchButton.addEventListener('click', () => {
        const query = dom.searchInput.value.trim();
        if (query) { fetchVideosByQuery(query); showPage('home'); }
    });
    dom.searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') dom.searchButton.click(); });
    dom.searchPlaylistsButton.addEventListener('click', () => { const query = dom.searchInput.value.trim() || 'Top playlists'; fetchPlaylistsByQuery(query); showPage('home'); });

    // Categories
    dom.categoryButtons.forEach(button => {
        button.addEventListener('click', () => {
            fetchVideosByQuery(button.dataset.category + " music");
            showPage('home');
        });
    });

    // Player controls
    dom.minimizePlayerBtn.addEventListener('click', ()=>showMiniPlayer());
    dom.maximizePlayerBtn.addEventListener('click', ()=>showFullPlayer());
    dom.playPauseBtn.addEventListener('click', togglePlayPause);
    dom.miniPlayPauseBtn.addEventListener('click', togglePlayPause);
    dom.nextBtn.addEventListener('click', playNext);
    dom.prevBtn.addEventListener('click', playPrev);
    dom.shuffleBtn.addEventListener('click', toggleShuffle);
    dom.loopBtn.addEventListener('click', toggleLoop);
    dom.favBtnFull.addEventListener('click', toggleFavorite);
    dom.libraryOptionsBtn.addEventListener('click', () => openLibraryOptionsModal());

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Playlist page handlers
    dom.playlistBackBtn.addEventListener('click', () => { showPage(state.lastPage || 'home'); });
    if (dom.playlistPage) {
        dom.playlistPage.addEventListener('scroll', () => {
            dom.playlistPage.classList.toggle('scrolled', dom.playlistPage.scrollTop > 150);
        });
    }

    // Progress bar listeners
    if (dom.playerProgressBar) {
        dom.playerProgressBar.addEventListener('input', (e) => {
            const newTime = e.target.value;
            dom.playerCurrentTime.textContent = formatTime(newTime);
            dom.playerProgressBar.style.setProperty('--progress-percent', `${(newTime / dom.playerProgressBar.max) * 100}%`);
        });
        dom.playerProgressBar.addEventListener('change', (e) => {
            try { getActivePlayer().seekTo(e.target.value, true); } catch(e){}
            state.isSeeking = false;
        });
        dom.playerProgressBar.addEventListener('mousedown', () => { state.isSeeking = true; });
        dom.playerProgressBar.addEventListener('mouseup', () => { state.isSeeking = false; });
    }

    // Gestures for queue panel
    dom.queueTriggerArea.addEventListener('touchstart', e => {
        state.touchStartY = e.touches[0].clientY;
        state.touchMoveY = e.touches[0].clientY;
    }, { passive: true });
    dom.queueTriggerArea.addEventListener('touchmove', e => {
        state.touchMoveY = e.touches[0].clientY;
    }, { passive: true });
    dom.queueTriggerArea.addEventListener('touchend', () => {
        if (state.touchStartY - state.touchMoveY > 50) { showQueuePanel(); }
        state.touchStartY = 0; state.touchMoveY = 0;
    });

    dom.playerQueueHandle.addEventListener('touchstart', e => {
        state.touchStartY = e.touches[0].clientY;
        state.touchMoveY = e.touches[0].clientY;
    }, { passive: true });
    dom.playerQueueHandle.addEventListener('touchmove', e => {
        state.touchMoveY = e.touches[0].clientY;
    }, { passive: true });
    dom.playerQueueHandle.addEventListener('touchend', () => {
        if (state.touchMoveY > 0 && state.touchMoveY - state.touchStartY > 50) {
            hideQueuePanel();
        }
        state.touchStartY = 0; state.touchMoveY = 0;
    });

    // Fullscreen
    dom.fullscreenBtn.addEventListener('click', toggleFullScreen);

    // Load saved data & initial requests
    loadFavorites(); loadLibraries(); loadRecents();
    fetchPopularMusic(); fetchPlaylistsByQuery('Top music');
}

document.addEventListener('DOMContentLoaded', initApp);

// End of script.js




/**
 * Reemplaza/borra todo lo de abajo y pega aquí tu código JS.
 * Ejemplo mínimo de inicialización:
 */
document.addEventListener('DOMContentLoaded', function() {
  // Código de ejemplo — puedes borrar estas 4 líneas
  const root = document.getElementById('extrasRoot') || document.getElementById('app');
  if(root) {
    const p = document.createElement('p');
    p.textContent = 'Tu código JS puede inicializarse aquí (DOMContentLoaded).';
    p.style.textAlign = 'center';
    p.style.color = '#666';
    root.appendChild(p);
  }

  // Emite evento de arranque
  APP.bus.emit('app.ready', { ts: Date.now() });
});

/* --- FIN: PEGA TU CÓDIGO AQUÍ --- */

/* Exporta APP para debugging */
window._app = APP;
