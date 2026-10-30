-- LibraCore initial schema
-- Engine: InnoDB | Charset: utf8mb4 | Money: DECIMAL | Timestamps: UTC DATETIME

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  module VARCHAR(50) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_permissions_module (module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS branches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  address VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(150) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NULL,
  role_id INT NOT NULL,
  branch_id INT NULL,
  status ENUM('active','inactive','suspended','pending') NOT NULL DEFAULT 'pending',
  email_verified_at DATETIME NULL,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  last_login_at DATETIME NULL,
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_users_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_users_status (status),
  INDEX idx_users_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  replaced_by INT NULL,
  user_agent VARCHAR(255) NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_rt_user (user_id),
  INDEX idx_rt_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_prt_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_evt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS membership_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  borrow_limit INT NOT NULL DEFAULT 3,
  loan_period_days INT NOT NULL DEFAULT 14,
  renewal_limit INT NOT NULL DEFAULT 1,
  daily_fine DECIMAL(10,2) NOT NULL DEFAULT 5.00,
  max_fine DECIMAL(10,2) NOT NULL DEFAULT 250.00,
  grace_days INT NOT NULL DEFAULT 1,
  reservation_limit INT NOT NULL DEFAULT 3,
  membership_months INT NOT NULL DEFAULT 12,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS member_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  member_code VARCHAR(30) NOT NULL UNIQUE,
  student_id VARCHAR(40) NULL,
  department VARCHAR(120) NULL,
  program VARCHAR(120) NULL,
  academic_year VARCHAR(20) NULL,
  guardian_name VARCHAR(150) NULL,
  guardian_phone VARCHAR(30) NULL,
  address VARCHAR(255) NULL,
  profile_image_path VARCHAR(255) NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_mp_student_id (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS memberships (
  id INT AUTO_INCREMENT PRIMARY KEY,
  member_profile_id INT NOT NULL,
  membership_type_id INT NOT NULL,
  branch_id INT NOT NULL,
  starts_at DATE NOT NULL,
  expires_at DATE NOT NULL,
  status ENUM('active','expired','suspended','cancelled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ms_profile FOREIGN KEY (member_profile_id) REFERENCES member_profiles(id),
  CONSTRAINT fk_ms_type FOREIGN KEY (membership_type_id) REFERENCES membership_types(id),
  CONSTRAINT fk_ms_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  INDEX idx_ms_status_expires (status, expires_at),
  INDEX idx_ms_profile (member_profile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS publishers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  city VARCHAR(100) NULL,
  country VARCHAR(80) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_publishers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS authors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(180) NOT NULL,
  bio TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_authors_name (full_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  parent_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cat_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shelves (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  floor_label VARCHAR(40) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_shelf_branch_code (branch_id, code),
  CONSTRAINT fk_shelf_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS books (
  id INT AUTO_INCREMENT PRIMARY KEY,
  book_code VARCHAR(30) NOT NULL UNIQUE,
  isbn10 CHAR(10) NULL,
  isbn13 CHAR(13) NULL,
  title VARCHAR(255) NOT NULL,
  subtitle VARCHAR(255) NULL,
  description TEXT NULL,
  language VARCHAR(40) NOT NULL DEFAULT 'English',
  edition VARCHAR(40) NULL,
  publication_year SMALLINT NULL,
  publisher_id INT NULL,
  classification_code VARCHAR(40) NULL,
  keywords VARCHAR(255) NULL,
  cover_image_path VARCHAR(255) NULL,
  status ENUM('active','archived','withdrawn') NOT NULL DEFAULT 'active',
  reviews_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_books_isbn13 (isbn13),
  UNIQUE KEY uq_books_isbn10 (isbn10),
  CONSTRAINT fk_books_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE SET NULL,
  FULLTEXT KEY ft_books_search (title, subtitle, keywords, description),
  INDEX idx_books_status (status),
  INDEX idx_books_year (publication_year),
  INDEX idx_books_class (classification_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_authors (
  book_id INT NOT NULL,
  author_id INT NOT NULL,
  author_order TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (book_id, author_id),
  CONSTRAINT fk_ba_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  CONSTRAINT fk_ba_author FOREIGN KEY (author_id) REFERENCES authors(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_categories (
  book_id INT NOT NULL,
  category_id INT NOT NULL,
  PRIMARY KEY (book_id, category_id),
  CONSTRAINT fk_bc_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  CONSTRAINT fk_bc_cat FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_copies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  copy_code VARCHAR(30) NOT NULL UNIQUE,
  barcode VARCHAR(40) NOT NULL UNIQUE,
  book_id INT NOT NULL,
  branch_id INT NOT NULL,
  shelf_id INT NULL,
  acquisition_date DATE NULL,
  acquisition_source VARCHAR(120) NULL,
  purchase_cost DECIMAL(12,2) NULL,
  condition_code ENUM('new','good','fair','damaged') NOT NULL DEFAULT 'good',
  availability_status ENUM('available','issued','reserved','lost','withdrawn','missing','in_repair') NOT NULL DEFAULT 'available',
  notes TEXT NULL,
  withdrawn_at DATETIME NULL,
  withdrawn_reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_copy_book FOREIGN KEY (book_id) REFERENCES books(id),
  CONSTRAINT fk_copy_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_copy_shelf FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE SET NULL,
  INDEX idx_copy_book_status (book_id, availability_status),
  INDEX idx_copy_branch_status (branch_id, availability_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loan_policies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  branch_id INT NULL,
  membership_type_id INT NULL,
  loan_period_days INT NOT NULL DEFAULT 14,
  renewal_limit INT NOT NULL DEFAULT 1,
  skip_closed_days TINYINT(1) NOT NULL DEFAULT 1,
  block_if_overdue TINYINT(1) NOT NULL DEFAULT 1,
  block_if_unpaid_fine TINYINT(1) NOT NULL DEFAULT 1,
  unpaid_fine_threshold DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  allow_reserve_available TINYINT(1) NOT NULL DEFAULT 0,
  pickup_hours INT NOT NULL DEFAULT 48,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_lp_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_lp_mtype FOREIGN KEY (membership_type_id) REFERENCES membership_types(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS holidays (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NULL,
  holiday_date DATE NOT NULL,
  name VARCHAR(120) NOT NULL,
  UNIQUE KEY uq_holiday (branch_id, holiday_date),
  CONSTRAINT fk_hol_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operating_hours (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  weekday TINYINT NOT NULL,
  opens_at TIME NULL,
  closes_at TIME NULL,
  is_closed TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_hours (branch_id, weekday),
  CONSTRAINT fk_oh_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  loan_code VARCHAR(30) NOT NULL UNIQUE,
  copy_id INT NOT NULL,
  member_profile_id INT NOT NULL,
  membership_id INT NOT NULL,
  issued_by INT NOT NULL,
  branch_id INT NOT NULL,
  issued_at DATETIME NOT NULL,
  due_at DATETIME NOT NULL,
  returned_at DATETIME NULL,
  returned_by INT NULL,
  status ENUM('active','returned','lost','overdue') NOT NULL DEFAULT 'active',
  renewal_count INT NOT NULL DEFAULT 0,
  notes VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_loan_copy FOREIGN KEY (copy_id) REFERENCES book_copies(id),
  CONSTRAINT fk_loan_member FOREIGN KEY (member_profile_id) REFERENCES member_profiles(id),
  CONSTRAINT fk_loan_membership FOREIGN KEY (membership_id) REFERENCES memberships(id),
  CONSTRAINT fk_loan_issued_by FOREIGN KEY (issued_by) REFERENCES users(id),
  CONSTRAINT fk_loan_returned_by FOREIGN KEY (returned_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_loan_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  INDEX idx_loans_member_status (member_profile_id, status),
  INDEX idx_loans_copy_status (copy_id, status),
  INDEX idx_loans_due (status, due_at),
  INDEX idx_loans_issued (issued_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loan_renewals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  loan_id INT NOT NULL,
  previous_due_at DATETIME NOT NULL,
  new_due_at DATETIME NOT NULL,
  renewed_by INT NOT NULL,
  renewed_at DATETIME NOT NULL,
  CONSTRAINT fk_lr_loan FOREIGN KEY (loan_id) REFERENCES loans(id),
  CONSTRAINT fk_lr_user FOREIGN KEY (renewed_by) REFERENCES users(id),
  INDEX idx_lr_loan (loan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reservations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reservation_code VARCHAR(30) NOT NULL UNIQUE,
  book_id INT NOT NULL,
  member_profile_id INT NOT NULL,
  branch_id INT NOT NULL,
  copy_id INT NULL,
  queue_position INT NOT NULL DEFAULT 1,
  status ENUM('queued','ready','fulfilled','cancelled','expired') NOT NULL DEFAULT 'queued',
  reserved_at DATETIME NOT NULL,
  ready_at DATETIME NULL,
  pickup_deadline_at DATETIME NULL,
  fulfilled_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  expired_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_res_book FOREIGN KEY (book_id) REFERENCES books(id),
  CONSTRAINT fk_res_member FOREIGN KEY (member_profile_id) REFERENCES member_profiles(id),
  CONSTRAINT fk_res_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_res_copy FOREIGN KEY (copy_id) REFERENCES book_copies(id) ON DELETE SET NULL,
  INDEX idx_res_book_status (book_id, status, queue_position),
  INDEX idx_res_member_status (member_profile_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fine_code VARCHAR(30) NOT NULL UNIQUE,
  member_profile_id INT NOT NULL,
  loan_id INT NULL,
  copy_id INT NULL,
  fine_type ENUM('overdue','lost','damage','other') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  outstanding_amount DECIMAL(12,2) NOT NULL,
  waived_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status ENUM('outstanding','partial','paid','waived') NOT NULL DEFAULT 'outstanding',
  reason VARCHAR(255) NULL,
  policy_snapshot JSON NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_fine_member FOREIGN KEY (member_profile_id) REFERENCES member_profiles(id),
  CONSTRAINT fk_fine_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE SET NULL,
  CONSTRAINT fk_fine_copy FOREIGN KEY (copy_id) REFERENCES book_copies(id) ON DELETE SET NULL,
  CONSTRAINT fk_fine_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_fines_member_status (member_profile_id, status),
  INDEX idx_fines_loan (loan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payment_code VARCHAR(30) NOT NULL UNIQUE,
  member_profile_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  method ENUM('cash','card','upi','adjustment','other') NOT NULL,
  status ENUM('pending','completed','failed','refunded') NOT NULL DEFAULT 'completed',
  received_by INT NULL,
  notes VARCHAR(255) NULL,
  paid_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_member FOREIGN KEY (member_profile_id) REFERENCES member_profiles(id),
  CONSTRAINT fk_pay_received FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_pay_member (member_profile_id),
  INDEX idx_pay_paid_at (paid_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_allocations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payment_id INT NOT NULL,
  fine_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_pa_pay FOREIGN KEY (payment_id) REFERENCES payments(id),
  CONSTRAINT fk_pa_fine FOREIGN KEY (fine_id) REFERENCES fines(id),
  INDEX idx_pa_payment (payment_id),
  INDEX idx_pa_fine (fine_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payment_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  created_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_padj_pay FOREIGN KEY (payment_id) REFERENCES payments(id),
  CONSTRAINT fk_padj_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fine_waivers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fine_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  authorized_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fw_fine FOREIGN KEY (fine_id) REFERENCES fines(id),
  CONSTRAINT fk_fw_user FOREIGN KEY (authorized_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  copy_id INT NOT NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NOT NULL,
  reason VARCHAR(120) NOT NULL,
  actor_id INT NULL,
  notes VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_im_copy FOREIGN KEY (copy_id) REFERENCES book_copies(id),
  CONSTRAINT fk_im_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_im_copy (copy_id),
  INDEX idx_im_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS acquisitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_code VARCHAR(30) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  isbn13 CHAR(13) NULL,
  requested_by INT NOT NULL,
  status ENUM('requested','approved','ordered','received','rejected') NOT NULL DEFAULT 'requested',
  quantity INT NOT NULL DEFAULT 1,
  estimated_cost DECIMAL(12,2) NULL,
  supplier VARCHAR(150) NULL,
  notes TEXT NULL,
  book_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_acq_user FOREIGN KEY (requested_by) REFERENCES users(id),
  CONSTRAINT fk_acq_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  book_id INT NOT NULL,
  member_profile_id INT NOT NULL,
  rating TINYINT NOT NULL,
  review_text TEXT NULL,
  status ENUM('visible','hidden') NOT NULL DEFAULT 'visible',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_review (book_id, member_profile_id),
  CONSTRAINT fk_br_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  CONSTRAINT fk_br_member FOREIGN KEY (member_profile_id) REFERENCES member_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reading_lists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  member_profile_id INT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rl_member FOREIGN KEY (member_profile_id) REFERENCES member_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reading_list_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reading_list_id INT NOT NULL,
  book_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rli (reading_list_id, book_id),
  CONSTRAINT fk_rli_list FOREIGN KEY (reading_list_id) REFERENCES reading_lists(id) ON DELETE CASCADE,
  CONSTRAINT fk_rli_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(60) NOT NULL,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_n_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_n_user_read (user_id, is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INT NOT NULL,
  type VARCHAR(60) NOT NULL,
  in_app TINYINT(1) NOT NULL DEFAULT 1,
  email TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, type),
  CONSTRAINT fk_np_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_delivery_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  notification_id INT NOT NULL,
  channel ENUM('in_app','email') NOT NULL,
  status ENUM('queued','sent','failed') NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  last_error VARCHAR(255) NULL,
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ndl_n FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  INDEX idx_ndl_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id INT NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(40) NULL,
  details JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_al_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_al_created (created_at),
  INDEX idx_al_entity (entity_type, entity_id),
  INDEX idx_al_actor (actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  value_type ENUM('string','number','boolean','json') NOT NULL DEFAULT 'string',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS search_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  query_text VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sh_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS import_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_type ENUM('books','members') NOT NULL,
  filename VARCHAR(255) NOT NULL,
  status ENUM('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
  total_rows INT NOT NULL DEFAULT 0,
  success_rows INT NOT NULL DEFAULT 0,
  error_rows INT NOT NULL DEFAULT 0,
  error_report_path VARCHAR(255) NULL,
  created_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  CONSTRAINT fk_ij_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
