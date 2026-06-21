/* ═══════════════════════════════════════════════
   TurboSpot — script.js
═══════════════════════════════════════════════ */

const API = 'http://localhost:3045';

/* ScrambleText é opcional — usa só se carregou */
if (typeof ScrambleTextPlugin !== 'undefined') {
  gsap.registerPlugin(ScrambleTextPlugin);
}

/* ── Dados ───────────────────────────────────── */
const PROJECTS = [
  {
    id: 1,
    artist:   'TURBOSPOT',
    album:    'DOWNLOAD TRACK',
    category: 'FEATURE',
    label:    'MUSIC DOWNLOADER',
    year:     '2024',
    image:    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1000',
    modal:    'ovTrack'
  },
  {
    id: 2,
    artist:   'TURBOSPOT',
    album:    'DOWNLOAD PLAYLIST',
    category: 'FEATURE',
    label:    'MUSIC DOWNLOADER',
    year:     '2024',
    image:    'https://images.unsplash.com/photo-1511379938547-c1f69b13d835?w=1000',
    modal:    'ovPlaylist'
  },
  {
    id: 3,
    artist:   'TURBOSPOT',
    album:    'SEARCH INFO',
    category: 'FEATURE',
    label:    'MUSIC DOWNLOADER',
    year:     '2024',
    image:    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000',
    modal:    null
  }
];

const ALBUM_BG = [
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1000',
  'https://images.unsplash.com/photo-1511379938547-c1f69b13d835?w=1000',
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000',
  'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=1000',
  'https://images.unsplash.com/photo-1458560871784-56d23406c091?w=1000',
  'https://images.unsplash.com/photo-1501612780327-45045538702b?w=1000',
  'https://images.unsplash.com/photo-1468164016595-6108e4c60c8b?w=1000',
  'https://images.unsplash.com/photo-1526218626217-dc65a29bb444?w=1000',
  'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=1000',
  'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=1000',
  'https://images.unsplash.com/photo-1483412033650-1015ddeb83d1?w=1000',
  'https://images.unsplash.com/photo-1500462918059-b1a0cb512f1d?w=1000',
  'https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=1000',
  'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=1000',
  'https://images.unsplash.com/photo-1487537023671-8dce1a785863?w=1000'
];

ALBUM_BG.forEach(u => { const i = new Image(); i.src = u; });

/* ─────────────────────────────────────────────
   BACKGROUND
───────────────────────────────────────────── */
const bgEl    = document.getElementById('bgImg');
const wrapEl  = document.getElementById('wrap');
let bgIdx     = Math.floor(Math.random() * ALBUM_BG.length);
let bgTimer   = null;
let activeIdx = -1;

function setBg(url) {
  gsap.killTweensOf(bgEl);
  bgEl.style.backgroundImage = 'url(' + url + ')';
  gsap.to(bgEl, { opacity: 1, duration: .7, ease: 'power2.inOut' });
  gsap.to(bgEl, { transform: 'scale(1)', duration: .9, ease: 'power2.inOut' });
}

function dimBg() {
  gsap.killTweensOf(bgEl);
  gsap.to(bgEl, { opacity: .18, duration: .5, ease: 'power2.inOut' });
  gsap.set(bgEl, { transform: 'scale(1.15)' });
}

function startBgCycle() {
  stopBgCycle();
  bgEl.style.backgroundImage = 'url(' + ALBUM_BG[bgIdx] + ')';
  gsap.to(bgEl, { opacity: .18, duration: .8 });
  bgTimer = setInterval(function() {
    if (activeIdx !== -1) return;
    bgIdx = (bgIdx + 1) % ALBUM_BG.length;
    gsap.to(bgEl, {
      opacity: 0, duration: .4,
      onComplete: function() {
        bgEl.style.backgroundImage = 'url(' + ALBUM_BG[bgIdx] + ')';
        gsap.to(bgEl, { opacity: .18, duration: .6 });
      }
    });
  }, 3500);
}

function stopBgCycle() {
  if (bgTimer) { clearInterval(bgTimer); bgTimer = null; }
}

startBgCycle();

/* ─────────────────────────────────────────────
   RELÓGIO
───────────────────────────────────────────── */
function updateClock() {
  document.getElementById('clk').textContent =
    new Date().toLocaleTimeString('pt-PT');
}
updateClock();
setInterval(updateClock, 1000);

/* ─────────────────────────────────────────────
   IDLE ANIMATION
───────────────────────────────────────────── */
var idleTimer = null;
var idleTl    = null;
var itemEls   = [];

function startIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(function() {
    if (activeIdx !== -1) return;
    idleTl = gsap.timeline({ repeat: -1, repeatDelay: 1.5 });
    itemEls.forEach(function(el, i) {
      idleTl.to(el, { opacity: .04, duration: .08, ease: 'power2.inOut' }, i * .06);
      idleTl.to(el, { opacity: 1,   duration: .08, ease: 'power2.inOut' },
        itemEls.length * .06 * .5 + i * .06);
    });
  }, 4000);
}

