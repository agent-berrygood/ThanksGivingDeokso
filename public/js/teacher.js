import { ready, params, doc, setDoc, onSnapshot, serverTimestamp } from './fb.js';
import {
  CLASSES, GRADES, ENCOUNTER_BY_KEY, QUIZ_REWARD, JOINT_GOAL,
} from './data.js';
import {
  questionOf, rank, clampContribution, activeOf, jointWin,
} from './logic.js';
import {
  refs, subId, watch, watchClaims, claimClass,
} from './store.js';
import { $, esc, roundLabel, phaseLabel, startTicker, keepLabel } from './ui.js';

const g = params.get('s') || '';
const key = params.get('k') || '';
let classId = '';
let meta = null;
let claims = {};
let started = false;

let game = null;
let classes = [];
let mine = null; // 내 반 문서
let mySub = null; // 이번 단계 내 제출
let subKey = '';
let offSub = null;
let draft = null; // 창고 숫자 입력 중인 값
let sending = false;
let errMsg = '';

if (!g || !key) {
  $('#body').innerHTML = '<div class="big-msg">QR 주소가 올바르지 않아요.<br>출력 화면의 QR을 다시 찍어 주세요.</div>';
  throw new Error('bad link');
}

const updateConn = () => { $('#conn').textContent = navigator.onLine ? '' : '인터넷 연결이 끊겼어요. 다시 연결되면 자동으로 이어져요.'; };
addEventListener('online', updateConn);
addEventListener('offline', updateConn);
updateConn();

const user = await ready();

// ===== 초기 세팅: 우리 반 고르기 =====
function setupView() {
  const taken = (id) => id in claims && claims[id].uid !== user.uid;
  $('#cname').textContent = '감사 열매 농장';
  $('#tphase').textContent = '반 선생님 초기 세팅';
  $('#tround').textContent = '';
  $('#tfruit').innerHTML = '';
  $('#body').innerHTML = `
    <div class="t-q">우리 반을 골라 주세요</div>
    <label for="classSel" class="muted">반 선택</label>
    <select id="classSel" class="select">
      <option value="">— 반을 고르세요 —</option>
      ${GRADES.map((gr) => `<optgroup label="${gr.name} (${gr.school})">${
        CLASSES.filter((c) => c.grade === gr.key).map((c) => `<option value="${c.id}" ${taken(c.id) ? 'disabled' : ''}>${esc(c.name)}${taken(c.id) ? ' (선택됨)' : ''}</option>`).join('')
      }</optgroup>`).join('')}
    </select>
    <button type="button" class="btn big" id="claimBtn">이 반으로 시작</button>
    <div class="notice">이미 다른 선생님이 고른 반은 고를 수 없어요. 잘못 골랐거나 휴대폰을 바꿨다면 진행자에게 '해제'를 부탁해 주세요.</div>
    ${errMsg ? `<div class="notice" style="background:#FEE2E2;color:#B91C1C">${esc(errMsg)}</div>` : ''}`;
}

function start(id) {
  classId = id;
  meta = CLASSES.find((c) => c.id === id);
  started = true;
  $('#root').className = `teacher grade-${meta.grade}`;
  $('#cname').textContent = meta.name;
  errMsg = '';
  mine = classes.find((c) => c.id === classId) || null;
  subKey = '';
  resubscribe();
  render();
}

function onClaims(v) {
  claims = v;
  const mineId = Object.keys(v).find((id) => v[id].uid === user.uid);
  if (!started && mineId) { start(mineId); return; }
  if (started && !mineId) {
    // 진행자가 해제함 → 다시 고르기
    started = false;
    classId = '';
    meta = null;
    if (offSub) offSub();
    offSub = null;
    subKey = '';
    $('#root').className = 'teacher';
  }
  if (!started && document.activeElement?.id !== 'classSel') setupView();
}

