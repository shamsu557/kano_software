const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const PDFDocument = require('pdfkit');
const cors = require('cors');
const mime = require('mime-types');

const db = require('./mysql');
const adminRoutes = require('./admin-routes');

const app = express();

const PORT = process.env.PORT || 3000;

const PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_KEY ||
  'sk_live_b04d777ada9b06c828dc4084969106de9d8044a3';

const PAYSTACK_PUBLIC_KEY =
  process.env.PAYSTACK_PUBLIC_KEY || '';

const ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY || '';

const pendingApplications = {};

/* ──────────────────────────────────────────────────────────────
   MIDDLEWARE
────────────────────────────────────────────────────────────── */

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(cors());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(__dirname));

app.use(
  '/Uploads',
  express.static(path.join(__dirname, 'Uploads'))
);

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'ksrms-secret-2025',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

/* ──────────────────────────────────────────────────────────────
   FILE UPLOAD
────────────────────────────────────────────────────────────── */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {

    const uploadPath = path.join(__dirname, 'Uploads');

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {

    cb(
      null,
      file.fieldname +
      '-' +
      Date.now() +
      path.extname(file.originalname)
    );

  }
});

const upload = multer({
  storage,

  limits: {
    fileSize: 15 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {

    const allowed =
      /pdf|doc|docx|zip|rar|jpeg|jpg|png|gif|webp/i.test(
        path.extname(file.originalname).toLowerCase()
      );

    cb(null, allowed);
  }
});

/* ──────────────────────────────────────────────────────────────
   AUTH MIDDLEWARE
────────────────────────────────────────────────────────────── */

const isAuthenticated = (req, res, next) => {

  if (req.session.studentId) {
    return next();
  }

  res.redirect('/student/login');
};

const isAuthenticatedStaff = (req, res, next) => {

  if (req.session.staffDatabaseId) {
    return next();
  }

  res.redirect('/staff/login');
};

/* ──────────────────────────────────────────────────────────────
   HELPERS
────────────────────────────────────────────────────────────── */

function normalizeProfilePath(p) {

  if (!p) return null;

  const normalized = p.replace(/\\/g, '/');

  return normalized.startsWith('/uploads')
    ? normalized
    : `/uploads/${path.basename(normalized)}`;
}

async function generateAdmissionNumber(abbr, batchNumber) {
  // Format: KSRMS/YY+BatchNum/COURSEABBR/0001
  // e.g. KSRMS/261/FSE/0001  (26=year, 1=batch number)
  const yy = String(new Date().getFullYear()).slice(-2); // last 2 digits of year
  const bNum = batchNumber || 1;
  const prefix = `KSRMS/${yy}${bNum}/${abbr || 'KSR'}`;

  // Count existing admissions with this prefix to generate sequential number
  return new Promise((resolve) => {
    db.query(
      `SELECT COUNT(*) AS cnt FROM students WHERE admission_number LIKE ?`,
      [`${prefix}/%`],
      (err, rows) => {
        const seq = (rows?.[0]?.cnt || 0) + 1;
        const seqStr = String(seq).padStart(4, '0');
        resolve(`${prefix}/${seqStr}`);
      }
    );
  });
}

async function verifyPaystackPayment(reference) {

  try {

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      }
    );

    return response.data.data;

  } catch (e) {

    console.error('Paystack error:', e.message);

    return null;
  }
}

/* ──────────────────────────────────────────────────────────────
   PAGE ROUTES
────────────────────────────────────────────────────────────── */

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/student/apply', (req, res) => {
  res.sendFile(path.join(__dirname, 'student_signup.html'));
});

app.get('/student/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/student/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'student_login.html'));
});

app.get(
  '/student/dashboard',
  isAuthenticated,
  (req, res) => {
    res.sendFile(
      path.join(__dirname, 'student_dashboard.html')
    );
  }
);

app.get('/staff/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'staff_login.html'));
});

app.get('/staff/dashboard', isAuthenticatedStaff, (req, res) => {
  res.sendFile(path.join(__dirname, 'staff_dashboard.html'));
});

app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin_login.html'));
});

app.get('/admin/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin_dashboard.html'));
});

/* ──────────────────────────────────────────────────────────────
   PUBLIC API
────────────────────────────────────────────────────────────── */

/*
  IMPORTANT:
  roadmap is now included here
*/

