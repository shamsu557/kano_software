/* ============================================================
   KSRMS Technologies — application.js
   Student Application Form — reads course from URL params,
   fetches real application fee from API, no hardcoded fees.
   ============================================================ */

'use strict';

let _allCourses  = [];
let _paystackKey = '';
let _courseData  = {};   // current selected course details

document.addEventListener('DOMContentLoaded', async () => {
  // student_signup.html uses a hidden input for courseId (not a <select>)
  // and has its own fully self-contained inline script.
  // Skip all application.js setup on that page to avoid conflicts.
  const courseEl = document.getElementById('courseId');
  if (!courseEl || courseEl.tagName !== 'SELECT') return;

  // Fetch Paystack public key
  try {
    const r = await fetch('/api/config/paystack-key');
    const d = await r.json();
    _paystackKey = d.key || '';
  } catch(e) { console.warn('Could not fetch Paystack key'); }

  await loadCourses();
  setupCourseChangeListener();
  setupTermsCheckbox();
  setupApplicationForm();

  // Pre-fill course from URL params (coming from index.html course card)
  const params = new URLSearchParams(window.location.search);
  const courseId = params.get('courseId');
  if (courseId) {
    const sel = document.getElementById('courseId');
    if (sel) {
      sel.value = courseId;
      sel.dispatchEvent(new Event('change'));
    }
  }
});

/* ── Terms checkbox ── */
function setupTermsCheckbox() {
  const agreeBox  = document.getElementById('agreeTerms');
  const submitBtn = document.getElementById('submitBtn');

  function toggleSubmit() {
    submitBtn.disabled = !agreeBox.checked;
  }
  agreeBox.addEventListener('change', toggleSubmit);
  toggleSubmit();

  document.getElementById('acceptTerms')?.addEventListener('click', function () {
    agreeBox.checked = true;
    toggleSubmit();
    const modal = bootstrap.Modal.getInstance(document.getElementById('termsModal'));
    modal?.hide();
  });
}

/* ── Load courses ── */
async function loadCourses() {
  const courseSelect = document.getElementById('courseId');
  // If courseId is not a <select> (new apply page uses a hidden input), skip
  if (!courseSelect || courseSelect.tagName !== 'SELECT') return;
  try {
    const response = await fetch('/api/courses');
    _allCourses = await response.json();
    courseSelect.innerHTML = '<option value="">Select a course</option>';
    _allCourses.forEach((course) => {
      if (!course.is_active) return; // only show active courses
      const sessionTimes = course.session_times
        ? (typeof course.session_times === 'string' ? course.session_times : JSON.stringify(course.session_times))
        : '';
      courseSelect.innerHTML += `<option value="${course.id}"
        data-app-fee="${course.application_fee || 0}"
        data-reg-fee="${course.registration_fee || 0}"
        data-schedule="${course.schedule || ''}"
        data-mode="${course.mode || ''}"
        data-app-open="${course.application_open || 0}"
        data-session-times="${sessionTimes.replace(/"/g, '&quot;')}"
      >${course.name} (${course.duration || ''})</option>`;
    });
  } catch (error) {
    console.error('Error loading courses:', error);
    courseSelect.innerHTML = '<option value="">Error loading courses</option>';
  }
}