watchClaims(g, key, onClaims, (e) => {
  $('#body').innerHTML = `<div class="big-msg">세션에 들어가지 못했어요.<br>출력 화면의 QR을 다시 찍어 주세요.</div><p class="conn">${esc(e.code || e.message)}</p>`;
});

watch(g, {
  onGame: (v) => { game = v; if (started) { resubscribe(); render(); } },
  onClasses: (v) => { classes = v; mine = v.find((c) => c.id === classId) || null; if (started) render(); },
  onError: (e) => { errMsg = `연결 오류: ${e.message}`; if (started) render(); },
});

const kindOf = (phase) => (phase.startsWith('quiz') ? 'quiz' : ['store_open', 'store_locked', 'encounter_reveal'].includes(phase) ? 'store' : null);

// 이번 라운드·종류의 내 제출 문서를 구독 (새로고침해도 제출 상태가 보인다)
function resubscribe() {
  if (!game || !started) return;
  const kind = kindOf(game.phase);
  const sk = kind ? subId(game.round, kind, classId) : '';
  if (sk === subKey) return;
  subKey = sk;
  if (offSub) offSub();
  offSub = null;
  mySub = null;
  draft = null;
  if (!sk) return;
  const listen = () => onSnapshot(doc(refs(g).subs, sk), (s) => {
    mySub = s.exists() ? s.data() : null;
    render();
  }, () => {
    // 반 선택이 서버에 막 반영되는 순간 등에는 거절될 수 있다 → 잠시 뒤 다시 구독
    mySub = null;
    render();
    setTimeout(() => { if (subKey === sk) offSub = listen(); }, 1500);
  });
  offSub = listen();
}

async function submit(kind, value) {
  if (sending) return;
  sending = true;
  errMsg = '';
  render();
  try {
    await setDoc(doc(refs(g).subs, subId(game.round, kind, classId)), {
      classId, round: game.round, kind, value, at: serverTimestamp(),
    });
  } catch (e) {
    console.error(e);
    errMsg = '제출하지 못했어요. 이미 마감됐거나 연결이 불안정해요. 잠시 후 다시 눌러 주세요.';
  } finally {
    sending = false;
    render();
  }
}

function headRender() {
  $('#tphase').textContent = game ? phaseLabel(game.phase) : '연결 중…';
  $('#tround').textContent = game ? roundLabel(game) : '';
  $('#tfruit').innerHTML = mine ? `${mine.fruit}<small>개</small>` : '';
}

function quizView(open) {
  const q = questionOf(game.round, game.qset);
  const chosen = mySub?.value;
  const opts = q.type === 'ox' ? [['O', 'O'], ['X', 'X']] : q.options.map((o, i) => [String(i + 1), `${i + 1}. ${o}`]);
  if (!open) {
    const ans = game.last?.quiz?.answers?.[classId];
    const ok = ans === q.answer;
    const correctText = q.type === 'ox' ? q.answer : `${q.answer}. ${q.options[Number(q.answer) - 1]}`;
    return `<div class="t-q">${esc(q.q)}</div>
      <div class="notice ${ok ? 'ok' : ''}">${ok ? `정답이에요! 열매 +${QUIZ_REWARD}` : `아쉬워요. 정답은 <b>${esc(correctText)}</b>`}${ans ? ` (우리 반 답: ${esc(ans)})` : ' (미제출)'}</div>
      <div class="big-msg">곧 창고 회의가 시작돼요.</div>`;
  }
  return `<div class="row" style="justify-content:space-between"><span class="pill">감사 농사 · 맞히면 +${QUIZ_REWARD}</span><span class="timer" id="ttimer" style="font-size:28px"></span></div>
    <div class="t-q">${esc(q.q)}</div>
    <div class="ans-grid">${opts.map(([k, label]) => `<button type="button" class="ans${q.type === 'ox' ? ' ox' : ''}${chosen === k ? ' sel' : ''}" data-ans="${k}" ${sending ? 'disabled' : ''}>${esc(label)}</button>`).join('')}</div>
    <div class="notice ${chosen ? 'ok' : ''}">${chosen ? `제출됨: <b>${esc(chosen)}</b> · 마감 전까지 바꿀 수 있어요.` : '반 친구들과 의논해서 답을 눌러 주세요. 누르면 바로 제출돼요.'}</div>`;
}