app.get('/api/courses', (req, res) => {

  const query = `
    SELECT
      c.id,
      c.name,
      c.abbreviation,
      c.description,
      c.duration,
      c.mode,
      c.schedule,
      c.session_times,
      c.application_fee,
      c.registration_fee,
      c.certification_type,
      c.is_active,
      c.image_path,
      c.roadmap,
      b.id           AS current_batch_id,
      b.batch_number AS current_batch_number,
      b.batch_code   AS current_batch_code,
      b.session_label AS current_session_label,
      COALESCE(b.application_open, 0) AS application_open
    FROM courses c
    LEFT JOIN batches b ON b.id = (
      SELECT id FROM batches
      WHERE course_id = c.id AND is_active = 1
      ORDER BY created_at DESC LIMIT 1
    )
    ORDER BY c.is_active DESC, c.name
  `;

  db.query(query, (err, rows) => {

    if (err) {

      console.error(err);

      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    const courses = rows.map(course => ({

      ...course,

      image_path: course.image_path
        ? normalizeProfilePath(course.image_path)
        : null

    }));

    res.json(courses);

  });

});

/* ──────────────────────────────────────────────────────────────
   PUBLIC API - SINGLE COURSE (for pre-filling apply page)
────────────────────────────────────────────────────────────── */

app.get('/api/courses/:id', (req, res) => {
  const { id } = req.params;
  const query = `
    SELECT
      id,
      name,
      abbreviation,
      description,
      duration,
      mode,
      schedule,
      session_times,
      application_fee,
      registration_fee,
      certification_type,
      is_active,
      image_path
    FROM courses
    WHERE id = ?
    LIMIT 1
  `;
  db.query(query, [id], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: 'Database error' });
    if (!rows.length) return res.status(404).json({ success: false, error: 'Course not found' });
    const course = {
      ...rows[0],
      image_path: rows[0].image_path ? normalizeProfilePath(rows[0].image_path) : null
    };
    res.json(course);
  });
});



app.get('/api/batches/active', (req, res) => {

  const query = `
    SELECT
      b.*,
      c.name AS course_name
    FROM batches b
    JOIN courses c
      ON b.course_id = c.id
    WHERE b.is_active = 1
  `;

  db.query(query, (err, rows) => {

    if (err) {

      return res.status(500).json({
        error: 'DB error'
      });

    }

    res.json(rows);

  });

});

/* ──────────────────────────────────────────────────────────────
   STUDENT APPLY
────────────────────────────────────────────────────────────── */

app.post(
  '/api/student/apply',
  upload.single('profilePicture'),
  (req, res) => {

    const {
      firstName,
      lastName,
      email,
      phone,
      gender,
      dateOfBirth,
      address,
      courseId,
      schedule
    } = req.body;

    if (
      !firstName ||
      !lastName ||
      !email ||
      !phone ||
      !gender ||
      !courseId
    ) {

      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });

    }

    if (!req.file) {

      return res.status(400).json({
        success: false,
        error: 'Profile picture is required'
      });

    }

    db.query(
      `SELECT c.id FROM courses c
       LEFT JOIN batches b ON b.id = (
         SELECT id FROM batches WHERE course_id = c.id AND is_active = 1
         ORDER BY created_at DESC LIMIT 1
       )
       WHERE c.id = ? AND c.is_active = 1 AND COALESCE(b.application_open, 0) = 1`,
      [courseId],
      (err, rows) => {

        if (err || rows.length === 0) {

          return res.status(400).json({
            success: false,
            error: 'Applications are currently closed for this course'
          });

        }

        const applicationNumber =
          'APP' + Date.now();

        pendingApplications[applicationNumber] = {

          firstName,
          lastName,
          email,
          phone,
          gender,
          dateOfBirth,
          address,
          courseId,
          schedule,

          profilePicturePath: req.file.path

        };

        res.json({
          success: true,
          applicationNumber
        });

      }
    );

  }
);

/* ──────────────────────────────────────────────────────────────
   PAYMENT VERIFY
────────────────────────────────────────────────────────────── */

app.post('/api/payment/verify', async (req, res) => {

  try {

    const {
      reference,
      paymentType,
      studentId,
      installmentType
    } = req.body;

    const transaction =
      await verifyPaystackPayment(reference);

    if (
      !transaction ||
      transaction.status !== 'success'
    ) {

      return res.status(400).json({
        success: false,
        error: 'Payment verification failed'
      });

    }

    const amount = transaction.amount / 100;

    const paymentReference =
      'PAY-' +
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .substr(2, 5)
        .toUpperCase();

    db.query(
      `
      INSERT INTO payments
      (
        student_id,
        payment_type,
        amount,
        installment_type,
        reference_number,
        paystack_reference,
        status
      )
      VALUES
      (
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        "Completed"
      )
      `,
      [
        studentId,
        paymentType,
        amount,
        installmentType || 'full',
        paymentReference,
        reference
      ],
      (err) => {

        if (err) {

          console.error(err);

          return res.status(500).json({
            success: false,
            error: 'Failed to save payment'
          });

        }

        res.json({
          success: true,
          reference: paymentReference
        });

      }
    );

  } catch (e) {

    console.error(e);

    res.status(500).json({
      success: false,
      error: e.message
    });

  }

});

/* ──────────────────────────────────────────────────────────────
   STUDENT LOGIN
────────────────────────────────────────────────────────────── */

app.post('/api/student/login', async (req, res) => {

  const {
    admissionNumber,
    password
  } = req.body;

  if (!admissionNumber || !password) {

    return res.status(400).json({
      success: false,
      error: 'All fields required'
    });

  }

  const query = `
    SELECT
      s.*,
      c.name AS course_name
    FROM students s
    JOIN courses c
      ON s.course_id = c.id
    WHERE s.admission_number = ?
  `;

  db.query(query, [admissionNumber], async (err, rows) => {

    if (err || !rows.length) {

      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });

    }

    const student = rows[0];

    const match = await bcrypt.compare(
      password,
      student.password_hash || ''
    );

    if (!match) {

      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });

    }

    req.session.studentId = student.id;

    req.session.studentName =
      `${student.first_name} ${student.last_name}`;

    res.json({
      success: true,
      student: {
        id: student.id,
        name: req.session.studentName,
        admission_number: student.admission_number,
        course: student.course_name
      }
    });

  });

});

