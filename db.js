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
  reminded INTEGER DEFAULT 0,
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

function getSlotById(slotId) {
  return db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId);
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

function getNextAppointment(patientId) {
  return db.prepare(
    "SELECT * FROM appointments WHERE patient_id = ? AND status = 'booked' ORDER BY created_at DESC LIMIT 1"
  ).get(patientId);
}

function cancelAppointment(appointmentId) {
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointmentId);
  if (!appt) return;
  db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").run(appointmentId);
  db.prepare('UPDATE slots SET is_booked = 0 WHERE slot_date = ? AND slot_time = ?').run(appt.slot_date, appt.slot_time);
}

// Находим записи, до которых ровно ~2 часа (для напоминаний)
function getAppointmentsInTwoHours() {
  return db.prepare(`
    SELECT a.*, p.telegram_id, p.name, p.phone FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    WHERE a.status = 'booked' AND a.reminded = 0
  `).all();
}

function markReminded(appointmentId) {
  db.prepare('UPDATE appointments SET reminded = 1 WHERE id = ?').run(appointmentId);
}

function getAllAppointments() {
  return db.prepare(`
    SELECT a.*, p.name, p.phone FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    ORDER BY a.created_at DESC
  `).all();
}

function seedSlotsIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as c FROM slots').get().c;
  if (count > 0) return;
  const times = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
  const insert = db.prepare('INSERT INTO slots (slot_date, slot_time) VALUES (?, ?)');
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() === 0) continue;
    const dateStr = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    for (const t of times) insert.run(dateStr, t);
  }
}

function resetSlots() {
  db.prepare('DELETE FROM slots WHERE is_booked = 0').run();
  seedSlotsIfEmpty();
}

module.exports = {
  upsertPatient, savePhone, getAvailableSlots, getSlotById,
  bookSlot, getNextAppointment, cancelAppointment,
  getAppointmentsInTwoHours, markReminded,
  getAllAppointments, seedSlotsIfEmpty, resetSlots
};
