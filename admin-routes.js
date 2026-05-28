const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const db = require('./mysql');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const p = path.join(__dirname, 'Uploads');
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    cb(null, p);
  },
  filename: (req, file, cb) => cb(null, 'admin-' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

// ── Auth Middleware ───────────────────────────────────────────────────────────
const isAdmin = (req, res, next) => {
  if (req.session.adminId) return next();
  res.status(401).json({ success: false, error: 'Not authenticated' });
};
const isSuperAdmin = (req, res, next) => {
  if (req.session.adminId && req.session.adminRole === 'SuperAdmin') return next();
  res.status(403).json({ success: false, error: 'SuperAdmin access required' });
};

// ── LOGIN / LOGOUT ────────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.query('SELECT * FROM admins WHERE username=?', [username], async (err, rows) => {
    if (err || !rows.length) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    const admin = rows[0];
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    req.session.adminId = admin.id;
    req.session.adminRole = admin.role;
    req.session.adminName = `${admin.first_name} ${admin.last_name}`;
    res.json({ success: true, role: admin.role, name: req.session.adminName });
  });
});

router.post('/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
router.get('/auth-check', isAdmin, (req, res) => res.json({ success: true, role: req.session.adminRole, name: req.session.adminName }));

// ── DASHBOARD OVERVIEW ────────────────────────────────────────────────────────
router.get('/overview', isAdmin, (req, res) => {
  const queries = [
    new Promise(r => db.query('SELECT COUNT(*) as c FROM students WHERE status NOT IN ("Applied")', (e, rows) => r(rows[0]?.c || 0))),
    new Promise(r => db.query('SELECT COUNT(*) as c FROM staff WHERE is_registered=1', (e, rows) => r(rows[0]?.c || 0))),
    new Promise(r => db.query('SELECT SUM(amount) as t FROM payments WHERE status="Completed"', (e, rows) => r(rows[0]?.t || 0))),
    new Promise(r => db.query('SELECT COUNT(*) as c FROM students WHERE graduation_status="Passed" AND graduation_approved_by IS NULL', (e, rows) => r(rows[0]?.c || 0))),
    new Promise(r => db.query('SELECT COUNT(*) as c FROM students WHERE graduation_status="Failed" AND status != "Active"', (e, rows) => r(rows[0]?.c || 0))),
    new Promise(r => db.query('SELECT COUNT(*) as c FROM students WHERE status="Active"', (e, rows) => r(rows[0]?.c || 0))),
  ];
  Promise.all(queries).then(([students, tutors, revenue, pendingGrad, failed, active]) => {
    res.json({ success: true, students, tutors, revenue, pendingGrad, failed, active });
  });
});

// ── COURSE MANAGEMENT (UPDATED - Replaces Programs) ────────────────────────────
router.get('/courses', isAdmin, (req, res) => {
  db.query(
    `SELECT 
      id,
      name,
      abbreviation,
      description,
      duration,
      mode,
      schedule,
      application_fee,
      registration_fee,
      certification_type,
      is_active,
      image_path,
      roadmap,
      created_at
    FROM courses 
    ORDER BY is_active DESC, name`,
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      res.json({ success: true, courses: rows });
    }
  );
});

router.get('/courses/:id', isAdmin, (req, res) => {
  db.query('SELECT * FROM courses WHERE id = ?', [req.params.id], (err, rows) => {
    if (err || !rows.length) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }
    res.json({ success: true, course: rows[0] });
  });
});

