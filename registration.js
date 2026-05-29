/* ============================================================
   KSRMS Technologies — registration.js
   Handles the 4-step student registration flow:
   1. Verify application/admission number
   2. Pay registration fee (full or 2 installments)
   3. Set password + security question
   4. Upload qualification document
   ============================================================ */

'use strict';

/* ── Config ─────────────────────────────────────────────── */
let PAYSTACK_KEY = '';

let currentStep  = 1;
let studentData  = null;
let selectedPaymentType = null; // 'full' | 'first' | 'second'

/* ── Bootstrap shorthands ─────────────────────────────── */
const bsModal = (id) => new window.bootstrap.Modal(document.getElementById(id));

/* ── Init ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  // Fetch Paystack public key
  try {
    const r = await fetch('/api/config/paystack-key');
    const d = await r.json();
    PAYSTACK_KEY = d.key || '';
  } catch(e) { console.warn('Could not fetch Paystack key:', e.message); }

  // Check URL params (coming from track modal on index.html)
  const params = new URLSearchParams(window.location.search);
  const preloadNum = params.get('appNumber') || params.get('admissionNumber') || params.get('number');
  if (preloadNum) {
    document.getElementById('applicationNumber').value = preloadNum;
    document.getElementById('verifyApplicationForm').dispatchEvent(new Event('submit'));
  }

  // Bind forms
  document.getElementById('verifyApplicationForm').addEventListener('submit', verifyApplication);
  document.getElementById('securityForm').addEventListener('submit', setupSecurity);
  document.getElementById('documentForm').addEventListener('submit', completeRegistration);
  document.getElementById('downloadAdmissionLetterBtn')?.addEventListener('click', downloadAdmissionLetter);
  document.getElementById('downloadReceiptBtn')?.addEventListener('click', downloadReceipt);
  document.getElementById('proceedPayment')?.addEventListener('click', processPayment);
});

/* ── Alert helper ───────────────────────────────────────── */
function showAlert(msg, type = 'info') {
  const box = document.getElementById('alertBox');
  if (!box) return;
  box.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">
    ${msg}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  </div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (type !== 'danger') setTimeout(() => { if (box) box.innerHTML = ''; }, 7000);
}

function clearAlert() { const b = document.getElementById('alertBox'); if (b) b.innerHTML = ''; }

/* ── Step navigation ─────────────────────────────────────── */
function showStep(n) {
  document.querySelectorAll('.registration-step').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(`step${n}`);
  if (el) el.classList.add('active');
  currentStep = n;

  // Progress pills
  const titles = {
    1: ['Verify Your Number',           'Enter your Application or Admission Number'],
    2: ['Registration Fee Payment',      'Select and complete your payment'],
    3: ['Password & Security Setup',     'Set your portal password and security question'],
    4: ['Qualification Information',    'Tell us about your highest qualification and experience'],
  };
  const [title, sub] = titles[n] || ['Registration', ''];
  document.getElementById('stepTitle').textContent    = title;
  document.getElementById('stepSubtitle').textContent = sub;

  // Progress step indicators
  for (let i = 1; i <= 4; i++) {
    const ps = document.getElementById(`ps${i}`);
    if (!ps) continue;
    ps.classList.remove('active', 'done');
    if (i < n)  ps.classList.add('done');
    if (i === n) ps.classList.add('active');
  }
}

/* ── Loading state ──────────────────────────────────────── */
function setLoading(btn, loading, origText) {
  if (!btn) return;
  if (loading) {
    btn._origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Please wait…';
    btn.disabled  = true;
  } else {
    btn.innerHTML = btn._origHtml || origText || btn.innerHTML;
    btn.disabled  = false;
  }
}

/* ── STEP 1 — Verify ─────────────────────────────────────── */
async function verifyApplication(e) {
  e.preventDefault();
  const number = document.getElementById('applicationNumber').value.trim();
  if (!number) { showAlert('Please enter your Application or Admission Number.', 'danger'); return; }

  const btn = e.target.querySelector('button[type="submit"]');
  setLoading(btn, true);
  clearAlert();

  try {
    const res  = await fetch(`/api/student/verify-application/${encodeURIComponent(number)}`);
    const data = await res.json();

    if (!data.success) {
      showAlert(data.error || 'No record found. Please check your number and try again.', 'danger');
      setLoading(btn, false);
      return;
    }

    studentData = data.student;
    studentData._payments = data.payments || [];

    renderStudentDetails();
    renderPaymentSection();
    renderDownloadBar();       // ← show/hide download buttons based on payment state
    showStep(2);
    clearAlert();
  } catch(err) {
    showAlert('Network error. Please check your connection and try again.', 'danger');
  } finally {
    setLoading(btn, false);
  }
}

