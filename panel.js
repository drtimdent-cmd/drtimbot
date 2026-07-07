// ─── Веб-панель клиники: работает внутри сервиса бота, та же база ───
const http = require('http');
const crypto = require('crypto');
const db = require('./db');

const PANEL_PASSWORD = process.env.PANEL_PASSWORD || 'drtim2024';
const PORT = process.env.PORT || 3000;

// Токены активных сессий (живут до перезапуска сервиса)
const sessions = new Set();

function isAuthed(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/panel_token=([a-f0-9]+)/);
  return m && sessions.has(m[1]);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 10000) req.destroy(); });
    req.on('end', () => resolve(data));
  });
}

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dr.Tim Dental Clinic — Панель</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .card{background:#1e293b;padding:40px;border-radius:16px;width:320px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.4)}
  h1{font-size:20px;margin:0 0 8px}.sub{color:#94a3b8;font-size:14px;margin-bottom:24px}
  input{width:100%;padding:12px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:15px;box-sizing:border-box;margin-bottom:12px}
  button{width:100%;padding:12px;border-radius:8px;border:0;background:#0ea5e9;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  button:hover{background:#0284c7}.err{color:#f87171;font-size:13px;margin-bottom:10px}
</style></head><body>
<div class="card"><h1>🦷 Dr.Tim Dental Clinic</h1><div class="sub">Панель управления</div>
<div class="err" id="err"></div>
<input type="password" id="pw" placeholder="Пароль" autofocus>
<button onclick="go()">Войти</button></div>
<script>
async function go(){
  const r = await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('pw').value})});
  if(r.ok) location.reload(); else document.getElementById('err').textContent = 'Неверный пароль';
}
document.getElementById('pw').addEventListener('keydown',e=>{if(e.key==='Enter')go()});
</script></body></html>`;

const PANEL_HTML = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dr.Tim Dental Clinic — Панель</title>
<style>
  :root{--bg:#0f172a;--card:#1e293b;--line:#334155;--text:#e2e8f0;--mut:#94a3b8;--acc:#0ea5e9}
  body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:16px}
  h1{font-size:20px;margin:4px 0 16px}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
  .stat{background:var(--card);border-radius:12px;padding:16px}
  .stat .n{font-size:26px;font-weight:700}.stat .l{color:var(--mut);font-size:13px;margin-top:4px}
  .tabs{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
  .tab{padding:8px 16px;border-radius:8px;background:var(--card);cursor:pointer;font-size:14px;border:1px solid var(--line)}
  .tab.active{background:var(--acc);border-color:var(--acc);color:#fff;font-weight:600}
  table{width:100%;border-collapse:collapse;background:var(--card);border-radius:12px;overflow:hidden;font-size:14px}
  th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--line)}
  th{color:var(--mut);font-weight:600;font-size:12px;text-transform:uppercase}
  tr:last-child td{border-bottom:0}
  .b{display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600}
  .b.ok{background:#065f46;color:#6ee7b7}.b.no{background:#7f1d1d;color:#fca5a5}.b.wait{background:#78350f;color:#fcd34d}
  .stars{color:#fbbf24}.section{display:none}.section.active{display:block}
  .refresh{float:right;color:var(--mut);font-size:13px;cursor:pointer}
  @media(max-width:600px){th,td{padding:8px 6px;font-size:13px}}
</style></head><body>
<h1>🦷 Dr.Tim Dental Clinic <span class="refresh" onclick="load()">⟳ обновить</span></h1>
<div class="stats" id="stats"></div>
<div class="tabs">
  <div class="tab active" data-s="today">Сегодня</div>
  <div class="tab" data-s="appts">Записи</div>
  <div class="tab" data-s="patients">Пациенты</div>
  <div class="tab" data-s="reviews">Отзывы</div>
</div>
<div class="section active" id="today"></div>
<div class="section" id="appts"></div>
<div class="section" id="patients"></div>
<div class="section" id="reviews"></div>
<script>
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.section').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');document.getElementById(t.dataset.s).classList.add('active');
});
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function statusBadge(a){
  if(a.status==='cancelled')return '<span class="b no">отменена</span>';
  if(a.confirmed)return '<span class="b ok">подтвердил</span>';
  return '<span class="b wait">ожидается</span>';
}
async function load(){
  const r = await fetch('/api/all'); if(!r.ok){location.reload();return}
  const d = await r.json();
  document.getElementById('stats').innerHTML =
    '<div class="stat"><div class="n">'+d.stats.patients+'</div><div class="l">Пациентов</div></div>'+
    '<div class="stat"><div class="n">'+d.stats.todayCount+'</div><div class="l">Записей сегодня</div></div>'+
    '<div class="stat"><div class="n">'+d.stats.upcoming+'</div><div class="l">Предстоящих записей</div></div>'+
    '<div class="stat"><div class="n">'+(d.stats.avgRating||'—')+'</div><div class="l">Средняя оценка</div></div>'+
    '<div class="stat"><div class="n">'+d.stats.waiting+'</div><div class="l">В списке ожидания</div></div>';
  document.getElementById('today').innerHTML = tbl(['Время','Пациент','Телефон','Услуга','Статус'],
    d.today.map(a=>[a.slot_time,esc(a.name),esc(a.phone),esc(a.service),statusBadge(a)]),'На сегодня записей нет');
  document.getElementById('appts').innerHTML = tbl(['Дата','Время','Пациент','Телефон','Услуга','Статус'],
    d.appointments.map(a=>[a.slot_date,a.slot_time,esc(a.name),esc(a.phone),esc(a.service),statusBadge(a)]),'Записей пока нет');
  document.getElementById('patients').innerHTML = tbl(['Имя','Телефон','Язык','Дата добавления'],
    d.patients.map(p=>[esc(p.name),esc(p.phone),p.lang==='uz'?'узб':'рус',(p.created_at||'').slice(0,10)]),'Пациентов пока нет');
  document.getElementById('reviews').innerHTML = tbl(['Дата','Пациент','Оценка','Комментарий'],
    d.reviews.map(v=>[(v.created_at||'').slice(0,10),esc(v.name),'<span class="stars">'+'★'.repeat(v.rating)+'</span>',esc(v.comment)]),'Отзывов пока нет');
}
function tbl(heads,rows,empty){
  if(!rows.length)return '<table><tr><td style="color:var(--mut)">'+empty+'</td></tr></table>';
  return '<table><tr>'+heads.map(h=>'<th>'+h+'</th>').join('')+'</tr>'+
    rows.map(r=>'<tr>'+r.map(c=>'<td>'+(c==null?'':c)+'</td>').join('')+'</tr>').join('')+'</table>';
}
load();
</script></body></html>`;