router.post('/courses', isAdmin, upload.single('image_path'), (req, res) => {
  const {
    name,
    abbreviation,
    description,
    duration,
    mode,
    schedule,
    application_fee,
    registration_fee,
    certification_type,
    is_active,
    roadmap
  } = req.body;

  if (!name || !description || !duration) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const imagePath = req.file ? `/Uploads/${req.file.filename}` : null;

  db.query(
    `INSERT INTO courses 
    (name, abbreviation, description, duration, mode, schedule, application_fee, registration_fee, certification_type, is_active, image_path, roadmap) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      abbreviation || null,
      description,
      duration,
      mode || 'Physical',
      schedule || null,
      application_fee || 0,
      registration_fee || 0,
      certification_type || 'Certificate',
      parseInt(is_active) === 1 ? 1 : 0,
      imagePath,
      roadmap || null
    ],
    (err, r) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: 'Failed to create course' });
      }
      res.json({ success: true, courseId: r.insertId });
    }
  );
});

router.put('/courses/:id', isAdmin, upload.single('image_path'), (req, res) => {
  const {
    name,
    abbreviation,
    description,
    duration,
    mode,
    schedule,
    application_fee,
    registration_fee,
    certification_type,
    is_active,
    roadmap
  } = req.body;

  if (!name || !description || !duration) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  let query = `UPDATE courses 
    SET name=?, abbreviation=?, description=?, duration=?, mode=?, schedule=?, application_fee=?, registration_fee=?, 
        certification_type=?, is_active=?, roadmap=?`;
  let params = [
    name,
    abbreviation || null,
    description,
    duration,
    mode || 'Physical',
    schedule || null,
    application_fee || 0,
    registration_fee || 0,
    certification_type || 'Certificate',
    parseInt(is_active) === 1 ? 1 : 0,
    roadmap || null
  ];

  if (req.file) {
    query += ', image_path=?';
    params.push(`/Uploads/${req.file.filename}`);
  }

  query += ' WHERE id=?';
  params.push(req.params.id);

  db.query(query, params, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, error: 'Failed to update course' });
    }
    res.json({ success: true });
  });
});

router.delete('/courses/:id', isAdmin, (req, res) => {
  db.query('DELETE FROM courses WHERE id=?', [req.params.id], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, error: 'Failed to delete course' });
    }
    res.json({ success: true });
  });
});

// ── BATCH MANAGEMENT ──────────────────────────────────────────────────────────
router.get('/batches', isAdmin, (req, res) => {
  db.query('SELECT b.*, c.name as course_name, (SELECT COUNT(*) FROM students WHERE batch_id=b.id) as student_count FROM batches b JOIN courses c ON c.id=b.course_id ORDER BY b.created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true, batches: rows });
  });
});

router.post('/batches', isAdmin, (req, res) => {
  const { courseId, batchNumber, startDate } = req.body;
  db.query('SELECT abbreviation FROM courses WHERE id=?', [courseId], (err, rows) => {
    if (err || !rows.length) return res.status(400).json({ error: 'Invalid course' });
    const code = `${rows[0].abbreviation}-BATCH-${String(batchNumber).padStart(3, '0')}`;
    db.query('INSERT INTO batches (course_id, batch_number, batch_code, start_date, is_active) VALUES (?,?,?,?,1)', [courseId, batchNumber, code, startDate], (e2, r) => {
      if (e2) return res.status(500).json({ error: 'DB error' });
      res.json({ success: true, batchCode: code, id: r.insertId });
    });
  });
});

// ── STUDENT MANAGEMENT ────────────────────────────────────────────────────────
router.get('/students', isAdmin, (req, res) => {
  const { status, batchId, courseId } = req.query;
  let q = 'SELECT s.*, c.name as course_name, b.batch_code FROM students s JOIN courses c ON c.id=s.course_id LEFT JOIN batches b ON b.id=s.batch_id WHERE 1=1';
  const params = [];
  if (status) { q += ' AND s.status=?'; params.push(status); }
  if (batchId) { q += ' AND s.batch_id=?'; params.push(batchId); }
  if (courseId) { q += ' AND s.course_id=?'; params.push(courseId); }
  q += ' ORDER BY s.last_name';
  db.query(q, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true, students: rows });
  });
});

router.get('/students/:id', isAdmin, (req, res) => {
  db.query('SELECT s.*, c.name as course_name, b.batch_code, b.batch_number FROM students s JOIN courses c ON c.id=s.course_id LEFT JOIN batches b ON b.id=s.batch_id WHERE s.id=?', [req.params.id], (err, rows) => {
    if (err || !rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, student: rows[0] });
  });
});

router.post('/students', isAdmin, upload.single('profile_picture'), (req, res) => {
  const { admission_number, first_name, last_name, email, course_id } = req.body;

  if (!admission_number || !first_name || !last_name || !email || !course_id) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const profilePicture = req.file ? `/Uploads/${req.file.filename}` : null;
  db.query(
    'INSERT INTO students (admission_number, first_name, last_name, email, profile_picture, course_id) VALUES (?, ?, ?, ?, ?, ?)',
    [admission_number, first_name, last_name, email, profilePicture, course_id],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: 'Failed to create student' });
      }
      res.json({ success: true, studentId: result.insertId });
    }
  );
});

router.put('/students/:id', isAdmin, upload.single('profile_picture'), (req, res) => {
  const { admission_number, first_name, last_name, email, course_id, status, batchId, loginBlocked, blockReason } = req.body;

  let query = 'UPDATE students SET admission_number=?, first_name=?, last_name=?, email=?, course_id=?';
  let params = [admission_number, first_name, last_name, email, course_id];

  if (req.file) {
    query += ', profile_picture=?';
    params.push(`/Uploads/${req.file.filename}`);
  }

  if (status !== undefined) {
    query += ', status=?';
    params.push(status);
  }

  if (batchId !== undefined) {
    query += ', batch_id=?';
    params.push(batchId);
  }

  if (loginBlocked !== undefined) {
    query += ', login_blocked=?';
    params.push(loginBlocked ? 1 : 0);
  }

  if (blockReason !== undefined) {
    query += ', block_reason=?';
    params.push(blockReason);
  }

  query += ' WHERE id=?';
  params.push(req.params.id);

  db.query(query, params, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, error: 'Failed to update student' });
    }
    res.json({ success: true });
  });
});

router.delete('/students/:id', isSuperAdmin, (req, res) => {
  db.query('DELETE FROM students WHERE id=?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true });
  });
});

// ── GRADUATION APPROVAL ───────────────────────────────────────────────────────
router.get('/graduation/pending', isAdmin, (req, res) => {
  db.query(`
    SELECT s.*, c.name as course_name, c.registration_fee, b.batch_code,
           (SELECT SUM(amount) FROM payments WHERE student_id=s.id AND payment_type="Graduation" AND status="Completed") as grad_paid
    FROM students s JOIN courses c ON c.id=s.course_id LEFT JOIN batches b ON b.id=s.batch_id
    WHERE s.graduation_status IN ("Passed","Failed") AND s.graduation_approved_by IS NULL
    ORDER BY s.graduation_score DESC
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true, students: rows });
  });
});