function storeView(open) {
  const fruit = mine?.fruit ?? 0;
  const sent = mySub?.value;
  if (!open) {
    return `<div class="big-msg">${sent === undefined ? '이번 라운드는 창고에 내지 않았어요 (0개).' : `창고에 <b>${sent}개</b>를 냈어요.`}<br>날씨 발표를 기다려요!</div>`;
  }
  const value = clampContribution(draft ?? sent ?? 0, fruit);
  return `<div class="row" style="justify-content:space-between"><span class="pill">창고 회의</span><span class="timer" id="ttimer" style="font-size:28px"></span></div>
    <div class="t-q">감사 창고에 몇 개를 넣을까요? <span class="muted" style="font-size:16px">(0~${fruit}개)</span></div>
    <div class="stepper">
      <button type="button" data-step="-1" aria-label="1개 빼기">−</button>
      <input id="num" type="number" inputmode="numeric" min="0" max="${fruit}" value="${value}" aria-label="창고에 넣을 열매 수">
      <button type="button" data-step="1" aria-label="1개 더하기">+</button>
    </div>
    <div class="quick">
      <button type="button" data-set="0">0개</button>
      <button type="button" data-set="${Math.floor(fruit / 2)}">절반</button>
      <button type="button" data-set="${fruit}">전부</button>
      <button type="button" data-set="${sent ?? 0}">되돌리기</button>
    </div>
    <button type="button" class="btn big" id="sendStore" ${sending ? 'disabled' : ''}>${sent === undefined ? `${value}개 제출` : `${value}개로 다시 제출`}</button>
    <div class="notice ${sent !== undefined ? 'ok' : ''}">${sent !== undefined ? `제출됨: <b>${sent}개</b> · 마감 전까지 바꿀 수 있어요. 다른 반에는 숫자가 보이지 않아요.` : '아직 제출하지 않았어요. 마감까지 내지 않으면 0개로 처리돼요.'}</div>`;
}

function encounterView() {
  const r = game.last?.store;
  const p = r?.perClass?.[classId];
  const e = r ? ENCOUNTER_BY_KEY[r.enc] : null;
  if (!p || !e) return '<div class="big-msg">결과를 불러오는 중…</div>';
  return `<div class="t-q">이번 날씨: ${esc(e.name)}</div>
    <div class="notice">${esc(e.desc)}</div>
    <div class="t-result card">
      <span>원래 열매</span><b>${p.before}개</b>
      <span>창고에 낸 열매</span><b>${p.c}개</b>
      <span>남긴 열매${r.keep !== 1 ? ` (${keepLabel(r.keep)})` : ''}</span><b>${p.leftover} → ${p.kept}개</b>
      <span>창고에서 받은 열매</span><b>+${p.share}개</b>
      <span>지금 열매</span><b>${p.after}개</b>
    </div>`;
}

function resultView() {
  const act = activeOf(game);
  const list = classes.filter((c) => act.includes(c.id));
  const ranked = rank(list);
  const pos = ranked.findIndex((c) => c.id === classId) + 1;
  const joint = jointWin(list);
  return `<div class="big-msg">수고했어요!<br>${esc(meta.name)}은 열매 <b>${mine?.fruit ?? 0}개</b>로<br>${list.length}개 반 중 ${pos}등이에요.</div>
    ${joint ? `<div class="notice ok">모든 반이 ${JOINT_GOAL}개를 넘었어요. 모두 공동우승!</div>` : ''}
    <div class="notice">창고에 나눈 열매: ${mine?.shared ?? 0}개<br>다른 반이 나눠 준 열매에서 받은 몫: ${mine?.fromOthers ?? 0}개<br>범사에 감사하라 · 데살로니가전서 5:18</div>`;
}