function stopIdle() {
  clearTimeout(idleTimer);
  if (idleTl) { idleTl.kill(); idleTl = null; }
  itemEls.forEach(function(el) { gsap.set(el, { opacity: 1 }); });
}

/* ─────────────────────────────────────────────
   RENDER DOS ITEMS
───────────────────────────────────────────── */
var plist  = document.getElementById('plist');
var FIELDS = ['artist', 'album', 'category', 'label', 'year'];
var hasScramble = typeof ScrambleTextPlugin !== 'undefined';

PROJECTS.forEach(function(p, i) {
  var li = document.createElement('li');
  li.className = 'pitem';

  li.innerHTML = FIELDS.map(function(f) {
    return '<span class="pdata ' + f + '" data-val="' + p[f] + '">' + p[f] + '</span>';
  }).join('');

  li.addEventListener('mouseenter', function() {
    stopIdle();
    if (activeIdx === i) return;
    activeIdx = i;
    stopBgCycle();

    itemEls.forEach(function(el, j) {
      el.classList.toggle('active', j === i);
    });

    setBg(p.image);

    if (hasScramble) {
      li.querySelectorAll('.pdata').forEach(function(span) {
        gsap.killTweensOf(span);
        gsap.to(span, {
          duration: .85,
          scrambleText: {
            text:        span.dataset.val,
            chars:       'qwerty1337h@ck3r',
            revealDelay: .28,
            speed:       .4
          }
        });
      });
    }
  });

  li.addEventListener('mouseleave', function() {
    li.querySelectorAll('.pdata').forEach(function(span) {
      gsap.killTweensOf(span);
      span.textContent = span.dataset.val;
    });
  });

  li.addEventListener('click', function() {
    if (p.modal) openModal(p.modal);
  });

  plist.appendChild(li);
  itemEls.push(li);
});

wrapEl.addEventListener('mouseleave', function() {
  activeIdx = -1;
  itemEls.forEach(function(el) { el.classList.remove('active'); });
  dimBg();
  startBgCycle();
  startIdleTimer();
});

plist.addEventListener('mouseenter', stopIdle);
plist.addEventListener('mouseleave', function() { startIdleTimer(); });
startIdleTimer();

/* ─────────────────────────────────────────────
   MODAIS
───────────────────────────────────────────── */
function openModal(id) {
  document.querySelectorAll('.overlay').forEach(function(ov) {
    if (ov.id !== id) _closeNow(ov);
  });
  var ov = document.getElementById(id);
  ov.style.display = 'flex';
  var mc = ov.querySelector('.modal');
  gsap.fromTo(ov, { opacity: 0 }, { opacity: 1, duration: .22, ease: 'power2.out' });
  gsap.fromTo(mc, { y: 30, scale: .97 }, { y: 0, scale: 1, duration: .3, ease: 'power3.out' });
}

function _closeNow(ov) {
  ov.style.display = 'none';
}

function closeModal(id) {
  var ov = document.getElementById(id);
  gsap.to(ov, {
    opacity: 0, duration: .18, ease: 'power2.in',
    onComplete: function() { _closeNow(ov); }
  });
}

document.querySelectorAll('.overlay').forEach(function(ov) {
  ov.addEventListener('click', function(e) {
    if (e.target === ov) closeModal(ov.id);
  });
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.overlay').forEach(function(ov) {
      if (ov.style.display === 'flex') closeModal(ov.id);
    });
  }
});

/* ─────────────────────────────────────────────
   API — TRACK
───────────────────────────────────────────── */
async function searchTrack() {
  var link = document.getElementById('trackLink').value.trim();
  if (!link) return;

  var prev = document.getElementById('trackPrev');
  var btn  = document.getElementById('btnSearch');

  btn.disabled = true;
  btn.innerHTML = '<span class="sp"></span> A pesquisar…';
  prev.innerHTML = '';

  try {
    var id = link.includes('spotify.com')
      ? (link.match(/track\/([a-zA-Z0-9]+)/) || [])[1]
      : link;
    if (!id) throw new Error('Link inválido');

    var res  = await fetch(API + '/track/' + id + '/info');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();

    prev.innerHTML =
      '<img class="prev-img" src="' + escHtml(data.image) + '" alt="' + escHtml(data.name) + '">' +
      '<p class="prev-name">'   + escHtml(data.name)   + '</p>' +
      '<p class="prev-artist">' + escHtml(data.artist) + '</p>' +
      '<div class="prev-actions">' +
        '<button class="btn btn-p" id="btnDlTrack">' +
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="12" height="12"><path d="M13 10v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3"/><polyline points="5 7 8 10 11 7"/><line x1="8" y1="10" x2="8" y2="2"/></svg>' +
          ' Descarregar' +
        '</button>' +
        '<button class="btn btn-s" id="btnHearTrack">' +
          '<svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><polygon points="4,2 14,8 4,14"/></svg>' +
          ' Ouvir' +
        '</button>' +
      '</div>';

    document.getElementById('btnDlTrack').onclick   = function() { window.open(API + '/track/' + id); };
    document.getElementById('btnHearTrack').onclick = function() {
      playerLoad({ name: data.name, artist: data.artist, image: data.image, src: '' });
    };

    gsap.from(prev.children, { opacity: 0, y: 14, stagger: .08, duration: .35, ease: 'power2.out' });

  } catch(e) {
    prev.innerHTML = '<p class="err">Erro: ' + escHtml(e.message) + '</p>';
  } finally {
    btn.disabled = false;
    btn.innerHTML =
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><circle cx="7" cy="7" r="5"/><path d="M12 12l2.5 2.5"/></svg>' +
      ' Pesquisar';
  }
}