router.post('/graduation/approve/:studentId', isAdmin, (req, res) => {
  const { action } = req.body;
  const adminId = req.session.adminId;
  if (action === 'approve') {
    db.query('UPDATE students SET graduation_status="Approved", graduation_approved_by=?, graduation_approved_at=NOW(), login_blocked=1, block_reason="Payment of graduation fee required to access certificate." WHERE id=?',
      [adminId, req.params.studentId], (err) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ success: true, message: 'Graduation approved. Student notified to pay graduation fee.' });
      });
  } else {
    db.query('UPDATE students SET graduation_approved_by=?, login_blocked=1, block_reason="Resit fee required (30% of registration fee) to join next batch." WHERE id=?',
      [adminId, req.params.studentId], (err) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ success: true });
      });
  }
});

// ── STAFF MANAGEMENT ──────────────────────────────────────────────────────────
router.get('/staff', isAdmin, (req, res) => {
  db.query(
    `SELECT 
      s.id,
      s.staff_id,
      s.first_name,
      s.last_name,
      s.email,
      s.phone,
      GROUP_CONCAT(DISTINCT p.name SEPARATOR ', ') as positions,
      GROUP_CONCAT(DISTINCT c.name SEPARATOR ', ') as courses
    FROM staff s
    LEFT JOIN staff_positions sp ON s.id = sp.staff_id
    LEFT JOIN positions p ON sp.position_id = p.id
    LEFT JOIN staff_courses sc ON s.id = sc.staff_id
    LEFT JOIN courses c ON sc.course_id = c.id
    GROUP BY s.id
    ORDER BY s.first_name`,
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      res.json({ success: true, staff: rows });
    }
  );
});

