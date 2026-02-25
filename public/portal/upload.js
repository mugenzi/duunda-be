(function () {
  var API = window.location.origin + '/api';
  var token = localStorage.getItem('duunda_token');
  if (!token) {
    window.location.href = '/';
    return;
  }

  var currentArtistId = null;
  var currentArtistName = 'Artist';

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

  function artistDisplayName(d) {
    if (!d) return 'Artist';
    var full = [d.firstname, d.lastname].filter(Boolean).join(' ').trim();
    return full || d.carrier_name || d.name || 'Artist';
  }

  function getUploadArtistMeta() {
    if (currentArtistId) return Promise.resolve({ id: currentArtistId, name: currentArtistName });
    return api('/portal/my-artist').then(function (r) {
      var d = (r && r.ok && r.data) ? r.data : {};
      return { id: d.id || null, name: artistDisplayName(d) };
    });
  }

  function setBackLink() {
    var back = document.getElementById('backLink');
    back.href = currentArtistId ? ('/dashboard/artist/' + currentArtistId) : '/dashboard';
  }

  function init() {
    var path = window.location.pathname;
    var artistMatch = path.match(/\/dashboard\/artist\/(\d+)\/upload/);
    if (artistMatch) {
      currentArtistId = parseInt(artistMatch[1], 10);
      api('/artists/' + currentArtistId).then(function (r) {
        if (r && r.ok && r.data) currentArtistName = artistDisplayName(r.data);
      });
    }
    setBackLink();

    var form = document.getElementById('uploadForm');
    var errEl = document.getElementById('uploadErr');
    var progressEl = document.getElementById('uploadProgress');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errEl.textContent = '';
      progressEl.textContent = 'Uploading…';
      getUploadArtistMeta().then(function (meta) {
        var fd = new FormData();
        fd.append('title', form.title.value);
        fd.append('artist', meta.name);
        if (meta.id) fd.append('artist_id', String(meta.id));
        fd.append('album', form.album.value || '');
        fd.append('genre', form.genre.value || '');
        fd.append('track_number', form.track_number.value || '');
        if (form.album_id && form.album_id.value) fd.append('album_id', form.album_id.value);
        if (form.cover.files[0]) fd.append('cover', form.cover.files[0]);
        fd.append('audio', form.audio.files[0]);
        return fetch(API + '/music/upload', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token },
          body: fd,
        });
      }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok) {
            errEl.textContent = data.message || 'Upload failed';
            progressEl.textContent = '';
            return;
          }
          progressEl.textContent = 'Uploaded successfully.';
          form.reset();
        });
      }).catch(function () {
        errEl.textContent = 'Network error';
        progressEl.textContent = '';
      });
    });

    var bulkInput = document.getElementById('bulkFiles');
    var bulkMetaEl = document.getElementById('bulkMeta');
    var bulkBtn = document.getElementById('bulkSubmit');
    bulkInput.addEventListener('change', function () {
      bulkMetaEl.innerHTML = '';
      var files = Array.prototype.slice.call(bulkInput.files || []);
      if (!files.length) {
        bulkBtn.disabled = true;
        return;
      }
      files.forEach(function (f, i) {
        var div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = '<label>#' + (i + 1) + ' ' + f.name + '</label><input type="text" placeholder="Title" data-i="' + i + '" name="title" /><input type="text" placeholder="Genre" data-i="' + i + '" name="genre" /><input type="number" placeholder="Track" data-i="' + i + '" name="track" min="1" />';
        bulkMetaEl.appendChild(div);
      });
      bulkBtn.disabled = false;
    });
    bulkBtn.addEventListener('click', function () {
      var files = Array.prototype.slice.call(bulkInput.files || []);
      if (!files.length) return;
      getUploadArtistMeta().then(function (meta) {
        bulkBtn.disabled = true;
        var chain = Promise.resolve();
        files.forEach(function (file, i) {
          chain = chain.then(function () {
            var fd = new FormData();
            var titleEl = bulkMetaEl.querySelector('input[name="title"][data-i="' + i + '"]');
            var genreEl = bulkMetaEl.querySelector('input[name="genre"][data-i="' + i + '"]');
            var trackEl = bulkMetaEl.querySelector('input[name="track"][data-i="' + i + '"]');
            fd.append('title', (titleEl && titleEl.value) || file.name.replace(/\.[^.]*$/, ''));
            fd.append('artist', meta.name);
            if (meta.id) fd.append('artist_id', String(meta.id));
            fd.append('genre', (genreEl && genreEl.value) || '');
            fd.append('track_number', (trackEl && trackEl.value) || '');
            fd.append('audio', file);
            return fetch(API + '/music/upload', {
              method: 'POST',
              headers: { Authorization: 'Bearer ' + token },
              body: fd,
            });
          });
        });
        return chain;
      }).then(function () {
        bulkInput.value = '';
        bulkMetaEl.innerHTML = '';
        bulkBtn.disabled = false;
      }).catch(function () {
        bulkBtn.disabled = false;
      });
    });
  }

  init();
})();