/* ──────────────────────────────────────────────────────────────
   STUDENT LOGOUT
────────────────────────────────────────────────────────────── */

app.post('/api/student/logout', (req, res) => {

  req.session.destroy();

  res.json({
    success: true
  });

});

/* ──────────────────────────────────────────────────────────────
   RECEIPT DOWNLOAD
────────────────────────────────────────────────────────────── */

app.get(
  '/api/receipt/download',
  isAuthenticated,
  (req, res) => {

    const studentId = req.session.studentId;

    const query = `
      SELECT
        s.*,
        c.name AS course_name,
        b.batch_code
      FROM students s
      JOIN courses c
        ON c.id = s.course_id
      LEFT JOIN batches b
        ON b.id = s.batch_id
      WHERE s.id = ?
    `;

    db.query(query, [studentId], (err, rows) => {

      if (err || !rows.length) {
        return res.status(404).send('Not found');
      }

      const student = rows[0];

      db.query(
        `
        SELECT *
        FROM payments
        WHERE student_id = ?
        AND payment_type = "Registration"
        AND status = "Completed"
        ORDER BY payment_date
        `,
        [studentId],
        (e2, payments) => {

          const doc = new PDFDocument({
            margin: 50
          });

          res.setHeader(
            'Content-Type',
            'application/pdf'
          );

          res.setHeader(
            'Content-Disposition',
            'attachment; filename="receipt.pdf"'
          );

          doc.pipe(res);

          const logoPath =
            path.join(__dirname, 'ksrms_logo.png');

          if (fs.existsSync(logoPath)) {

            doc.image(
              logoPath,
              50,
              30,
              { width: 80 }
            );

          }

          doc
            .fontSize(20)
            .font('Helvetica-Bold')
            .text(
              'KSRMS Technologies',
              150,
              40
            );

          doc
            .fontSize(10)
            .font('Helvetica')
            .text(
              'Kano Software Resources & Modern Solution',
              150,
              65
            );

          doc.moveDown(3);

          doc
            .fontSize(16)
            .font('Helvetica-Bold')
            .text(
              'Payment Receipt',
              {
                align: 'center'
              }
            );

          doc.moveDown();

          doc
            .fontSize(12)
            .font('Helvetica')
            .text(
              `Name: ${student.first_name} ${student.last_name}`
            );

          doc.text(
            `Admission No: ${
              student.admission_number ||
              student.application_number
            }`
          );

          doc.text(
            `Course: ${student.course_name}`
          );

          payments.forEach(payment => {

            doc.text(
              `₦${Number(payment.amount).toLocaleString()} - ${payment.payment_type}`
            );

          });

          const total =
            payments.reduce(
              (sum, p) => sum + parseFloat(p.amount),
              0
            );

          doc.moveDown();

          doc
            .font('Helvetica-Bold')
            .text(
              `Total Paid: ₦${total.toLocaleString()}`
            );

          doc.end();

        }
      );

    });

  }
);
/* ──────────────────────────────────────────────────────────────
   PUBLIC API - PROGRAMS (New)
────────────────────────────────────────────────────────────── */

app.get('/api/programs', (req, res) => {
  db.query('SELECT * FROM programs ORDER BY is_active DESC, name', (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: 'Database error' });
    res.json(rows);
  });
});


/* ──────────────────────────────────────────────────────────────
   TRACK APPLICATION (public — by email or phone)
────────────────────────────────────────────────────────────── */
app.get('/api/track-application', (req, res) => {
  const { search } = req.query;
  if (!search) return res.status(400).json({ success: false, error: 'Email or phone required' });
  db.query(
    `SELECT s.id, s.first_name, s.last_name, s.email, s.phone,
            s.admission_number, s.application_number, s.status,
            s.security_question, s.is_first_login,
            (CASE WHEN s.password_hash IS NOT NULL AND s.password_hash != '' THEN 1 ELSE 0 END) AS hasPassword,
            c.name as course_name, c.application_fee, c.registration_fee, c.schedule, c.mode
     FROM students s
     LEFT JOIN courses c ON c.id = s.course_id
     WHERE s.email = ? OR s.phone = ?
     LIMIT 1`,
    [search.trim(), search.trim()],
    (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: 'Database error' });
      if (!rows.length) return res.status(404).json({ success: false, error: 'No application found with that email or phone number' });
      const s = rows[0];
      // Fetch payment history
      db.query(
        `SELECT payment_type, amount, status, installment_type, payment_date, reference_number FROM payments WHERE student_id=? ORDER BY payment_date ASC`,
        [s.id],
        (e2, payments) => {
          if (e2) return res.status(500).json({ success: false, error: 'Database error' });
          const completed = payments.filter(p => p.status === 'Completed');
          const regPayments = completed.filter(p => p.payment_type === 'Registration Fee');
          const totalRegPaid = regPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
          const hasApp = !!s.application_number;
          const hasAdm = !!s.admission_number;
          res.json({ success: true, student: { ...s, hasApp, hasAdm, totalRegPaid }, payments: completed });
        }
      );
    }
  );
});