router.post('/staff', isAdmin, (req, res) => {
  const { staff_id, first_name, last_name, email, phone, positions = [], courses = [] } = req.body;

  if (!staff_id || !first_name || !last_name || !email) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  db.query(
    'INSERT INTO staff (staff_id, first_name, last_name, email, phone) VALUES (?, ?, ?, ?, ?)',
    [staff_id, first_name, last_name, email, phone || null],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: err.code === 'ER_DUP_ENTRY' ? 'Email already exists' : 'Failed to create staff' });
      }

      const staffInsertId = result.insertId;

      // Add positions
      if (Array.isArray(positions) && positions.length > 0) {
        const positionQueries = positions.map(posId =>
          new Promise((resolve, reject) => {
            db.query('INSERT INTO staff_positions (staff_id, position_id) VALUES (?, ?)', [staffInsertId, posId], (err) => {
              if (err) reject(err);
              else resolve();
            });
          })
        );
        Promise.all(positionQueries).catch(err => console.error(err));
      }

      // Add courses
      if (Array.isArray(courses) && courses.length > 0) {
        const courseQueries = courses.map(courseId =>
          new Promise((resolve, reject) => {
            db.query('INSERT INTO staff_courses (staff_id, course_id) VALUES (?, ?)', [staffInsertId, courseId], (err) => {
              if (err) reject(err);
              else resolve();
            });
          })
        );
        Promise.all(courseQueries).catch(err => console.error(err));
      }

      res.json({ success: true, staffId: staffInsertId });
    }
  );
});

router.put('/staff/:id/courses', isAdmin, (req, res) => {
  const { courseIds } = req.body;
  db.query('DELETE FROM staff_courses WHERE staff_id=?', [req.params.id], () => {
    if (Array.isArray(courseIds) && courseIds.length > 0) {
      const vals = courseIds.map(cid => [req.params.id, cid]);
      db.query('INSERT INTO staff_courses (staff_id, course_id) VALUES ?', [vals]);
    }
    res.json({ success: true });
  });
});

router.delete('/staff/:id', isSuperAdmin, (req, res) => {
  db.query('DELETE FROM staff WHERE id=?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true });
  });
});

// ── ADMIN MANAGEMENT (SuperAdmin only) ───────────────────────────────────────
router.get('/admins', isSuperAdmin, (req, res) => {
  db.query('SELECT id, username, role FROM admins ORDER BY role, username', (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: 'DB error' });
    res.json({ success: true, admins: rows });
  });
});

router.get('/admins/:id', isSuperAdmin, (req, res) => {
  db.query('SELECT id, username, role FROM admins WHERE id = ?', [req.params.id], (err, rows) => {
    if (err || !rows.length) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    res.json({ success: true, admins: rows });
  });
});

router.post('/admins', isSuperAdmin, async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.query(
      'INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)',
      [username, hashedPassword, role],
      (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ success: false, error: err.code === 'ER_DUP_ENTRY' ? 'Username already exists' : 'Failed to create admin' });
        }
        res.json({ success: true, adminId: result.insertId });
      }
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to create admin' });
  }
});

router.put('/admins/:id', isSuperAdmin, async (req, res) => {
  const { username, role, password } = req.body;

  if (!username || !role) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  let query = 'UPDATE admins SET username=?, role=?';
  let params = [username, role];

  if (password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    query += ', password_hash=?';
    params.push(hashedPassword);
  }

  query += ' WHERE id=?';
  params.push(req.params.id);

  db.query(query, params, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, error: 'Failed to update admin' });
    }
    res.json({ success: true });
  });
});

router.delete('/admins/:id', isSuperAdmin, (req, res) => {
  if (req.session.adminId == req.params.id) {
    return res.status(400).json({ success: false, error: 'Cannot delete yourself' });
  }

  db.query('DELETE FROM admins WHERE id=? AND role != "SuperAdmin"', [req.params.id], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, error: 'Failed to delete admin' });
    }
    res.json({ success: result.affectedRows > 0 });
  });
});

