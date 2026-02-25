(function () {
  var API = window.location.origin + '/api';
  var form = document.getElementById('loginForm');
  var errEl = document.getElementById('err');
  var btn = document.getElementById('btn');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errEl.style.display = 'none';
    errEl.textContent = '';
    btn.disabled = true;
    var email = document.getElementById('email').value.trim();
    var password = document.getElementById('password').value;
    fetch(API + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password }),
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          errEl.textContent = result.data.message || 'Invalid email or password';
          errEl.style.display = 'block';
          btn.disabled = false;
          return;
        }
        var data = result.data;
        if (!data.token || !data.user) {
          errEl.textContent = 'Invalid response from server';
          errEl.style.display = 'block';
          btn.disabled = false;
          return;
        }
        var role = (data.user.role || '').toLowerCase();
        if (role !== 'artist' && role !== 'administrator') {
          errEl.textContent = 'Access denied. This portal is for artists and administrators only.';
          errEl.style.display = 'block';
          btn.disabled = false;
          return;
        }
        localStorage.setItem('duunda_token', data.token);
        localStorage.setItem('duunda_user', JSON.stringify(data.user));
        window.location.href = '/dashboard';
      })
      .catch(function () {
        errEl.textContent = 'Network error. Please try again.';
        errEl.style.display = 'block';
        btn.disabled = false;
      });
  });
})();
