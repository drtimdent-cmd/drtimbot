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
  { id: 'consult',     icon: '🩺', ru: 'Консультация врача',                         uz: 'Shifokor maslahati' },
  { id: 'filling',     icon: '🦷', ru: 'Реставрация (пломба) зуба',                  uz: 'Tish plombasi (restavratsiya)' },
  { id: 'clean',       icon: '✨', ru: 'Профессиональная чистка зубов',               uz: 'Tishlarni professional tozalash' },
  { id: 'prosthetics', icon: '👑', ru: 'Съёмное и несъёмное протезирование',          uz: 'Olinadigan va olinmaydigan protezlash' },
  { id: 'extraction',  icon: '🛠', ru: 'Удаление зубов',                              uz: 'Tishni olib tashlash' },
  { id: 'endo',        icon: '🔬', ru: 'Эндодонтическое лечение (удаление нерва)',    uz: 'Endodontik davolash (nerv olish)' },
];

const TEXTS = {
  ru: {
    welcome:      (name) => `Здравствуйте, ${name}! Добро пожаловать в ${CLINIC_NAME}.\n\nКакая услуга вам нужна?`,
    chooseDate:   'Выберите удобную дату:',
    chooseTime:   (date) => `📅 ${date}\n\nВыберите удобное время:`,
    noSlotsDate:  (date) => `❌ На ${date} свободных мест нет.\n\nПожалуйста, выберите другой день:`,
    askPhone:     'Последний шаг — поделитесь номером телефона, чтобы мы могли связаться с вами при необходимости:',
    phoneBtn:     '📱 Отправить номер телефона',
    noSlots:      'Сейчас нет свободных дней. Попробуйте позже или позвоните в клинику.',
    booked:       (date, time, service) => `✅ Вы записаны!\n\n📅 ${date}, ${time}\n💊 ${service}\n🏥 ${CLINIC_NAME}\n\nМы напомним вам за 2 часа до визита.`,
    reminder:     (date, time, service) => `⏰ Напоминание!\n\nСкоро у вас визит в ${CLINIC_NAME}:\n📅 ${date}, ${time}\n💊 ${service}\n\nЕсли не сможете прийти — отмените через /cancel`,
    reviewAsk:    (name) => `Здравствуйте, ${name}! 😊\n\nКак прошёл ваш визит в ${CLINIC_NAME}?\n\nПоставьте оценку:`,
    reviewThanks: (rating) => `Спасибо за оценку ${rating}⭐! Ваше мнение очень важно для нас. Ждём вас снова! 🦷`,
    reviewComment:'Хотите оставить комментарий? Напишите его или нажмите "Пропустить":',
    reviewSkip:   'Пропустить',
    rebooking:    (name) => `Здравствуйте, ${name}! 👋\n\nПрошло 6 месяцев с вашего последнего визита в ${CLINIC_NAME}.\n\nРекомендуем пройти профилактический осмотр — это займёт всего 30 минут и поможет сохранить здоровье зубов! 🦷\n\nЗаписаться: /start`,
    aiConsultBtn: '🤖 ИИ-консультация',
    aiAsk:        'Опишите свою проблему или симптомы как можно подробнее, и я дам предварительную рекомендацию:\n\n_(Например: болит зуб справа, боль при жевании, началась 3 дня назад)_',
    aiThinking:   '🤔 Анализирую симптомы...',
    aiError:      'Не удалось получить ответ. Пожалуйста, позвоните в клинику напрямую.',
    aiBooking:    '\n\n📅 Хотите записаться на приём?',
    aiBookBtn:    '✅ Записаться',
    aiSkipBtn:    'Не сейчас',
    cancelDone:   (date, time) => `❌ Запись на ${date} в ${time} отменена. Если хотите записаться снова — /start`,
    cancelNone:   'У вас нет активных записей. Записаться — /start',
    waitlistBtn:  '🔔 Встать в список ожидания',
    waitlistAdded:'✅ Вы в списке ожидания! Как только освободится место, мы сразу пришлём вам уведомление.',
    waitlistAlready:'Вы уже в списке ожидания. Как только появится место — сообщим!',
    waitlistBtnDate:(date) => `🔔 В список ожидания на ${date}`,
    waitlistAddedDate:(date) => `✅ Вы в списке ожидания на ${date}! Если на этот день освободится место — мы сразу пришлём вам уведомление.`,
    confirmQuestion:(date, time) => `👋 Напоминаем: завтра, ${date} в ${time}, у вас приём в ${CLINIC_NAME}.\n\nВы придёте?`,
    confirmYesBtn:  '✅ Приду',
    confirmNoBtn:   '❌ Отменить запись',
    confirmThanks:  '👍 Отлично, ждём вас! Напоминание придёт за 2 часа до приёма.',
    waitlistNotify:(date, time) => `🔔 Хорошая новость! Освободилось место в ${CLINIC_NAME}:\n\n📅 ${date}, ${time}\n\nЧтобы записаться, нажмите /start и выберите это время. Поторопитесь — место могут занять!`,
    slotTaken:    'К сожалению, это время уже заняли. Выберите другое.',
  },
  uz: {
    welcome:      (name) => `Salom, ${name}! ${CLINIC_NAME} klinikasiga xush kelibsiz.\n\nQaysi xizmat kerak?`,
    chooseDate:   'Qulay kunni tanlang:',
    chooseTime:   (date) => `📅 ${date}\n\nQulay vaqtni tanlang:`,
    noSlotsDate:  (date) => `❌ ${date} kuni bo'sh joy yo'q.\n\nIltimos, boshqa kun tanlang:`,
    askPhone:     "Oxirgi qadam — telefon raqamingizni yuboring, kerak bo'lganda siz bilan bog'lanamiz:",
    phoneBtn:     '📱 Telefon raqamini yuborish',
    noSlots:      "Hozircha bo'sh kunlar yo'q. Iltimos keyinroq urinib ko'ring yoki klinikaga qo'ng'iroq qiling.",
    booked:       (date, time, service) => `✅ Siz yozildingiz!\n\n📅 ${date}, ${time}\n💊 ${service}\n🏥 ${CLINIC_NAME}\n\nUchrashuvdan 2 soat oldin eslatma yuboriladi.`,
    reminder:     (date, time, service) => `⏰ Eslatma!\n\n${CLINIC_NAME} klinikasiga yozilgansiz:\n📅 ${date}, ${time}\n💊 ${service}\n\nKela olmasangiz — /cancel orqali bekor qiling`,
    reviewAsk:    (name) => `Salom, ${name}! 😊\n\n${CLINIC_NAME} klinikasiga tashrif qanday o'tdi?\n\nBaho bering:`,
    reviewThanks: (rating) => `${rating}⭐ baho uchun rahmat! Fikringiz biz uchun juda muhim. Yana kutib qolamiz! 🦷`,
    reviewComment:"Izoh qoldirmoqchimisiz? Yozing yoki 'O'tkazib yuborish' tugmasini bosing:",
    reviewSkip:   "O'tkazib yuborish",
    rebooking:    (name) => `Salom, ${name}! 👋\n\n${CLINIC_NAME} klinikasiga oxirgi tashrifingizdan 6 oy o'tdi.\n\nProfilaktik ko'rik o'tkazishni tavsiya qilamiz — bu atigi 30 daqiqa vaqt oladi! 🦷\n\nYozilish: /start`,
    aiConsultBtn: '🤖 Sun\'iy intellekt maslahati',
    aiAsk:        'Muammo yoki belgilaringizni imkon qadar batafsil tasvirlab bering:\n\n_(Masalan: o\'ng tomonda tish og\'riyapti, chaynashda og\'riq, 3 kun oldin boshlandi)_',
    aiThinking:   '🤔 Belgilar tahlil qilinmoqda...',
    aiError:      'Javob olishning iloji bo\'lmadi. Iltimos, klinikaga to\'g\'ridan-to\'g\'ri qo\'ng\'iroq qiling.',
    aiBooking:    '\n\n📅 Qabul uchun yozilmoqchimisiz?',
    aiBookBtn:    '✅ Yozilish',
    aiSkipBtn:    'Hozir emas',
    cancelDone:   (date, time) => `❌ ${date} kuni ${time} dagi yozuv bekor qilindi. Qayta yozilish uchun — /start`,
    cancelNone:   "Sizda faol yozuvlar yo'q. Yozilish uchun — /start",
    waitlistBtn:  "🔔 Navbatga turish",
    waitlistAdded:"✅ Siz navbatdasiz! Joy bo'shashi bilan darhol xabar yuboramiz.",
    waitlistAlready:"Siz allaqachon navbatdasiz. Joy paydo bo'lishi bilan xabar beramiz!",
    waitlistBtnDate:(date) => `🔔 ${date} kuniga navbatga turish`,
    waitlistAddedDate:(date) => `✅ Siz ${date} kuni uchun navbatdasiz! Shu kunga joy bo'shasa — darhol xabar yuboramiz.`,
    confirmQuestion:(date, time) => `👋 Eslatamiz: ertaga, ${date} kuni soat ${time} da ${CLINIC_NAME} klinikasida qabulingiz bor.\n\nKelasizmi?`,
    confirmYesBtn:  '✅ Kelaman',
    confirmNoBtn:   '❌ Yozuvni bekor qilish',
    confirmThanks:  "👍 Ajoyib, sizni kutamiz! Qabuldan 2 soat oldin eslatma keladi.",
    waitlistNotify:(date, time) => `🔔 Yaxshi yangilik! ${CLINIC_NAME} klinikasida joy bo'shadi:\n\n📅 ${date}, ${time}\n\nYozilish uchun /start bosing va shu vaqtni tanlang. Shoshiling — joyni band qilishlari mumkin!`,
    slotTaken:    "Kechirasiz, bu vaqt band qilindi. Boshqa vaqtni tanlang.",
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
  db.savePatientLang(ctx.from.id, lang);
  userState[ctx.from.id] = { lang };
  const t = TEXTS[lang];
  await ctx.editMessageText(t.welcome(name),
    Markup.inlineKeyboard([
      ...SERVICES.map(s => [Markup.button.callback(`${s.icon} ${s[lang]}`, `service_${s.id}`)]),
      [Markup.button.callback(t.aiConsultBtn, 'ai_consult')],
    ])
  );
});

