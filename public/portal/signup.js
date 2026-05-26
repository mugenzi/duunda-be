(function () {
  var API = window.location.origin + '/api';
  var form = document.getElementById('signupForm');
  var errEl = document.getElementById('err');
  var btn = document.getElementById('btn');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errEl.style.display = 'none';
    errEl.textContent = '';
    var password = document.getElementById('password').value;
    var confirmPassword = document.getElementById('confirmPassword').value;
    if (password !== confirmPassword) {
      errEl.textContent = 'Passwords do not match';
      errEl.style.display = 'block';
      return;
    }
    if (password.length < 6) {
      errEl.textContent = 'Password must be at least 6 characters';
      errEl.style.display = 'block';
      return;
    }
    btn.disabled = true;
    var payload = {
      firstname: document.getElementById('firstname').value.trim(),
      lastname: document.getElementById('lastname').value.trim(),
      middle_name: document.getElementById('middle_name').value.trim(),
      carrier_name: document.getElementById('carrier_name').value.trim(),
      email: document.getElementById('email').value.trim().toLowerCase(),
      password: password,
    };
    fetch(API + '/auth/register-artist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { status: r.status, data: data };
        });
      })
      .then(function (result) {
        if (result.status >= 200 && result.status < 300) {
          window.location.href = '/';
        } else {
          errEl.textContent = result.data.message || 'Sign up failed';
          errEl.style.display = 'block';
          btn.disabled = false;
        }
      })
      .catch(function () {
        errEl.textContent = 'Network error. Please try again.';
        errEl.style.display = 'block';
        btn.disabled = false;
      });
  });
})();