/* ── Course change handler ── */
function setupCourseChangeListener() {
  const courseSelect   = document.getElementById('courseId');
  if (!courseSelect || courseSelect.tagName !== 'SELECT') return; // new page handles this inline
  const scheduleSelect = document.getElementById('schedule');
  const scheduleNote   = document.getElementById('scheduleNote');
  const sessionTimeGrp = document.getElementById('sessionTimeGroup');
  const sessionTimeSel = document.getElementById('sessionTime');
  const appFeeDisplay  = document.getElementById('displayAppFee');
  const regFeeDisplay  = document.getElementById('displayRegFee');
  const submitBtn      = document.getElementById('submitBtn');

  courseSelect.addEventListener('change', () => {
    const opt = courseSelect.options[courseSelect.selectedIndex];
    if (!opt || !opt.value) {
      scheduleNote.textContent = 'Note: Select your preferred schedule';
      scheduleSelect.disabled  = false;
      scheduleSelect.value     = '';
      scheduleSelect.style.display = '';
      const scheduleDisplay = document.getElementById('scheduleDisplay');
      if (scheduleDisplay) scheduleDisplay.style.display = 'none';
      if (appFeeDisplay) appFeeDisplay.textContent = '—';
      if (regFeeDisplay) regFeeDisplay.textContent = '—';
      submitBtn.disabled = true;
      _courseData = {};
      // Hide session time picker
      if (sessionTimeGrp) sessionTimeGrp.style.display = 'none';
      return;
    }

    const appFee       = Number(opt.getAttribute('data-app-fee') || 0);
    const regFee       = Number(opt.getAttribute('data-reg-fee') || 0);
    const schedule     = opt.getAttribute('data-schedule') || '';
    const sessionTimes = opt.getAttribute('data-session-times') || '';

    _courseData = { appFee, regFee, schedule, sessionTimes };

    if (appFeeDisplay) appFeeDisplay.textContent = appFee > 0 ? `₦${appFee.toLocaleString()}` : 'Free';
    if (regFeeDisplay) regFeeDisplay.textContent = regFee > 0 ? `₦${regFee.toLocaleString()}` : '—';

    // Update submit button label
    const agreeBox = document.getElementById('agreeTerms');
    submitBtn.disabled = !agreeBox.checked;
    submitBtn.innerHTML = `<i class="fas fa-credit-card me-2"></i>Submit Application & Pay ${appFee > 0 ? '₦' + appFee.toLocaleString() : ''}`;

    // ── Schedule handling ─────────────────────────────────────
    // If the course has a specific schedule (e.g. "Saturday, Sunday"),
    // hide the dropdown and show the schedule as a locked read-only display.
    // If no fixed schedule, let the user choose from the dropdown.

    const scheduleWrapper = document.getElementById('scheduleWrapper');
    const scheduleDisplay = document.getElementById('scheduleDisplay');

    if (schedule && schedule.toLowerCase() !== 'flexible') {
      // Lock: hide the dropdown, show the course's schedule as a badge
      scheduleSelect.disabled = false;          // keep enabled so value submits
      scheduleSelect.style.display = 'none';    // but visually hidden
      scheduleNote.style.display = 'none';

      if (scheduleDisplay) {
        scheduleDisplay.style.display = 'block';
        scheduleDisplay.innerHTML = `
          <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;padding:10px 14px;font-size:.9rem;color:#1e40af;font-weight:600;">
            <i class="fas fa-clock me-2 text-primary"></i>${schedule}
          </div>
          <small class="text-muted mt-1 d-block">Schedule is fixed for this course</small>`;
      }

      // Map the schedule text to the closest dropdown value so it submits correctly
      const sLower = schedule.toLowerCase();
      scheduleSelect.value =
        sLower.includes('morning')  ? 'morning'  :
        sLower.includes('evening')  ? 'evening'  :
        sLower.includes('weekend') || sLower.includes('saturday') || sLower.includes('sunday') ? 'weekend' :
        sLower.includes('online')   ? 'online'   : schedule;

      // If none of the standard values matched, add a custom option so it submits
      if (!scheduleSelect.value || !['morning','evening','weekend','online'].includes(scheduleSelect.value)) {
        const opt = document.createElement('option');
        opt.value = schedule;
        opt.textContent = schedule;
        scheduleSelect.appendChild(opt);
        scheduleSelect.value = schedule;
      }

    } else {
      // Flexible: show the dropdown normally
      scheduleSelect.style.display = '';
      scheduleSelect.disabled = false;
      scheduleSelect.value    = '';
      scheduleNote.style.display = '';
      scheduleNote.textContent = 'Note: Select your preferred schedule';
      if (scheduleDisplay) scheduleDisplay.style.display = 'none';
    }

    // Session times — populate a second dropdown if session_times exist
    if (sessionTimeGrp && sessionTimeSel) {
      let times = [];
      try {
        times = sessionTimes ? JSON.parse(sessionTimes) : [];
      } catch(e) { times = []; }

      if (times && times.length > 0) {
        sessionTimeSel.innerHTML = '<option value="">Select session time</option>' +
          times.map(t => `<option value="${t}">${t}</option>`).join('');
        sessionTimeGrp.style.display = 'block';
        sessionTimeSel.required = true;
      } else {
        sessionTimeGrp.style.display = 'none';
        sessionTimeSel.required = false;
      }
    }
  });
}

/* ── Validate form ── */
function validateForm(form) {
  const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
  let isValid = true;
  inputs.forEach((input) => {
    const isEmpty = input.type === 'file'
      ? !input.files[0]
      : !input.value.trim();
    if (isEmpty) {
      input.classList.add('is-invalid');
      let errDiv = input.nextElementSibling;
      if (!errDiv || !errDiv.classList.contains('invalid-feedback')) {
        errDiv = document.createElement('div');
        errDiv.className = 'invalid-feedback';
        input.parentNode.insertBefore(errDiv, input.nextSibling);
      }
      errDiv.textContent = input.type === 'file'
        ? `Please upload a ${input.id}`
        : `This field is required`;
      isValid = false;
    } else {
      input.classList.remove('is-invalid');
      const errDiv = input.nextElementSibling;
      if (errDiv && errDiv.classList.contains('invalid-feedback')) errDiv.textContent = '';
    }
  });
  return isValid;
}

