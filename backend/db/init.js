const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const DB_FILE = path.join(DB_DIR, 'auth.db');

let sqlInstance = null;
let rawDb = null;

function saveDb() {
  if (rawDb) {
    try {
      const data = rawDb.export();
      fs.writeFileSync(DB_FILE, Buffer.from(data));
    } catch (err) {
      console.error('[DB Save Error]', err);
    }
  }
}

class StatementWrapper {
  constructor(sql) {
    this.sql = sql;
  }

  run(...params) {
    if (params.length === 1 && Array.isArray(params[0])) {
      params = params[0];
    }
    rawDb.run(this.sql, params);
    
    // Get last insert rowid and changes
    let lastId = 0;
    try {
      const res = rawDb.exec('SELECT last_insert_rowid() as id, changes() as cnt');
      if (res && res.length && res[0].values && res[0].values[0]) {
        lastId = res[0].values[0][0];
      }
    } catch (e) {}

    saveDb();
    return { lastInsertRowid: lastId, changes: 1 };
  }

  get(...params) {
    if (params.length === 1 && Array.isArray(params[0])) {
      params = params[0];
    }
    const stmt = rawDb.prepare(this.sql);
    try {
      stmt.bind(params);
      if (stmt.step()) {
        const obj = stmt.getAsObject();
        stmt.free();
        return obj;
      }
      stmt.free();
      return undefined;
    } catch (err) {
      try { stmt.free(); } catch(e) {}
      throw err;
    }
  }

  all(...params) {
    if (params.length === 1 && Array.isArray(params[0])) {
      params = params[0];
    }
    const stmt = rawDb.prepare(this.sql);
    const results = [];
    try {
      stmt.bind(params);
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    } catch (err) {
      try { stmt.free(); } catch(e) {}
      throw err;
    }
  }
}

const db = {
  prepare(sql) {
    return new StatementWrapper(sql);
  },
  exec(sql) {
    rawDb.run(sql);
    saveDb();
  }
};

async function initDB() {
  if (!sqlInstance) {
    sqlInstance = await initSqlJs();
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const buffer = fs.readFileSync(DB_FILE);
      rawDb = new sqlInstance.Database(buffer);
    } catch (e) {
      console.warn('[DB] Corrupted DB file, creating new database');
      rawDb = new sqlInstance.Database();
    }
  } else {
    rawDb = new sqlInstance.Database();
  }

  // Create tables
  rawDb.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      is_verified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS otps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      otp TEXT NOT NULL,
      purpose TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS registrations (
      user_id INTEGER PRIMARY KEY,
      account_type TEXT NOT NULL,
      requested_role TEXT NOT NULL,
      institution_name TEXT, aicte_id TEXT, contact_person TEXT,
      employee_id TEXT, organisation TEXT, designation TEXT,
      phone TEXT, region TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS face_descriptors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      descriptor TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  saveDb();
  console.log('[DB] SQLite database initialized successfully at', DB_FILE);
  return db;
}

module.exports = { db, initDB };