// ── RESOURCE MANAGEMENT ───────────────────────────────────────────────────────
router.get('/resources', isAdmin, (req, res) => {
  db.query(
    `SELECT 
      r.id,
      r.title,
      r.file_path,
      c.name as course_name,
      r.course_id,
      r.created_at
    FROM resources r
    LEFT JOIN courses c ON r.course_id = c.id
    ORDER BY r.created_at DESC`,
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      res.json({ success: true, resources: rows });
    }
  );
});

router.get('/resources/:id', isAdmin, (req, res) => {
  db.query('SELECT * FROM resources WHERE id = ?', [req.params.id], (err, rows) => {
    if (err || !rows.length) {
      return res.status(404).json({ success: false, error: 'Resource not found' });
    }
    res.json({ success: true, resource: rows[0] });
  });
});

router.post('/resources', isAdmin, upload.single('file'), (req, res) => {
  const { title, course_id } = req.body;

  if (!title || !course_id || !req.file) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const filePath = `/Uploads/${req.file.filename}`;
  db.query(
    'INSERT INTO resources (title, file_path, course_id) VALUES (?, ?, ?)',
    [title, filePath, course_id],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: 'Failed to create resource' });
      }
      res.json({ success: true, resourceId: result.insertId });
    }
  );
});

router.put('/resources/:id', isAdmin, upload.single('file'), (req, res) => {
  const { title, course_id } = req.body;

  if (!title || !course_id) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  let query = 'UPDATE resources SET title=?, course_id=?';
  let params = [title, course_id];

  if (req.file) {
    query += ', file_path=?';
    params.push(`/Uploads/${req.file.filename}`);
  }

  query += ' WHERE id=?';
  params.push(req.params.id);

  db.query(query, params, (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, error: 'Failed to update resource' });
    }
    res.json({ success: true });
  });
});

router.delete('/resources/:id', isAdmin, (req, res) => {
  db.query('DELETE FROM resources WHERE id=?', [req.params.id], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, error: 'Failed to delete resource' });
    }
    res.json({ success: true });
  });
});

router.get('/resources/download/:id', isAdmin, (req, res) => {
  db.query('SELECT file_path FROM resources WHERE id = ?', [req.params.id], (err, rows) => {
    if (err || !rows.length) {
      return res.status(404).json({ success: false, error: 'Resource not found' });
    }

    const filePath = path.join(__dirname, rows[0].file_path);
    res.download(filePath);
  });
});

