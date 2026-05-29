-- ============================================
-- KSRMS Technologies Database Schema
-- FULLY FIXED VERSION
-- MySQL / MariaDB Compatible
-- ============================================

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS progress;
DROP TABLE IF EXISTS final_project_submissions;
DROP TABLE IF EXISTS final_projects;
DROP TABLE IF EXISTS assignment_submissions;
DROP TABLE IF EXISTS assignment_questions;
DROP TABLE IF EXISTS assignments;
DROP TABLE IF EXISTS resources;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS staff_courses;
DROP TABLE IF EXISTS staff_positions;
DROP TABLE IF EXISTS staff;
DROP TABLE IF EXISTS batches;
DROP TABLE IF EXISTS positions;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS programs;
DROP TABLE IF EXISTS admins;

SET FOREIGN_KEY_CHECKS = 1;

SET default_storage_engine=INNODB;

-- ============================================
-- ADMINS
-- ============================================

CREATE TABLE admins (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(150) UNIQUE,
    role ENUM('SuperAdmin','Admin','Deputy Admin','Assistant Admin') DEFAULT 'Admin',
    is_first_login TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;


-- ============================================
-- PROGRAMS
-- ============================================

CREATE TABLE programs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    fee DECIMAL(10,2) DEFAULT 0.00,
    duration VARCHAR(50),
    mode VARCHAR(50) DEFAULT 'Hybrid',
    schedule VARCHAR(100),
    image_path VARCHAR(255),
    roadmap LONGTEXT,
    is_active TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;


-- ============================================
-- COURSES
-- ============================================

CREATE TABLE courses (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200),
    abbreviation VARCHAR(20),
    description TEXT,
    duration VARCHAR(50),
    mode VARCHAR(50) DEFAULT 'Physical',
    schedule VARCHAR(100),
    application_fee DECIMAL(10,2) DEFAULT 0,
    registration_fee DECIMAL(10,2) DEFAULT 0,
    session_times JSON DEFAULT NULL,           -- e.g. ["10:00-12:00","12:00-15:00"]
    certification_type VARCHAR(100) DEFAULT 'Certificate',
    is_active TINYINT(1) DEFAULT 1,
    image_path VARCHAR(255),
    roadmap LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================
-- POSITIONS
-- ============================================

CREATE TABLE positions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO positions (name)
VALUES
('Tutor'),
('Coordinator'),
('Senior Tutor'),
('Overseer');

-- ============================================
-- BATCHES
-- ============================================

CREATE TABLE batches (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    course_id INT UNSIGNED NULL,
    batch_number INT,
    batch_code VARCHAR(50),
    session_label VARCHAR(20),          -- e.g. "2025/2026"
    start_date DATE,
    end_date DATE,
    is_active TINYINT(1) DEFAULT 1,
    application_open TINYINT(1) DEFAULT 1,  -- 1 = accepting applications, 0 = closed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_batch_course
        FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- STAFF
-- ============================================

CREATE TABLE staff (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    staff_id VARCHAR(50) UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    phone VARCHAR(20),
    is_registered TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================
-- STAFF POSITIONS
-- ============================================

CREATE TABLE staff_positions (
    staff_id INT UNSIGNED,
    position_id INT UNSIGNED,

    PRIMARY KEY (staff_id, position_id),

    CONSTRAINT fk_staff_position_staff
        FOREIGN KEY (staff_id)
        REFERENCES staff(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_staff_position_position
        FOREIGN KEY (position_id)
        REFERENCES positions(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- STAFF COURSES
-- ============================================

CREATE TABLE staff_courses (
    staff_id INT UNSIGNED,
    course_id INT UNSIGNED,

    PRIMARY KEY (staff_id, course_id),

    CONSTRAINT fk_staff_course_staff
        FOREIGN KEY (staff_id)
        REFERENCES staff(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_staff_course_course
        FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- STUDENTS
-- ============================================

CREATE TABLE students (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    admission_number VARCHAR(100) UNIQUE,
    application_number VARCHAR(100) UNIQUE,
    is_first_login TINYINT(1) DEFAULT 1,
    security_question VARCHAR(255),
    security_answer VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(150) UNIQUE,
    password_hash VARCHAR(255),
    phone VARCHAR(20),
    profile_picture VARCHAR(255),

    program_id INT UNSIGNED NULL,
    course_id INT UNSIGNED NULL,
    batch_id INT UNSIGNED NULL,

    status VARCHAR(50) DEFAULT 'Active',

    login_blocked TINYINT(1) DEFAULT 0,
    block_reason TEXT,
  highest_qualification VARCHAR(100) DEFAULT NULL,
  COLUMN previous_experience VARCHAR(10) DEFAULT NULL;
    graduation_status VARCHAR(50) DEFAULT 'Pending',
    graduation_score DECIMAL(5,2) DEFAULT 0.00,

    graduation_approved_by INT UNSIGNED NULL,
    graduation_approved_at DATETIME NULL,

    graduation_fee_paid TINYINT(1) DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_student_program
        FOREIGN KEY (program_id)
        REFERENCES programs(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_student_course
        FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_student_batch
        FOREIGN KEY (batch_id)
        REFERENCES batches(id)
        ON DELETE SET NULL

) ENGINE=InnoDB;

-- ============================================
-- PAYMENTS
-- ============================================

CREATE TABLE payments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    student_id INT UNSIGNED,
    payment_type VARCHAR(100),
    amount DECIMAL(10,2),
    installment_type VARCHAR(20) DEFAULT 'full',
    reference_number VARCHAR(100),
    paystack_reference VARCHAR(100),

    status ENUM('pending','Completed','Failed') DEFAULT 'pending',

    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_payment_student
        FOREIGN KEY (student_id)
        REFERENCES students(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- RESOURCES
-- ============================================

CREATE TABLE resources (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    program_id INT UNSIGNED NULL,
    course_id INT UNSIGNED NULL,

    title VARCHAR(200),
    file_path VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_resource_program
        FOREIGN KEY (program_id)
        REFERENCES programs(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_resource_course
        FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- ASSIGNMENTS
-- ============================================

CREATE TABLE assignments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    program_id INT UNSIGNED NULL,
    course_id INT UNSIGNED NULL,

    sequence_number INT DEFAULT 1,

    title VARCHAR(200),
    description TEXT,
    due_date DATETIME,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_assignment_program
        FOREIGN KEY (program_id)
        REFERENCES programs(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_assignment_course
        FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- ASSIGNMENT QUESTIONS
-- ============================================

CREATE TABLE assignment_questions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    assignment_id INT UNSIGNED,

    question TEXT,
    test_cases LONGTEXT,
    expected_output LONGTEXT,

    CONSTRAINT fk_question_assignment
        FOREIGN KEY (assignment_id)
        REFERENCES assignments(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- ASSIGNMENT SUBMISSIONS
-- ============================================

CREATE TABLE assignment_submissions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    student_id INT UNSIGNED,
    assignment_id INT UNSIGNED,
    question_id INT UNSIGNED,

    submitted_code LONGTEXT,

    ai_score DECIMAL(5,2) DEFAULT 0.00,
    tutor_score DECIMAL(5,2) DEFAULT NULL,

    is_submitted TINYINT(1) DEFAULT 0,

    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_submission_student
        FOREIGN KEY (student_id)
        REFERENCES students(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_submission_assignment
        FOREIGN KEY (assignment_id)
        REFERENCES assignments(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_submission_question
        FOREIGN KEY (question_id)
        REFERENCES assignment_questions(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- FINAL PROJECTS
-- ============================================

CREATE TABLE final_projects (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    program_id INT UNSIGNED,

    title VARCHAR(200),
    description TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_project_program
        FOREIGN KEY (program_id)
        REFERENCES programs(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- FINAL PROJECT SUBMISSIONS
-- ============================================

CREATE TABLE final_project_submissions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    project_id INT UNSIGNED,
    student_id INT UNSIGNED,

    submission_link VARCHAR(255),

    ai_score DECIMAL(5,2),
    tutor_score DECIMAL(5,2),

    is_submitted TINYINT(1) DEFAULT 0,

    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_final_submission_project
        FOREIGN KEY (project_id)
        REFERENCES final_projects(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_final_submission_student
        FOREIGN KEY (student_id)
        REFERENCES students(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- PROGRESS
-- ============================================

CREATE TABLE progress (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    student_id INT UNSIGNED,
    program_id INT UNSIGNED,

    completion_percentage INT DEFAULT 0,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_progress_student
        FOREIGN KEY (student_id)
        REFERENCES students(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_progress_program
        FOREIGN KEY (program_id)
        REFERENCES programs(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- END
-- ============================================