/* ── STEP 2 — Payment ─────────────────────────────────── */
function renderStudentDetails() {
  const s = studentData;
  const regFee = Number(s.registration_fee || 0);
  const paid   = Number(s.totalPaid || 0);
  const remaining = Math.max(0, regFee - paid);

  const paidStatus = paid >= regFee && regFee > 0
    ? '<span class="badge-paid">Fully Paid</span>'
    : paid > 0
      ? `<span style="color:#d97706;font-weight:600;">Partially Paid (₦${paid.toLocaleString()} of ₦${regFee.toLocaleString()})</span>`
      : '<span style="color:#dc2626;font-weight:600;">Unpaid</span>';

  document.getElementById('studentDetails').innerHTML = `
    <div class="info-row"><span class="info-label">Name</span><span class="info-val">${s.first_name} ${s.last_name}</span></div>
    <div class="info-row"><span class="info-label">Email</span><span class="info-val">${s.email}</span></div>
    <div class="info-row"><span class="info-label">Course</span><span class="info-val">${s.course_name || '—'}</span></div>
    <div class="info-row"><span class="info-label">Mode / Schedule</span><span class="info-val">${s.mode || '—'} ${s.schedule ? '· ' + s.schedule : ''}</span></div>
    ${s.application_number ? `<div class="info-row"><span class="info-label">Application No.</span><span class="info-val text-primary fw-bold">${s.application_number}</span></div>` : ''}
    ${s.admission_number   ? `<div class="info-row"><span class="info-label">Admission No.</span><span class="info-val text-success fw-bold">${s.admission_number}</span></div>` : ''}
    <div class="info-row"><span class="info-label">Registration Fee</span><span class="info-val">₦${regFee.toLocaleString()}</span></div>
    <div class="info-row"><span class="info-label">Payment Status</span><span class="info-val">${paidStatus}</span></div>
    ${remaining > 0 && paid > 0 ? `<div class="info-row"><span class="info-label">Balance</span><span class="info-val text-danger">₦${remaining.toLocaleString()}</span></div>` : ''}
  `;
}

function renderPaymentSection() {
  const s       = studentData;
  const regFee  = Number(s.registration_fee || 0);
  const paid    = Number(s.totalPaid || 0);
  const payments = s._payments || [];
  const regPays  = payments.filter(p => p.payment_type === 'Registration Fee');
  const installNum = Number(s.installmentNumber || 0);
  const firstAmt   = Math.ceil(regFee / 2);
  const secondAmt  = regFee - firstAmt;

  // Payment history
  const histSection = document.getElementById('paymentHistorySection');
  const histList    = document.getElementById('paymentHistoryList');
  if (regPays.length) {
    histSection.style.display = 'block';
    histList.innerHTML = regPays.map(p => {
      const lbl = p.installment_type && p.installment_type !== 'full'
        ? `Registration Fee (${p.installment_type} installment)`
        : 'Registration Fee (full)';
      return `<div class="pay-hist-item">
        <div><strong>${lbl}</strong><br><small class="text-muted">${new Date(p.payment_date).toLocaleDateString('en-GB')}</small></div>
        <div class="text-end"><div class="fw-bold text-success">₦${Number(p.amount).toLocaleString()}</div><span class="badge-paid">Paid</span></div>
      </div>`;
    }).join('');
  } else {
    histSection.style.display = 'none';
  }

  const cardsEl   = document.getElementById('paymentCards');
  const proceedEl = document.getElementById('proceedPayment');
  const completeEl = document.getElementById('paymentComplete');
  const optionsEl  = document.getElementById('paymentOptions');

  // Already fully paid
  if (paid >= regFee && regFee > 0) {
    optionsEl.style.display  = 'none';
    completeEl.style.display = 'block';
    const adm = s.admission_number;
    if (adm) {
      document.getElementById('receiptDownloadLink').href =
        `/api/receipt/download/public?admissionNum=${encodeURIComponent(adm)}`;
    }
    return;
  }

  optionsEl.style.display  = 'block';
  completeEl.style.display = 'none';
  proceedEl.style.display  = 'none';
  selectedPaymentType = null;

  // Second installment only
  if (installNum === 1) {
    cardsEl.innerHTML = `
      <div class="col-12">
        <div class="payment-card p-3 text-center" id="card-second" onclick="selectPayment('second')">
          <i class="fas fa-calendar-check fa-2x text-primary mb-2"></i>
          <h6 class="fw-bold mb-1">2nd Installment (Balance)</h6>
          <h4 class="text-primary fw-bold mb-0">₦${secondAmt.toLocaleString()}</h4>
          <small class="text-muted">Completes your registration payment</small>
        </div>
      </div>`;
    return;
  }

  // No payments yet — show Full + 1st installment
  cardsEl.innerHTML = `
    <div class="col-md-6">
      <div class="payment-card p-3 text-center" id="card-full" onclick="selectPayment('full')">
        <i class="fas fa-money-bill-wave fa-2x text-success mb-2"></i>
        <h6 class="fw-bold mb-1">Full Payment</h6>
        <h4 class="text-success fw-bold mb-0">₦${regFee.toLocaleString()}</h4>
        <small class="text-muted">Pay once and complete registration</small>
      </div>
    </div>
    <div class="col-md-6">
      <div class="payment-card p-3 text-center" id="card-first" onclick="selectPayment('first')">
        <i class="fas fa-calendar-alt fa-2x text-primary mb-2"></i>
        <h6 class="fw-bold mb-1">1st Installment</h6>
        <h4 class="text-primary fw-bold mb-0">₦${firstAmt.toLocaleString()}</h4>
        <small class="text-muted">Pay 50% now, balance later</small>
      </div>
    </div>`;
}

