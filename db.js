// db.js — простая база данных на SQLite, файл создаётся автоматически
const Database = require('better-sqlite3');
const db = new Database('clinic.db');

db.exec(`
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER UNIQUE,
  name TEXT,
  phone TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER,
  service TEXT,
  slot_date TEXT,
  slot_time TEXT,
  status TEXT DEFAULT 'booked',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE TABLE IF NOT EXISTS slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_date TEXT,
  slot_time TEXT,
  is_booked INTEGER DEFAULT 0
);
`);

function upsertPatient(telegramId, name) {
  const existing = db.prepare('SELECT * FROM patients WHERE telegram_id = ?').get(telegramId);
  if (existing) return existing;
  const info = db.prepare('INSERT INTO patients (telegram_id, name) VALUES (?, ?)').run(telegramId, name);
  return db.prepare('SELECT * FROM patients WHERE id = ?').get(info.lastInsertRowid);
}

function savePhone(telegramId, phone) {
  db.prepare('UPDATE patients SET phone = ? WHERE telegram_id = ?').run(phone, telegramId);
}

function getAvailableSlots() {
  return db.prepare('SELECT * FROM slots WHERE is_booked = 0 ORDER BY slot_date, slot_time').all();
}

function bookSlot(slotId, patientId, service) {
  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId);
  if (!slot || slot.is_booked) return null;
  db.prepare('UPDATE slots SET is_booked = 1 WHERE id = ?').run(slotId);
  const info = db.prepare(
    'INSERT INTO appointments (patient_id, service, slot_date, slot_time) VALUES (?, ?, ?, ?)'
  ).run(patientId, service, slot.slot_date, slot.slot_time);
  return { ...slot, appointmentId: info.lastInsertRowid };
}

function seedSlotsIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as c FROM slots').get().c;
  if (count > 0) return;

  // Реальный график: пн-сб, 9:00-18:00, приём раз в час (последний слот 17:00)
  // Генерируем слоты на 14 дней вперёд, воскресенье пропускаем
  const times = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
  const insert = db.prepare('INSERT INTO slots (slot_date, slot_time) VALUES (?, ?)');

  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() === 0) continue; // воскресенье — выходной

    const dateStr = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    for (const t of times) insert.run(dateStr, t);
  }
}

// сбросить и заново сгенерировать расписание (на случай если нужно обновить даты)
function resetSlots() {
  db.prepare('DELETE FROM slots WHERE is_booked = 0').run();
  seedSlotsIfEmpty();
}

function getAllAppointments() {
  return db.prepare(`
    SELECT a.*, p.name, p.phone FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    ORDER BY a.created_at DESC
  `).all();
}

module.exports = {
  upsertPatient, savePhone, getAvailableSlots, bookSlot, seedSlotsIfEmpty, resetSlots, getAllAppointments
};
