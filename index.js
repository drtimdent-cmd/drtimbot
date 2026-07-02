require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const db = require('./db');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CLINIC_NAME = process.env.CLINIC_NAME || 'Doctor Tim Dental';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!BOT_TOKEN) { console.error('Ошибка: не задан BOT_TOKEN в файле .env'); process.exit(1); }

const bot = new Telegraf(BOT_TOKEN);
db.seedSlotsIfEmpty();

const SERVICES = [
  { id: 'consult',    icon: '🩺', ru: 'Консультация врача',                            uz: 'Shifokor maslahati' },
  { id: 'filling',    icon: '🦷', ru: 'Реставрация (пломба) зуба',                    uz: 'Tish plombasi (restavratsiya)' },
  { id: 'clean',      icon: '✨', ru: 'Профессиональная чистка зубов',                 uz: 'Tishlarni professional tozalash' },
  { id: 'prosthetics',icon: '👑', ru: 'Съёмное и несъёмное протезирование',            uz: 'Olinadigan va olinmaydigan protezlash' },
  { id: 'extraction', icon: '🛠️', ru: 'Удаление зубов',                               uz: 'Tishni olib tashlash' },
  { id: 'endo',       icon: '🔬', ru: 'Эндодонтическое лечение (удаление нерва)',      uz: 'Endodontik davolash (nerv olish)' },
];

const TEXTS = {
  ru: {
    welcome:      (name) => `Здравствуйте, ${name}! Добро пожаловать в ${CLINIC_NAME}.\n\nКакая услуга вам нужна?`,
    chooseTime:   'Выберите удобное время:',
    askPhone:     'Последний шаг — поделитесь номером телефона, чтобы мы могли связаться с вами при необходимости:',
    phoneBtn:     '📱 Отправить номер телефона',
    noSlots:      'Сейчас нет свободного времени. Попробуйте позже или позвоните в клинику.',
    booked:       (date, time, service) => `✅ Вы записаны!\n\n📅 ${date}, ${time}\n💊 ${service}\n🏥 ${CLINIC_NAME}\n\nМы напомним вам за 2 часа до визита.`,
    reminder:     (date, time, service) => `⏰ Напоминание!\n\nЗавтра у вас визит в ${CLINIC_NAME}:\n📅 ${date}, ${time}\n💊 ${service}\n\nЕсли не сможете прийти — отмените через /cancel`,
    cancelNone:   'У вас нет предстоящих записей.',
    cancelDone:   (date, time) => `❌ Запись на ${date} в ${time} отменена. Если хотите записаться снова — /start`,
    slotTaken:    'К сожалению, это время уже заняли. Выберите другое.',
    restart:      'Пожалуйста, начните заново через /start',
  },
  uz: {
    welcome:      (name) => `Salom, ${name}! ${CLINIC_NAME} klinikasiga xush kelibsiz.\n\nQaysi xizmat kerak?`,
    chooseTime:   "Bo'sh vaqtlardan birini tanlang:",
    askPhone:     "Oxirgi qadam — telefon raqamingizni yuboring, kerak bo'lganda siz bilan bog'lanamiz:",
    phoneBtn:     '📱 Telefon raqamini yuborish',
    noSlots:      "Hozircha bo'sh vaqt yo'q. Iltimos keyinroq urinib ko'ring yoki klinikaga qo'ng'iroq qiling.",
    booked:       (date, time, service) => `✅ Siz yozildingiz!\n\n📅 ${date}, ${time}\n💊 ${service}\n🏥 ${CLINIC_NAME}\n\nUchrashuvdan 2 soat oldin eslatma yuboriladi.`,
    reminder:     (date, time, service) => `⏰ Eslatma!\n\n${CLINIC_NAME} klinikasiga yozilgansiz:\n📅 ${date}, ${time}\n💊 ${service}\n\nKela olmasangiz — /cancel orqali bekor qiling`,
    cancelNone:   "Sizda kelgusi yozuvlar yo'q.",
    cancelDone:   (date, time) => `❌ ${date} kuni ${time} dagi yozuv bekor qilindi. Qayta yozilish uchun — /start`,
    slotTaken:    "Kechirasiz, bu vaqt band qilindi. Boshqa vaqtni tanlang.",
    restart:      'Iltimos, /start dan qaytadan boshlang',
  },
};

const userState = {};

// ─── /start ───────────────────────────────────────────────
bot.start((ctx) => {
  userState[ctx.from.id] = {};
  ctx.reply('Tilni tanlang / Выберите язык:',
    Markup.inlineKeyboard([
      [Markup.button.callback("🇺🇿 O'zbekcha", 'lang_uz')],
      [Markup.button.callback('🇷🇺 Русский',   'lang_ru')],
    ])
  );
});