// ─── Выбор услуги → показываем доступные ДАТЫ ─────────────
bot.action(/service_(.+)/, async (ctx) => {
  const state = userState[ctx.from.id];
  if (!state?.lang) { await ctx.answerCbQuery(); return; }
  const lang = state.lang;
  const service = SERVICES.find(s => s.id === ctx.match[1]);
  userState[ctx.from.id] = { lang, service: service[lang], serviceIcon: service.icon, serviceId: service.id };

  const buttons = buildDateButtons();
  if (!buttons.length) {
    await ctx.editMessageText(TEXTS[lang].noSlots,
      Markup.inlineKeyboard([[Markup.button.callback(TEXTS[lang].waitlistBtn, 'waitlist_join')]])
    );
    return;
  }

  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push([Markup.button.callback('⬅️ Назад / Orqaga', 'back_to_services')]);

  await ctx.editMessageText(
    `${service.icon} ${service[lang]}

${TEXTS[lang].chooseDate}`,
    Markup.inlineKeyboard(rows)
  );
});

// Кнопки дат: свободные дни — обычные, полностью занятые — с 🔒
function buildDateButtons() {
  return db.getDatesWithStatus().map(d => Markup.button.callback(
    d.has_free ? db.formatDate(d.slot_date) : `🔒 ${db.formatDate(d.slot_date)}`,
    `date_${d.slot_date}`
  ));
}