/* ──────────────────────────────────────────────────────────────
   PAY APPLICATION FEE — verify & save student record
────────────────────────────────────────────────────────────── */
app.post('/api/payment/verify-application', async (req, res) => {
  try {
    const { reference, applicationNumber } = req.body;
    const appData = pendingApplications[applicationNumber];
    if (!appData) return res.status(400).json({ success: false, error: 'Application session expired or not found' });

    const transaction = await verifyPaystackPayment(reference);
    if (!transaction || transaction.status !== 'success') {
      return res.status(400).json({ success: false, error: 'Payment verification failed' });
    }

    const amount = transaction.amount / 100;

    // Check duplicate email
    db.query('SELECT id, application_number FROM students WHERE email=?', [appData.email], (err, existing) => {
      if (err) return res.status(500).json({ success: false, error: 'Database error' });
      if (existing.length) {
        return res.json({ success: true, applicationNumber: existing[0].application_number, message: 'Already applied' });
      }

      // Insert student with application_number, status=Applied
      const appNum = applicationNumber;
      db.query(
        `INSERT INTO students (application_number, first_name, last_name, email, phone, profile_picture, course_id, status)
         VALUES (?,?,?,?,?,?,?,'Applied')`,
        [appNum, appData.firstName, appData.lastName, appData.email, appData.phone, appData.profilePicturePath, appData.courseId],
        (e2, result) => {
          if (e2) return res.status(500).json({ success: false, error: 'Failed to save application' });
          const studentId = result.insertId;
          // Save payment
          db.query(
            `INSERT INTO payments (student_id, payment_type, amount, status, reference_number, paystack_reference) VALUES (?,'Application Fee',?,'Completed',?,?)`,
            [studentId, amount, 'PAY-'+Date.now(), reference],
            (e3) => {
              if (e3) console.error('Payment insert error:', e3);
              delete pendingApplications[applicationNumber];
              res.json({ success: true, applicationNumber: appNum, studentId, name: appData.firstName + ' ' + appData.lastName });
            }
          );
        }
      );
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ──────────────────────────────────────────────────────────────
   DOWNLOAD APPLICATION FORM PDF (after application fee paid)
────────────────────────────────────────────────────────────── */
app.get('/api/download/application-form/:appNumber', (req, res) => {
  const { appNumber } = req.params;
  db.query(
    `SELECT s.*, c.name as course_name, c.application_fee, c.registration_fee, c.schedule, c.mode
     FROM students s LEFT JOIN courses c ON c.id=s.course_id
     WHERE s.application_number=?`,
    [appNumber],
    (err, rows) => {
      if (err || !rows.length) return res.status(404).json({ error: 'Application not found' });
      const s = rows[0];
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="application-form-${appNumber}.pdf"`);
      doc.pipe(res);

      // ── Centered header: logo + org name + contact
      const logoPath = path.join(__dirname, 'ksrms_logo.png');
      const pageWidth = 595.28; // A4 width in points
      const margin = 50;
      let yPos = 30;
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, (pageWidth - 60) / 2, yPos, { width: 60 });
        yPos += 68;
      }
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#0D1B5E')
         .text('KSRMS Technologies', margin, yPos, { align: 'center', width: pageWidth - margin * 2 });
      yPos += 20;
      doc.fontSize(9).font('Helvetica').fillColor('#555')
         .text('Kano Software Resources & Modern Solution', margin, yPos, { align: 'center', width: pageWidth - margin * 2 });
      yPos += 14;
      doc.fontSize(8).fillColor('#777')
         .text('ICT Unit, Tech. Incubation Center, Farm Centre Rd, Tarauni, Kano  |  ksrmstechnologies@gmail.com  |  08030909793 / 07035639129', margin, yPos, { align: 'center', width: pageWidth - margin * 2 });
      doc.moveDown(1.5);

      // Divider line
      doc.moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).strokeColor('#0D1B5E').lineWidth(1).stroke();
      doc.moveDown(1);

      doc.fontSize(15).font('Helvetica-Bold').fillColor('#0D1B5E').text('APPLICATION FORM', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').fillColor('#333').text(`Application Number: ${s.application_number}`, { align: 'center' });
      doc.moveDown(1.5);

      const fields = [
        ['Full Name', `${s.first_name} ${s.last_name}`],
        ['Email', s.email],
        ['Phone', s.phone || 'N/A'],
        ['Course Applied', s.course_name],
        ['Mode', s.mode || 'N/A'],
        ['Schedule', s.schedule || 'N/A'],
        ['Application Fee', `\u20a6${Number(s.application_fee || 0).toLocaleString()}`],
        ['Registration Fee', `\u20a6${Number(s.registration_fee || 0).toLocaleString()}`],
        ['Date Applied', new Date(s.created_at).toLocaleDateString('en-GB', { year:'numeric', month:'long', day:'numeric' })],
        ['Status', 'Application Fee Paid — Pending Registration'],
      ];
      fields.forEach(([label, val]) => {
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text(label + ': ', { continued: true });
        doc.font('Helvetica').fillColor('#555').text(val);
        doc.moveDown(0.4);
      });

      doc.moveDown(2);
      doc.fontSize(9).fillColor('#888').text('Note: Keep this form and your application number safe. You will need your Application Number to complete registration.', { align: 'center' });

      // ── Centered signature block at bottom
      doc.moveDown(3);
      const sigPath = path.join(__dirname, 'csignature.png');
      const sigBlockX = (pageWidth - 120) / 2;
      if (fs.existsSync(sigPath)) {
        doc.image(sigPath, sigBlockX, doc.y, { width: 120 });
        doc.moveDown(1);
      }
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text('Shamsu Sabo', { align: 'center' });
      doc.font('Helvetica').fontSize(9).fillColor('#555').text('Coordinator, KSRMS Technologies', { align: 'center' });
      doc.end();
    }
  );
});

/* ──────────────────────────────────────────────────────────────
   DOWNLOAD ADMISSION LETTER (after registration fee paid)
────────────────────────────────────────────────────────────── */
app.get('/api/download/admission-letter', (req, res) => {
  const admissionNumber = req.query.num || req.query.admissionNumber || req.query.admissionNum;
  if (!admissionNumber) return res.status(400).json({ error: 'Admission number required' });
  db.query(
    `SELECT s.*, c.name as course_name, c.schedule, c.mode, c.duration, b.batch_code, b.session_label, b.batch_number
     FROM students s
     LEFT JOIN courses c ON c.id=s.course_id
     LEFT JOIN batches b ON b.id=s.batch_id
     WHERE s.admission_number=?`,
    [admissionNumber],
    (err, rows) => {
      if (err || !rows.length) return res.status(404).json({ error: 'Admission record not found' });
      const s = rows[0];

      // ── Payment check: at least one completed Registration Fee payment required
      db.query(
        `SELECT COUNT(*) AS cnt FROM payments WHERE student_id=? AND payment_type='Registration Fee' AND status='Completed'`,
        [s.id],
        (epay, payRows) => {
          if (epay || !payRows?.[0]?.cnt) {
            return res.status(403).json({ error: 'Admission letter is only available after at least one registration fee payment has been made.' });
          }

          const doc = new PDFDocument({ margin: 50, size: 'A4' });
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="admission-letter-${admissionNumber}.pdf"`);
          doc.pipe(res);

          const pageWidth = 595.28;
          const margin = 50;

          // ── Centered header: logo + org name + contact
          const logoPath = path.join(__dirname, 'ksrms_logo.png');
          let yPos = 30;
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, (pageWidth - 60) / 2, yPos, { width: 60 });
            yPos += 68;
          }
          doc.fontSize(16).font('Helvetica-Bold').fillColor('#0D1B5E')
             .text('KSRMS Technologies', margin, yPos, { align: 'center', width: pageWidth - margin * 2 });
          yPos += 20;
          doc.fontSize(9).font('Helvetica').fillColor('#555')
             .text('Kano Software Resources & Modern Solution', margin, yPos, { align: 'center', width: pageWidth - margin * 2 });
          yPos += 14;
          doc.fontSize(8).fillColor('#777')
             .text('ICT Unit, Tech. Incubation Center, Farm Centre Rd, Tarauni, Kano  |  ksrmstechnologies@gmail.com  |  08030909793 / 07035639129', margin, yPos, { align: 'center', width: pageWidth - margin * 2 });
          doc.moveDown(1.5);

          // Divider line
          doc.moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).strokeColor('#0D1B5E').lineWidth(1).stroke();
          doc.moveDown(1);

          doc.fontSize(15).font('Helvetica-Bold').fillColor('#0D1B5E').text('ADMISSION LETTER', { align: 'center' });
          doc.moveDown(0.5);
          doc.fontSize(10).font('Helvetica').fillColor('#888').text(new Date().toLocaleDateString('en-GB', { year:'numeric', month:'long', day:'numeric' }), { align: 'center' });
          doc.moveDown(1.5);
          doc.fontSize(11).font('Helvetica').fillColor('#333').text(`Dear ${s.first_name} ${s.last_name},`);
          doc.moveDown(0.8);
          doc.text(`We are pleased to inform you that your application to KSRMS Technologies has been accepted. You have been admitted into the ${s.course_name} programme. Please find your admission details below:`);
          doc.moveDown(1);

          const admFields = [
            ['Admission Number', s.admission_number],
            ['Full Name', `${s.first_name} ${s.last_name}`],
            ['Course', s.course_name],
            ['Batch', s.batch_code || 'N/A'],
            ['Session', s.session_label || 'N/A'],
            ['Mode', s.mode || 'N/A'],
            ['Schedule', s.schedule || 'N/A'],
            ['Duration', s.duration || 'N/A'],
            ['Student Portal Login', 'Use your Admission Number as username and password for first login'],
          ];
          admFields.forEach(([label, val]) => {
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#0D1B5E').text(label + ': ', { continued: true });
            doc.font('Helvetica').fillColor('#333').text(val);
            doc.moveDown(0.5);
          });

          doc.moveDown(1.5);
          doc.fontSize(10).font('Helvetica').fillColor('#333').text('You are required to report to your first class session on time. Welcome to KSRMS Technologies!');

          // ── Centered signature block at bottom
          doc.moveDown(3);
          const sigPath = path.join(__dirname, 'csignature.png');
          const sigBlockX = (pageWidth - 120) / 2;
          if (fs.existsSync(sigPath)) {
            doc.image(sigPath, sigBlockX, doc.y, { width: 120 });
            doc.moveDown(1);
          }
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text('Shamsu Sabo', { align: 'center' });
          doc.font('Helvetica').fontSize(9).fillColor('#555').text('Coordinator, KSRMS Technologies', { align: 'center' });
          doc.end();
        }
      );
    }
  );
});

