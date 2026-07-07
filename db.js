const Database = require('better-sqlite3');
// DB_PATH задаётся в Railway Variables (например /data/clinic.db на volume),
// локально по умолчанию — clinic.db рядом с кодом
const db = new Database(process.env.DB_PATH || 'clinic.db');

// ─── Часовой пояс клиники: Ташкент, UTC+5 (без перехода на летнее время) ───
// Сервер Railway живёт по UTC, поэтому все "сегодня/сейчас" считаем со сдвигом.
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

// Возвращает Date, у которого UTC-методы (getUTCHours, toISOString и т.д.)
// показывают ташкентское время
function tashkentNow() {
  return new Date(Date.now() + TASHKENT_OFFSET_MS);
}

// Сегодняшняя дата в Ташкенте в формате YYYY-MM-DD
function tashkentToday() {
  return tashkentNow().toISOString().slice(0, 10);
}

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
  review_sent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);
CREATE TABLE IF NOT EXISTS slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_date TEXT,
  slot_time TEXT,
  is_booked INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS waiting_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER UNIQUE,
  service TEXT,
  lang TEXT DEFAULT 'ru',
  slot_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER,
  appointment_id INTEGER,
  rating INTEGER,
  comment TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// Миграция: колонка даты в списке ожидания (ошибка "duplicate column" игнорируется)
try { db.exec('ALTER TABLE waiting_list ADD COLUMN slot_date TEXT'); } catch (e) {}