// ─── Список ожидания: пациент встаёт в очередь ────────────
bot.action('waitlist_join', async (ctx) => {
  const state = userState[ctx.from.id];
  const lang = state?.lang || 'ru';
  const t = TEXTS[lang];
  const patient = db.upsertPatient(ctx.from.id, `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim());
  const existing = db.addToWaitingList(patient.id, state?.service || '', lang, null);
  await ctx.answerCbQuery();
  await ctx.editMessageText(existing ? t.waitlistAlready : t.waitlistAdded);
});

// Очередь на конкретный день
bot.action(/wljoin_(.+)/, async (ctx) => {
  const dateStr = ctx.match[1];
  const state = userState[ctx.from.id];
  const lang = state?.lang || 'ru';
  const t = TEXTS[lang];
  const patient = db.upsertPatient(ctx.from.id, `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim());
  db.addToWaitingList(patient.id, state?.service || '', lang, dateStr);
  await ctx.answerCbQuery();
  await ctx.editMessageText(t.waitlistAddedDate(db.formatDate(dateStr)));
});

// Пациент подтвердил завтрашний визит
bot.action(/apptconfirm_(\d+)/, async (ctx) => {
  const appt = db.getAppointmentWithPatient(parseInt(ctx.match[1]));
  const lang = userState[ctx.from.id]?.lang || (appt && appt.lang) || 'ru';
  if (appt && appt.status === 'booked') db.markConfirmed(appt.id);
  await ctx.answerCbQuery();
  await ctx.editMessageText(TEXTS[lang === 'uz' ? 'uz' : 'ru'].confirmThanks);
});

// Пациент отменил запись из вечернего напоминания
bot.action(/apptcancel_(\d+)/, async (ctx) => {
  const appt = db.getAppointmentWithPatient(parseInt(ctx.match[1]));
  const lang0 = userState[ctx.from.id]?.lang || 'ru';
  const t = TEXTS[lang0];
  await ctx.answerCbQuery();
  if (!appt || appt.status !== 'booked') { await ctx.editMessageText(t.cancelNone); return; }
  db.cancelAppointment(appt.id);
  await ctx.editMessageText(t.cancelDone(db.formatDate(appt.slot_date), appt.slot_time));
  if (ADMIN_CHAT_ID) {
    bot.telegram.sendMessage(ADMIN_CHAT_ID,
      `❌ Пациент отменил запись (из напоминания):\n${appt.name || 'Без имени'} (${appt.phone || '—'}) — ${db.formatDate(appt.slot_date)}, ${appt.slot_time}\n${appt.service}`
    ).catch(() => {});
  }
  if (!db.isDateBlocked(appt.slot_date)) notifyWaitingList(appt.slot_date, appt.slot_time);
});

// Уведомить первого в очереди об освободившемся месте
async function notifyWaitingList(slotDate, slotTime) {
  const first = db.getFirstInWaitingList(slotDate);
  if (!first || !first.telegram_id) return;
  const lang = first.lang === 'uz' ? 'uz' : 'ru';
  try {
    await bot.telegram.sendMessage(first.telegram_id,
      TEXTS[lang].waitlistNotify(db.formatDate(slotDate), slotTime)
    );
    db.removeFromWaitingList(first.patient_id);
    if (ADMIN_CHAT_ID) {
      bot.telegram.sendMessage(ADMIN_CHAT_ID,
        `🔔 Пациенту из списка ожидания (${first.name || 'без имени'}) отправлено предложение занять ${db.formatDate(slotDate)}, ${slotTime}`
      ).catch(() => {});
    }
  } catch (e) {
    // пациент заблокировал бота — убираем из очереди и пробуем следующего
    db.removeFromWaitingList(first.patient_id);
    return notifyWaitingList(slotDate, slotTime);
  }
}

// ─── ИИ-консультация ──────────────────────────────────────
bot.action('ai_consult', async (ctx) => {
  const state = userState[ctx.from.id];
  const lang = state?.lang || 'ru';
  userState[ctx.from.id] = { ...state, waitingForSymptoms: true };
  await ctx.editMessageText(TEXTS[lang].aiAsk, { parse_mode: 'Markdown' });
});

