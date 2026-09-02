-- 会话表
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(64) NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions(token);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

-- 审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  user_id UUID,
  username VARCHAR(50),
  ip_address VARCHAR(45),
  user_agent TEXT,
  target_type VARCHAR(50),
  target_id VARCHAR(36),
  details JSONB,
  result VARCHAR(10) NOT NULL CHECK (result IN ('success', 'failure')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_event_type_idx ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_target_type_idx ON audit_logs(target_type);
CREATE INDEX IF NOT EXISTS audit_logs_target_id_idx ON audit_logs(target_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS audit_logs_result_idx ON audit_logs(result);

-- 登录失败记录表（用于限流）
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS login_attempts_username_idx ON login_attempts(username);
CREATE INDEX IF NOT EXISTS login_attempts_ip_address_idx ON login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS login_attempts_created_at_idx ON login_attempts(created_at);

-- 为 admin_users 表添加 password_hash 字段（兼容迁移）
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

-- 为 uploaded_files 表添加版本化和软删除字段
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT TRUE;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(36);
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS checksum VARCHAR(64);
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(36);

CREATE INDEX IF NOT EXISTS uploaded_files_version_idx ON uploaded_files(version);
CREATE INDEX IF NOT EXISTS uploaded_files_is_current_idx ON uploaded_files(is_current);
CREATE INDEX IF NOT EXISTS uploaded_files_is_deleted_idx ON uploaded_files(is_deleted);
CREATE UNIQUE INDEX IF NOT EXISTS uploaded_files_idempotency_key_idx
  ON uploaded_files(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 只补齐空值，不删除、不覆盖任何历史记录。
UPDATE uploaded_files SET version = 1 WHERE version IS NULL;
UPDATE uploaded_files SET is_current = TRUE WHERE is_current IS NULL;
UPDATE uploaded_files SET is_deleted = FALSE WHERE is_deleted IS NULL;

-- 为 uploaded_files 表添加归属期间字段
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS period_start DATE;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS period_end DATE;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS period_label VARCHAR(100);
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS parse_status VARCHAR(20) DEFAULT 'pending' CHECK (parse_status IN ('success', 'failed', 'pending', 'manual'));
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS parse_source VARCHAR(20) DEFAULT 'filename' CHECK (parse_source IN ('filename', 'user_input', 'system'));

CREATE INDEX IF NOT EXISTS uploaded_files_period_start_idx ON uploaded_files(period_start);
CREATE INDEX IF NOT EXISTS uploaded_files_period_end_idx ON uploaded_files(period_end);
CREATE INDEX IF NOT EXISTS uploaded_files_parse_status_idx ON uploaded_files(parse_status);

-- 导出任务表
CREATE TABLE IF NOT EXISTS export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired', 'cancelled')),
  file_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  filter_params JSONB,
  file_ids UUID[],
  result_key VARCHAR(500),
  result_url TEXT,
  result_expires_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT export_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS export_jobs_user_id_idx ON export_jobs(user_id);
CREATE INDEX IF NOT EXISTS export_jobs_status_idx ON export_jobs(status);
CREATE INDEX IF NOT EXISTS export_jobs_created_at_idx ON export_jobs(created_at);

-- 文件配置表（允许格式、大小限制等）
CREATE TABLE IF NOT EXISTS upload_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(50) NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(36)
);

-- 初始化默认配置
INSERT INTO upload_config (key, value, description) VALUES
  ('allowed_mime_types', '["application/pdf", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/csv", "application/zip", "application/x-rar-compressed", "image/jpeg", "image/png", "image/gif"]', '允许上传的文件类型'),
  ('max_file_size', '104857600', '单文件最大大小（字节），默认 100MB'),
  ('max_batch_size', '50', '批量上传最大文件数'),
  ('large_file_threshold', '12582912', '大文件阈值（字节），默认 12MB')
ON CONFLICT (key) DO NOTHING;

INSERT INTO upload_config (key, value, description) VALUES
  ('multipart_part_size', '8388608', '对象存储多段上传分片大小（字节），默认 8MB')
ON CONFLICT (key) DO NOTHING;
