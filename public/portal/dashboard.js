(function () {
  var API = window.location.origin + '/api';
  var token = localStorage.getItem('duunda_token');
  if (!token) {
    window.location.href = '/';
    return;
  }

  document.getElementById('logoutBtn').addEventListener('click', function (e) {
    e.preventDefault();
    localStorage.removeItem('duunda_token');
    localStorage.removeItem('duunda_user');
    window.location.href = '/';
  });

  function api(path, opts) {
    opts = opts || {};
    var headers = { Authorization: 'Bearer ' + token };
    if (opts.headers) {
      for (var k in opts.headers) headers[k] = opts.headers[k];
    }
    return fetch(API + path, Object.assign({}, opts, { headers: headers }))
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (r.status === 401) {
            window.location.href = '/';
            return null;
          }
          return { ok: r.ok, data: data, status: r.status };
        });
      });
  }

  var me = null;
  var currentArtistId = null;
  var currentArtistName = 'Artist';
  var allSongs = [];

  function filterSongs(songs, query) {
    if (!query || !query.trim()) return songs;
    var q = query.trim().toLowerCase();
    return songs.filter(function (s) {
      return (
        (s.title && s.title.toLowerCase().indexOf(q) !== -1) ||
        (s.artist && s.artist.toLowerCase().indexOf(q) !== -1) ||
        (s.album && s.album.toLowerCase().indexOf(q) !== -1) ||
        (s.genre && s.genre.toLowerCase().indexOf(q) !== -1)
      );
    });
  }

  function renderSongs(songs) {
    var el = document.getElementById('songsList');
    var searchEl = document.getElementById('songSearch');
    var query = searchEl ? searchEl.value.trim() : '';
    var toShow = filterSongs(songs || [], query);
    if (!toShow.length) {
      el.innerHTML = query ? '<p class="err">No songs match your search.</p>' : '<p class="err">No songs yet.</p>';
      return;
    }
    var html = '<table><thead><tr><th>Title</th><th>Artist</th><th>Album</th><th>Genre</th></tr></thead><tbody>';
    toShow.forEach(function (s) {
      html += '<tr><td>' + (s.title || '') + '</td><td>' + (s.artist || '') + '</td><td>' + (s.album || '') + '</td><td>' + (s.genre || '') + '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  function loadArtists() {
    var search = document.getElementById('artistSearch').value.trim();
    var q = search ? '?search=' + encodeURIComponent(search) : '';
    return api('/portal/artists' + q).then(function (r) {
      if (!r || !r.ok) return;
      var list = document.getElementById('artistList');
      list.innerHTML = '';
      (r.data.artists || []).forEach(function (a) {
        var link = document.createElement('a');
        link.href = '/dashboard/artist/' + a.id;
        var parts = [];
        var fullName = [a.firstname, a.lastname].filter(Boolean).join(' ').trim();
        if (fullName) parts.push(fullName);
        var carrier = a.carrier_name || a.name || 'Artist';
        parts.push(parts.length ? ' (' + carrier + ')' : carrier);
        if (a.email) parts.push(' – ' + a.email);
        link.textContent = parts.length ? parts.join('') : 'Artist';
        list.appendChild(link);
      });
    });
  }

  function loadSongs() {
    var url = currentArtistId ? ('/portal/artists/' + currentArtistId + '/songs') : '/portal/my-artist';
    return api(url).then(function (r) {
      if (!r || !r.ok) {
        if (currentArtistId) {
          return api('/portal/artists/' + currentArtistId + '/songs').then(function (r2) {
            if (r2 && r2.ok) {
              allSongs = r2.data.songs || [];
              renderSongs(allSongs);
            }
          });
        }
        return;
      }
      if (currentArtistId) {
        return api('/portal/artists/' + currentArtistId + '/songs').then(function (r2) {
          if (r2 && r2.ok) {
            allSongs = r2.data.songs || [];
            renderSongs(allSongs);
          }
        });
      }
      var artist = r.data;
      if (artist && artist.id) {
        return api('/portal/artists/' + artist.id + '/songs').then(function (r3) {
          allSongs = (r3 && r3.ok && r3.data.songs) ? r3.data.songs : [];
          renderSongs(allSongs);
        });
      }
      allSongs = [];
      renderSongs(allSongs);
    });
  }

  function init() {
    api('/portal/me').then(function (r) {
      if (!r || !r.ok) {
        document.getElementById('roleLabel').textContent = 'Invalid session';
        setTimeout(function () { window.location.href = '/'; }, 1500);
        return;
      }
      me = r.data.user;
      document.getElementById('roleLabel').textContent = me.role === 'administrator' ? 'Admin' : 'Artist';

      var path = window.location.pathname;
      var artistMatch = path.match(/\/dashboard\/artist\/(\d+)/);
      if (me.role === 'administrator' && !artistMatch) {
        document.getElementById('adminView').classList.remove('hidden');
        loadArtists();
        document.getElementById('artistSearch').addEventListener('input', loadArtists);
      } else {
        document.getElementById('artistView').classList.remove('hidden');
        if (artistMatch) {
          currentArtistId = parseInt(artistMatch[1], 10);
          document.getElementById('roleLabel').textContent = 'Admin – Artist #' + currentArtistId;
          document.getElementById('backLink').classList.remove('hidden');
          api('/artists/' + currentArtistId).then(function (ar) {
            if (ar && ar.ok && ar.data) currentArtistName = ar.data.carrier_name || ar.data.name || 'Artist';
          });
        }
        loadSongs().then(function () {
          var addBtn = document.getElementById('addSongBtn');
          if (addBtn) {
            addBtn.href = currentArtistId ? ('/dashboard/artist/' + currentArtistId + '/upload') : '/dashboard/upload';
          }
          var songSearch = document.getElementById('songSearch');
          if (songSearch) {
            songSearch.addEventListener('input', function () { renderSongs(allSongs); });
          }
        });
      }
    });
  }

  init();
})();