bot.action('ai_book', async (ctx) => {
  const state = userState[ctx.from.id];
  const lang = state?.lang || 'ru';
  userState[ctx.from.id] = { lang };
  const buttons = buildDateButtons();
  if (!buttons.length) {
    await ctx.editMessageText(TEXTS[lang].noSlots,
      Markup.inlineKeyboard([[Markup.button.callback(TEXTS[lang].waitlistBtn, 'waitlist_join')]])
    );
    return;
  }
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push([Markup.button.callback('⬅️ Назад / Orqaga', 'back_to_services')]);
  await ctx.editMessageText(TEXTS[lang].chooseDate, Markup.inlineKeyboard(rows));
});

bot.action('ai_skip', async (ctx) => {
  const lang = userState[ctx.from.id]?.lang || 'ru';
  userState[ctx.from.id] = { lang };
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
});

async function askClaude(symptoms, lang) {
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) {
    console.log('GROQ_API_KEY не задан');
    return null;
  }
  console.log('Запрос к Groq, длина симптомов:', symptoms.length);

  const systemPrompt = lang === 'ru'
    ? `Ты помощник стоматологической клиники "${CLINIC_NAME}" в Узбекистане. Пациент описывает симптомы, ты даёшь краткую (3-5 предложений) предварительную рекомендацию.

Строгие правила:
- Отвечай ТОЛЬКО на грамотном русском языке. Не используй другие языки и выдуманные слова.
- Пиши простым, понятным языком, без сложных медицинских терминов.
- Никогда не ставь диагноз — только предположение, что это может быть, и что делать до визита.
- Всегда в конце рекомендуй записаться на приём к врачу.
- Если симптомы серьёзные (сильная боль, отёк, температура, кровотечение) — рекомендуй срочный визит.
- Если сообщение пациента не про зубы и полость рта — вежливо скажи, что можешь помочь только со стоматологическими вопросами.`
    : `Siz O'zbekistondagi "${CLINIC_NAME}" stomatologiya klinikasining yordamchisisiz. Bemor belgilarini tasvirlab beradi, siz qisqa (3-5 gap) dastlabki tavsiya berasiz.

Qat'iy qoidalar:
- FAQAT sof va toza o'zbek tilida (lotin yozuvida) javob bering. Boshqa tillarni va mavjud bo'lmagan so'zlarni ishlatmang.
- Oddiy, tushunarli tilda yozing, murakkab tibbiy atamalarsiz.
- Hech qachon tashxis qo'ymang — faqat bu nima bo'lishi mumkinligi va shifokorga borgunga qadar nima qilish kerakligi haqida ayting.
- Har doim oxirida shifokor qabuliga yozilishni tavsiya qiling.
- Belgilar jiddiy bo'lsa (kuchli og'riq, shish, harorat, qon ketishi) — shoshilinch tashrifni tavsiya qiling.
- Agar bemorning xabari tish va og'iz bo'shlig'iga oid bo'lmasa — muloyimlik bilan faqat stomatologik savollarga yordam bera olishingizni ayting.`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: symptoms },
        ],
        max_tokens: 500,
        temperature: 0.4,
      }),
    });
    const data = await res.json();
    console.log('Groq статус:', res.status);
    console.log('Groq ответ:', JSON.stringify(data).slice(0, 200));
    return data.choices?.[0]?.message?.content || null;
  } catch(e) {
    console.log('Groq ошибка:', e.message);
    return null;
  }
}

// ─── Назад к списку услуг ─────────────────────────────────
bot.action('back_to_services', async (ctx) => {
  const state = userState[ctx.from.id];
  const lang = state?.lang || 'ru';
  const name = ctx.from.first_name || (lang === 'ru' ? 'Гость' : 'Mehmon');
  await ctx.editMessageText(TEXTS[lang].welcome(name),
    Markup.inlineKeyboard(SERVICES.map(s => [Markup.button.callback(`${s.icon} ${s[lang]}`, `service_${s.id}`)]))
  );
});

// ─── Назад к списку дат ───────────────────────────────────
bot.action(/back_to_dates_(.+)/, async (ctx) => {
  const serviceId = ctx.match[1];
  const state = userState[ctx.from.id];
  const lang = state?.lang || 'ru';
  const service = SERVICES.find(s => s.id === serviceId);
  const buttons = buildDateButtons();
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push([Markup.button.callback('⬅️ Назад / Orqaga', 'back_to_services')]);
  await ctx.editMessageText(
    `${service.icon} ${service[lang]}

${TEXTS[lang].chooseDate}`,
    Markup.inlineKeyboard(rows)
  );
});

