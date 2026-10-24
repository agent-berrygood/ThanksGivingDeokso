import { ready, params } from './fb.js';
import { GRADES, ENCOUNTERS, ENCOUNTER_BY_KEY, SEASONS, QUIZ_REWARD } from './data.js';
import { questionOf, seasonOf, awards, simulateAllShare } from './logic.js';
import {
  watch, watchClaims, isAdmin, collectSubs, loadJoinKey, joinUrl, qrSvg,
} from './store.js';
import { $, esc, roundLabel, phaseLabel, startTicker, signed, keepLabel } from './ui.js';

const g = params.get('s') || '';
let game = null;
let classes = [];
let subs = [];
let claims = {};

const user = await ready();
if (!g || !(await isAdmin(g, user.uid))) {
  $('#stage').innerHTML = '<h2>진행자 컨트롤 화면의 "출력 창 열기" 버튼으로 열어 주세요.</h2>';
  throw new Error('not admin');
}
const key = await loadJoinKey(g);
const QR = qrSvg(joinUrl(g, key), 8);
$('#qrOverlayImg').innerHTML = QR;
watchClaims(g, key, (v) => { claims = v; if (game?.phase === 'lobby') renderStage(); });

watch(g, {
  onGame: (v) => { game = v; render(); },
  onClasses: (v) => { classes = v; render(); },
  onSubs: (v) => { subs = v; renderChips(); renderBoard(); },
  onError: (e) => { $('#stage').innerHTML = `<h2>연결 오류</h2><p class="sub">${esc(e.message)}</p>`; },
});

const openKind = () => (game?.phase === 'quiz_open' ? 'quiz' : game?.phase === 'store_open' ? 'store' : null);

function deltas() {
  const last = game?.last;
  if (!last) return {};
  if (game.phase === 'quiz_reveal' && last.quiz) return last.quiz.delta || {};
  if (game.phase === 'encounter_reveal' && last.store) {
    return Object.fromEntries(Object.entries(last.store.perClass).map(([id, p]) => [id, p.after - p.before]));
  }
  return {};
}

function renderBoard() {
  if (!classes.length) return;
  const d = deltas();
  const kind = openKind();
  const sent = kind ? collectSubs(subs, game.round, kind) : {};
  $('#board').innerHTML = GRADES.map((gr) => `
    <div class="board-row grade-${gr.key}">
      <div class="g">${gr.name}<small>${gr.school}</small></div>
      ${classes.filter((c) => c.grade === gr.key).map((c) => {
        const dv = d[c.id];
        const dHtml = dv === undefined ? '' : `<span class="delta ${dv > 0 ? 'up' : dv < 0 ? 'down' : ''}">${signed(dv)}</span>`;
        const badge = c.id in sent ? '<span class="badge">제출 ✓</span>' : '';
        return `<div class="cls${c.id in sent ? ' sent' : ''}">
          <div><div class="name">${esc(c.no)}반</div>${badge}</div>
          ${dHtml}
          <div class="fruit">${c.fruit}<small>개</small></div>
        </div>`;
      }).join('')}
    </div>`).join('');
}

function chipsHtml(mode) {
  const q = questionOf(game.round);
  const kind = mode === 'reveal' ? 'quiz' : openKind() || (game.phase === 'store_locked' ? 'store' : null);
  const sent = kind ? collectSubs(subs, game.round, kind) : {};
  return `<div class="chips" id="chips">${classes.map((c) => {
    let cls = '';
    let v = '';
    if (mode === 'reveal') {
      const a = game.last?.quiz?.answers?.[c.id];
      cls = a === q.answer ? 'right' : 'wrong';
      v = a ?? '—';
    } else if (c.id in sent) {
      cls = 'done';
      v = '✓';
    } else {
      v = '…';
    }
    return `<div class="chip grade-${c.grade} ${cls}">${esc(c.name)}<span class="v">${esc(v)}</span></div>`;
  }).join('')}</div>`;
}

function renderChips() {
  const el = $('#chips');
  if (!el || !game) return;
  const mode = game.phase === 'quiz_reveal' ? 'reveal' : 'sent';
  el.outerHTML = chipsHtml(mode);
}

function optionsHtml(q, reveal) {
  const opts = q.type === 'ox' ? [['O', 'O'], ['X', 'X']] : q.options.map((o, i) => [String(i + 1), o]);
  return `<div class="opts${q.type === 'ox' ? ' ox' : ''}">${opts.map(([k, label]) => {
    const st = reveal ? (k === q.answer ? ' correct' : ' dim') : '';
    return `<div class="opt${st}">${q.type === 'ox' ? '' : `<span class="n">${k}</span>`}${esc(label)}</div>`;
  }).join('')}</div>`;
}

function poolHtml(season) {
  return `<div class="pool-list">${ENCOUNTERS[season].map((e) => `
    <div class="pool-item"><h3>${esc(e.name)} ×${e.mult}</h3><p>${e.keep === 1 ? '남긴 열매 그대로' : keepLabel(e.keep)}</p></div>`).join('')}</div>`;
}