function selectPayment(type) {
  selectedPaymentType = type;
  document.querySelectorAll('.payment-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById(`card-${type}`);
  if (card) card.classList.add('selected');
  const btn = document.getElementById('proceedPayment');
  if (btn) btn.style.display = 'block';
}


async function processPayment() {
  if (!selectedPaymentType) { showAlert('Please select a payment option first.', 'warning'); return; }
  if (!studentData) { showAlert('Student data missing. Please go back to Step 1.', 'danger'); return; }

  const regFee    = Number(studentData.registration_fee || 0);
  const firstAmt  = Math.ceil(regFee / 2);
  const secondAmt = regFee - firstAmt;
  const amount    = selectedPaymentType === 'full' ? regFee
                  : selectedPaymentType === 'first' ? firstAmt
                  : secondAmt;

  const appNum = studentData.application_number || studentData.admission_number;

  const handler = PaystackPop.setup({
    key:      'pk_live_661e479efe8cccc078d6e6c078a5b6e0dc963079',
    email:    studentData.email,
    amount:   Math.round(amount * 100),
    currency: 'NGN',
    ref:      `REG-${Date.now()}-${Math.random().toString(36).substr(2,6).toUpperCase()}`,
    metadata: {
      custom_fields: [
        { display_name: 'Application/Admission No', variable_name: 'app_number', value: appNum || '' },
        { display_name: 'Installment Type',         variable_name: 'installment_type', value: selectedPaymentType },
      ]
    },
    callback: (response) => verifyRegistrationPayment(response.reference, selectedPaymentType),
    onClose:  () => showAlert('Payment window closed. No charge was made.', 'warning'),
  });
  handler.openIframe();
}

async function verifyRegistrationPayment(reference, installmentType) {
  const btn = document.getElementById('proceedPayment');
  setLoading(btn, true);
  try {
    const appNum = studentData.application_number || studentData.admission_number;
    const res = await fetch('/api/payment/verify-registration', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reference, applicationNumber: appNum, installmentType }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Payment verification failed');

    // Refresh student data
    const num = appNum || data.admissionNumber;
    if (num) {
      const r2  = await fetch(`/api/student/verify-application/${encodeURIComponent(num)}`);
      const d2  = await r2.json();
      if (d2.success) {
        studentData = d2.student;
        studentData._payments = d2.payments || [];
      }
    }
    if (data.admissionNumber && !studentData.admission_number) {
      studentData.admission_number = data.admissionNumber;
    }

    renderStudentDetails();
    renderPaymentSection();
    renderDownloadBar();       // refresh download buttons after payment

    if (installmentType === 'second') {
      showAlert('✅ Final installment paid! Your registration payment is now complete. Please download your receipt.', 'success');
    } else if (installmentType === 'full') {
      showAlert('✅ Full payment received! Proceed to set up your security details.', 'success');
      setTimeout(() => showStep(3), 1800);
    } else {
      showAlert('✅ First installment paid! Proceed to set up your security details. You can pay the balance anytime.', 'success');
      setTimeout(() => showStep(3), 1800);
    }
  } catch(err) {
    showAlert('Payment verification failed: ' + err.message, 'danger');
  } finally {
    setLoading(btn, false);
  }
}

/* ── STEP 3 — Security Setup ─────────────────────────── */
async function setupSecurity(e) {
  e.preventDefault();
  if (!studentData?.id) { showAlert('Student data missing. Please go back and verify your number.', 'danger'); return; }

  if (studentData.hasPassword && !studentData.is_first_login) {
    showAlert('Security already set up. Proceeding to document upload.', 'info');
    showStep(4);
    return;
  }

  const password        = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const question        = document.getElementById('securityQuestion').value;
  const answer          = document.getElementById('securityAnswer').value.trim();

  if (!password || !confirmPassword || !question || !answer) {
    showAlert('Please fill in all fields.', 'danger'); return;
  }
  if (password !== confirmPassword) {
    document.getElementById('confirmPassword').classList.add('is-invalid');
    showAlert('Passwords do not match.', 'danger'); return;
  }
  document.getElementById('confirmPassword').classList.remove('is-invalid');

  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    showAlert('Password must be at least 8 characters and contain both letters and numbers.', 'danger'); return;
  }
  if (answer.length < 2) {
    showAlert('Security answer must be at least 2 characters.', 'danger'); return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  setLoading(btn, true);

  try {
    const res = await fetch('/api/student/setup-security', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        studentId:       studentData.id,
        password,
        securityQuestion: question,
        securityAnswer:  answer,          // server trims + uppercases
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Setup failed');

    studentData.hasPassword    = true;
    studentData.is_first_login = 0;
    showAlert('✅ Security details saved!', 'success');
    setTimeout(() => showStep(4), 1000);
  } catch(err) {
    showAlert('Error: ' + err.message, 'danger');
  } finally {
    setLoading(btn, false);
  }
}

/* ── STEP 4 — Qualification info ──────────────────────── */
async function completeRegistration(e) {
  e.preventDefault();
  if (!studentData?.id) { showAlert('Student data missing. Please restart.', 'danger'); return; }

  const qualification = document.getElementById('highestQualification').value;
  if (!qualification) { showAlert('Please select your highest qualification.', 'danger'); return; }

  const prevExpEl = document.querySelector('input[name="prevExperience"]:checked');
  if (!prevExpEl) { showAlert('Please indicate whether you have previous experience.', 'danger'); return; }
  const previousExperience = prevExpEl.value;

  const btn = e.target.querySelector('button[type="submit"]');
  setLoading(btn, true);

  try {
    const res = await fetch('/api/student/complete-registration', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        studentId:          studentData.id,
        highestQualification: qualification,
        previousExperience,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Registration completion failed');

    const admNum = data.admissionNumber || studentData.admission_number;
    studentData.admission_number = admNum;

    // Show success modal
    const span = document.getElementById('admissionNumberSpan');
    if (span) span.textContent = `Admission Number: ${admNum || 'Will be sent via email'}`;
    bsModal('registrationSuccessModal').show();
  } catch(err) {
    showAlert('Error: ' + err.message, 'danger');
  } finally {
    setLoading(btn, false);
  }
}

/* ── Download action bar (Step 2) ──────────────────────── */
function renderDownloadBar() {
  const s = studentData;
  if (!s) return;

  const bar       = document.getElementById('downloadActionBar');
  const admBtn    = document.getElementById('dlAdmLetterBtn');
  const lockNote  = document.getElementById('dlAdmLockNote');

  if (!bar) return;

  // Application form button — always show once student is found
  bar.style.display = 'block';

  // Admission letter — only if at least one registration payment was made
  const hasRegPayment = Number(s.installmentNumber || 0) > 0;
  if (hasRegPayment && s.admission_number) {
    admBtn.style.display  = 'inline-flex';
    if (lockNote) lockNote.style.display = 'none';
  } else {
    admBtn.style.display  = 'none';
    if (lockNote) lockNote.style.display = 'block';
  }
}

function downloadApplicationForm() {
  const appNum = studentData?.application_number;
  if (!appNum) {
    showAlert('Application number not found. Please re-verify your number.', 'danger');
    return;
  }
  window.open(`/api/download/application-form/${encodeURIComponent(appNum)}`, '_blank');
}

function downloadAdmissionLetterStep2() {
  const adm = studentData?.admission_number;
  if (!adm) {
    showAlert('Admission number not available yet. Please complete payment first.', 'danger');
    return;
  }
  window.open(`/api/download/admission-letter?num=${encodeURIComponent(adm)}`, '_blank');
}

/* ── Downloads ─────────────────────────────────────────── */
function downloadAdmissionLetter() {
  const adm = studentData?.admission_number;
  if (!adm) {
    document.getElementById('modalAlertBox').innerHTML =
      '<div class="alert alert-danger">Admission number not available yet. Complete all steps first.</div>';
    return;
  }
  window.open(`/api/download/admission-letter?num=${encodeURIComponent(adm)}`, '_blank');
}

function downloadReceipt() {
  const adm = studentData?.admission_number;
  if (!adm) {
    document.getElementById('modalAlertBox').innerHTML =
      '<div class="alert alert-danger">Admission number not available. Complete registration first.</div>';
    return;
  }
  window.open(`/api/receipt/download/public?admissionNum=${encodeURIComponent(adm)}`, '_blank');
}