// ─── Выбор даты → показываем ВРЕМЯ на этот день ───────────
bot.action(/date_(.+)/, async (ctx) => {
  const state = userState[ctx.from.id];
  if (!state?.lang) { await ctx.answerCbQuery(); return; }
  const lang = state.lang;
  const dateStr = ctx.match[1]; // YYYY-MM-DD

  const slots = db.getSlotsByDate(dateStr);
  const formattedDate = db.formatDate(dateStr);

  if (!slots.length) {
    // На этот день мест нет — предлагаем очередь на этот день + другие даты
    const others = buildDateButtons().filter(b => b.callback_data !== `date_${dateStr}`);
    const rows = [[Markup.button.callback(TEXTS[lang].waitlistBtnDate(formattedDate), `wljoin_${dateStr}`)]];
    for (let i = 0; i < others.length; i += 2) rows.push(others.slice(i, i + 2));
    await ctx.editMessageText(TEXTS[lang].noSlotsDate(formattedDate), Markup.inlineKeyboard(rows));
    return;
  }

  // Показываем время в 24-часовом формате (09:00, 10:00 и т.д.)
  const buttons = slots.map(s => Markup.button.callback(s.slot_time, `slot_${s.id}`));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 3) rows.push(buttons.slice(i, i + 3));
  rows.push([Markup.button.callback('⬅️ Назад / Orqaga', `back_to_dates_${state.serviceId}`)]);

  await ctx.editMessageText(TEXTS[lang].chooseTime(formattedDate), Markup.inlineKeyboard(rows));
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

  const formattedDate = db.formatDate(result.slot_date);
  await ctx.reply(t.booked(formattedDate, result.slot_time, state.service), Markup.removeKeyboard());

  if (ADMIN_CHAT_ID) {
    bot.telegram.sendMessage(ADMIN_CHAT_ID,
      `📋 Новая запись!\n\nПациент: ${ctx.from.first_name || ''} ${ctx.from.last_name || ''}\nТелефон: ${phone}\nУслуга: ${state.service}\nВремя: ${formattedDate}, ${result.slot_time}\nTelegram: @${ctx.from.username || '—'}`
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
  ctx.reply(t.cancelDone(db.formatDate(appt.slot_date), appt.slot_time));
  if (ADMIN_CHAT_ID) {
    bot.telegram.sendMessage(ADMIN_CHAT_ID,
      `❌ Пациент отменил запись:\n${ctx.from.first_name || ''} ${ctx.from.last_name || ''} — ${db.formatDate(appt.slot_date)}, ${appt.slot_time}\n${appt.service}`
    ).catch(() => {});
  }
  if (!db.isDateBlocked(appt.slot_date)) notifyWaitingList(appt.slot_date, appt.slot_time);
});

// ─── /resetdb (только для врача) ──────────────────────────
bot.command('resetdb', (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_CHAT_ID)) {
    ctx.reply('Команда доступна только администратору.');
    return;
  }
  db.resetSlots();
  ctx.reply('✅ База слотов сброшена! Новые даты загружены.');
});

// ─── /admincancel (только для врача) — отмена записи пациента ──
bot.command('admincancel', (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_CHAT_ID)) { ctx.reply('Команда доступна только администратору.'); return; }
  const list = db.getUpcomingBookedAppointments();
  if (!list.length) { ctx.reply('Предстоящих записей нет.'); return; }
  const rows = list.slice(0, 20).map(a => [
    Markup.button.callback(
      `${db.formatDate(a.slot_date)} ${a.slot_time} — ${a.name || 'Без имени'}`,
      `admcancel_${a.id}`
    )
  ]);
  ctx.reply('Выберите запись, которую нужно отменить:', Markup.inlineKeyboard(rows));
});

bot.action(/admcancel_(\d+)/, async (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_CHAT_ID)) { await ctx.answerCbQuery('Только для администратора'); return; }
  const appt = db.getAppointmentWithPatient(parseInt(ctx.match[1]));
  if (!appt || appt.status !== 'booked') {
    await ctx.answerCbQuery();
    await ctx.editMessageText('Эта запись уже отменена или не найдена.');
    return;
  }

  db.cancelAppointment(appt.id);
  const formattedDate = db.formatDate(appt.slot_date);

  // Уведомляем пациента (на двух языках, т.к. язык пациента не хранится)
  if (appt.telegram_id) {
    bot.telegram.sendMessage(appt.telegram_id,
      `❌ Ваша запись в ${CLINIC_NAME} на ${formattedDate} в ${appt.slot_time} отменена клиникой.\nЗаписаться на другое время — /start\n\n❌ ${CLINIC_NAME} klinikasidagi ${formattedDate} kuni ${appt.slot_time} dagi yozuvingiz klinika tomonidan bekor qilindi.\nBoshqa vaqtga yozilish — /start`
    ).catch(() => {});
  }

  await ctx.answerCbQuery('Отменено');
  await ctx.editMessageText(
    `✅ Запись отменена:\n${formattedDate}, ${appt.slot_time} — ${appt.name || 'Без имени'} (${appt.phone || '—'})\n${appt.service}\n\nСлот снова свободен, пациент получил уведомление.`
  );
  notifyWaitingList(appt.slot_date, appt.slot_time);
});

// ─── /today (только для врача) — записи на сегодня ───────
function todayScheduleText() {
  const list = db.getTodaysAppointments();
  if (!list.length) return '📅 На сегодня записей нет.';
  const lines = list.map(a =>
    `${a.slot_time} — ${a.name || 'Без имени'} (${a.phone || '—'})\n   ${a.service}${a.confirmed ? ' ✅ подтвердил' : ''}`
  );
  return `📅 Записи на сегодня (${list.length}):\n\n${lines.join('\n\n')}`;
}

bot.command('today', (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_CHAT_ID)) { ctx.reply('Команда доступна только администратору.'); return; }
  ctx.reply(todayScheduleText());
});

// ─── /dayoff и /dayon (только для врача) — закрыть/открыть день ──
bot.command('dayoff', (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_CHAT_ID)) { ctx.reply('Команда доступна только администратору.'); return; }
  const dates = db.getDatesWithStatus();
  if (!dates.length) { ctx.reply('Открытых дней в расписании нет.'); return; }
  const rows = dates.map(d => [Markup.button.callback(db.formatDate(d.slot_date), `dayoff_${d.slot_date}`)]);
  ctx.reply('Какой день закрыть для записи?', Markup.inlineKeyboard(rows));
});