function renderStage() {
  const s = $('#stage');
  const q = questionOf(game.round);
  const season = seasonOf(game.round);
  switch (game.phase) {
    case 'lobby':
      s.innerHTML = `
        <div class="lobby">
          <div class="lobby-text">
            <h2>열매 10개로 시작! 나눌까, 아낄까?</h2>
            <p class="sub">12개 반이 <b>감사 창고</b> 하나를 함께 써요. 창고에 모인 열매 × 날씨 배수 ÷ 12 만큼 모든 반이 똑같이 받아요.</p>
            <p class="sub">계절마다 2라운드, 모두 8라운드. 감사 농사 문제를 맞히면 열매 +${QUIZ_REWARD}!</p>
            <p class="sub" style="margin-top:2vh"><b>반 선생님</b>: QR을 찍고 우리 반을 골라 주세요. (${Object.keys(claims).length}/12)</p>
            <div class="chips">${classes.map((c) => `<div class="chip grade-${c.grade} ${c.id in claims ? 'done' : ''}">${esc(c.name)}<span class="v">${c.id in claims ? '✓' : '…'}</span></div>`).join('')}</div>
          </div>
          <div class="qr-img">${QR}</div>
        </div>`;
      break;
    case 'quiz_open':
    case 'quiz_reveal': {
      const reveal = game.phase === 'quiz_reveal';
      s.innerHTML = `
        <div class="row" style="justify-content:space-between"><p class="sub" style="margin:0">감사 농사 · 맞히면 열매 +${QUIZ_REWARD}</p>${reveal ? '' : '<div class="timer" id="timer"></div>'}</div>
        <h2>${esc(q.q)}</h2>
        ${optionsHtml(q, reveal)}
        ${chipsHtml(reveal ? 'reveal' : 'sent')}`;
      break;
    }
    case 'store_open':
    case 'store_locked': {
      const open = game.phase === 'store_open';
      s.innerHTML = `
        <div class="row" style="justify-content:space-between"><h2>${open ? '창고 회의: 감사 창고에 몇 개를 넣을까요?' : '창고 마감! 이번 날씨는…?'}</h2>${open ? '<div class="timer" id="timer"></div>' : ''}</div>
        <p class="sub" style="margin:0">${SEASONS[season]}에 나올 수 있는 날씨</p>
        ${poolHtml(season)}
        ${chipsHtml('sent')}`;
      break;
    }
    case 'encounter_reveal': {
      const r = game.last?.store;
      const e = r ? ENCOUNTER_BY_KEY[r.enc] : null;
      if (!r || !e) { s.innerHTML = '<h2>…</h2>'; break; }
      s.innerHTML = `
        <div class="enc-card">
          <div class="enc-name">${esc(e.name)}</div>
          <div class="enc-desc">${esc(e.desc)}</div>
        </div>
        <div class="calc">감사 창고 <b>${r.X}</b>개 × ${r.mult} = ${Math.round(r.pool * 10) / 10}개 → 12개 반에 <b>${r.share}</b>개씩${r.keep !== 1 ? ` · ${keepLabel(r.keep)}` : ''}</div>`;
      break;
    }
    case 'result': {
      const a = awards(classes);
      const sim = simulateAllShare(game.history || []);
      const max = Math.max(a.total, sim.total, 1);
      s.innerHTML = `
        <div class="result-grid">
          <div>
            <h2 style="font-size:4.4vh;margin-bottom:1.4vh">최종 순위</h2>
            <div class="rank-list">${a.ranked.map((c, i) => `<div class="grade-${c.grade}"><span>${i + 1}. ${esc(c.name)}</span><b>${c.fruit}개</b></div>`).join('')}</div>
          </div>
          <div class="awards">
            ${GRADES.map((gr) => `<div class="award"><h3>${gr.name}(${gr.school}) 1등</h3><p>${esc(a.gradeWinners[gr.key]?.name || '')} · ${a.gradeWinners[gr.key]?.fruit ?? ''}개</p></div>`).join('')}
            <div class="award"><h3>나눔상 (창고에 가장 많이 넣은 반)</h3><p>${esc(a.sharer?.name || '')} · ${a.sharer?.shared ?? 0}개 나눔</p></div>
          </div>
        </div>
        <div class="compare">
          <p class="sub" style="margin:0">같은 문제·같은 날씨에서 12개 반이 매번 열매를 모두 창고에 넣었다면?</p>
          <div class="bar" style="width:${(a.total / max) * 100}%">우리가 모은 열매 ${a.total}개</div>
          <div class="bar alt" style="width:${(sim.total / max) * 100}%">모두 다 나눴다면 ${sim.total}개</div>
        </div>
        <div class="verse">범사에 감사하라 · 데살로니가전서 5:18</div>`;
      break;
    }
    default:
      s.innerHTML = '';
  }
  const t = $('#timer');
  if (t) {
    clearInterval(window.__tick);
    window.__tick = startTicker(() => game?.deadlineAt, t);
  }
}

function render() {
  if (!game) return;
  $('#phase').textContent = phaseLabel(game.phase);
  $('#round').textContent = roundLabel(game);
  $('#board').classList.toggle('hidden', game.phase === 'result' || game.phase === 'lobby');
  $('#qrOverlay').classList.toggle('hidden', !game.showQr || game.phase === 'lobby');
  renderStage();
  renderBoard();
}
