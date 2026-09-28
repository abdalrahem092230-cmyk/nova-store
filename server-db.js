const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is missing. Falling back to local file storage.');
  require('./server.js');
  return;
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined
});

const defaultState = {
  settings: {
    name: 'نوفا ستور',
    en: 'NOVA STORE',
    tag: 'اختيارات عصرية، جودة تستحقها',
    currency: 'د.ل',
    ship: 15,
    free: 250,
    wa: '218900000000'
  },
  products: [
    { id:'p1', name:'ساعة Urban Edge', cat:'إكسسوارات', price:189, old:239, stock:18, img:'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1000&q=85' },
    { id:'p2', name:'سماعات AirBeat Pro', cat:'تقنية', price:149, old:179, stock:31, img:'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=85' },
    { id:'p3', name:'حقيبة City Carry', cat:'حقائب', price:219, old:0, stock:12, img:'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1000&q=85' },
    { id:'p4', name:'نظارة Noir Classic', cat:'إكسسوارات', price:99, old:129, stock:24, img:'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1000&q=85' },
    { id:'p5', name:'عطر Velvet Night', cat:'عطور', price:169, old:199, stock:9, img:'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1000&q=85' },
    { id:'p6', name:'حذاء Mono Run', cat:'أحذية', price:259, old:299, stock:16, img:'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1000&q=85' }
  ],
  orders: []
};

let pendingWrite = Promise.resolve();
let lastPersisted = '';

function persistRaw(raw) {
  if (!raw || raw === lastPersisted) return;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return; }
  lastPersisted = raw;
  pendingWrite = pendingWrite
    .then(() => pool.query(
      'INSERT INTO nova_state (id, data, updated_at) VALUES (1, $1::jsonb, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()',
      [JSON.stringify(parsed)]
    ))
    .catch(err => console.error('Database sync failed:', err.message));
}

async function boot() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS nova_state (
      id smallint PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const found = await pool.query('SELECT data FROM nova_state WHERE id = 1');
  let state;

  if (found.rowCount) {
    state = found.rows[0].data;
  } else {
    state = defaultState;
    await pool.query(
      'INSERT INTO nova_state (id, data) VALUES (1, $1::jsonb)',
      [JSON.stringify(state)]
    );
  }

  const raw = JSON.stringify(state, null, 2);
  fs.writeFileSync(STORE_FILE, raw);
  lastPersisted = raw;

  const originalWriteFileSync = fs.writeFileSync.bind(fs);
  fs.writeFileSync = function(file, data, ...rest) {
    const result = originalWriteFileSync(file, data, ...rest);
    try {
      if (path.resolve(String(file)) === path.resolve(STORE_FILE)) {
        persistRaw(Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
      }
    } catch (err) {
      console.error('Store sync hook failed:', err.message);
    }
    return result;
  };

  setInterval(() => {
    try {
      if (fs.existsSync(STORE_FILE)) persistRaw(fs.readFileSync(STORE_FILE, 'utf8'));
    } catch (err) {
      console.error('Periodic store backup failed:', err.message);
    }
  }, 2000).unref();

  process.on('SIGTERM', async () => {
    try {
      if (fs.existsSync(STORE_FILE)) persistRaw(fs.readFileSync(STORE_FILE, 'utf8'));
      await pendingWrite;
      await pool.end();
    } finally {
      process.exit(0);
    }
  });

  console.log('NOVA persistent storage connected to Render PostgreSQL');
  require('./server.js');
}

boot().catch(err => {
  console.error('Database boot failed:', err);
  process.exit(1);
});