// ── PAYMENTS OVERVIEW ─────────────────────────────────────────────────────────
router.get('/payments', isAdmin, (req, res) => {
  db.query(`
    SELECT p.*, CONCAT(s.first_name,' ',s.last_name) as student_name, s.admission_number, c.name as course_name
    FROM payments p JOIN students s ON s.id=p.student_id JOIN courses c ON c.id=s.course_id
    WHERE p.status="Completed" ORDER BY p.payment_date DESC LIMIT 200
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true, payments: rows });
  });
});

// ── POSITIONS (For Staff Management) ──────────────────────────────────────────
router.get('/positions', isAdmin, (req, res) => {
  db.query('SELECT * FROM positions ORDER BY name', (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, error: 'Database error' });
    }
    res.json({ success: true, positions: rows });
  });
});

// ── CERTIFICATE & TRANSCRIPT (SuperAdmin only) ────────────────────────────────
router.get('/certificate/:studentId', isSuperAdmin, (req, res) => {
  db.query('SELECT s.*, c.name as course_name, c.duration, c.certification_type, b.batch_code, b.batch_number FROM students s JOIN courses c ON c.id=s.course_id LEFT JOIN batches b ON b.id=s.batch_id WHERE s.id=? AND s.graduation_status="Approved" AND s.graduation_fee_paid=1', [req.params.studentId], (err, rows) => {
    if (err || !rows.length) return res.status(404).json({ error: 'Student not found or graduation not approved or fees not paid' });
    const s = rows[0];
    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${s.admission_number}.pdf"`);
    doc.pipe(res);

    const logoPath = require('path').join(__dirname, 'ksrms_logo.png');
    if (require('fs').existsSync(logoPath)) doc.image(logoPath, 230, 40, { width: 120 });

    doc.moveDown(5);
    doc.fontSize(28).font('Helvetica-Bold').fillColor('#0D1B5E').text('KSRMS Technologies', { align: 'center' });
    doc.fontSize(11).font('Helvetica').fillColor('#444').text('Kano Software Resources & Modern Solution', { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#1A56DB').text('Certificate of Completion', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).font('Helvetica').fillColor('#333').text('This is to certify that', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#0D1B5E').text(`${s.first_name} ${s.last_name}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').fillColor('#333').text(`Admission No: ${s.admission_number} | Batch: ${s.batch_code}`, { align: 'center' });
    doc.moveDown();
    doc.text(`has successfully completed the`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1A56DB').text(s.course_name, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').fillColor('#333').text(`with a final score of ${s.graduation_score}% — ${s.graduation_score >= 70 ? 'Distinction' : s.graduation_score >= 60 ? 'Merit' : 'Pass'}`, { align: 'center' });
    doc.moveDown(2);
    doc.text(`Issued: ${new Date(s.graduation_approved_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });
    doc.moveDown(3);
    doc.moveTo(100, doc.y).lineTo(250, doc.y).stroke('#0D1B5E');
    doc.text('Director, KSRMS Technologies', 100, doc.y + 5, { width: 150, align: 'center' });
    doc.end();
  });
});

router.get('/transcript/:studentId', isSuperAdmin, (req, res) => {
  const sid = req.params.studentId;
  db.query('SELECT s.*, c.name as course_name, c.duration, c.certification_type, b.batch_code FROM students s JOIN courses c ON c.id=s.course_id LEFT JOIN batches b ON b.id=s.batch_id WHERE s.id=? AND s.graduation_fee_paid=1', [sid], (err, rows) => {
    if (err || !rows.length) return res.status(404).json({ error: 'Not found or fees not paid' });
    const s = rows[0];

    db.query(`
      SELECT a.sequence_number, a.title as assignment_title, AVG(asub.ai_score) as avg_score, COUNT(aq.id) as q_count
      FROM assignments a
      JOIN assignment_questions aq ON aq.assignment_id=a.id
      LEFT JOIN assignment_submissions asub ON asub.assignment_id=a.id AND asub.question_id=aq.id AND asub.student_id=? AND asub.is_submitted=1
      WHERE a.course_id=?
      GROUP BY a.id ORDER BY a.sequence_number
    `, [sid, s.course_id], (e2, assignments) => {
      db.query('SELECT fps.*, fp.title FROM final_project_submissions fps JOIN final_projects fp ON fp.id=fps.project_id WHERE fps.student_id=? AND fps.is_submitted=1 LIMIT 1', [sid], (e3, projects) => {
        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="transcript-${s.admission_number}.pdf"`);
        doc.pipe(res);

        const logoPath = require('path').join(__dirname, 'ksrms_logo.png');
        if (require('fs').existsSync(logoPath)) doc.image(logoPath, 50, 30, { width: 70 });

        doc.fontSize(18).font('Helvetica-Bold').fillColor('#0D1B5E').text('KSRMS Technologies', 140, 40);
        doc.fontSize(10).font('Helvetica').fillColor('#555').text('Kano Software Resources & Modern Solution', 140, 62);
        doc.moveDown(3);
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#1A56DB').text('Academic Transcript', { align: 'center' });
        doc.moveDown();
        doc.fontSize(11).font('Helvetica').fillColor('#333');
        doc.text(`Name: ${s.first_name} ${s.last_name}`);
        doc.text(`Admission No: ${s.admission_number} | Batch: ${s.batch_code || 'N/A'}`);
        doc.text(`Course: ${s.course_name} | Duration: ${s.duration}`);
        doc.text(`Date: ${new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}`);
        doc.moveDown();

        doc.fontSize(13).font('Helvetica-Bold').text('Assignments (60% of total)');
        doc.moveDown(0.3);
        assignments.forEach(a => {
          const sc = a.avg_score != null ? parseFloat(a.avg_score).toFixed(1) + '%' : 'Not submitted';
          doc.fontSize(11).font('Helvetica').text(`  Assignment ${a.sequence_number}: ${a.assignment_title} — ${sc}`);
        });

        const assignAvg = assignments.length ? assignments.reduce((sum, a) => sum + (a.avg_score || 0), 0) / assignments.length : 0;
        doc.moveDown(0.3).font('Helvetica-Bold').text(`  Assignment Average: ${assignAvg.toFixed(1)}%`);
        doc.moveDown();

        doc.fontSize(13).font('Helvetica-Bold').text('Final Project (40% of total)');
        const proj = projects[0];
        if (proj) {
          doc.fontSize(11).font('Helvetica').text(`  ${proj.title}`);
          doc.text(`  AI Score: ${proj.ai_score || 0}% | Tutor Score: ${proj.tutor_score ?? 'Pending'}%`);
        } else {
          doc.fontSize(11).font('Helvetica').text('  Not submitted');
        }
        doc.moveDown();

        const projectScore = proj ? (proj.tutor_score ?? proj.ai_score ?? 0) : 0;
        const total = (assignAvg * 0.6) + (projectScore * 0.4);
        const grade = total >= 70 ? 'Distinction' : total >= 60 ? 'Merit' : total >= 50 ? 'Pass' : 'Fail';

        doc.fontSize(14).font('Helvetica-Bold').fillColor('#0D1B5E').text(`Total Score: ${total.toFixed(1)}% — ${grade}`);
        doc.end();
      });
    });
  });
});

