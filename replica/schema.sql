-- Schema for Nexus Download Accelerator (Modern IDM Rebuild)

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  target_folder TEXT NOT NULL,
  file_extensions TEXT NOT NULL, -- JSON array of strings e.g. ["zip","rar","tar"]
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS download_queues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_scheduled INTEGER NOT NULL DEFAULT 0,
  start_time TEXT, -- HH:MM (24-hour)
  stop_time TEXT,  -- HH:MM (24-hour)
  days_of_week TEXT, -- JSON array of ints [1,2,3,4,5,6,7]
  max_concurrent_tasks INTEGER NOT NULL DEFAULT 2,
  on_complete_action TEXT NOT NULL DEFAULT 'none' CHECK (on_complete_action IN ('none', 'exit', 'sleep', 'shutdown')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS download_tasks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  original_url TEXT NOT NULL,
  referrer_url TEXT,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0, -- bytes (0 if unknown / chunked)
  downloaded_bytes INTEGER NOT NULL DEFAULT 0,
  save_path TEXT NOT NULL,
  temp_dir TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  queue_id TEXT REFERENCES download_queues(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'probing', 'downloading', 'paused', 'completed', 'error')),
  etag TEXT,
  last_modified TEXT,
  allows_range INTEGER NOT NULL DEFAULT 1,
  chunk_count INTEGER NOT NULL DEFAULT 8,
  speed_limit_bps INTEGER NOT NULL DEFAULT 0,
  checksum TEXT,
  error_message TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON download_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON download_tasks(category_id);
CREATE INDEX IF NOT EXISTS idx_tasks_queue ON download_tasks(queue_id);

CREATE TABLE IF NOT EXISTS download_segments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES download_tasks(id) ON DELETE CASCADE,
  segment_index INTEGER NOT NULL,
  start_byte INTEGER NOT NULL,
  end_byte INTEGER NOT NULL,
  current_byte INTEGER NOT NULL,
  temp_file_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'downloading', 'completed', 'failed')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_segments_task ON download_segments(task_id, segment_index);

CREATE TABLE IF NOT EXISTS site_credentials (
  id TEXT PRIMARY KEY,
  domain_pattern TEXT NOT NULL UNIQUE,
  auth_type TEXT NOT NULL DEFAULT 'basic' CHECK (auth_type IN ('basic', 'digest', 'bearer', 'cookie')),
  username TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
