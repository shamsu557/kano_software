document.addEventListener('DOMContentLoaded', async () => {
  const dashboardContainer = document.getElementById('dashboard-container');
  const adminManagementTab = document.getElementById('admin-management-tab');
  const coursesTable = document.getElementById('courses-table');
  const staffTable = document.getElementById('staff-table');
  const studentsTable = document.getElementById('students-table');
  const adminsTable = document.getElementById('admins-table');
  const resourcesTable = document.getElementById('resources-table');
  const paymentsTable = document.getElementById('payments-table');
  const staffCountEl = document.getElementById('staff-count');
  const studentCountEl = document.getElementById('student-count');
  const courseCountEl = document.getElementById('course-count');
  // totalPaidEl removed
  const addCourseButton = document.getElementById('add-course-button');
  const addStaffButton = document.getElementById('add-staff-button');
  const addStudentButton = document.getElementById('add-student-button');
  const addAdminButton = document.getElementById('add-admin-button');
  const addResourceButton = document.getElementById('add-resource-button');
  const generateIdCardButton = document.getElementById('generate-id-card-button');
  const generateCertificateButton = document.getElementById('generate-certificate-button');
  const generateTranscriptButton = document.getElementById('generate-transcript-button');
  const logoutButton = document.getElementById('logout-button');
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modal-title');
  const modalForm = document.getElementById('modal-form');
  const closeModalButton = document.getElementById('close-modal-button');
  const closeModalButtonSecondary = document.getElementById('close-modal-button-secondary');
  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const hamburger = document.getElementById('hamburger');
  const pageTitle = document.getElementById('pageTitle');

  let currentAction = '';
  let currentEntityType = '';
  let currentEntityId = null;

  const API_BASE_URL =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "http://localhost:3000"
      : `${window.location.origin}`;

  const bootstrapModal = new bootstrap.Modal(modal, { backdrop: 'static', keyboard: false });

  // Sidebar Toggle Functionality
  hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('sidebar-active');
    sidebarBackdrop.classList.toggle('d-block');
  });
  sidebarBackdrop.addEventListener('click', () => {
    sidebar.classList.remove('sidebar-active');
    sidebarBackdrop.classList.remove('d-block');
  });

  // API Functions
  const fetchData = async (url, options = {}) => {
    try {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        credentials: 'include'
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'API call failed');
      return data;
    } catch (error) {
      console.error('Fetch error:', error);
      return { success: false, error: error.message };
    }
  };

  const postData = async (url, data) => {
    return fetchData(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  };

  const postFormData = async (url, formData) => {
    return fetchData(url, {
      method: 'POST',
      body: formData
    });
  };

  const putData = async (url, data) => {
    const headers = data instanceof FormData ? {} : { 'Content-Type': 'application/json' };
    return fetchData(url, {
      method: 'PUT',
      headers,
      body: data instanceof FormData ? data : JSON.stringify(data)
    });
  };

  const deleteData = async (url) => {
    try {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const errorData = await response.json();
          return { success: false, error: errorData.error || `Error ${response.status}` };
        } else {
          return { success: false, error: "Session may have expired. Please log in again." };
        }
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Delete error:", error);
      return { success: false, error: error.message || "Request failed." };
    }
  };

  // UI Rendering Functions
  const formatCurrency = (amount) => {
    return `₦${parseFloat(amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getStatusBadge = (isActive) => {
    if (isActive) {
      return '<span class="badge bg-success">Active</span>';
    } else {
      return '<span class="badge bg-warning text-dark">Inactive</span>';
    }
  };

  const renderCourses = (courses) => {
    coursesTable.querySelector('tbody').innerHTML = '';
    courses.forEach(course => {
      const row = document.createElement('tr');

      // Batch + application status cell — only meaningful for active courses
      let batchCell = '<span class="text-gray-400 text-xs">—</span>';
      let appToggleBtn = '';
      if (course.is_active) {
        if (course.current_batch_id) {
          const batchLabel = course.current_session_label
            ? `Batch ${course.current_batch_number} &bull; ${course.current_session_label}`
            : `Batch ${course.current_batch_number}`;
          const appOpen = parseInt(course.application_open) === 1;
          const badgeClass = appOpen ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
          const badgeText = appOpen ? 'Open' : 'Closed';
          batchCell = `<div class="text-xs font-medium text-gray-700">${batchLabel}</div>
            <span class="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${badgeClass}">${badgeText}</span>`;
          appToggleBtn = `<button class="btn btn-sm toggle-application-btn ${appOpen ? 'btn-outline-warning' : 'btn-outline-success'}"
            data-batch-id="${course.current_batch_id}"
            data-course-id="${course.id}"
            data-open="${appOpen ? 1 : 0}"
            title="${appOpen ? 'Close Applications' : 'Open Applications'}">
            <i class="bi ${appOpen ? 'bi-lock' : 'bi-unlock'}"></i>
            <span class="ms-1 d-none d-lg-inline">${appOpen ? 'Close' : 'Open'} Apps</span>
          </button>`;
        } else {
          batchCell = '<span class="text-xs text-orange-500 font-medium">No active batch</span>';
          appToggleBtn = '';
        }
      }

      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${course.name || 'N/A'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${course.duration || 'N/A'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${course.mode || 'N/A'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">${formatCurrency(course.application_fee || 0)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">${formatCurrency(course.registration_fee || 0)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm">${getStatusBadge(course.is_active)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm">${batchCell}</td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-1">
          ${appToggleBtn}
          <button class="btn btn-sm btn-outline-secondary manage-batch-btn"
            data-course-id="${course.id}"
            data-course-name="${course.name}"
            data-current-batch="${course.current_batch_number || 0}"
            title="Manage Batch">
            <i class="bi bi-layers"></i>
            <span class="ms-1 d-none d-lg-inline">Batch</span>
          </button>
          <button class="btn btn-sm btn-outline-primary edit-button" data-id="${course.id}" data-type="course">
            <i class="bi bi-pencil-square"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger delete-button" data-id="${course.id}" data-type="course">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      `;
      coursesTable.querySelector('tbody').appendChild(row);
    });

    // Wire up toggle-application buttons
    coursesTable.querySelectorAll('.toggle-application-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const batchId = btn.dataset.batchId;
        const isOpen = parseInt(btn.dataset.open);
        const action = isOpen ? 'close' : 'open';
        if (!confirm(`Are you sure you want to ${action} applications for this batch?`)) return;
        try {
          const res = await fetch(`/api/admin/batches/${batchId}/toggle-application`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
          });
          const data = await res.json();
          if (data.success) {
            await fetchDataAndRender('/api/admin/courses', renderCourses);
          } else {
            alert(data.error || 'Failed to toggle application status');
          }
        } catch (err) {
          alert('Network error. Please try again.');
        }
      });
    });

    // Wire up manage-batch buttons
    coursesTable.querySelectorAll('.manage-batch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const courseId   = btn.dataset.courseId;
        const courseName = btn.dataset.courseName;
        const lastBatch  = parseInt(btn.dataset.currentBatch) || 0;
        const nextBatch  = lastBatch + 1;

        const formHtml = `
          <div class="alert alert-info py-2 px-3 small mb-3">
            Creating a new batch opens applications for <strong>${courseName}</strong>.
            The previous batch is closed automatically and the new batch becomes active.
          </div>
          <div class="mb-3">
            <label class="form-label text-gray-700 font-medium">Batch Number</label>
            <input type="number" name="batchNumber" class="form-control" value="${nextBatch}" min="1" required>
          </div>
          <div class="mb-3">
            <label class="form-label text-gray-700 font-medium">Session Label <span class="text-muted small">(e.g. 2025/2026)</span></label>
            <input type="text" name="sessionLabel" class="form-control" placeholder="e.g. 2025/2026">
          </div>
          <div class="mb-3">
            <label class="form-label text-gray-700 font-medium">Start Date</label>
            <input type="date" name="startDate" class="form-control">
          </div>
        `;

        showModal(`New Batch — ${courseName}`, formHtml, async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const payload = {
            courseId,
            batchNumber: fd.get('batchNumber'),
            sessionLabel: fd.get('sessionLabel') || '',
            startDate: fd.get('startDate') || ''
          };
          try {
            const res = await fetch('/api/admin/batches', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
              alert(`Batch created: ${data.batchCode}\nApplications are now OPEN.`);
              await fetchDataAndRender('/api/admin/courses', renderCourses);
            } else {
              alert(data.error || 'Failed to create batch');
            }
          } catch (err) {
            alert('Network error. Please try again.');
          }
        });
      });
    });
  };

  const renderStaff = (staff) => {
    staffTable.querySelector('tbody').innerHTML = '';
    staff.forEach(person => {
      const row = document.createElement('tr');
      row.className = 'bg-white border-b hover:bg-gray-50';
      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${person.staff_id || 'N/A'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${person.first_name} ${person.last_name}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${person.email}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${person.positions || 'N/A'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${person.courses || 'N/A'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
          <button class="btn btn-sm btn-outline-danger delete-button" data-id="${person.id}" data-type="staff">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      `;
      staffTable.querySelector('tbody').appendChild(row);
    });
  };

  const renderStudents = (students) => {
    studentsTable.querySelector('tbody').innerHTML = '';
    students.forEach(student => {
      const row = document.createElement('tr');
      row.className = 'bg-white border-b hover:bg-gray-50';
      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${student.admission_number || 'N/A'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${student.first_name} ${student.last_name}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.email}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${student.course_name || 'N/A'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
          <button class="btn btn-sm btn-outline-primary edit-button" data-id="${student.id}" data-type="student">
            <i class="bi bi-pencil-square"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger delete-button" data-id="${student.id}" data-type="student">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      `;
      studentsTable.querySelector('tbody').appendChild(row);
    });
  };

  const renderAdmins = (admins) => {
    adminsTable.querySelector('tbody').innerHTML = '';
    admins.forEach(admin => {
      const row = document.createElement('tr');
      row.className = 'bg-white border-b hover:bg-gray-50';
      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${admin.username}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${admin.role}</td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
          ${admin.role !== 'Admin' 
            ? `<button class="btn btn-sm btn-outline-danger delete-button" data-id="${admin.id}" data-type="admin">
                 <i class="bi bi-trash"></i>
               </button>` 
            : ''
          }
        </td>
      `;
      adminsTable.querySelector('tbody').appendChild(row);
    });
  };

  const renderResources = (resources) => {
    resourcesTable.querySelector('tbody').innerHTML = '';
    resources.forEach(resource => {
      const row = document.createElement('tr');
      row.className = 'bg-white border-b hover:bg-gray-50';
      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${resource.title}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${resource.course_name}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 space-x-2">
          <a href="${API_BASE_URL}${resource.file_path}" class="btn btn-sm btn-outline-secondary" target="_blank">
            <i class="bi bi-eye"></i>
          </a>
          <button class="btn btn-sm btn-outline-success download-button" data-id="${resource.id}" data-type="resource">
            <i class="bi bi-download"></i>
          </button>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
          <button class="btn btn-sm btn-outline-primary edit-button" data-id="${resource.id}" data-type="resource">
            <i class="bi bi-pencil-square"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger delete-button" data-id="${resource.id}" data-type="resource">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      `;
      resourcesTable.querySelector('tbody').appendChild(row);
    });
  };

  const renderPayments = (payments) => {
    paymentsTable.querySelector('tbody').innerHTML = '';
    payments.forEach(payment => {
      const row = document.createElement('tr');
      row.className = 'bg-white border-b hover:bg-gray-50';
      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${payment.first_name} ${payment.last_name}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${payment.payment_type}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatCurrency(payment.amount)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          <span class="${payment.status === 'Completed' ? 'text-green-600' : 'text-yellow-500'} font-semibold">${payment.status}</span>
        </td>
      `;
      paymentsTable.querySelector('tbody').appendChild(row);
    });
  };

  const renderDashboardOverview = async () => {
    const data = await fetchData('/api/admin/overview');
    if (data.success) {
      staffCountEl.textContent   = data.staff    || 0;
      studentCountEl.textContent = data.students || 0;
      courseCountEl.textContent  = data.courses || 0;
      const activeEl   = document.getElementById('course-active-count');
      const inactiveEl = document.getElementById('course-inactive-count');
      if (activeEl)   activeEl.textContent   = `${data.activeCourses   || 0} Active`;
      if (inactiveEl) inactiveEl.textContent = `${data.inactiveCourses || 0} Inactive`;
    } else {
      console.error('Failed to fetch dashboard data:', data.error);
      alert('Failed to load dashboard data. Please try again.');
    }

    const paymentsData = await fetchData('/api/admin/payments');
    if (paymentsData.success) {
      renderPayments(paymentsData.payments);
    }
  };

  const refreshData = async () => {
    await fetchDataAndRender('/api/admin/courses', renderCourses);
    await fetchDataAndRender('/api/admin/staff', renderStaff);
    await fetchDataAndRender('/api/admin/students', renderStudents);
    await fetchDataAndRender('/api/admin/resources', renderResources);
    const adminsData = await fetchData('/api/admin/admins');
    if (adminsData.success) {
      renderAdmins(adminsData.admins);
    }
  };

  const fetchDataAndRender = async (url, renderFunc) => {
    const data = await fetchData(url);
    if (data.success) {
      renderFunc(data.courses || data.staff || data.students || data.resources || data.admins || []);
    }
  };

  // Modal Functionality
  const showModal = (title, formHtml, onSubmit, closable = true) => {
    modalTitle.textContent = title;
    modalForm.innerHTML = formHtml;
    bootstrapModal.show();
    closeModalButton.style.display = closable ? 'inline-block' : 'none';
    closeModalButtonSecondary.style.display = closable ? 'inline-block' : 'none';
    modalForm.onsubmit = async (e) => {
      e.preventDefault();
      await onSubmit(e);
      bootstrapModal.hide();
      if (currentAction !== 'change-credentials') await refreshData();
    };
  };

  closeModalButton.addEventListener('click', () => {
    if (currentAction !== 'change-credentials') {
      bootstrapModal.hide();
    }
  });

  closeModalButtonSecondary.addEventListener('click', () => {
    if (currentAction !== 'change-credentials') {
      bootstrapModal.hide();
    }
  });

  logoutButton.addEventListener('click', async () => {
    const result = await postData('/api/admin/logout');
    if (result.success) {
      window.location.href = '/admin/login';
    } else {
      alert('Failed to log out.');
    }
  });

  // Tab Functionality
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', async () => {
      document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

      button.classList.add('active');
      const tabName = button.getAttribute('data-tab');
      document.getElementById(`${tabName}-tab`).classList.add('active');
      pageTitle.textContent = tabName.charAt(0).toUpperCase() + tabName.slice(1);
      sidebar.classList.remove('sidebar-active');
      sidebarBackdrop.classList.remove('d-block');

      if (tabName === 'overview') {
        await renderDashboardOverview();
      } else if (tabName === 'resources') {
        await fetchDataAndRender('/api/admin/resources', renderResources);
      } else if (tabName === 'courses') {
        await fetchDataAndRender('/api/admin/courses', renderCourses);
      }
    });
  });

  // ===================== COURSE MANAGEMENT =====================
  addCourseButton.addEventListener('click', () => {
    const formHtml = `
      <div style="max-height: 70vh; overflow-y: auto; padding-right: 10px;">
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Course Name</label>
          <input type="text" name="name" class="form-control" required>
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Abbreviation</label>
          <input type="text" name="abbreviation" class="form-control" placeholder="e.g., FSE" maxlength="20">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Description</label>
          <textarea name="description" class="form-control" rows="3" required></textarea>
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Duration</label>
          <input type="text" name="duration" class="form-control" placeholder="e.g., 6 Months" required>
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Mode</label>
          <select name="mode" class="form-control" id="addCourseMode" required>
            <option value="">Select Mode</option>
            <option value="Physical">Physical</option>
            <option value="Online">Online</option>
          </select>
        </div>
        <div id="addScheduleFields">
          <div class="mb-3">
            <label class="form-label text-gray-700 font-medium">Session Time</label>
            <div class="row g-2">
              <div class="col-6">
                <select name="session_start" class="form-control" id="addSessionStart">
                  <option value="">Start Time</option>
                  <option value="8:00am">8:00am</option>
                  <option value="9:00am">9:00am</option>
                  <option value="10:00am">10:00am</option>
                  <option value="11:00am">11:00am</option>
                  <option value="12:00pm">12:00pm</option>
                  <option value="1:00pm">1:00pm</option>
                  <option value="2:00pm">2:00pm</option>
                  <option value="3:00pm">3:00pm</option>
                  <option value="5:00pm">5:00pm</option>
                  <option value="6:00pm">6:00pm</option>
                  <option value="7:00pm">7:00pm</option>
                  <option value="8:00pm">8:00pm</option>
                </select>
              </div>
              <div class="col-6">
                <select name="session_end" class="form-control" id="addSessionEnd">
                  <option value="">End Time</option>
                  <option value="9:00am">9:00am</option>
                  <option value="10:00am">10:00am</option>
                  <option value="11:00am">11:00am</option>
                  <option value="12:00pm">12:00pm</option>
                  <option value="1:00pm">1:00pm</option>
                  <option value="2:00pm">2:00pm</option>
                  <option value="3:00pm">3:00pm</option>
                  <option value="4:00pm">4:00pm</option>
                  <option value="5:00pm">5:00pm</option>
                  <option value="6:00pm">6:00pm</option>
                  <option value="7:00pm">7:00pm</option>
                  <option value="8:00pm">8:00pm</option>
                  <option value="9:00pm">9:00pm</option>
                  <option value="10:00pm">10:00pm</option>
                </select>
              </div>
            </div>
            <small class="text-muted">e.g. 10:00am – 12:00pm or 12:00pm – 3:00pm</small>
          </div>
          <div class="mb-3">
            <label class="form-label text-gray-700 font-medium">Class Days</label>
            <div class="d-flex flex-wrap gap-2 mt-1" id="addDaysSelector">
              ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d =>
                `<label class="d-flex align-items-center gap-1 border rounded px-2 py-1" style="cursor:pointer;font-size:.85rem;background:#f8fafc;">
                  <input type="checkbox" name="days[]" value="${d}" style="accent-color:#1A56DB;"> ${d}
                </label>`).join('')}
            </div>
            <small class="text-muted">Select one or more days (e.g. Saturday + Sunday)</small>
          </div>
        </div>
        <input type="hidden" name="schedule" id="addScheduleHidden">
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Application Fee (₦)</label>
          <input type="number" name="application_fee" class="form-control" step="0.01" value="0" required>
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Registration Fee (₦)</label>
          <input type="number" name="registration_fee" class="form-control" step="0.01" value="0" required>
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Certification Type</label>
          <input type="text" name="certification_type" class="form-control" placeholder="e.g., Certificate of Completion" value="Certificate">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Course Image</label>
          <input type="file" name="image_path" class="form-control" accept="image/*">
          <small class="text-muted">Recommended: 400x300px, max 5MB</small>
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Roadmap</label>
          <div id="addRoadmapBuilder" style="border:1px solid #dee2e6;border-radius:8px;padding:12px;background:#f8f9fa;">
            <div id="addPhasesList"></div>
            <button type="button" class="btn btn-sm btn-outline-success mt-2" onclick="addPhase('add')">
              <i class="bi bi-plus-circle me-1"></i>Add Phase
            </button>
          </div>
          <input type="hidden" name="roadmap" id="addRoadmapHidden">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Status</label>
          <select name="is_active" class="form-control" required>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
        </div>
      </div>
    `;
    currentAction = 'add-course';
    showModal('Add New Course', formHtml, async (e) => {
      e.preventDefault();
      // Build schedule string from time + days
      buildScheduleString('add', e.target);
      // Serialize roadmap builder into hidden input
      serializeRoadmap('add');
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);
      data.is_active = data.is_active === '1' ? 1 : 0;
      
      const result = await postFormData('/api/admin/courses', formData);
      if (result.success) {
        alert('Course added successfully!');
        await refreshData();
      } else {
        alert(result.error || 'Failed to add course.');
      }
    });
    // Initialize builder after modal renders
    setTimeout(() => { renderPhasesList('add', []); }, 50);
  });

  // Staff Management
  addStaffButton.addEventListener('click', async () => {
    const positionsData = await fetchData('/api/admin/positions');
    const coursesData = await fetchData('/api/admin/courses');

    const positionsHtml = positionsData.success && positionsData.positions.length > 0
        ? positionsData.positions.map(pos => `<option value="${pos.id}">${pos.name}</option>`).join('')
        : '<option value="" disabled>No positions available</option>';

    const coursesHtml = coursesData.success && coursesData.courses.length > 0
        ? coursesData.courses.map(course => `<option value="${course.id}">${course.name}</option>`).join('')
        : '<option value="" disabled>No courses available</option>';

    const formHtml = `
      <div style="max-height: 70vh; overflow-y: auto; padding-right: 10px;">
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Staff ID</label>
          <input type="text" name="staff_id" required class="form-control">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">First Name</label>
          <input type="text" name="first_name" required class="form-control">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Last Name</label>
          <input type="text" name="last_name" required class="form-control">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Email</label>
          <input type="email" name="email" required class="form-control">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Phone</label>
          <input type="text" name="phone" class="form-control">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Positions</label>
          <select name="positions[]" multiple class="form-control">
            ${positionsHtml}
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Courses</label>
          <select name="courses[]" multiple class="form-control">
            ${coursesHtml}
          </select>
        </div>
      </div>
    `;

    currentAction = 'add-staff';
    showModal('Add New Staff Member', formHtml, async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);
        data.positions = formData.getAll('positions[]');
        data.courses = formData.getAll('courses[]');
        const result = await postData('/api/admin/staff', data);
        if (result.success) {
            alert('Staff member added successfully.');
        } else {
            alert(result.error || 'Failed to add staff.');
        }
    });
  });

  // Student Management
  addStudentButton.addEventListener('click', async () => {
    const coursesData = await fetchData('/api/admin/courses');
    const coursesHtml = coursesData.success && coursesData.courses.length > 0
      ? coursesData.courses.map(course => `<option value="${course.id}">${course.name}</option>`).join('')
      : '<option value="" disabled>No courses available</option>';
    const formHtml = `
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Admission No</label>
        <input type="text" name="admission_number" required class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">First Name</label>
        <input type="text" name="first_name" required class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Last Name</label>
        <input type="text" name="last_name" required class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Email</label>
        <input type="email" name="email" required class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Course</label>
        <select name="course_id" required class="form-control">
          ${coursesHtml}
        </select>
      </div>
    `;
    currentAction = 'add-student';
    showModal('Add New Student', formHtml, async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const result = await postFormData('/api/admin/students', formData);
      if (result.success) {
        alert('Student added successfully.');
      } else {
        alert(result.error || 'Failed to add student.');
      }
    });
  });

  // Admin Management
  addAdminButton.addEventListener('click', async () => {
    const formHtml = `
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Username</label>
        <input type="text" name="username" required class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Password</label>
        <input type="password" name="password" required class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Role</label>
        <select name="role" required class="form-control">
          <option value="Admin">Admin</option>
          <option value="Deputy Admin">Deputy Admin</option>
          <option value="Assistant Admin">Assistant Admin</option>
        </select>
      </div>
    `;
    currentAction = 'add-admin';
    showModal('Add New Admin', formHtml, async (e) => {
      e.preventDefault();
      const formData = Object.fromEntries(new FormData(e.target).entries());
      const result = await postData('/api/admin/admins', formData);
      if (result.success) {
        alert('Admin created successfully.');
      } else {
        alert(result.error || 'Failed to create admin.');
      }
    });
  });

  // Resource Management
  addResourceButton.addEventListener('click', async () => {
    const coursesData = await fetchData('/api/admin/courses');
    const coursesHtml = coursesData.success && coursesData.courses.length > 0
      ? coursesData.courses.map(course => `<option value="${course.id}">${course.name}</option>`).join('')
      : '<option value="" disabled>No courses available</option>';
    const formHtml = `
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Title</label>
        <input type="text" name="title" required class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label text-gray-700 font-medium">Course</label>
        <select name="course_id" required class="form-control">
          ${coursesHtml}
        </select>
      </div>
      <div class="mb-3">
        <label for="file" class="form-label text-gray-700 font-medium">File</label>
        <input type="file" id="file" name="file" accept=".pdf,.doc,.docx,.zip,.rar,.jpg,.jpeg,.png" required class="form-control">
      </div>
    `;
    currentAction = 'add-resource';
    showModal('Add New Resource', formHtml, async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const result = await postFormData('/api/admin/resources', formData);
      if (result.success) {
        alert('Resource added successfully.');
      } else {
        alert(result.error || 'Failed to add resource.');
      }
    });
  });

  // Delete and Edit Handlers
  document.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.delete-button');
    const editBtn = e.target.closest('.edit-button');
    const downloadBtn = e.target.closest('.download-button');

    // Delete Course
    if (deleteBtn && deleteBtn.dataset.type === 'course') {
      const id = deleteBtn.dataset.id;
      if (confirm('Are you sure you want to delete this course?')) {
        const result = await deleteData(`/api/admin/courses/${id}`);
        if (result.success) {
          alert('Course deleted successfully.');
          await refreshData();
        } else {
          alert(result.error || 'Failed to delete course.');
        }
      }
    }

    // Edit Course
    if (editBtn && editBtn.dataset.type === 'course') {
      const id = editBtn.dataset.id;
      currentAction = 'edit-course';
      currentEntityType = 'course';
      currentEntityId = id;

      const data = await fetchData(`/api/admin/courses/${id}`);
      if (!data.success) {
        alert(data.error || 'Failed to fetch course data.');
        return;
      }
      const course = data.course;

      const formHtml = `
        <div style="max-height: 70vh; overflow-y: auto; padding-right: 10px;">
          <div class="mb-3">
            <label class="form-label text-gray-700 font-medium">Course Name</label>
            <input type="text" name="name" value="${course.name || ''}" class="form-control" required>
          </div>
          <div class="mb-3">
            <label class="form-label text-gray-700 font-medium">Abbreviation</label>
            <input type="text" name="abbreviation" value="${course.abbreviation || ''}" class="form-control" maxlength="20">
          </div>
          <div class="mb-3">
            <label class="form-label text-gray-700 font-medium">Description</label>
            <textarea name="description" class="form-control" rows="3" required>${course.description || ''}</textarea>
          </div>
          <div class="mb-3">
            <label class="form-label text-gray-700 font-medium">Duration</label>
            <input type="text" name="duration" value="${course.duration || ''}" class="form-control" required>
          </div>
          <div class="mb-3">
            <label class="form-label text-gray-700 font-medium">Mode</label>
            <select name="mode" class="form-control" id="editCourseMode" required>
              <option value="Physical" ${course.mode === 'Physical' ? 'selected' : ''}>Physical</option>
              <option value="Online" ${course.mode === 'Online' ? 'selected' : ''}>Online</option>
            </select>
          </div>
          <div id="editScheduleFields">
            <div class="mb-3">
              <label class="form-label text-gray-700 font-medium">Session Time</label>
              <div class="row g-2">
                <div class="col-6">
                  <select name="session_start" class="form-control" id="editSessionStart">
                    <option value="">Start Time</option>
                    ${['8:00am','9:00am','10:00am','11:00am','12:00pm','1:00pm','2:00pm','3:00pm','5:00pm','6:00pm','7:00pm','8:00pm'].map(t => {
                      const cur = (course.schedule || '').split(/[-–]/)[0]?.trim();
                      return `<option value="${t}" ${cur === t ? 'selected' : ''}>${t}</option>`;
                    }).join('')}
                  </select>
                </div>
                <div class="col-6">
                  <select name="session_end" class="form-control" id="editSessionEnd">
                    <option value="">End Time</option>
                    ${['9:00am','10:00am','11:00am','12:00pm','1:00pm','2:00pm','3:00pm','4:00pm','5:00pm','6:00pm','7:00pm','8:00pm','9:00pm','10:00pm'].map(t => {
                      const cur = (course.schedule || '').split(/[-–]/)[1]?.split(',')[0]?.trim();
                      return `<option value="${t}" ${cur === t ? 'selected' : ''}>${t}</option>`;
                    }).join('')}
                  </select>
                </div>
              </div>
              <small class="text-muted">e.g. 10:00am – 12:00pm or 12:00pm – 3:00pm</small>
            </div>
            <div class="mb-3">
              <label class="form-label text-gray-700 font-medium">Class Days</label>
              <div class="d-flex flex-wrap gap-2 mt-1" id="editDaysSelector">
                ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => {
                  const scheduleDays = (course.schedule || '').split(',').slice(1).join(',');
                  const checked = scheduleDays.includes(d) ? 'checked' : '';
                  return `<label class="d-flex align-items-center gap-1 border rounded px-2 py-1" style="cursor:pointer;font-size:.85rem;background:#f8fafc;">
                    <input type="checkbox" name="days[]" value="${d}" ${checked} style="accent-color:#1A56DB;"> ${d}
                  </label>`;
                }).join('')}
              </div>
              <small class="text-muted">Select one or more days (e.g. Saturday + Sunday)</small>
            </div>
          </div>
          <input type="hidden" name="schedule" id="editScheduleHidden">
          <div class="mb-3">
            <label class="form-label text-gray-700 font-medium">Application Fee (₦)</label>
            <input type="number" name="application_fee" value="${course.application_fee || 0}" class="form-control" step="0.01" required>
          </div>
          <div class="mb-3">
            <label class="form-label text-gray-700 font-medium">Registration Fee (₦)</label>
            <input type="number" name="registration_fee" value="${course.registration_fee || 0}" class="form-control" step="0.01" required>
          </div>
          <div class="mb-3">
            <label class="form-label text-gray-700 font-medium">Certification Type</label>
            <input type="text" name="certification_type" value="${course.certification_type || 'Certificate'}" class="form-control">
          </div>
          <div class="mb-3">
            <label class="form-label text-gray-700 font-medium">Course Image</label>
            ${course.image_path ? `<div class="mb-2"><img src="${API_BASE_URL}${course.image_path}" alt="Course Image" style="max-width: 200px; max-height: 150px; border-radius: 8px;"></div>` : ''}
            <input type="file" name="image_path" class="form-control" accept="image/*">
            <small class="text-muted">Leave blank to keep existing image</small>
          </div>
          <div class="mb-3">
            <label class="form-label text-gray-700 font-medium">Roadmap</label>
            <div id="editRoadmapBuilder" style="border:1px solid #dee2e6;border-radius:8px;padding:12px;background:#f8f9fa;">
              <div id="editPhasesList"></div>
              <button type="button" class="btn btn-sm btn-outline-success mt-2" onclick="addPhase('edit')">
                <i class="bi bi-plus-circle me-1"></i>Add Phase
              </button>
            </div>
            <input type="hidden" name="roadmap" id="editRoadmapHidden">
          </div>
          <div class="mb-3">
            <label class="form-label text-gray-700 font-medium">Status</label>
            <select name="is_active" class="form-control" required>
              <option value="1" ${course.is_active ? 'selected' : ''}>Active</option>
              <option value="0" ${!course.is_active ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
        </div>
      `;

      showModal('Edit Course', formHtml, async (e) => {
        e.preventDefault();
        buildScheduleString('edit', e.target);
        serializeRoadmap('edit');
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);
        data.is_active = data.is_active === '1' ? 1 : 0;
        const result = await putData(`/api/admin/courses/${currentEntityId}`, formData);
        if (result.success) {
          alert('Course updated successfully.');
        } else {
          alert(result.error || 'Failed to update course.');
        }
      });

      // Initialize builder with existing roadmap data after modal renders
      setTimeout(() => {
        let existingPhases = [];
        if (course.roadmap) {
          try {
            const rm = typeof course.roadmap === 'string' ? JSON.parse(course.roadmap) : course.roadmap;
            existingPhases = rm.phases || [];
          } catch(e) { existingPhases = []; }
        }
        renderPhasesList('edit', existingPhases);
      }, 50);
    }

    // Delete Staff
    if (deleteBtn && deleteBtn.dataset.type === 'staff') {
      const id = deleteBtn.dataset.id;
      if (confirm('Are you sure you want to delete this staff?')) {
        const result = await deleteData(`/api/admin/staff/${id}`);
        if (result.success) {
          alert('Staff deleted successfully.');
          await refreshData();
        } else {
          alert(result.error || 'Failed to delete staff.');
        }
      }
    }

    // Delete Student
    if (deleteBtn && deleteBtn.dataset.type === 'student') {
      const id = deleteBtn.dataset.id;
      if (confirm('Are you sure you want to delete this student?')) {
        const result = await deleteData(`/api/admin/students/${id}`);
        if (result.success) {
          alert('Student deleted successfully.');
          await refreshData();
        } else {
          alert(result.error || 'Failed to delete student.');
        }
      }
    }

    // Delete Admin
    if (deleteBtn && deleteBtn.dataset.type === 'admin') {
      const id = deleteBtn.dataset.id;
      if (confirm('Are you sure you want to delete this admin?')) {
        const result = await deleteData(`/api/admin/admins/${id}`);
        if (result.success) {
          alert('Admin deleted successfully.');
          await refreshData();
        } else {
          alert(result.error || 'Failed to delete admin.');
        }
      }
    }

    // Delete Resource
    if (deleteBtn && deleteBtn.dataset.type === 'resource') {
      const id = deleteBtn.dataset.id;
      if (confirm('Are you sure you want to delete this resource?')) {
        const result = await deleteData(`/api/admin/resources/${id}`);
        if (result.success) {
          alert('Resource deleted successfully.');
          await refreshData();
        } else {
          alert(result.error || 'Failed to delete resource.');
        }
      }
    }

    // Download Resource
    if (downloadBtn && downloadBtn.dataset.type === 'resource') {
      const id = downloadBtn.dataset.id;
      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/resources/download/${id}`, {
          method: 'GET',
          credentials: 'include'
        });
        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `resource_${id}`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          alert('Resource downloaded successfully.');
        } else {
          const data = await response.json();
          throw new Error(data.error || 'Failed to download resource.');
        }
      } catch (error) {
        console.error('Download error:', error);
        alert(error.message || 'Failed to download resource.');
      }
    }

    // Edit Student
    if (editBtn && editBtn.dataset.type === 'student') {
      const id = editBtn.dataset.id;
      currentAction = 'edit-student';
      currentEntityType = 'student';
      currentEntityId = id;

      const data = await fetchData(`/api/admin/students/${id}`);
      if (!data.success) {
        alert(data.error || 'Failed to fetch data for editing student.');
        return;
      }
      const student = data.student;
      const coursesData = await fetchData('/api/admin/courses');
      const coursesHtml = coursesData.success
        ? coursesData.courses.map(course => `<option value="${course.id}" ${student.course_id === course.id ? 'selected' : ''}>${course.name}</option>`).join('')
        : '<option value="" disabled>No courses available</option>';

      const formHtml = `
        <div class="mb-3 text-center">
          <label class="form-label text-gray-700 font-medium d-block">Profile Picture</label>
          <img src="${student.profile_picture ? API_BASE_URL + student.profile_picture : '/default-avatar.png'}" 
               alt="Profile Picture" 
               class="rounded-circle mb-2" 
               style="width: 100px; height: 100px; object-fit: cover;">
          <input type="file" name="profile_picture" accept="image/*" class="form-control mt-2">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Admission No</label>
          <input type="text" name="admission_number" value="${student.admission_number || ''}" required class="form-control">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">First Name</label>
          <input type="text" name="first_name" value="${student.first_name || ''}" required class="form-control">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Last Name</label>
          <input type="text" name="last_name" value="${student.last_name || ''}" required class="form-control">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Email</label>
          <input type="email" name="email" value="${student.email || ''}" required class="form-control">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Course</label>
          <select name="course_id" required class="form-control">
            ${coursesHtml}
          </select>
        </div>
      `;

      showModal('Edit Student', formHtml, async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const result = await putData(`/api/admin/students/${currentEntityId}`, formData);
        if (result.success) {
          alert('Student updated successfully.');
        } else {
          alert(result.error || 'Failed to update student.');
        }
      });
    }

    // Edit Admin
    if (editBtn && editBtn.dataset.type === 'admin') {
      const id = editBtn.dataset.id;
      currentAction = 'edit-admin';
      currentEntityType = 'admin';
      currentEntityId = id;

      const data = await fetchData(`/api/admin/admins/${id}`);
      if (!data.success) {
        alert(data.error || 'Failed to fetch data for editing admin.');
        return;
      }
      const admin = data.admins[0];
      const formHtml = `
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Username</label>
          <input type="text" name="username" value="${admin.username || ''}" required class="form-control">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Role</label>
          <select name="role" required class="form-control">
            <option value="Deputy Admin" ${admin.role === 'Deputy Admin' ? 'selected' : ''}>Deputy Admin</option>
            <option value="Assistant Admin" ${admin.role === 'Assistant Admin' ? 'selected' : ''}>Assistant Admin</option>
          </select>
        </div>
      `;
      showModal('Edit Admin', formHtml, async (e) => {
        e.preventDefault();
        const formData = Object.fromEntries(new FormData(e.target).entries());
        const result = await putData(`/api/admin/admins/${currentEntityId}`, formData);
        if (result.success) {
          alert('Admin updated successfully.');
        } else {
          alert(result.error || 'Failed to update admin.');
        }
      });
    }

    // Edit Resource
    if (editBtn && editBtn.dataset.type === 'resource') {
      const id = editBtn.dataset.id;
      currentAction = 'edit-resource';
      currentEntityType = 'resource';
      currentEntityId = id;

      const data = await fetchData(`/api/admin/resources/${id}`);
      if (!data.success) {
        alert(data.error || 'Failed to fetch data for editing resource.');
        return;
      }
      const resource = data.resource;
      const coursesData = await fetchData('/api/admin/courses');
      const coursesHtml = coursesData.success
        ? coursesData.courses.map(course => `<option value="${course.id}" ${resource.course_id === course.id ? 'selected' : ''}>${course.name}</option>`).join('')
        : '<option value="" disabled>No courses available</option>';
      const formHtml = `
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Title</label>
          <input type="text" name="title" value="${resource.title || ''}" required class="form-control">
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Course</label>
          <select name="course_id" required class="form-control">
            ${coursesHtml}
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label text-gray-700 font-medium">Current File</label>
          <a href="${API_BASE_URL}${resource.file_path}" target="_blank" class="text-indigo-600 hover:text-indigo-900">${resource.file_path.split('/').pop()}</a>
        </div>
        <div class="mb-3">
          <label for="file" class="form-label text-gray-700 font-medium">New File (optional)</label>
          <input type="file" id="file" name="file" accept=".pdf,.doc,.docx,.zip,.rar,.jpg,.jpeg,.png" class="form-control">
        </div>
      `;
      showModal('Edit Resource', formHtml, async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        if (!formData.get('file') || formData.get('file').name === '') {
          formData.delete('file');
        }
        const result = await putData(`/api/admin/resources/${currentEntityId}`, formData);
        if (result.success) {
          alert('Resource updated successfully.');
        } else {
          alert(result.error || 'Failed to update resource.');
        }
      });
    }
  });

  generateIdCardButton.addEventListener('click', async () => {
    const entityType = document.getElementById('id-card-entity-type').value;
    const entityId = document.getElementById('id-card-entity-id').value;
    if (!entityId) {
      alert('Please enter an ID.');
      return;
    }
    const response = await fetch(`${API_BASE_URL}/api/admin/id-card/${entityType}/${entityId}`, {
      method: 'GET',
      credentials: 'include'
    });
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${entityType}_ID_${entityId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      alert('ID card generated successfully.');
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to generate ID card.');
    }
  });

  generateCertificateButton.addEventListener('click', async () => {
    const studentId = document.getElementById('certificate-student-id').value;
    if (!studentId) {
      alert('Please enter a student ID.');
      return;
    }
    const response = await fetch(`${API_BASE_URL}/api/admin/certificate/${studentId}`, {
      method: 'GET',
      credentials: 'include'
    });
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Certificate_${studentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      alert('Certificate generated successfully.');
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to generate certificate.');
    }
  });

  generateTranscriptButton.addEventListener('click', async () => {
    const studentId = document.getElementById('transcript-student-id').value.trim();
    if (!studentId) {
      alert('Please enter a Student ID.');
      return;
    }
    const response = await fetch(`${API_BASE_URL}/api/admin/transcript/${studentId}`, {
      method: 'GET',
      credentials: 'include'
    });
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Transcript_${studentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      alert('Transcript generated successfully.');
    } else {
      let errMsg = 'Failed to generate transcript.';
      try { const d = await response.json(); errMsg = d.error || errMsg; } catch {}
      alert(errMsg);
    }
  });

  // ===================== ROADMAP BUILDER =====================
  // prefix = 'add' | 'edit'
  window._roadmapPhases = { add: [], edit: [] };

  window.renderPhasesList = function(prefix, phases) {
    window._roadmapPhases[prefix] = phases.map(p => ({
      title: p.title || '',
      duration: p.duration || '',
      sprints: (p.sprints || []).map(s => ({
        sprint: s.sprint || '',
        title: s.title || '',
        topics: (s.topics || []).join('\n')
      }))
    }));
    _repaintPhases(prefix);
  };

  function _repaintPhases(prefix) {
    const container = document.getElementById(`${prefix}PhasesList`);
    if (!container) return;
    const phases = window._roadmapPhases[prefix];
    container.innerHTML = phases.map((phase, pi) => `
      <div style="background:#fff;border:1px solid #dee2e6;border-radius:8px;padding:12px;margin-bottom:10px;">
        <div class="d-flex align-items-center gap-2 mb-2">
          <span class="badge bg-primary">Phase ${pi + 1}</span>
          <input type="text" class="form-control form-control-sm flex-grow-1" placeholder="Phase title e.g. Core Foundations"
            value="${escAdminHtml(phase.title)}"
            onchange="window._roadmapPhases['${prefix}'][${pi}].title=this.value">
          <input type="text" class="form-control form-control-sm" style="max-width:120px;" placeholder="Duration"
            value="${escAdminHtml(phase.duration)}"
            onchange="window._roadmapPhases['${prefix}'][${pi}].duration=this.value">
          <button type="button" class="btn btn-sm btn-outline-danger" onclick="removePhase('${prefix}',${pi})">
            <i class="bi bi-trash"></i>
          </button>
        </div>
        <div id="${prefix}SprintsList${pi}">
          ${phase.sprints.map((s, si) => _sprintHtml(prefix, pi, si, s)).join('')}
        </div>
        <button type="button" class="btn btn-sm btn-outline-secondary mt-1" onclick="addSprint('${prefix}',${pi})">
          <i class="bi bi-plus me-1"></i>Add Sprint
        </button>
      </div>`).join('');
  }

  function _sprintHtml(prefix, pi, si, s) {
    return `
      <div style="background:#f1f5f9;border-radius:6px;padding:8px;margin-bottom:6px;">
        <div class="d-flex align-items-center gap-2 mb-1">
          <span class="badge bg-secondary" style="min-width:60px;">Sprint ${si + 1}</span>
          <input type="text" class="form-control form-control-sm flex-grow-1" placeholder="Sprint title"
            value="${escAdminHtml(s.title)}"
            onchange="window._roadmapPhases['${prefix}'][${pi}].sprints[${si}].title=this.value">
          <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeSprint('${prefix}',${pi},${si})">
            <i class="bi bi-x"></i>
          </button>
        </div>
        <textarea class="form-control form-control-sm" rows="3"
          placeholder="Topics — one per line e.g:&#10;Variables &amp; Data Types&#10;Functions&#10;Loops"
          onchange="window._roadmapPhases['${prefix}'][${pi}].sprints[${si}].topics=this.value"
          >${escAdminHtml(s.topics)}</textarea>
        <small class="text-muted">One topic per line</small>
      </div>`;
  }

  function escAdminHtml(str) {
    if (typeof str !== 'string') return str ?? '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  window.addPhase = function(prefix) {
    window._roadmapPhases[prefix].push({ title: '', duration: '', sprints: [] });
    _repaintPhases(prefix);
  };

  window.removePhase = function(prefix, pi) {
    window._roadmapPhases[prefix].splice(pi, 1);
    _repaintPhases(prefix);
  };

  window.addSprint = function(prefix, pi) {
    window._roadmapPhases[prefix][pi].sprints.push({ sprint: '', title: '', topics: '' });
    _repaintPhases(prefix);
  };

  window.removeSprint = function(prefix, pi, si) {
    window._roadmapPhases[prefix][pi].sprints.splice(si, 1);
    _repaintPhases(prefix);
  };

  window.serializeRoadmap = function(prefix) {
    const phases = window._roadmapPhases[prefix].map((p, pi) => ({
      title: p.title,
      duration: p.duration,
      sprints: p.sprints.map((s, si) => ({
        sprint: si + 1,
        title: s.title,
        topics: (typeof s.topics === 'string' ? s.topics : '').split('\n').map(t => t.trim()).filter(Boolean)
      }))
    }));
    const hidden = document.getElementById(`${prefix}RoadmapHidden`);
    if (hidden) hidden.value = phases.length ? JSON.stringify({ phases }) : '';
  };

  // Initial check and data load
  const checkAuth = async () => {
    const authCheck = await fetchData('/api/admin/auth-check');
    if (authCheck.success) {
      dashboardContainer.classList.remove('hidden');
      if (authCheck.role === 'Admin') {
        adminManagementTab.classList.remove('hidden');
      }
      await renderDashboardOverview();
      await refreshData();
    } else {
      window.location.href = '/admin/login';
    }
  };

  await checkAuth();
});

/* ── Schedule Builder Helpers ── */

/**
 * Build a schedule string like "10:00am - 12:00pm, Saturday, Sunday"
 * from the time dropdowns and day checkboxes, then set the hidden input.
 */
function buildScheduleString(prefix, form) {
  const start = form.querySelector(`[name="session_start"]`)?.value || '';
  const end   = form.querySelector(`[name="session_end"]`)?.value || '';
  const days  = Array.from(form.querySelectorAll(`[name="days[]"]:checked`)).map(el => el.value);

  let schedule = '';
  if (start && end) {
    schedule = `${start} - ${end}`;
  }
  if (days.length) {
    schedule += (schedule ? ', ' : '') + days.join(', ');
  }

  const hidden = form.querySelector(`#${prefix}ScheduleHidden`);
  if (hidden) hidden.value = schedule;
}