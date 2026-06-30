// index.js — Telegram-бот записи для стоматологической клиники
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./db');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CLINIC_NAME = process.env.CLINIC_NAME || 'Doctor Tim Dental';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!BOT_TOKEN) {
  console.error('Ошибка: не задан BOT_TOKEN в файле .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
db.seedSlotsIfEmpty();

// Список услуг — впиши свои цены при необходимости (поле price)
const SERVICES = [
  { id: 'filling', icon: '🦷', ru: 'Реставрация (пломба) зуба', uz: "Tish plombasi (restavratsiya)" },
  { id: 'clean', icon: '✨', ru: 'Профессиональная чистка зубов', uz: 'Tishlarni professional tozalash' },
  { id: 'prosthetics', icon: '👑', ru: 'Съёмное и несъёмное протезирование', uz: 'Olinadigan va olinmaydigan protezlash' },
  { id: 'extraction', icon: '🛠️', ru: 'Удаление зубов', uz: 'Tishni olib tashlash' },
  { id: 'endo', icon: '🩺', ru: 'Эндодонтическое лечение (удаление нерва)', uz: 'Endodontik davolash (nerv olish)' },
];

const TEXTS = {
  ru: {
    welcome: (name) => `Здравствуйте, ${name}! Добро пожаловать в ${CLINIC_NAME}.\n\nКакая услуга вам нужна?`,
    chooseTime: 'Выберите удобное время:',
    noSlots: 'Сейчас нет свободного времени. Попробуйте позже или позвоните в клинику.',
    booked: (date, time, service) => `✅ Вы записаны!\n\n${date}, ${time}\n${service}\n${CLINIC_NAME}\n\nНапоминание придёт перед визитом.`,
    slotTaken: 'К сожалению, это время уже заняли. Выберите другое.',
    restart: 'Пожалуйста, начните заново через /start',
  },
  uz: {
    welcome: (name) => `Salom, ${name}! ${CLINIC_NAME} klinikasiga xush kelibsiz.\n\nQaysi xizmat kerak?`,
    chooseTime: "Bo'sh vaqtlardan birini tanlang:",
    noSlots: "Hozircha bo'sh vaqt yo'q. Iltimos keyinroq urinib ko'ring yoki klinikaga qo'ng'iroq qiling.",
    booked: (date, time, service) => `✅ Siz yozildingiz!\n\n${date}, ${time}\n${service}\n${CLINIC_NAME}\n\nEslatma uchrashuvdan oldin yuboriladi.`,
    slotTaken: "Kechirasiz, bu vaqt band qilindi. Boshqa vaqtni tanlang.",
    restart: 'Iltimos, /start dan qaytadan boshlang',
  },
};

// временное хранилище состояния диалога (в памяти процесса)
const userState = {};

bot.start((ctx) => {
  userState[ctx.from.id] = {};
  ctx.reply(
    'Tilni tanlang / Выберите язык:',
    Markup.inlineKeyboard([
      [Markup.button.callback('🇺🇿 O\'zbekcha', 'lang_uz')],
      [Markup.button.callback('🇷🇺 Русский', 'lang_ru')],
    ])
  );
});

bot.action(/lang_(.+)/, async (ctx) => {
  const lang = ctx.match[1];
  userState[ctx.from.id] = { lang };
  const t = TEXTS[lang];
  const name = ctx.from.first_name || (lang === 'ru' ? 'Гость' : 'Mehmon');
  db.upsertPatient(ctx.from.id, `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim());

  await ctx.editMessageText(
    t.welcome(name),
    Markup.inlineKeyboard(
      SERVICES.map(s => [Markup.button.callback(`${s.icon} ${s[lang]}`, `service_${s.id}`)])
    )
  );
});

bot.action(/service_(.+)/, async (ctx) => {
  const serviceId = ctx.match[1];
  const state = userState[ctx.from.id];
  if (!state || !state.lang) {
    await ctx.answerCbQuery('Iltimos /start dan boshlang / Начните с /start');
    return;
  }
  const lang = state.lang;
  const t = TEXTS[lang];
  const service = SERVICES.find(s => s.id === serviceId);
  userState[ctx.from.id] = { lang, service: service[lang] };

  const slots = db.getAvailableSlots().slice(0, 12);
  if (slots.length === 0) {
    await ctx.editMessageText(t.noSlots);
    return;
  }

  const buttons = slots.map(s => Markup.button.callback(`${s.slot_date} ${s.slot_time}`, `slot_${s.id}`));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 3) rows.push(buttons.slice(i, i + 3));

  await ctx.editMessageText(
    `${service.icon} ${service[lang]}\n\n${t.chooseTime}`,
    Markup.inlineKeyboard(rows)
  );
});

bot.action(/slot_(\d+)/, async (ctx) => {
  const slotId = parseInt(ctx.match[1]);
  const state = userState[ctx.from.id];
  if (!state || !state.lang) {
    await ctx.answerCbQuery('Iltimos /start dan boshlang / Начните с /start');
    return;
  }
  const lang = state.lang;
  const t = TEXTS[lang];

  const patient = db.upsertPatient(ctx.from.id, `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim());
  const result = db.bookSlot(slotId, patient.id, state.service);

  if (!result) {
    await ctx.editMessageText(t.slotTaken);
    return;
  }

  await ctx.editMessageText(t.booked(result.slot_date, result.slot_time, state.service));

  if (ADMIN_CHAT_ID) {
    bot.telegram.sendMessage(
      ADMIN_CHAT_ID,
      `📋 Новая запись!\n\nПациент: ${ctx.from.first_name || ''} ${ctx.from.last_name || ''}\nУслуга: ${state.service}\nВремя: ${result.slot_date}, ${result.slot_time}\nTelegram: @${ctx.from.username || '—'}`
    ).catch(() => {});
  }

  delete userState[ctx.from.id];
});

// команда для врача — посмотреть все записи
bot.command('appointments', (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_CHAT_ID)) {
    ctx.reply('Эта команда доступна только администратору.');
    return;
  }
  const list = db.getAllAppointments();
  if (list.length === 0) {
    ctx.reply('Записей пока нет.');
    return;
  }
  const text = list.slice(0, 20).map(a =>
    `${a.slot_date} ${a.slot_time} — ${a.name} (${a.phone || 'телефон не указан'})\n${a.service}`
  ).join('\n\n');
  ctx.reply(text);
});

bot.launch();
console.log(`Bot ishga tushdi / Бот запущен: ${CLINIC_NAME}`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