function startPanel() {
  const server = http.createServer(async (req, res) => {
    try {
      // ─── Вход ───
      if (req.method === 'POST' && req.url === '/login') {
        const body = await readBody(req);
        let pw = '';
        try { pw = JSON.parse(body).password || ''; } catch (e) {}
        if (pw === PANEL_PASSWORD) {
          const token = crypto.randomBytes(16).toString('hex');
          sessions.add(token);
          res.writeHead(200, { 'Set-Cookie': `panel_token=${token}; HttpOnly; Path=/; Max-Age=604800`, 'Content-Type': 'text/plain' });
          res.end('ok');
        } else {
          res.writeHead(401); res.end('wrong password');
        }
        return;
      }

      // ─── Данные для панели ───
      if (req.url === '/api/all') {
        if (!isAuthed(req)) { res.writeHead(401); res.end('unauthorized'); return; }
        const weekly = db.getWeeklyStats();
        const counts = db.getDbCounts();
        const today = db.getTodaysAppointments();
        const appointments = db.getAllAppointments().slice(0, 300);
        const patients = db.getAllPatients();
        const reviews = db.getAllReviews();
        const avg = db.getOverallRating();
        const data = {
          stats: {
            patients: counts.patients,
            todayCount: today.length,
            upcoming: weekly.upcoming,
            waiting: weekly.waiting,
            avgRating: avg ? `${avg}⭐` : null,
          },
          today, appointments, patients, reviews,
        };
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
        return;
      }

      // ─── Страница ───
      if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(isAuthed(req) ? PANEL_HTML : LOGIN_HTML);
        return;
      }

      res.writeHead(404); res.end('not found');
    } catch (e) {
      res.writeHead(500); res.end('error');
    }
  });

  server.listen(PORT, () => console.log(`Веб-панель запущена на порту ${PORT}`));
}

module.exports = { startPanel };