bot.action(/dayoff_(.+)/, async (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_CHAT_ID)) { await ctx.answerCbQuery('Только для администратора'); return; }
  const dateStr = ctx.match[1];
  const { bookedLeft } = db.blockDate(dateStr);
  await ctx.answerCbQuery('День закрыт');
  let msg = `🚫 ${db.formatDate(dateStr)} закрыт для записи — пациенты этот день больше не видят.`;
  if (bookedLeft > 0) msg += `\n\n⚠️ На этот день уже есть записей: ${bookedLeft}. Отмените их через /admincancel — пациенты получат уведомления.`;
  msg += `\n\nОткрыть день обратно — /dayon`;
  await ctx.editMessageText(msg);
});

bot.command('dayon', (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_CHAT_ID)) { ctx.reply('Команда доступна только администратору.'); return; }
  const dates = db.getBlockedDates();
  if (!dates.length) { ctx.reply('Закрытых дней нет.'); return; }
  const rows = dates.map(d => [Markup.button.callback(db.formatDate(d), `dayon_${d}`)]);
  ctx.reply('Какой день открыть для записи?', Markup.inlineKeyboard(rows));
});

bot.action(/dayon_(.+)/, async (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_CHAT_ID)) { await ctx.answerCbQuery('Только для администратора'); return; }
  const dateStr = ctx.match[1];
  db.unblockDate(dateStr);
  await ctx.answerCbQuery('День открыт');
  await ctx.editMessageText(`✅ ${db.formatDate(dateStr)} снова открыт для записи.`);
});

// ─── /export (только для врача) — данные в Excel (CSV) ──
function toCsv(rows) {
  const escape = (v) => {
    const s = String(v == null ? '' : v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '\uFEFF' + rows.map(r => r.map(escape).join(';')).join('\r\n');
}

bot.command('export', async (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_CHAT_ID)) { ctx.reply('Команда доступна только администратору.'); return; }
  try {
    const today = db.tashkentToday();

    const patients = db.getAllPatients();
    const pRows = [['Имя', 'Телефон', 'Язык', 'Дата добавления']];
    for (const p of patients) pRows.push([p.name, p.phone, p.lang === 'uz' ? 'узбекский' : 'русский', (p.created_at || '').slice(0, 10)]);

    const appts = db.getAllAppointments();
    const aRows = [['Дата', 'Время', 'Пациент', 'Телефон', 'Услуга', 'Статус', 'Подтвердил', 'Создана']];
    for (const a of appts) aRows.push([
      a.slot_date, a.slot_time, a.name, a.phone, a.service,
      a.status === 'cancelled' ? 'отменена' : 'активна',
      a.confirmed ? 'да' : '', (a.created_at || '').slice(0, 16).replace('T', ' ')
    ]);

    const fs = require('fs');
    fs.writeFileSync('/tmp/patients.csv', toCsv(pRows));
    fs.writeFileSync('/tmp/appointments.csv', toCsv(aRows));

    await ctx.replyWithDocument({ source: '/tmp/patients.csv', filename: `пациенты-${today}.csv` });
    await ctx.replyWithDocument({ source: '/tmp/appointments.csv', filename: `записи-${today}.csv` },
      { caption: 'Оба файла открываются в Excel двойным щелчком.' });
  } catch (e) {
    ctx.reply('Не удалось сделать экспорт: ' + e.message);
  }
});

// ─── /backup (только для врача) — копия базы в Telegram ──
async function sendBackup(chatId) {
  const dest = '/tmp/clinic-backup.db';
  await db.backupTo(dest);
  const c = db.getDbCounts();
  const today = db.tashkentToday();
  await bot.telegram.sendDocument(chatId,
    { source: dest, filename: `clinic-backup-${today}.db` },
    { caption: `💾 Резервная копия базы за ${today}\nПациентов: ${c.patients} | Записей: ${c.appointments} | Отзывов: ${c.reviews}\n\nСохраните файл — по нему можно полностью восстановить данные.` }
  );
}

bot.command('backup', async (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_CHAT_ID)) { ctx.reply('Команда доступна только администратору.'); return; }
  try {
    await sendBackup(ctx.chat.id);
  } catch (e) {
    ctx.reply('Не удалось создать бэкап: ' + e.message);
  }
});

// ─── /slots (только для врача) — диагностика расписания ──
bot.command('slots', (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_CHAT_ID)) { ctx.reply('Команда доступна только администратору.'); return; }
  const s = db.getSlotsDiagnostics();
  const datesList = s.freeDates.length ? s.freeDates.map(d => db.formatDate(d)).join('\n') : '— нет —';
  ctx.reply(
    `🔍 Диагностика расписания:\n\n` +
    `Всего слотов в базе: ${s.total}\n` +
    `Свободных: ${s.free}\n` +
    `Занятых: ${s.booked}\n\n` +
    `Даты со свободными местами (${s.freeDates.length}):\n${datesList}`
  );
});

