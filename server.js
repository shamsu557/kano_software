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

function generateAdmissionNumber(abbr, batchCode) {

  const seq =
    Math.floor(Math.random() * 900) + 100;

  return `${abbr}/${batchCode}/${seq}`;
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