/* ─────────────────────────────────────────────
   API — PLAYLIST
───────────────────────────────────────────── */
async function searchPlaylist() {
  var link = document.getElementById('playlistLink').value.trim();
  if (!link) return;

  var list = document.getElementById('trkList');
  var btn  = document.querySelector('.btn-see');

  btn.disabled = true;
  btn.textContent = 'A carregar…';
  list.innerHTML = '';

  try {
    var id = (link.match(/playlist\/([a-zA-Z0-9]+)/) || [])[1];
    if (!id) throw new Error('Link inválido');

    var res  = await fetch(API + '/playlist/' + id);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();

    list.innerHTML = data.tracks.map(function(t, i) {
      return '<div class="trk-row">' +
        '<span class="trk-n">' + (i + 1) + '</span>' +
        '<span><strong>' + escHtml(t.name) + '</strong> — ' + escHtml(t.artist) + '</span>' +
        '</div>';
    }).join('');

    gsap.from(list.querySelectorAll('.trk-row'), {
      opacity: 0, x: -10, stagger: .04, duration: .3, ease: 'power2.out'
    });

  } catch(e) {
    list.innerHTML = '<p class="err">Erro: ' + escHtml(e.message) + '</p>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ver conteúdo';
  }
}

async function downloadPlaylist() {
  var link = document.getElementById('playlistLink').value.trim();
  if (!link) return;

  var btn  = document.querySelector('.btn-dl');
  var orig = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '<span class="sp"></span> A descarregar…';

  try {
    var res  = await fetch(API + '/playlist/download-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: link })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();

    btn.innerHTML = '✓ Descarregado!';
    btn.classList.add('success');
    alert(data.downloaded + '/' + data.total + ' guardadas em downloads/' + data.playlistName + '/');

    setTimeout(function() {
      btn.innerHTML = orig;
      btn.classList.remove('success');
      btn.disabled = false;
    }, 3000);

  } catch(e) {
    btn.innerHTML = orig;
    btn.disabled  = false;
    alert('Erro: ' + e.message);
  }
}

/* ─────────────────────────────────────────────
   MUSIC PLAYER
───────────────────────────────────────────── */
var audio     = new Audio();
var playing   = false;
var dragging  = false;
var vinylRaf  = null;
var vinylRot  = 0;

function $el(id) { return document.getElementById(id); }

function playerLoad(track) {
  audio.src = track.src || '';
  $el('pTitle').textContent  = track.name   || 'Sem título';
  $el('pArtist').textContent = track.artist || '—';

  // Set cover: use provided image, or try to extract from audio file
  if (track.image) {
    setCover(track.image);
  } else if (track.file) {
    extractCoverFromFile(track.file);
  } else {
    setCover('');
  }

  playing = false;
  updatePlayBtn();
  showPlayer();
  if (track.src) {
    audio.play()
      .then(function() { playing = true; updatePlayBtn(); })
      .catch(function() {});
  }
}

function setCover(url) {
  var cov = $el('pCover');
  if (url) {
    // Animate swap
    gsap.to(cov, { scale: 0.85, opacity: 0, duration: 0.18, ease: 'power2.in',
      onComplete: function() {
        cov.style.backgroundImage = 'url(' + url + ')';
        gsap.to(cov, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.4)' });
      }
    });
  } else {
    cov.style.backgroundImage = '';
  }
}

function extractCoverFromFile(file) {
  // Use jsmediatags if available, fallback to no cover
  if (typeof jsmediatags !== 'undefined') {
    jsmediatags.read(file, {
      onSuccess: function(tag) {
        var pic = tag.tags && tag.tags.picture;
        if (pic) {
          var b64 = '';
          for (var i = 0; i < pic.data.length; i++) {
            b64 += String.fromCharCode(pic.data[i]);
          }
          var dataUrl = 'data:' + pic.format + ';base64,' + btoa(b64);
          setCover(dataUrl);
        } else {
          setCover('');
        }
      },
      onError: function() { setCover(''); }
    });
  } else {
    // Try reading embedded art via MediaMetadata / browser
    setCover('');
  }
}

function showPlayer() {
  // Player is always visible — cover swap handled by setCover()
  startVinylSpin();
}

function hidePlayer() {
  // No-op: player is always visible
}

function updatePlayBtn() {
  $el('pPlayBtn').innerHTML = playing
    ? '<svg viewBox="0 0 22 22" fill="currentColor" width="18" height="18"><rect x="4" y="3" width="5" height="16" rx="1"/><rect x="13" y="3" width="5" height="16" rx="1"/></svg>'
    : '<svg viewBox="0 0 22 22" fill="currentColor" width="18" height="18"><polygon points="5,3 19,11 5,19"/></svg>';
}

$el('pPlayBtn').addEventListener('click', function() {
  if (!audio.src && !audio.currentSrc) return;
  if (playing) {
    audio.pause(); playing = false;
  } else {
    audio.play().then(function() { playing = true; }).catch(function() { playing = false; });
    playing = true;
  }
  updatePlayBtn();
});

// Player is permanent — no close button

audio.addEventListener('timeupdate', function() {
  if (dragging || !audio.duration) return;
  var pct = (audio.currentTime / audio.duration) * 100;
  $el('pFill').style.width  = pct + '%';
  $el('pThumb').style.left  = pct + '%';
  $el('pCur').textContent   = fmt(audio.currentTime);
});

audio.addEventListener('loadedmetadata', function() {
  $el('pDur').textContent = fmt(audio.duration);
});

audio.addEventListener('ended', function() {
  playing = false; updatePlayBtn();
  $el('pFill').style.width = '0%';
  $el('pThumb').style.left = '0%';
  $el('pCur').textContent  = '0:00';
});

function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

function seekAt(e) {
  var r   = $el('pTrack').getBoundingClientRect();
  var x   = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
  var pct = Math.max(0, Math.min(1, x / r.width));
  $el('pFill').style.width = (pct * 100) + '%';
  $el('pThumb').style.left = (pct * 100) + '%';
  if (audio.duration) audio.currentTime = pct * audio.duration;
}

$el('pTrack').addEventListener('mousedown', function(e) {
  dragging = true; seekAt(e);
  var up = function() {
    dragging = false;
    window.removeEventListener('mouseup', up);
    window.removeEventListener('mousemove', seekAt);
  };
  window.addEventListener('mousemove', seekAt);
  window.addEventListener('mouseup', up);
});

$el('volSlider').addEventListener('input', function() {
  audio.volume = this.value / 100;
  var muted = this.value == 0;
  $el('volIc').innerHTML = muted
    ? '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><polygon points="3,6 6,4 6,12 3,10"/><line x1="11" y1="5" x2="15" y2="11"/><line x1="15" y1="5" x2="11" y2="11"/></svg>'
    : '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><polygon points="3,6 6,4 6,12 3,10"/><path d="M9 5.5a4 4 0 0 1 0 5"/><path d="M11.5 3.5a7 7 0 0 1 0 9"/></svg>';
});

function startVinylSpin() {
  if (vinylRaf) return;
  var cov = $el('pCover');
  function spin() {
    if (playing) vinylRot += 0.22;
    cov.style.transform = 'rotate(' + vinylRot + 'deg)';
    vinylRaf = requestAnimationFrame(spin);
  }
  vinylRaf = requestAnimationFrame(spin);
}

/* ─────────────────────────────────────────────
   UPLOAD LOCAL
───────────────────────────────────────────── */
var dropzone  = document.getElementById('dropzone');
var fileInput = document.getElementById('fileInput');

dropzone.addEventListener('click', function() { fileInput.click(); });

fileInput.addEventListener('change', function() {
  if (fileInput.files[0]) loadLocalFile(fileInput.files[0]);
});

dropzone.addEventListener('dragover', function(e) {
  e.preventDefault(); dropzone.classList.add('drag');
});
dropzone.addEventListener('dragleave', function() { dropzone.classList.remove('drag'); });
dropzone.addEventListener('drop', function(e) {
  e.preventDefault(); dropzone.classList.remove('drag');
  var f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('audio/')) loadLocalFile(f);
});

function loadLocalFile(file) {
  var url  = URL.createObjectURL(file);
  var name = file.name.replace(/\.[^.]+$/, '');
  playerLoad({ name: name, artist: 'Ficheiro local', image: '', src: url, file: file });
  // No modal to close — upload is inline now
}

/* ─────────────────────────────────────────────
   UTIL
───────────────────────────────────────────── */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Start vinyl spin on load (player always visible)
startVinylSpin();