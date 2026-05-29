/* ============================================================
   KSRMS Technologies — login.js
   Handles student login, first-login forced setup, and
   forgot-password (3-step: admission no → security Q → reset)
   ============================================================ */

'use strict';

/* ── Helpers ─────────────────────────────────────────────── */
function togglePassword(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon  = document.getElementById(iconId);
  if (!input) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  if (icon) icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
}

function showAlert(containerEl, msg, type = 'danger') {
  if (!containerEl) return;
  containerEl.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show mb-3" role="alert">
      ${msg}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>`;
  if (type !== 'danger') setTimeout(() => { if (containerEl) containerEl.innerHTML = ''; }, 6000);
}

function floatAlert(msg, type = 'danger') {
  const box = document.querySelector('.alert-container');
  if (!box) return;
  const div = document.createElement('div');
  div.className = `alert alert-${type} alert-dismissible fade show`;
  div.setAttribute('role', 'alert');
  div.innerHTML = `${msg}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
  box.innerHTML = '';
  box.appendChild(div);
  if (type !== 'danger') setTimeout(() => div.remove(), 6000);
}

/* ── State ───────────────────────────────────────────────── */
let _studentId       = null;   // set after login, used for first-login setup
let _forgotStep      = 1;      // 1=enter admNo, 2=answer question, 3=new password
let _forgotAdmNum    = '';
let _forgotQuestion  = '';

/* ── DOMContentLoaded ────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

  /* ── Main login form ── */
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const admNum  = document.getElementById('admissionNumber').value.trim();
    const pwd     = document.getElementById('password').value;
    const btn     = e.target.querySelector('button[type="submit"]');

    if (!admNum || !pwd) { floatAlert('Please enter both Admission Number and Password.'); return; }

    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Signing in…';
    btn.disabled = true;

    try {
      const res  = await fetch('/api/student/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ admissionNumber: admNum, password: pwd }),
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error || 'Login failed. Please check your credentials.');

      _studentId = data.student?.id;

      if (data.isFirstLogin) {
        // Force password + security setup before entering dashboard
        floatAlert('Login successful! Please set your new password and security question to continue.', 'info');
        new bootstrap.Modal(document.getElementById('firstLoginModal')).show();
      } else {
        floatAlert('Login successful! Redirecting…', 'success');
        setTimeout(() => { window.location.href = '/student/dashboard'; }, 1000);
      }
    } catch (err) {
      floatAlert(err.message || 'An unexpected error occurred.');
    } finally {
      btn.innerHTML = origHtml;
      btn.disabled  = false;
    }
  });

  /* ── First-login setup form ── */
  document.getElementById('firstLoginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password        = document.getElementById('flPassword').value;
    const confirmPassword = document.getElementById('flConfirmPassword').value;
    const question        = document.getElementById('flSecurityQuestion').value;
    const answer          = document.getElementById('flSecurityAnswer').value.trim().toUpperCase();
    const alertBox        = document.getElementById('firstLoginAlert');

    if (!password || !confirmPassword || !question || !answer) {
      showAlert(alertBox, 'Please fill in all fields.'); return;
    }
    if (password !== confirmPassword) {
      showAlert(alertBox, 'Passwords do not match.'); return;
    }
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      showAlert(alertBox, 'Password must be at least 8 characters and contain both letters and numbers.'); return;
    }
    if (answer.length < 2) {
      showAlert(alertBox, 'Security answer must be at least 2 characters.'); return;
    }

    const btn = document.getElementById('flSubmitBtn');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving…';
    btn.disabled = true;

    try {
      const res  = await fetch('/api/student/setup-security', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          studentId:        _studentId,
          password,
          securityQuestion: question,
          securityAnswer:   answer,   // already trimmed + uppercased above
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Setup failed. Please try again.');

      showAlert(alertBox, '✅ Setup complete! Redirecting to your dashboard…', 'success');
      setTimeout(() => { window.location.href = '/student/dashboard'; }, 1500);
    } catch (err) {
      showAlert(alertBox, err.message || 'An unexpected error occurred.');
      btn.innerHTML = origHtml;
      btn.disabled  = false;
    }
  });

  /* ── Forgot Password — 3-step form ── */
  document.getElementById('forgotPasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (_forgotStep === 1) {
      /* Step 1 — look up admission number → get security question */
      const admNum = document.getElementById('resetAdmissionNumber').value.trim();
      if (!admNum) { floatAlert('Please enter your Admission Number.'); return; }

      try {
        const res  = await fetch(`/api/student/forgot-password/question?admissionNumber=${encodeURIComponent(admNum)}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Admission number not found.');

        _forgotAdmNum   = admNum;
        _forgotQuestion = data.question;

        document.getElementById('step1').style.display = 'none';
        document.getElementById('step2').style.display = 'block';
        document.getElementById('securityQuestionText').textContent = _forgotQuestion;
        document.getElementById('stepButton').textContent = 'Verify Answer';
        _forgotStep = 2;
      } catch (err) {
        floatAlert(err.message || 'Could not retrieve security question.');
      }

    } else if (_forgotStep === 2) {
      /* Step 2 — verify security answer */
      const answer = document.getElementById('securityAnswer').value.trim();
      if (!answer) { floatAlert('Please enter your security answer.'); return; }

      // We just move to step 3; actual verification happens on final submit
      _forgotStep = 3;
      document.getElementById('step2').style.display = 'none';
      document.getElementById('step3').style.display = 'block';
      document.getElementById('stepButton').textContent = 'Reset Password';
      // Store answer for step 3
      document.getElementById('stepButton').dataset.answer = answer;

    } else if (_forgotStep === 3) {
      /* Step 3 — submit new password */
      const newPassword     = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmNewPassword').value;
      const securityAnswer  = document.getElementById('stepButton').dataset.answer || '';

      if (!newPassword || !confirmPassword) { floatAlert('Please enter and confirm your new password.'); return; }
      if (newPassword !== confirmPassword)   { floatAlert('Passwords do not match.'); return; }
      if (newPassword.length < 8)            { floatAlert('Password must be at least 8 characters.'); return; }

      const btn = document.getElementById('stepButton');
      const origHtml = btn.innerHTML;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Resetting…';
      btn.disabled = true;

      try {
        const res  = await fetch('/api/student/forgot-password/reset', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            admissionNumber: _forgotAdmNum,
            securityAnswer:  securityAnswer.trim().toUpperCase(),
            newPassword,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Password reset failed. Please check your answer.');

        floatAlert('✅ Password reset successfully! You can now log in with your new password.', 'success');
        // Close modal and reset state
        bootstrap.Modal.getInstance(document.getElementById('forgotPasswordModal'))?.hide();
        resetForgotForm();
      } catch (err) {
        floatAlert(err.message || 'Password reset failed.');
        btn.innerHTML = origHtml;
        btn.disabled  = false;
      }
    }
  });

  /* Reset forgot password form when modal is closed */
  document.getElementById('forgotPasswordModal')?.addEventListener('hidden.bs.modal', resetForgotForm);
});

function resetForgotForm() {
  _forgotStep     = 1;
  _forgotAdmNum   = '';
  _forgotQuestion = '';
  const form = document.getElementById('forgotPasswordForm');
  if (form) form.reset();
  const s1 = document.getElementById('step1');
  const s2 = document.getElementById('step2');
  const s3 = document.getElementById('step3');
  if (s1) s1.style.display = 'block';
  if (s2) s2.style.display = 'none';
  if (s3) s3.style.display = 'none';
  const btn = document.getElementById('stepButton');
  if (btn) { btn.textContent = 'Submit'; btn.disabled = false; delete btn.dataset.answer; }
}