/* ── Show alert ── */
function showMessage(message, type) {
  let alertContainer = document.getElementById('alertContainer');
  if (!alertContainer) {
    alertContainer = document.createElement('div');
    alertContainer.id = 'alertContainer';
    document.querySelector('.card-body')?.prepend(alertContainer);
  }
  alertContainer.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">
    ${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>`;
  alertContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ── Loading state ── */
function setLoadingState(button, isLoading, originalText) {
  if (isLoading) {
    button._orig = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Please wait…';
    button.disabled  = true;
  } else {
    button.innerHTML = button._orig || originalText || button.innerHTML;
    button.disabled  = false;
  }
}

/* ── Generate reference ── */
function generateReference(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
}

/* ── Application form submit ── */
function setupApplicationForm() {
  const form = document.getElementById('applicationForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm(form)) {
      showMessage('Please fill in all required fields.', 'danger');
      return;
    }

    const courseId = document.getElementById('courseId').value;
    if (!courseId) { showMessage('Please select a course.', 'danger'); return; }
    if (!_courseData.appFee && _courseData.appFee !== 0) {
      showMessage('Course details not loaded. Please re-select your course.', 'danger');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    setLoadingState(submitBtn, true);

    try {
      const scheduleSelect = document.getElementById('schedule');
      const schedule = scheduleSelect.value;
      const sessionTimeSel = document.getElementById('sessionTime');
      const sessionTime = sessionTimeSel ? sessionTimeSel.value : '';

      const formData = new FormData();
      formData.append('firstName',   document.getElementById('firstName').value.trim());
      formData.append('lastName',    document.getElementById('lastName').value.trim());
      formData.append('email',       document.getElementById('email').value.trim());
      formData.append('phone',       document.getElementById('phone').value.trim());
      formData.append('gender',      document.getElementById('gender').value);
      formData.append('dateOfBirth', document.getElementById('dateOfBirth').value);
      formData.append('address',     document.getElementById('address').value.trim());
      formData.append('courseId',    courseId);
      formData.append('schedule',    schedule);
      if (sessionTime) formData.append('sessionTime', sessionTime);

      const profilePictureFile = document.getElementById('profilePicture').files[0];
      if (profilePictureFile) {
        formData.append('profilePicture', profilePictureFile);
      } else {
        throw new Error('Profile picture is required');
      }

      const response = await fetch('/api/student/apply', { method: 'POST', body: formData });
      const result   = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to submit application');

      const { applicationNumber } = result;
      const applicationData = {
        firstName:  document.getElementById('firstName').value.trim(),
        lastName:   document.getElementById('lastName').value.trim(),
        email:      document.getElementById('email').value.trim(),
        phone:      document.getElementById('phone').value.trim(),
        gender:     document.getElementById('gender').value,
        dateOfBirth: document.getElementById('dateOfBirth').value,
        address:    document.getElementById('address').value.trim(),
        courseId,
        schedule,
        appFee: _courseData.appFee || 0,
      };

      initializeApplicationPayment(applicationNumber, applicationData);
    } catch (error) {
      console.error('Application error:', error);
      showMessage(error.message || 'Application failed. Please try again.', 'danger');
    } finally {
      setLoadingState(submitBtn, false);
    }
  });
}

/* ── Initialize Paystack payment ── */
function initializeApplicationPayment(applicationNumber, applicationData) {
  const amountKobo = Math.round((applicationData.appFee || 0) * 100);
  if (amountKobo <= 0) {
    // Free — skip payment, go straight to verify
    verifyApplicationPayment('FREE-' + Date.now(), applicationNumber);
    return;
  }

  if (!_paystackKey) {
    showMessage('Payment configuration not loaded. Please refresh the page and try again.', 'danger');
    return;
  }

  const handler = PaystackPop.setup({
    key:      _paystackKey,
    email:    applicationData.email,
    amount:   amountKobo,
    currency: 'NGN',
    ref:      generateReference('APP'),
    metadata: {
      application_number: applicationNumber,
      first_name:   applicationData.firstName,
      last_name:    applicationData.lastName,
      course_id:    applicationData.courseId,
      schedule:     applicationData.schedule,
    },
    callback: (response) => verifyApplicationPayment(response.reference, applicationNumber),
    onClose:  () => showMessage('Payment cancelled. Your application has been saved — use your Application Number to resume.', 'warning'),
  });

  try {
    handler.openIframe();
  } catch (error) {
    console.error('Payment initialization error:', error);
    showMessage('Failed to initialize payment. Please try again.', 'danger');
  }
}

/* ── Verify application payment ── */
async function verifyApplicationPayment(reference, applicationNumber) {
  try {
    const response = await fetch('/api/payment/verify-application', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reference, applicationNumber }),
    });
    const result = await response.json();
    if (result.success) {
      const appNum = result.applicationNumber || applicationNumber;
      document.getElementById('applicationNumber').textContent = appNum;
      sessionStorage.setItem('applicationNumber', appNum);
      sessionStorage.setItem('paymentReference', reference);
      const successModal = new bootstrap.Modal(document.getElementById('successModal'));
      successModal.show();
    } else {
      throw new Error(result.error || 'Payment verification failed');
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    showMessage('Payment verification failed. If you were charged, please contact support with reference: ' + reference, 'danger');
  }
}

/* ── Download application form PDF ── */
function downloadReceipt() {
  const applicationNumber = sessionStorage.getItem('applicationNumber');
  if (applicationNumber) {
    window.open(`/api/download/application-form/${applicationNumber}`, '_blank');
  } else {
    showMessage('Application number not found. Please check your email.', 'danger');
  }
}