// ── GRADUATION LIST FOR ADMIN ─────────────────────────────────────────────────
router.get('/graduation/approved', isAdmin, (req, res) => {
  db.query(`
    SELECT s.*, c.name as course_name, b.batch_code,
           (SELECT SUM(amount) FROM payments WHERE student_id=s.id AND payment_type="Graduation" AND status="Completed") as grad_paid
    FROM students s JOIN courses c ON c.id=s.course_id LEFT JOIN batches b ON b.id=s.batch_id
    WHERE s.graduation_status="Approved"
    ORDER BY s.graduation_approved_at DESC
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true, students: rows });
  });
});

// ── ID CARD GENERATION ────────────────────────────��───────────────────────────
router.get('/id-card/:entityType/:entityId', isAdmin, (req, res) => {
  const { entityType, entityId } = req.params;

  if (entityType === 'student') {
    db.query('SELECT * FROM students WHERE id = ?', [entityId], (err, rows) => {
      if (err || !rows.length) {
        return res.status(404).json({ success: false, error: 'Student not found' });
      }
      generateIdCard(res, rows[0], 'Student');
    });
  } else if (entityType === 'staff') {
    db.query('SELECT * FROM staff WHERE id = ?', [entityId], (err, rows) => {
      if (err || !rows.length) {
        return res.status(404).json({ success: false, error: 'Staff not found' });
      }
      generateIdCard(res, rows[0], 'Staff');
    });
  } else {
    res.status(400).json({ success: false, error: 'Invalid entity type' });
  }
});

function generateIdCard(res, entity, type) {
  const doc = new PDFDocument({
    size: [226, 358],
    margin: 10
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${type}_ID_${entity.id}.pdf"`);
  doc.pipe(res);

  doc.rect(0, 0, 226, 358).fill('#0D1B5E');
  doc.fontSize(14).font('Helvetica-Bold').fillColor('#FFFFFF').text('KSRMS', 10, 20);
  doc.fontSize(8).font('Helvetica').text('Technologies', 10, 35);
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFD700').text(type, 10, 55);
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#FFFFFF').text(`${entity.first_name} ${entity.last_name}`, 10, 80);
  doc.fontSize(8).font('Helvetica').fillColor('#CCCCCC').text(`ID: ${entity.id}`, 10, 105);

  doc.fontSize(7).fillColor('#AAAAAA');
  const details = [
    `Email: ${entity.email}`,
    `Phone: ${entity.phone || 'N/A'}`,
    ...(type === 'Student' ? [`Admission: ${entity.admission_number || 'N/A'}`] : [`Staff ID: ${entity.staff_id || 'N/A'}`])
  ];

  let yPosition = 125;
  details.forEach(detail => {
    doc.text(detail, 10, yPosition);
    yPosition += 15;
  });

  doc.fontSize(6).fillColor('#888888').text(`Issued: ${new Date().toLocaleDateString()}`, 10, 300);
  doc.end();
}

module.exports = router;