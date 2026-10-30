-- Fit Log database (MySQL / MariaDB - XAMPP)
-- Pwede itong i-import sa phpMyAdmin, pero awtomatiko rin itong pinapatakbo ng app.py sa unang takbo.

CREATE DATABASE IF NOT EXISTS fitlog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fitlog;

-- 1. User registration
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2, 3, 4. Exercise/activity records + workout duration + calories burned
CREATE TABLE IF NOT EXISTS workouts (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL,
  activity_date   DATE NOT NULL,
  exercise_name   VARCHAR(100) NOT NULL,
  category        VARCHAR(30) NOT NULL DEFAULT 'Other',
  duration_min    INT NOT NULL,
  calories_burned INT NOT NULL DEFAULT 0,
  notes           VARCHAR(255) NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_date (user_id, activity_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5 & 6. Daily fitness logs (the weight entries also feed Progress Tracking)
CREATE TABLE IF NOT EXISTS daily_logs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  log_date      DATE NOT NULL,
  weight_kg     DECIMAL(5,2) NULL,
  water_glasses INT NULL,
  sleep_hours   DECIMAL(4,1) NULL,
  mood          VARCHAR(20) NULL,
  notes         VARCHAR(255) NULL,
  UNIQUE KEY uq_user_day (user_id, log_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 8. Calories calculator history
CREATE TABLE IF NOT EXISTS calculations (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT NOT NULL,
  sex            VARCHAR(10) NOT NULL,
  age            INT NOT NULL,
  height_cm      DECIMAL(5,1) NOT NULL,
  weight_kg      DECIMAL(5,1) NOT NULL,
  activity_level VARCHAR(20) NOT NULL,
  goal           VARCHAR(20) NOT NULL,
  bmr            INT NOT NULL,
  tdee           INT NOT NULL,
  target_kcal    INT NOT NULL,
  met            DECIMAL(4,1) NULL,
  minutes        INT NULL,
  burn_kcal      INT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Weekly/Monthly Reports at Progress Tracking ay kinukuwenta mula sa workouts at daily_logs (walang dagdag na table).