// ─── /appointments (только для врача) ────────────────────
bot.command('appointments', (ctx) => {
  if (String(ctx.from.id) !== String(ADMIN_CHAT_ID)) { ctx.reply('Команда доступна только администратору.'); return; }
  const list = db.getAllAppointments();
  if (!list.length) { ctx.reply('Записей пока нет.'); return; }
  const text = list.slice(0, 20).map(a =>
    `${db.formatDate(a.slot_date)} ${a.slot_time} — ${a.name} (${a.phone || '—'})\n${a.service} [${a.status}]`
  ).join('\n\n');
  ctx.reply(text);
});

// ─── Оценка после визита ──────────────────────────────────
bot.action(/review_(\d+)_(\d+)/, async (ctx) => {
  const rating = parseInt(ctx.match[1]);
  const appointmentId = parseInt(ctx.match[2]);
  const lang = userState[ctx.from.id]?.lang || 'ru';
  const t = TEXTS[lang];
  const patient = db.upsertPatient(ctx.from.id, ctx.from.first_name || '');

  db.saveReview(patient.id, appointmentId, rating, '');
  userState[ctx.from.id] = { ...userState[ctx.from.id], reviewApptId: appointmentId };

  await ctx.editMessageText(t.reviewComment,
    Markup.inlineKeyboard([[Markup.button.callback(t.reviewSkip, `review_skip_${appointmentId}`)]])
  );

  if (ADMIN_CHAT_ID) {
    bot.telegram.sendMessage(ADMIN_CHAT_ID,
      `⭐ Новый отзыв!\n\nПациент: ${ctx.from.first_name || ''}\nОценка: ${rating}/5`
    ).catch(() => {});
  }
});

bot.action(/review_skip_(\d+)/, async (ctx) => {
  const lang = userState[ctx.from.id]?.lang || 'ru';
  const rating = userState[ctx.from.id]?.lastRating || 5;
  await ctx.editMessageText(TEXTS[lang].reviewThanks(rating));
  delete userState[ctx.from.id];
});

// Текстовые сообщения — симптомы или комментарий к отзыву
bot.on('text', async (ctx) => {
  const state = userState[ctx.from.id];
  const lang = state?.lang || 'ru';
  const t = TEXTS[lang];

  // ИИ-консультация по симптомам
  if (state?.waitingForSymptoms) {
    userState[ctx.from.id] = { ...state, waitingForSymptoms: false };
    const thinking = await ctx.reply(t.aiThinking);
    const answer = await askClaude(ctx.message.text, lang);
    try { await ctx.telegram.deleteMessage(ctx.chat.id, thinking.message_id); } catch(e) {}

    if (!answer) {
      await ctx.reply(t.aiError);
      return;
    }

    await ctx.reply(answer + t.aiBooking,
      Markup.inlineKeyboard([
        [Markup.button.callback(t.aiBookBtn, 'ai_book')],
        [Markup.button.callback(t.aiSkipBtn, 'ai_skip')],
      ])
    );
    return;
  }

  // Комментарий к отзыву
  if (state?.reviewApptId) {
    const patient = db.upsertPatient(ctx.from.id, ctx.from.first_name || '');
    const review = db.getReviewByAppointment(state.reviewApptId);
    if (review) db.saveReview(patient.id, state.reviewApptId, review.rating, ctx.message.text);
    await ctx.reply(t.reviewThanks(review?.rating || 5));
    if (ADMIN_CHAT_ID && ctx.message.text) {
      bot.telegram.sendMessage(ADMIN_CHAT_ID,
        `💬 Комментарий к отзыву от ${ctx.from.first_name || ''}:\n"${ctx.message.text}"`
      ).catch(() => {});
    }
    delete userState[ctx.from.id];
  }
});

// ─── Каждый день в 10:00 (Ташкент) — запрос отзыва после вчерашних визитов ──
cron.schedule('0 10 * * *', async () => {
  const visits = db.getVisitsForReview();
  for (const v of visits) {
    if (!v.telegram_id) continue;
    try {
      await bot.telegram.sendMessage(v.telegram_id,
        TEXTS['ru'].reviewAsk(v.name || ''),
        Markup.inlineKeyboard([[
          Markup.button.callback('⭐ 1', `review_1_${v.id}`),
          Markup.button.callback('⭐ 2', `review_2_${v.id}`),
          Markup.button.callback('⭐ 3', `review_3_${v.id}`),
          Markup.button.callback('⭐ 4', `review_4_${v.id}`),
          Markup.button.callback('⭐ 5', `review_5_${v.id}`),
        ]])
      );
      db.markReviewSent(v.id);
    } catch(e) { /* пациент заблокировал бота */ }
  }
}, { timezone: 'Asia/Tashkent' });

// ─── Каждый день в 11:00 (Ташкент) — напоминание о повторном визите через 6 месяцев ──
cron.schedule('0 11 * * *', async () => {
  const patients = db.getPatientsForRebooking();
  for (const p of patients) {
    if (!p.telegram_id) continue;
    try {
      await bot.telegram.sendMessage(p.telegram_id, TEXTS['ru'].rebooking(p.name || ''));
    } catch(e) { /* пациент заблокировал бота */ }
  }
}, { timezone: 'Asia/Tashkent' });

// ─── Каждый день в полночь (Ташкент) — удаляем прошедшие слоты ─────
cron.schedule('0 0 * * *', () => {
  db.deleteOldSlots();
  db.refillSlots();
  console.log('Старые слоты удалены, расписание обновлено');
}, { timezone: 'Asia/Tashkent' });

