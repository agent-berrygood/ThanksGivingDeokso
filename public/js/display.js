import { ready, params } from './fb.js';
import {
  GRADES, CLASSES, ENCOUNTERS, ENCOUNTER_BY_KEY, SEASONS, QUIZ_REWARD, START_FRUIT, JOINT_GOAL,
  TUTORIAL, PRACTICE_QUESTION, PRACTICE_ROUND,
} from './data.js';
import {
  questionOf, seasonOf, awards, simulateAllShare, activeOf, applyStore,
} from './logic.js';
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
watchClaims(g, key, (v) => { claims = v; if (game?.phase === 'lobby') render(); });

watch(g, {
  onGame: (v) => { game = v; render(); },
  onClasses: (v) => { classes = v; render(); },
  onSubs: (v) => { subs = v; renderChips(); renderBoard(); },
  onError: (e) => { $('#stage').innerHTML = `<h2>연결 오류</h2><p class="sub">${esc(e.message)}</p>`; },
});

// 이번 게임에 참여하는 반 (시작 전에는 반을 고른 반)
function activeIds() {
  if (game?.phase === 'lobby') return CLASSES.filter((c) => c.id in claims).map((c) => c.id);
  return activeOf(game);
}
const activeClasses = () => classes.filter((c) => activeIds().includes(c.id));
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
  if (!classes.length || !game) return;
  const d = deltas();
  const kind = openKind();
  const act = activeIds();
  const sent = kind ? collectSubs(subs, game.round, kind, act) : {};
  const rows = GRADES.map((gr) => ({ gr, list: activeClasses().filter((c) => c.grade === gr.key) })).filter((r) => r.list.length);
  const cols = Math.max(...rows.map((r) => r.list.length), 1);
  $('#board').innerHTML = rows.map(({ gr, list }) => `
    <div class="board-row grade-${gr.key}" style="grid-template-columns: 8vw repeat(${cols}, minmax(0, 1fr))">
      <div class="g">${gr.name}<small>${gr.school}</small></div>
      ${list.map((c) => {
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
  const act = activeIds();
  const kind = mode === 'reveal' ? 'quiz' : openKind() || (game.phase === 'store_locked' ? 'store' : null);
  const sent = kind ? collectSubs(subs, game.round, kind, act) : {};
  const list = activeClasses();
  return `<div class="chips" id="chips" style="grid-template-columns: repeat(${Math.max(list.length, 1)}, minmax(0, 1fr))">${list.map((c) => {
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
  if (!el || !game || game.phase === 'lobby') return;
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

// ===== 설명·연습 슬라이드 =====
function tutorialHtml(step, reveal) {
  const t = TUTORIAL[step];
  const n = Object.keys(claims).length;
  const head = `<p class="sub" style="margin:0">설명 ${step + 1}/${TUTORIAL.length}</p><h2>${esc(t.title)}</h2>`;
  switch (t.key) {
    case 'welcome':
      return `${head}
        <p class="sub">반마다 열매 <b>${START_FRUIT}개</b>로 시작해요. 봄·여름·가을·추수, 계절마다 2라운드씩 <b>모두 8라운드</b>를 해요.</p>
        <p class="sub">우리 반 열매를 지키면서, 다른 반과 <b>감사 창고</b>에 열매를 나눌 수도 있어요. 나눌까, 아낄까? 반끼리 의논해서 정해요.</p>`;
    case 'round':
      return `${head}
        <div class="steps">
          <div class="step"><b>1</b><h3>감사 농사</h3><p>문제를 함께 풀어요. 맞히면 열매 +${QUIZ_REWARD}</p></div>
          <div class="step"><b>2</b><h3>창고 회의</h3><p>감사 창고에 몇 개를 넣을지 반끼리 의논해요</p></div>
          <div class="step"><b>3</b><h3>제출</h3><p>반 선생님이 휴대폰으로 내요. 다른 반 숫자는 안 보여요</p></div>
          <div class="step"><b>4</b><h3>날씨 공개</h3><p>날씨에 따라 창고 열매가 불어나서 모든 반이 똑같이 나눠 받아요</p></div>
        </div>`;
    case 'store':
      return `${head}
        <div class="calc">반마다 받는 열매 = 창고 합계 × 날씨 배수 ÷ 참여한 반 수</div>
        <p class="sub">예) 12개 반이 모두 10개씩 넣고 '보통 날씨(×2)'가 오면 → 120 × 2 ÷ 12 = <b>반마다 20개</b></p>
        <p class="sub">한 반만 0개를 넣으면 → 110 × 2 ÷ 12 = 18개씩. 넣은 반은 18개, 안 넣은 반은 10 + 18 = 28개!</p>`;
    case 'weather':
      return `${head}
        <div class="weather-grid">${ENCOUNTERS.map((list, s) => `
          <div class="weather-col"><h3>${SEASONS[s]}</h3>${list.map((e) => `<p><b>${esc(e.name)}</b> ×${e.mult}${e.keep !== 1 ? ` · <span class="warn">${keepLabel(e.keep)}</span>` : ''}</p>`).join('')}</div>`).join('')}
        </div>
        <p class="sub">같은 계절 두 라운드에는 다른 날씨가 나와요. <span class="warn">남긴 열매가 줄어드는 날씨</span>도 있으니 조심!</p>`;
    case 'practiceQ':
      return `${head}
        <p class="sub" style="margin:0">감사 농사 연습 · 반끼리 의논해 보세요</p>
        <h2 style="font-size:5.4vh">${esc(PRACTICE_QUESTION.q)}</h2>
        ${optionsHtml(PRACTICE_QUESTION, reveal)}
        ${reveal ? `<p class="sub">정답은 <b>${PRACTICE_QUESTION.answer}</b> · ${esc(PRACTICE_QUESTION.note)}</p>` : ''}`;
    case 'practiceRound': {
      const P = PRACTICE_ROUND;
      const ids = P.names.map((_, i) => `p${i}`);
      const fruits = Object.fromEntries(ids.map((id) => [id, P.start]));
      const contrib = Object.fromEntries(ids.map((id, i) => [id, P.contrib[i]]));
      const r = applyStore(fruits, contrib, P.encounter, ids);
      const e = ENCOUNTER_BY_KEY[P.encounter];
      return `${head}
        <p class="sub" style="margin:0">4개 반이 열매 ${P.start}개씩 가지고 창고에 이렇게 넣었어요.</p>
        <table class="demo">
          <thead><tr><th>반</th><th>창고에 낸 열매</th><th>남긴 열매</th>${reveal ? '<th>창고에서 받은 열매</th><th>지금 열매</th>' : ''}</tr></thead>
          <tbody>${ids.map((id, i) => `<tr><td>${P.names[i]}</td><td>${r.perClass[id].c}개</td><td>${r.perClass[id].leftover}개</td>${
            reveal ? `<td>+${r.perClass[id].share}개</td><td><b>${r.perClass[id].after}개</b></td>` : ''}</tr>`).join('')}</tbody>
        </table>
        ${reveal
          ? `<div class="calc">날씨: <b>${esc(e.name)}</b> → 창고 ${r.X}개 × ${e.mult} = ${r.pool}개 ÷ 4 = 반마다 <b>${r.share}</b>개</div>
             <p class="sub">하나도 안 낸 '다 반'이 이번엔 제일 많아요. 그런데 모두가 이렇게 하면 어떻게 될까요?</p>`
          : '<p class="sub">이번 날씨는 무엇일까요?</p>'}`;
    }
    case 'danger':
      return `${head}
        <p class="sub">아무 반도 나누지 않으면 창고가 비어서 불어날 열매가 없어요. 게다가 <span class="warn">꽃샘추위·폭염·태풍·메뚜기 떼·까마귀 떼</span>가 오면 남긴 열매가 줄어들어요.</p>
        <div class="calc">미리 2,000번 해 보니: 아무도 안 나누면 마지막에 반마다 열매가 <b>2~5개</b>밖에 남지 않았어요.</div>
        <p class="sub">모든 반이 매번 절반씩만 나눠도 가장 적은 반조차 <b>100개가 훨씬 넘었어요</b>.</p>`;
    case 'joint':
      return `${head}
        <div class="joint-goal">모든 반이 각각 열매 <b>${JOINT_GOAL}개 이상</b>이면 → <b>모두 공동우승!</b></div>
        <p class="sub">우리 반만 1등을 할 수도 있지만, 함께 나누면 모두가 우승할 수 있어요. 어떤 길을 고를지 반끼리 의논해 보세요.</p>`;
    case 'ready':
      return `<div class="lobby">
          <div class="lobby-text">${head}
            <p class="sub">반 선생님은 QR을 찍고 우리 반을 골라 주세요. (${n}명 참여)</p>
            <p class="sub">반을 고른 반만 이번 게임에 참여해요.</p>
          </div>
          <div class="qr-img">${QR}</div>
        </div>`;
    default:
      return head;
  }
}

function renderStage() {
  const s = $('#stage');
  const q = questionOf(game.round);
  const season = seasonOf(game.round);
  const N = activeIds().length;
  if (game.phase === 'lobby' && game.tutorial !== null && game.tutorial !== undefined && TUTORIAL[game.tutorial]) {
    s.innerHTML = tutorialHtml(game.tutorial, !!game.tutorialReveal);
    return;
  }
  switch (game.phase) {
    case 'lobby':
      s.innerHTML = `
        <div class="lobby">
          <div class="lobby-text">
            <h2>열매 ${START_FRUIT}개로 시작! 나눌까, 아낄까?</h2>
            <p class="sub">참여한 반이 <b>감사 창고</b> 하나를 함께 써요. 창고에 모인 열매 × 날씨 배수 ÷ 참여한 반 수만큼 모든 반이 똑같이 받아요.</p>
            <p class="sub">모든 반이 ${JOINT_GOAL}개 이상이면 <b>모두 공동우승</b>!</p>
            <p class="sub" style="margin-top:2vh"><b>반 선생님</b>: QR을 찍고 우리 반을 골라 주세요. (지금 ${N}개 반)</p>
            <div class="chips" style="grid-template-columns: repeat(6, minmax(0, 1fr))">${classes.map((c) => `<div class="chip grade-${c.grade} ${c.id in claims ? 'done' : ''}">${esc(c.name)}<span class="v">${c.id in claims ? '✓' : '…'}</span></div>`).join('')}</div>
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
      const low = Math.min(...activeClasses().map((c) => c.fruit));
      s.innerHTML = `
        <div class="enc-card">
          <div class="enc-name">${esc(e.name)}</div>
          <div class="enc-desc">${esc(e.desc)}</div>
        </div>
        <div class="calc">감사 창고 <b>${r.X}</b>개 × ${r.mult} = ${Math.round(r.pool * 10) / 10}개 → ${r.n || N}개 반에 <b>${r.share}</b>개씩${r.keep !== 1 ? ` · ${keepLabel(r.keep)}` : ''}</div>
        <p class="sub" style="margin:0">공동우승까지: 가장 적은 반 <b>${low}개</b> / 목표 ${JOINT_GOAL}개</p>`;
      break;
    }
    case 'result':
      s.innerHTML = resultHtml();
      break;
    default:
      s.innerHTML = '';
  }
  const t = $('#timer');
  if (t) {
    clearInterval(window.__tick);
    window.__tick = startTicker(() => game?.deadlineAt, t);
  }
}

function resultHtml() {
  const list = activeClasses();
  const a = awards(list);
  const sim = simulateAllShare(game.history || [], activeIds());
  const max = Math.max(a.total, sim.total, 1);
  const w = a.winner;
  const gradesPresent = GRADES.filter((gr) => a.gradeWinners[gr.key]);
  const banner = a.joint
    ? `<div class="joint-goal win">모든 반이 ${a.goal}개를 넘었어요! <b>${list.length}개 반 모두 공동우승!</b></div>`
    : `<div class="joint-goal">공동우승 목표 ${a.goal}개 · 가장 적은 반 ${esc(a.lowest?.name || '')} <b>${a.lowest?.fruit ?? 0}개</b></div>`;
  const lesson = !a.joint && w
    ? `<div class="lesson">1등 ${esc(w.name)}이 받은 열매 가운데 <b>${w.fromOthers || 0}개</b>는 다른 반이 창고에 나눠 준 열매에서 왔어요. 혼자 모은 열매가 아니었어요.</div>`
    : '';
  return `
    ${banner}
    <div class="result-grid">
      <div>
        <h2 style="font-size:4vh;margin-bottom:1.2vh">최종 순위</h2>
        <div class="rank-list">${a.ranked.map((c, i) => `<div class="grade-${c.grade}"><span>${i + 1}. ${esc(c.name)}</span><b>${c.fruit}개</b></div>`).join('')}</div>
      </div>
      <div class="awards">
        ${gradesPresent.map((gr) => `<div class="award"><h3>${gr.name}(${gr.school}) 1등</h3><p>${esc(a.gradeWinners[gr.key].name)} · ${a.gradeWinners[gr.key].fruit}개</p></div>`).join('')}
        <div class="award"><h3>나눔상 (창고에 가장 많이 넣은 반)</h3><p>${esc(a.sharer?.name || '')} · ${a.sharer?.shared ?? 0}개 나눔</p></div>
      </div>
    </div>
    ${lesson}
    <div class="compare">
      <p class="sub" style="margin:0">같은 문제·같은 날씨에서 모든 반이 매번 열매를 모두 창고에 넣었다면?</p>
      <div class="bar" style="width:${(a.total / max) * 100}%">우리가 모은 열매 ${a.total}개</div>
      <div class="bar alt" style="width:${(sim.total / max) * 100}%">모두 다 나눴다면 ${sim.total}개</div>
    </div>
    <div class="verse">범사에 감사하라 · 데살로니가전서 5:18</div>`;
}

function render() {
  if (!game) return;
  const tut = game.phase === 'lobby' && game.tutorial !== null && game.tutorial !== undefined;
  $('#phase').textContent = tut ? '게임 설명·연습' : phaseLabel(game.phase);
  $('#round').textContent = roundLabel(game);
  $('#board').classList.toggle('hidden', game.phase === 'result' || game.phase === 'lobby');
  $('#qrOverlay').classList.toggle('hidden', !game.showQr || game.phase === 'lobby');
  renderStage();
  renderBoard();
}