// Чистим возможные дубли слотов (оставляем занятый, если есть) и запрещаем дубли впредь
db.exec(`
DELETE FROM slots WHERE id NOT IN (
  SELECT (SELECT id FROM slots s2
          WHERE s2.slot_date = s.slot_date AND s2.slot_time = s.slot_time
          ORDER BY s2.is_booked DESC, s2.id LIMIT 1)
  FROM (SELECT DISTINCT slot_date, slot_time FROM slots) s
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_slots_unique ON slots(slot_date, slot_time);
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

// Все предстоящие даты с флагом: есть ли свободные места
function getDatesWithStatus() {
  return db.prepare(`
    SELECT slot_date, MAX(CASE WHEN is_booked = 0 THEN 1 ELSE 0 END) as has_free
    FROM slots
    WHERE slot_date >= ?
    GROUP BY slot_date
    ORDER BY slot_date
  `).all(tashkentToday());
}

// Уникальные даты с хотя бы одним свободным слотом
function getAvailableDates() {
  return db.prepare(
    'SELECT DISTINCT slot_date FROM slots WHERE is_booked = 0 ORDER BY slot_date'
  ).all().map(r => r.slot_date);
}

// Свободные слоты на конкретную дату
function getSlotsByDate(dateStr) {
  return db.prepare(
    'SELECT * FROM slots WHERE is_booked = 0 AND slot_date = ? ORDER BY slot_time'
  ).all(dateStr);
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

// Находим записи ровно через 2 часа от текущего момента (по ташкентскому времени)
function getAppointmentsInTwoHours() {
  // Целевое время = сейчас в Ташкенте + 2 часа, округляем до часа
  const target = new Date(Date.now() + TASHKENT_OFFSET_MS + 2 * 60 * 60 * 1000);
  const targetDate = target.toISOString().slice(0, 10); // YYYY-MM-DD
  const targetHour = String(target.getUTCHours()).padStart(2, '0') + ':00';

  return db.prepare(`
    SELECT a.*, p.telegram_id, p.name, p.phone FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    WHERE a.status = 'booked'
      AND a.reminded = 0
      AND a.slot_date = ?
      AND a.slot_time = ?
  `).all(targetDate, targetHour);
}

function markReminded(appointmentId) {
  db.prepare('UPDATE appointments SET reminded = 1 WHERE id = ?').run(appointmentId);
}

function getAllAppointments() {
  return db.prepare(`
    SELECT a.*, p.name, p.phone FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    ORDER BY a.slot_date DESC, a.slot_time DESC
  `).all();
}

// Предстоящие активные записи (от сегодня и позже) — для админ-отмены
function getUpcomingBookedAppointments() {
  const today = tashkentToday();
  return db.prepare(`
    SELECT a.*, p.name, p.phone, p.telegram_id FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    WHERE a.status = 'booked' AND a.slot_date >= ?
    ORDER BY a.slot_date, a.slot_time
  `).all(today);
}

// Одна запись вместе с данными пациента (для уведомления при отмене)
function getAppointmentWithPatient(appointmentId) {
  return db.prepare(`
    SELECT a.*, p.name, p.phone, p.telegram_id FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    WHERE a.id = ?
  `).get(appointmentId);
}

// Форматируем дату для показа пациенту: 2026-07-03 → 03.07 (пятница)
function formatDate(dateStr) {
  const days = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
  const d = new Date(dateStr); // YYYY-MM-DD парсится как полночь UTC
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const weekday = days[d.getUTCDay()];
  return `${day}.${month} (${weekday})`;
}

// Создаёт слоты на 14 дней вперёд от сегодня (Ташкент), пн-сб, 9:00-17:00.
// Уже существующие слоты (в т.ч. занятые) не трогает — благодаря уникальному индексу.
function generateSlots() {
  const times = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];
  const insert = db.prepare('INSERT OR IGNORE INTO slots (slot_date, slot_time) VALUES (?, ?)');
  const today = tashkentNow();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() + i);
    if (d.getUTCDay() === 0) continue; // воскресенье
    const dateStr = d.toISOString().slice(0, 10);
    for (const t of times) insert.run(dateStr, t);
  }
}

function seedSlotsIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as c FROM slots').get().c;
  if (count > 0) return;
  generateSlots();
}

// Пополняет расписание: добавляет недостающие слоты так, чтобы всегда было 14 дней вперёд.
// Существующие (в т.ч. занятые) слоты не трогает.
function refillSlots() {
  generateSlots();
}

// Удаляет прошедшие незабронированные слоты (по ташкентской дате)
function deleteOldSlots() {
  db.prepare('DELETE FROM slots WHERE slot_date < ? AND is_booked = 0').run(tashkentToday());
}

function resetSlots() {
  db.prepare('DELETE FROM slots WHERE is_booked = 0').run();
  generateSlots(); // пересоздаёт расписание всегда, а не только при пустой таблице
}

// Визиты вчерашнего дня которым ещё не отправлен запрос отзыва
function getVisitsForReview() {
  const yesterday = new Date(Date.now() + TASHKENT_OFFSET_MS - 24*60*60*1000).toISOString().slice(0,10);
  return db.prepare(`
    SELECT a.*, p.telegram_id, p.name FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    WHERE a.slot_date = ? AND a.status = 'booked' AND a.review_sent = 0
      AND p.telegram_id IS NOT NULL
  `).all(yesterday);
}

function markReviewSent(appointmentId) {
  db.prepare('UPDATE appointments SET review_sent = 1 WHERE id = ?').run(appointmentId);
}

function saveReview(patientId, appointmentId, rating, comment) {
  db.prepare(
    'INSERT INTO reviews (patient_id, appointment_id, rating, comment) VALUES (?,?,?,?)'
  ).run(patientId, appointmentId, rating, comment || '');
}

function getReviewByAppointment(appointmentId) {
  return db.prepare('SELECT * FROM reviews WHERE appointment_id = ?').get(appointmentId);
}

// Пациенты у которых последний визит был ровно 6 месяцев назад
function getPatientsForRebooking() {
  const sixMonthsAgo = tashkentNow();
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);
  const target = sixMonthsAgo.toISOString().slice(0,10);
  return db.prepare(`
    SELECT p.*, MAX(a.slot_date) as last_visit FROM patients p
    JOIN appointments a ON a.patient_id = p.id
    WHERE a.status = 'booked' AND p.telegram_id IS NOT NULL
    GROUP BY p.id
    HAVING last_visit = ?
  `).all(target);
}

// ─── Список ожидания ──────────────────────────────────────
// Добавить пациента в очередь. slotDate = конкретный день или null (любой день).
// Повторное добавление обновляет день/услугу, место в очереди сохраняется.
function addToWaitingList(patientId, service, lang, slotDate) {
  const existing = db.prepare('SELECT * FROM waiting_list WHERE patient_id = ?').get(patientId);
  if (existing) {
    db.prepare('UPDATE waiting_list SET service = ?, lang = ?, slot_date = ? WHERE patient_id = ?')
      .run(service || existing.service, lang || existing.lang, slotDate !== undefined ? slotDate : existing.slot_date, patientId);
    return existing;
  }
  db.prepare('INSERT INTO waiting_list (patient_id, service, lang, slot_date) VALUES (?, ?, ?, ?)')
    .run(patientId, service || '', lang || 'ru', slotDate || null);
  return null;
}

// Первый в очереди на освободившееся место: сначала ждущие именно этот день, потом общая очередь
function getFirstInWaitingList(slotDate) {
  if (slotDate) {
    const dateSpecific = db.prepare(`
      SELECT w.*, p.telegram_id, p.name FROM waiting_list w
      JOIN patients p ON p.id = w.patient_id
      WHERE p.telegram_id IS NOT NULL AND w.slot_date = ?
      ORDER BY w.created_at, w.id
      LIMIT 1
    `).get(slotDate);
    if (dateSpecific) return dateSpecific;
  }
  return db.prepare(`
    SELECT w.*, p.telegram_id, p.name FROM waiting_list w
    JOIN patients p ON p.id = w.patient_id
    WHERE p.telegram_id IS NOT NULL AND w.slot_date IS NULL
    ORDER BY w.created_at, w.id
    LIMIT 1
  `).get();
}

function removeFromWaitingList(patientId) {
  db.prepare('DELETE FROM waiting_list WHERE patient_id = ?').run(patientId);
}

function getWaitingListCount() {
  return db.prepare('SELECT COUNT(*) as c FROM waiting_list').get().c;
}

// ─── Диагностика расписания (для команды /slots) ──────────
function getSlotsDiagnostics() {
  const total = db.prepare('SELECT COUNT(*) as c FROM slots').get().c;
  const free = db.prepare('SELECT COUNT(*) as c FROM slots WHERE is_booked = 0').get().c;
  const booked = db.prepare('SELECT COUNT(*) as c FROM slots WHERE is_booked = 1').get().c;
  const freeDates = db.prepare('SELECT DISTINCT slot_date FROM slots WHERE is_booked = 0 ORDER BY slot_date').all().map(r => r.slot_date);
  return { total, free, booked, freeDates };
}

// ─── Статистика за неделю (для отчёта врачу) ──────────────
function getWeeklyStats() {
  const now = tashkentNow();
  const weekAgo = new Date(now); weekAgo.setUTCDate(now.getUTCDate() - 7);
  const weekAhead = new Date(now); weekAhead.setUTCDate(now.getUTCDate() + 7);
  const today = now.toISOString().slice(0, 10);
  const from = weekAgo.toISOString().slice(0, 10);
  const to = weekAhead.toISOString().slice(0, 10);

  const created = db.prepare(
    "SELECT COUNT(*) as c FROM appointments WHERE created_at >= datetime('now', '-7 days')"
  ).get().c;
  const cancelled = db.prepare(
    "SELECT COUNT(*) as c FROM appointments WHERE status = 'cancelled' AND created_at >= datetime('now', '-7 days')"
  ).get().c;
  const held = db.prepare(
    "SELECT COUNT(*) as c FROM appointments WHERE status = 'booked' AND slot_date >= ? AND slot_date < ?"
  ).get(from, today).c;
  const upcoming = db.prepare(
    "SELECT COUNT(*) as c FROM appointments WHERE status = 'booked' AND slot_date >= ? AND slot_date <= ?"
  ).get(today, to).c;
  const topServices = db.prepare(
    "SELECT service, COUNT(*) as c FROM appointments WHERE created_at >= datetime('now', '-7 days') GROUP BY service ORDER BY c DESC LIMIT 3"
  ).all();
  const avgRating = db.prepare(
    "SELECT ROUND(AVG(rating), 1) as r, COUNT(*) as c FROM reviews WHERE created_at >= datetime('now', '-7 days')"
  ).get();
  const waiting = getWaitingListCount();

  return { created, cancelled, held, upcoming, topServices, avgRating, waiting };
}

module.exports = {
  upsertPatient, savePhone,
  getAvailableSlots, getAvailableDates, getDatesWithStatus, getSlotsByDate, getSlotById,
  bookSlot, getNextAppointment, cancelAppointment,
  getAppointmentsInTwoHours, markReminded, formatDate,
  getVisitsForReview, markReviewSent, saveReview, getReviewByAppointment,
  getPatientsForRebooking,
  getUpcomingBookedAppointments, getAppointmentWithPatient,
  addToWaitingList, getFirstInWaitingList, removeFromWaitingList, getWaitingListCount,
  getWeeklyStats, getSlotsDiagnostics,
  getAllAppointments, seedSlotsIfEmpty, resetSlots, refillSlots, deleteOldSlots
};