// ─── Каждое воскресенье в полночь (Ташкент) — пополняем расписание ──
cron.schedule('0 0 * * 0', () => {
  db.refillSlots();
  console.log('Расписание пополнено на следующие 14 дней');
}, { timezone: 'Asia/Tashkent' });

// ─── Каждый понедельник в 09:00 (Ташкент) — недельный отчёт врачу ──
cron.schedule('0 9 * * 1', async () => {
  if (!ADMIN_CHAT_ID) return;
  const s = db.getWeeklyStats();
  const services = s.topServices.length
    ? s.topServices.map((x, i) => `${i + 1}. ${x.service} — ${x.c}`).join('\n')
    : 'нет данных';
  const rating = s.avgRating?.c ? `${s.avgRating.r}⭐ (${s.avgRating.c} отзывов)` : 'отзывов не было';

  const text =
    `📊 Отчёт за неделю — ${CLINIC_NAME}\n\n` +
    `📝 Новых записей: ${s.created}\n` +
    `✅ Состоявшихся визитов: ${s.held}\n` +
    `❌ Отмен: ${s.cancelled}\n` +
    `📅 Записей на предстоящую неделю: ${s.upcoming}\n` +
    `🔔 В списке ожидания: ${s.waiting}\n\n` +
    `Популярные услуги за неделю:\n${services}\n\n` +
    `Средняя оценка: ${rating}`;

  bot.telegram.sendMessage(ADMIN_CHAT_ID, text).catch(() => {});
}, { timezone: 'Asia/Tashkent' });

// ─── Каждый день в 19:00 (Ташкент) — просим подтвердить завтрашний визит ──
cron.schedule('0 19 * * *', async () => {
  const list = db.getTomorrowsUnconfirmed();
  for (const a of list) {
    const lang = a.lang === 'uz' ? 'uz' : 'ru';
    const t = TEXTS[lang];
    try {
      await bot.telegram.sendMessage(a.telegram_id,
        t.confirmQuestion(db.formatDate(a.slot_date), a.slot_time),
        Markup.inlineKeyboard([
          [Markup.button.callback(t.confirmYesBtn, `apptconfirm_${a.id}`)],
          [Markup.button.callback(t.confirmNoBtn, `apptcancel_${a.id}`)],
        ])
      );
      db.markConfirmSent(a.id);
    } catch (e) { db.markConfirmSent(a.id); /* пациент заблокировал бота */ }
  }
}, { timezone: 'Asia/Tashkent' });

// ─── Каждый день в 08:00 (Ташкент) — расписание дня врачу ──
cron.schedule('0 8 * * *', () => {
  if (!ADMIN_CHAT_ID) return;
  const list = db.getTodaysAppointments();
  if (!list.length) return; // пустой день — не беспокоим
  bot.telegram.sendMessage(ADMIN_CHAT_ID, todayScheduleText()).catch(() => {});
}, { timezone: 'Asia/Tashkent' });

// ─── Каждое воскресенье в 20:00 (Ташкент) — автобэкап базы врачу ──
cron.schedule('0 20 * * 0', () => {
  if (!ADMIN_CHAT_ID) return;
  sendBackup(ADMIN_CHAT_ID).catch((e) => console.log('Ошибка автобэкапа:', e.message));
}, { timezone: 'Asia/Tashkent' });

// ─── Напоминания — каждый час ─────────────────────────────
cron.schedule('0 * * * *', async () => {
  const upcoming = db.getAppointmentsInTwoHours();
  for (const appt of upcoming) {
    if (!appt.telegram_id) continue;
    try {
      await bot.telegram.sendMessage(
        appt.telegram_id,
        TEXTS['ru'].reminder(db.formatDate(appt.slot_date), appt.slot_time, appt.service)
      );
      db.markReminded(appt.id);
    } catch (e) { /* пациент заблокировал бота */ }
  }
});

// ─── Меню команд (кнопка "/" рядом с полем ввода) ─────────
// Пациенты видят только start и cancel, врач — все команды
bot.telegram.setMyCommands([
  { command: 'start',  description: 'Записаться на приём / Qabulga yozilish' },
  { command: 'cancel', description: 'Отменить запись / Yozuvni bekor qilish' },
]).catch((e) => console.log('Не удалось задать команды:', e.message));

if (ADMIN_CHAT_ID) {
  bot.telegram.setMyCommands([
    { command: 'start',        description: 'Записаться на приём' },
    { command: 'cancel',       description: 'Отменить свою запись' },
    { command: 'today',        description: 'Записи на сегодня' },
    { command: 'appointments', description: 'Список всех записей' },
    { command: 'admincancel',  description: 'Отменить запись пациента' },
    { command: 'dayoff',       description: 'Закрыть день (выходной)' },
    { command: 'dayon',        description: 'Открыть закрытый день' },
    { command: 'export',       description: 'Выгрузить данные в Excel' },
    { command: 'backup',       description: 'Скачать копию базы' },
    { command: 'slots',        description: 'Диагностика расписания' },
    { command: 'resetdb',      description: 'Сбросить слоты расписания' },
  ], { scope: { type: 'chat', chat_id: Number(ADMIN_CHAT_ID) } })
    .catch((e) => console.log('Не удалось задать команды админа:', e.message));
}

bot.launch();

// Веб-панель (тот же сервис, та же база)
require('./panel').startPanel();
console.log(`Bot ishga tushdi / Бот запущен: ${CLINIC_NAME}`);
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