function render() {
  if (!started) return;
  headRender();
  const body = $('#body');
  if (!game) {
    body.innerHTML = '<div class="big-msg">게임을 찾는 중이에요…</div>';
    return;
  }
  let html = '';
  if (game.phase !== 'lobby' && !activeOf(game).includes(classId)) {
    body.innerHTML = '<div class="big-msg">이번 게임은 이미 시작됐어요.<br>우리 반은 이번 게임에 참여하지 않아요.<br>다음 게임 때 함께해요!</div>';
    return;
  }
  switch (game.phase) {
    case 'lobby': html = `<div class="big-msg">게임 시작을 기다리고 있어요.<br>이 화면을 켜 둔 채로 기다려 주세요.</div><div class="notice">모든 반이 열매 ${JOINT_GOAL}개 이상이면 모두 공동우승이에요.</div>`; break;
    case 'quiz_open': html = quizView(true); break;
    case 'quiz_reveal': html = quizView(false); break;
    case 'store_open': html = storeView(true); break;
    case 'store_locked': html = storeView(false); break;
    case 'encounter_reveal': html = encounterView(); break;
    case 'result': html = resultView(); break;
    default: html = '';
  }
  if (errMsg) html += `<div class="notice" style="background:#FEE2E2;color:#B91C1C">${esc(errMsg)}</div>`;
  // 입력 중인 숫자 칸은 포커스를 유지하기 위해 같은 값이면 다시 그리지 않는다
  const active = document.activeElement?.id === 'num';
  if (active && game.phase === 'store_open') {
    const btn = $('#sendStore');
    if (btn) btn.disabled = sending;
    return;
  }
  body.innerHTML = html;
  const t = $('#ttimer');
  clearInterval(window.__tick);
  if (t) window.__tick = startTicker(() => game?.deadlineAt, t);
}

$('#body').addEventListener('click', async (e) => {
  if (e.target.closest('#claimBtn')) {
    const id = $('#classSel').value;
    if (!id) { errMsg = '반을 먼저 골라 주세요.'; setupView(); return; }
    const name = CLASSES.find((c) => c.id === id).name;
    if (!confirm(`${name} 선생님으로 시작할까요?`)) return;
    errMsg = '';
    try {
      await claimClass(g, key, id, user.uid);
      start(id);
    } catch (err) {
      console.error(err);
      errMsg = '그 반은 이미 다른 선생님이 골랐어요. 다른 반을 고르거나 진행자에게 해제를 부탁해 주세요.';
      setupView();
    }
    return;
  }
  if (!started) return;
  const a = e.target.closest('[data-ans]');
  if (a && game?.phase === 'quiz_open') { submit('quiz', a.dataset.ans); return; }
  const fruit = mine?.fruit ?? 0;
  const st = e.target.closest('[data-step]');
  if (st) { draft = clampContribution(Number($('#num').value) + Number(st.dataset.step), fruit); render(); return; }
  const set = e.target.closest('[data-set]');
  if (set) { draft = clampContribution(set.dataset.set, fruit); render(); return; }
  if (e.target.closest('#sendStore')) {
    const v = clampContribution($('#num').value, fruit);
    draft = v;
    if (confirm(`감사 창고에 ${v}개를 낼까요?`)) submit('store', v);
  }
});
$('#body').addEventListener('input', (e) => {
  if (e.target.id !== 'num') return;
  draft = clampContribution(e.target.value, mine?.fruit ?? 0);
  const btn = $('#sendStore');
  if (btn) btn.textContent = mySub?.value === undefined ? `${draft}개 제출` : `${draft}개로 다시 제출`;
});