// ─── Выбор языка ──────────────────────────────────────────
bot.action(/lang_(.+)/, async (ctx) => {
  const lang = ctx.match[1];
  const name = ctx.from.first_name || (lang === 'ru' ? 'Гость' : 'Mehmon');
  db.upsertPatient(ctx.from.id, `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim());
  userState[ctx.from.id] = { lang };
  await ctx.editMessageText(TEXTS[lang].welcome(name),
    Markup.inlineKeyboard(SERVICES.map(s => [Markup.button.callback(`${s.icon} ${s[lang]}`, `service_${s.id}`)]))
  );
});

// ─── Выбор услуги ─────────────────────────────────────────
bot.action(/service_(.+)/, async (ctx) => {
  const state = userState[ctx.from.id];
  if (!state?.lang) { await ctx.answerCbQuery(); return; }
  const lang = state.lang;
  const service = SERVICES.find(s => s.id === ctx.match[1]);
  userState[ctx.from.id] = { lang, service: service[lang], serviceIcon: service.icon };

  const slots = db.getAvailableSlots().slice(0, 12);
  if (!slots.length) { await ctx.editMessageText(TEXTS[lang].noSlots); return; }

  const buttons = slots.map(s => Markup.button.callback(`${s.slot_date} ${s.slot_time}`, `slot_${s.id}`));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 3) rows.push(buttons.slice(i, i + 3));
  await ctx.editMessageText(`${service.icon} ${service[lang]}\n\n${TEXTS[lang].chooseTime}`, Markup.inlineKeyboard(rows));
});

// ─── Выбор времени → просим телефон ───────────────────────
bot.action(/slot_(\d+)/, async (ctx) => {
  const state = userState[ctx.from.id];
  if (!state?.lang) { await ctx.answerCbQuery(); return; }
  const lang = state.lang;
  const slot = db.getSlotById(parseInt(ctx.match[1]));
  if (!slot || slot.is_booked) { await ctx.editMessageText(TEXTS[lang].slotTaken); return; }

  userState[ctx.from.id] = { ...state, slotId: slot.id };
  await ctx.answerCbQuery();
  await ctx.reply(TEXTS[lang].askPhone,
    Markup.keyboard([[Markup.button.contactRequest(TEXTS[lang].phoneBtn)]]).resize().oneTime()
  );
});

// ─── Получили телефон → финальная запись ──────────────────
bot.on('contact', async (ctx) => {
  const state = userState[ctx.from.id];
  if (!state?.slotId) return;
  const lang = state.lang || 'ru';
  const t = TEXTS[lang];
  const phone = ctx.message.contact.phone_number;

  db.savePhone(ctx.from.id, phone);
  const patient = db.upsertPatient(ctx.from.id, `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim());
  const result = db.bookSlot(state.slotId, patient.id, state.service);

  if (!result) {
    await ctx.reply(t.slotTaken, Markup.removeKeyboard());
    return;
  }

  await ctx.reply(t.booked(result.slot_date, result.slot_time, state.service), Markup.removeKeyboard());

  if (ADMIN_CHAT_ID) {
    bot.telegram.sendMessage(ADMIN_CHAT_ID,
      `📋 Новая запись!\n\nПациент: ${ctx.from.first_name || ''} ${ctx.from.last_name || ''}\nТелефон: ${phone}\nУслуга: ${state.service}\nВремя: ${result.slot_date}, ${result.slot_time}\nTelegram: @${ctx.from.username || '—'}`
    ).catch(() => {});
  }

  delete userState[ctx.from.id];
});

// ─── /cancel ──────────────────────────────────────────────
bot.command('cancel', async (ctx) => {
  const patient = db.upsertPatient(ctx.from.id, ctx.from.first_name || '');
  const lang = userState[ctx.from.id]?.lang || 'ru';
  const t = TEXTS[lang];
  const appt = db.getNextAppointment(patient.id);
  if (!appt) { ctx.reply(t.cancelNone); return; }
  db.cancelAppointment(appt.id);
  ctx.reply(t.cancelDone(appt.slot_date, appt.slot_time));
});

// ─── /appointments (только для врача) ────────────────────
bot.command('appointments', (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_CHAT_ID)) { ctx.reply('Команда доступна только администратору.'); return; }
  const list = db.getAllAppointments();
  if (!list.length) { ctx.reply('Записей пока нет.'); return; }
  const text = list.slice(0, 20).map(a =>
    `${a.slot_date} ${a.slot_time} — ${a.name} (${a.phone || '—'})\n${a.service} [${a.status}]`
  ).join('\n\n');
  ctx.reply(text);
});

// ─── Напоминания — каждый час проверяем записи ───────────
cron.schedule('0 * * * *', async () => {
  const upcoming = db.getAppointmentsInTwoHours();
  for (const appt of upcoming) {
    if (!appt.telegram_id) continue;
    const lang = 'ru'; // напоминание на русском, можно хранить язык пациента в БД
    try {
      await bot.telegram.sendMessage(appt.telegram_id, TEXTS[lang].reminder(appt.slot_date, appt.slot_time, appt.service));
    } catch (e) { /* пациент заблокировал бота */ }
  }
});

bot.launch();
console.log(`Bot ishga tushdi / Бот запущен: ${CLINIC_NAME}`);
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
