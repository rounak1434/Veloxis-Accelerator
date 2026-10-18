const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..', '..');
const DATA_DIR = fs.existsSync(path.join(ROOT_DIR, 'data'))
  ? path.join(ROOT_DIR, 'data')
  : (fs.existsSync(path.join(process.cwd(), 'data')) ? path.join(process.cwd(), 'data') : path.join(ROOT_DIR, 'data'));

if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
}

const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_CATEGORIES = [
  { id: 'cat-comp', name: 'Compressed', extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'], folder: 'Compressed' },
  { id: 'cat-doc', name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'epub'], folder: 'Documents' },
  { id: 'cat-mus', name: 'Music', extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'], folder: 'Music' },
  { id: 'cat-prog', name: 'Programs', extensions: ['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'apk'], folder: 'Programs' },
  { id: 'cat-vid', name: 'Video', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v'], folder: 'Video' }
];

const DEFAULT_QUEUES = [
  {
    id: 'queue-main',
    name: 'Main Download Queue',
    isScheduled: false,
    startTime: '02:00',
    stopTime: '06:00',
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    maxConcurrent: 2,
    onComplete: 'none' // 'none', 'sleep', 'shutdown'
  },
  {
    id: 'queue-night',
    name: 'Night Schedule Queue',
    isScheduled: true,
    startTime: '01:00',
    stopTime: '07:00',
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    maxConcurrent: 3,
    onComplete: 'none'
  }
];

const userDownloads = process.env.USERPROFILE
  ? path.join(process.env.USERPROFILE, 'Downloads')
  : path.join(ROOT_DIR, 'downloads');

const DEFAULT_SETTINGS = {
  maxSegmentsPerDownload: 8,
  speedLimitEnabled: false,
  speedLimitBytesPerSec: 500 * 1024, // 500 KB/s
  defaultDownloadDir: userDownloads,
  tempDir: path.join(userDownloads, '.veloxis_temp'),
  clipboardMonitor: true,
  browserIntegration: true,
  interceptExtensions: ['zip', 'rar', '7z', 'iso', 'exe', 'msi', 'mp4', 'mkv', 'mp3', 'flac', 'pdf', 'tar', 'gz'],
  antivirusPath: '',
  antivirusArgs: ''
};

class Storage {
  constructor() {
    this.data = {
      tasks: [],
      categories: DEFAULT_CATEGORIES,
      queues: DEFAULT_QUEUES,
      settings: DEFAULT_SETTINGS,
      credentials: []
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = {
          tasks: parsed.tasks || [],
          categories: parsed.categories || DEFAULT_CATEGORIES,
          queues: parsed.queues || DEFAULT_QUEUES,
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
          credentials: parsed.credentials || []
        };
      } else {
        this.save();
      }
    } catch (err) {
      console.error('Error loading db.json, using defaults:', err.message);
      this.save();
    }
  }

  save() {
    try {
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving db.json:', err.message);
    }
  }

  getTasks() {
    return this.data.tasks;
  }

  getTask(id) {
    return this.data.tasks.find(t => t.id === id);
  }

  upsertTask(task) {
    const idx = this.data.tasks.findIndex(t => t.id === task.id);
    if (idx >= 0) {
      this.data.tasks[idx] = { ...this.data.tasks[idx], ...task };
    } else {
      this.data.tasks.unshift(task);
    }
    this.save();
    return task;
  }

  deleteTask(id) {
    this.data.tasks = this.data.tasks.filter(t => t.id !== id);
    this.save();
  }

  getCategories() {
    return this.data.categories;
  }

  getQueues() {
    return this.data.queues;
  }

  updateQueue(queue) {
    const idx = this.data.queues.findIndex(q => q.id === queue.id);
    if (idx >= 0) {
      this.data.queues[idx] = { ...this.data.queues[idx], ...queue };
      this.save();
      return this.data.queues[idx];
    }
    return null;
  }

  getSettings() {
    return this.data.settings;
  }

  updateSettings(settings) {
    this.data.settings = { ...this.data.settings, ...settings };
    this.save();
    return this.data.settings;
  }

  determineCategory(filename) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    for (const cat of this.data.categories) {
      if (cat.extensions.includes(ext)) {
        return cat.id;
      }
    }
    return 'cat-other';
  }
}

module.exports = new Storage();