/* ──────────────────────────────────────────────────────────────
   PAY REGISTRATION FEE (installment or full)
────────────────────────────────────────────────────────────── */
app.post('/api/payment/verify-registration', async (req, res) => {
  try {
    const { reference, applicationNumber, installmentType } = req.body;
    // installmentType: 'full' | 'first' | 'second'

    const transaction = await verifyPaystackPayment(reference);
    if (!transaction || transaction.status !== 'success') {
      return res.status(400).json({ success: false, error: 'Payment verification failed' });
    }
    const amount = transaction.amount / 100;

    db.query(
      `SELECT s.*, c.name as course_name, c.abbreviation, c.registration_fee
       FROM students s LEFT JOIN courses c ON c.id=s.course_id
       WHERE s.application_number=? OR s.admission_number=?`,
      [applicationNumber, applicationNumber],
      (err, rows) => {
        if (err || !rows.length) return res.status(404).json({ success: false, error: 'Student not found' });
        const student = rows[0];
        const studentId = student.id;

        // Get active batch for this course
        db.query('SELECT * FROM batches WHERE course_id=? AND is_active=1 ORDER BY created_at DESC LIMIT 1', [student.course_id], (e2, batches) => {
          const batch = batches?.[0];
          const batchId = batch?.id || null;

          // Generate admission number if not already assigned
          let admissionNumberExisting = student.admission_number;
          const needsAdmission = !admissionNumberExisting;

          const savePaymentAndRespond = (admNum) => {
            const savePayment = () => {
              const payRef = 'PAY-' + Date.now() + '-' + Math.random().toString(36).substr(2,5).toUpperCase();
              db.query(
                `INSERT INTO payments (student_id, payment_type, amount, status, installment_type, reference_number, paystack_reference) VALUES (?,'Registration Fee',?,'Completed',?,?,?)`,
                [studentId, amount, installmentType || 'full', payRef, reference],
                (e5) => {
                  if (e5) console.error('Payment insert error:', e5);
                  res.json({ success: true, admissionNumber: admNum, studentId, installmentType });
                }
              );
            };

            if (needsAdmission) {
              bcrypt.hash(admNum, 10, (e3, hash) => {
                if (e3) return res.status(500).json({ success: false, error: 'Server error' });
                db.query(
                  'UPDATE students SET admission_number=?, password_hash=?, batch_id=?, status=? WHERE id=?',
                  [admNum, hash, batchId, 'Active', studentId],
                  (e4) => {
                    if (e4) return res.status(500).json({ success: false, error: 'Failed to update student' });
                    savePayment();
                  }
                );
              });
            } else {
              db.query('UPDATE students SET status=? WHERE id=?', ['Active', studentId], (e4) => {
                if (e4) return res.status(500).json({ success: false, error: 'Failed to update student' });
                savePayment();
              });
            }
          };

          if (needsAdmission) {
            // Format: KSRMS/YY+BatchNum/COURSEABBR/0001
            const yy = String(new Date().getFullYear()).slice(-2);
            const bNum = batch?.batch_number || 1;
            const abbr = student.abbreviation || 'KSR';
            const prefix = `KSRMS/${yy}${bNum}/${abbr}`;
            db.query(
              'SELECT COUNT(*) AS cnt FROM students WHERE admission_number LIKE ?',
              [`${prefix}/%`],
              (eCnt, cntRows) => {
                const seq = (cntRows?.[0]?.cnt || 0) + 1;
                const seqStr = String(seq).padStart(4, '0');
                savePaymentAndRespond(`${prefix}/${seqStr}`);
              }
            );
          } else {
            savePaymentAndRespond(admissionNumberExisting);
          }
        });
      }
    );
  } catch(e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ──────────────────────────────────────────────────────────────
   SECURITY QUESTION SETUP (after first login password change)
────────────────────────────────────────────────────────────── */
app.post('/api/student/setup-security', async (req, res) => {
  // Works both during registration (studentId in body) and from portal (session)
  const { studentId, newPassword, password, securityQuestion, securityAnswer } = req.body;
  const pwd = newPassword || password;
  const sid = studentId || req.session?.studentId;
  if (!sid || !pwd || !securityQuestion || !securityAnswer) {
    return res.status(400).json({ success: false, error: 'All fields are required' });
  }
  try {
    const hash = await bcrypt.hash(pwd, 10);
    const normAnswer = securityAnswer.trim().toUpperCase();
    db.query(
      'UPDATE students SET password_hash=?, security_question=?, security_answer=?, is_first_login=0 WHERE id=?',
      [hash, securityQuestion, normAnswer, sid],
      (err) => {
        if (err) return res.status(500).json({ success: false, error: 'Failed to save security details' });
        res.json({ success: true });
      }
    );
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ──────────────────────────────────────────────────────────────
   FORGOT PASSWORD — get security question
────────────────────────────────────────────────────────────── */
app.get('/api/student/forgot-password/question', (req, res) => {
  const { admissionNumber } = req.query;
  if (!admissionNumber) return res.status(400).json({ success: false, error: 'Admission number required' });
  db.query('SELECT security_question FROM students WHERE admission_number=?', [admissionNumber], (err, rows) => {
    if (err || !rows.length || !rows[0].security_question) {
      return res.status(404).json({ success: false, error: 'No security question set for this account' });
    }
    res.json({ success: true, question: rows[0].security_question });
  });
});

/* ──────────────────────────────────────────────────────────────
   FORGOT PASSWORD — verify answer and reset
────────────────────────────────────────────────────────────── */
app.post('/api/student/forgot-password/reset', async (req, res) => {
  const { admissionNumber, securityAnswer, newPassword } = req.body;
  if (!admissionNumber || !securityAnswer || !newPassword) {
    return res.status(400).json({ success: false, error: 'All fields required' });
  }
  db.query('SELECT id, security_answer FROM students WHERE admission_number=?', [admissionNumber], async (err, rows) => {
    if (err || !rows.length) return res.status(404).json({ success: false, error: 'Account not found' });
    const stored = rows[0].security_answer;
    const provided = securityAnswer.trim().toUpperCase();
    if (stored !== provided) return res.status(401).json({ success: false, error: 'Incorrect answer' });
    const hash = await bcrypt.hash(newPassword, 10);
    db.query('UPDATE students SET password_hash=? WHERE id=?', [hash, rows[0].id], (e2) => {
      if (e2) return res.status(500).json({ success: false, error: 'Failed to reset password' });
      res.json({ success: true });
    });
  });
});

/* ──────────────────────────────────────────────────────────────
   PAYSTACK PUBLIC KEY (for frontend)
────────────────────────────────────────────────────────────── */
app.get('/api/config/paystack-key', (req, res) => {
  res.json({ key: PAYSTACK_PUBLIC_KEY });
});


/* ──────────────────────────────────────────────────────────────
   VERIFY APPLICATION / ADMISSION NUMBER (for register.html)
────────────────────────────────────────────────────────────── */
app.get('/api/student/verify-application/:number', (req, res) => {
  const { number } = req.params;
  const decoded = decodeURIComponent(number).trim();

  db.query(
    `SELECT s.id, s.first_name, s.last_name, s.email, s.phone,
            s.application_number, s.admission_number, s.status,
            s.security_question, s.is_first_login,
            (CASE WHEN s.password_hash IS NOT NULL AND s.password_hash != '' THEN 1 ELSE 0 END) AS hasPassword,
            c.name as course_name, c.application_fee, c.registration_fee,
            c.schedule, c.mode, c.duration, c.certification_type
     FROM students s
     LEFT JOIN courses c ON c.id = s.course_id
     WHERE s.application_number = ? OR s.admission_number = ?
     LIMIT 1`,
    [decoded, decoded],
    (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: 'Database error' });
      if (!rows.length) return res.status(404).json({ success: false, error: 'No record found with that number. Please check and try again.' });

      const s = rows[0];
      db.query(
        `SELECT payment_type, amount, status, installment_type, payment_date, reference_number
         FROM payments WHERE student_id = ? ORDER BY payment_date ASC`,
        [s.id],
        (e2, payments) => {
          if (e2) return res.status(500).json({ success: false, error: 'Database error' });
          const completed = payments.filter(p => p.status === 'Completed');
          const regPayments = completed.filter(p => p.payment_type === 'Registration Fee');
          const totalRegPaid = regPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
          const lastReg = regPayments[regPayments.length - 1];
          res.json({
            success: true,
            student: {
              ...s,
              totalPaid: totalRegPaid,
              installmentNumber: regPayments.length,
              installmentType: lastReg?.installment_type || null,
            },
            payments: completed,
          });
        }
      );
    }
  );
});

/* ──────────────────────────────────────────────────────────────
   COMPLETE REGISTRATION (upload qualification doc)
────────────────────────────────────────────────────────────── */
app.post('/api/student/complete-registration', express.json(), (req, res) => {
    const { studentId, highestQualification, previousExperience } = req.body;
    if (!studentId) return res.status(400).json({ success: false, error: 'Student ID required' });

    db.query('SELECT id, admission_number FROM students WHERE id=?', [studentId], (err, rows) => {
      if (err || !rows.length) return res.status(404).json({ success: false, error: 'Student not found' });
      const student = rows[0];
      db.query(
        'UPDATE students SET status=\'Active\', highest_qualification=?, previous_experience=? WHERE id=?',
        [highestQualification || null, previousExperience || null, studentId],
        (e2) => {
          if (e2) return res.status(500).json({ success: false, error: 'Failed to complete registration' });
          res.json({ success: true, admissionNumber: student.admission_number });
        }
      );
    });
  }
);

/* ──────────────────────────────────────────────────────────────
   ADMISSION LETTER DOWNLOAD — alias route used by registration.js
────────────────────────────────────────────────────────────── */
app.get('/api/admission-letter/download', (req, res) => {
  const admNum = req.query.admissionNum || req.query.admissionNumber;
  if (!admNum) return res.status(400).json({ error: 'Admission number required' });
  res.redirect(`/api/download/admission-letter?num=${encodeURIComponent(admNum)}`);
});

/* ──────────────────────────────────────────────────────────────
   REGISTRATION RECEIPT DOWNLOAD (public — by admission number)
────────────────────────────────────────────────────────────── */
app.get('/api/receipt/download/public', (req, res) => {
  const admNum = req.query.admissionNum || req.query.admissionNumber;
  if (!admNum) return res.status(400).json({ error: 'Admission number required' });

  db.query(
    `SELECT s.*, c.name as course_name FROM students s
     LEFT JOIN courses c ON c.id=s.course_id WHERE s.admission_number=?`,
    [admNum],
    (err, rows) => {
      if (err || !rows.length) return res.status(404).json({ error: 'Student not found' });
      const student = rows[0];
      db.query(
        `SELECT * FROM payments WHERE student_id=? AND status='Completed' AND payment_type='Registration Fee' ORDER BY payment_date ASC`,
        [student.id],
        (e2, payments) => {
          if (e2 || !payments.length) return res.status(404).json({ error: 'No completed registration payments found' });

          const doc = new PDFDocument({ margin: 50, size: 'A4' });
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="receipt-${admNum}.pdf"`);
          doc.pipe(res);

          const pageWidth = 595.28;
          const margin = 50;

          // ── Centered header: logo + org name + contact
          const logoPath = path.join(__dirname, 'ksrms_logo.png');
          let yPos = 30;
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, (pageWidth - 60) / 2, yPos, { width: 60 });
            yPos += 68;
          }
          doc.fontSize(16).font('Helvetica-Bold').fillColor('#0D1B5E')
             .text('KSRMS Technologies', margin, yPos, { align: 'center', width: pageWidth - margin * 2 });
          yPos += 20;
          doc.fontSize(9).font('Helvetica').fillColor('#555')
             .text('Kano Software Resources & Modern Solution', margin, yPos, { align: 'center', width: pageWidth - margin * 2 });
          yPos += 14;
          doc.fontSize(8).fillColor('#777')
             .text('ICT Unit, Tech. Incubation Center, Farm Centre Rd, Tarauni, Kano  |  ksrmstechnologies@gmail.com  |  08030909793 / 07035639129', margin, yPos, { align: 'center', width: pageWidth - margin * 2 });
          doc.moveDown(1.5);

          // Divider line
          doc.moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).strokeColor('#0D1B5E').lineWidth(1).stroke();
          doc.moveDown(1);

          doc.fontSize(14).font('Helvetica-Bold').fillColor('#0D1B5E').text('PAYMENT RECEIPT', { align: 'center' });
          doc.moveDown(1);

          const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
          [
            ['Student Name', student.first_name + ' ' + student.last_name],
            ['Admission Number', student.admission_number],
            ['Email', student.email],
            ['Course', student.course_name],
            ['Total Paid', '\u20a6' + totalPaid.toLocaleString()],
            ['Date Issued', new Date().toLocaleDateString('en-GB', { year:'numeric', month:'long', day:'numeric' })],
          ].forEach(([k, v]) => {
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text(k + ': ', { continued: true });
            doc.font('Helvetica').fillColor('#555').text(v);
            doc.moveDown(0.5);
          });

          doc.moveDown(1);
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text('Payment Breakdown:', { underline: true });
          doc.moveDown(0.5);
          payments.forEach(p => {
            const label = p.installment_type && p.installment_type !== 'full'
              ? `${p.payment_type} (${p.installment_type} installment)`
              : p.payment_type;
            doc.font('Helvetica').fontSize(10).fillColor('#555')
               .text(`\u2022 ${label}: \u20a6${Number(p.amount).toLocaleString()} — ${new Date(p.payment_date).toLocaleDateString('en-GB')}`);
          });

          // ── Centered signature block at bottom
          doc.moveDown(3);
          const sigPath = path.join(__dirname, 'csignature.png');
          const sigBlockX = (pageWidth - 120) / 2;
          if (fs.existsSync(sigPath)) {
            doc.image(sigPath, sigBlockX, doc.y, { width: 120 });
            doc.moveDown(1);
          }
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text('Shamsu Sabo', { align: 'center' });
          doc.font('Helvetica').fontSize(9).fillColor('#555').text('Coordinator, KSRMS Technologies', { align: 'center' });
          doc.end();
        }
      );
    }
  );
});

/* ──────────────────────────────────────────────────────────────
   ADMIN ROUTES
────────────────────────────────────────────────────────────── */

app.use('/api/admin', adminRoutes);

/* ──────────────────────────────────────────────────────────────
   START SERVER
────────────────────────────────────────────────────────────── */

app.listen(PORT, () => {

  console.log(
    `KSRMS server running on http://localhost:${PORT}`
  );

});