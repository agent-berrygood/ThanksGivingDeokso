import { ready, params } from './fb.js';
import {
  QUESTION_SETS, QSET_BY_KEY, DEFAULT_QSET, questionsOf, ENCOUNTERS, SEASONS, CLASSES, TUTORIAL, JOINT_GOAL,
} from './data.js';
import { NEXT_LABEL, questionOf, seasonOf, activeOf } from './logic.js';
import {
  watch, watchClaims, advance, undo, resetGame, adjustFruit, extendDeadline, setShowQr, isAdmin,
  loadJoinKey, collectSubs, releaseClass, joinUrl, qrSvg, rememberSession, setTutorial, setQset,
} from './store.js';
import { $, esc, roundLabel, phaseLabel, startTicker, keepLabel } from './ui.js';

const g = params.get('s') || '';
let game = null;
let classes = [];
let subs = [];
let claims = {};
let busy = false;

const user = await ready();
if (!g || !(await isAdmin(g, user.uid))) {
  location.replace('/');
  throw new Error('not admin');
}
rememberSession(g);
$('#gameName').textContent = g;
const key = await loadJoinKey(g);
const link = joinUrl(g, key);

startTicker(() => game?.deadlineAt, $('#timer'));

watch(g, {
  onGame: (v) => { game = v; render(); },
  onClasses: (v) => { classes = v; render(); },
  onSubs: (v) => { subs = v; render(); },
  onError: (e) => { $('#ctlErr').textContent = `연결 오류: ${e.message}`; },
});
watchClaims(g, key, (v) => { claims = v; render(); });

// 이번 게임 참여 반: 시작 전에는 반을 고른 반, 시작 뒤에는 시작할 때 확정된 반
function activeIds() {
  if (game?.phase === 'lobby') return CLASSES.filter((c) => c.id in claims).map((c) => c.id);
  return activeOf(game);
}

function currentKind() {
  if (!game) return null;
  if (game.phase === 'quiz_open' || game.phase === 'quiz_reveal') return 'quiz';
  if (['store_open', 'store_locked', 'encounter_reveal'].includes(game.phase)) return 'store';
  return null;
}

function previewText() {
  if (!game) return '불러오는 중…';
  const q = questionOf(game.round, game.qset);
  const optText = (qq) => (qq.type === 'ox' ? 'O / X' : qq.options.map((o, i) => `${i + 1}) ${o}`).join('  '));
  const answerText = (qq) => (qq.type === 'ox' ? qq.answer : `${qq.answer}번 ${qq.options[Number(qq.answer) - 1]}`);
  const joined = Object.keys(claims).length;
  switch (game.phase) {
    case 'lobby':
      if (game.tutorial !== null && game.tutorial !== undefined) {
        return '설명·연습 화면을 보여 주는 중이에요. 아래 버튼으로 넘기세요. 실제 열매에는 영향이 없어요.';
      }
      return `출력 창을 프로젝터에 띄우면 참여 QR이 보여요. 지금 ${joined}개 반이 반을 골랐어요. 게임은 <b>시작할 때 반을 고른 반만</b> 참여해요. 공동우승 목표는 모든 반 ${JOINT_GOAL}개 이상이에요.`;
    case 'quiz_open':
      return `<b>문제</b> ${esc(q.q)}<br>${esc(optText(q))}<br><b>정답</b> ${esc(answerText(q))}<br>반이 의논해서 선생님 휴대폰으로 답을 내요. 다 내면 정답을 공개하세요.`;
    case 'quiz_reveal':
      return '맞힌 반에 열매 +2가 들어갔어요. 이제 창고 회의를 시작하세요.';
    case 'store_open':
      return `이번 계절(${SEASONS[seasonOf(game.round)]}) 인카운터 후보를 보여 주며 회의 시간을 주세요. 숫자는 출력 화면에 보이지 않아요.`;
    case 'store_locked':
      return '제출이 마감됐어요. 인카운터를 뽑으면 열매가 나눠져요. 안 낸 반은 0개로 처리돼요.';
    case 'encounter_reveal':
      return game.round >= 7 ? '마지막 라운드가 끝났어요. 다음을 누르면 최종 결과가 나와요.' : '결과를 함께 확인하고 다음 라운드로 넘어가세요.';
    case 'result':
      return '최종 결과 화면이에요. 누가복음 17장과 데살로니가전서 5:18로 마무리 말씀을 전해 주세요.';
    default:
      return '';
  }
}

let qListFor = '';
function renderQList(qs) {
  if (qListFor === qs) return;
  qListFor = qs;
  $('#qList').innerHTML = `<h3 style="font-size:20px;margin-bottom:8px">감사 농사 문제 · ${esc(QSET_BY_KEY[qs].name)}</h3><ol style="margin:0;padding-left:22px;line-height:1.7">${
  questionsOf(qs).map((q, i) => `<li><b>${SEASONS[Math.floor(i / 2)]} ${(i % 2) + 1}</b> ${esc(q.q)} → <b>${
    q.type === 'ox' ? q.answer : `${q.answer}) ${esc(q.options[Number(q.answer) - 1])}`}</b></li>`).join('')}</ol>`;
}

function render() {
  if (!game) return;
  $('#roundLabel').textContent = roundLabel(game);
  $('#phaseLabel').textContent = ['lobby', 'result'].includes(game.phase) ? '' : phaseLabel(game.phase);
  $('#preview').innerHTML = previewText();
  const label = NEXT_LABEL[game.phase];
  $('#nextBtn').textContent = label || '게임 끝';
  $('#nextBtn').disabled = busy || !label;
  $('#undoBtn').disabled = busy || game.phase === 'lobby';
  $('#plusBtn').disabled = busy || !game.deadlineAt;
  const act = activeIds();
  $('#joinCount').textContent = game.phase === 'lobby' ? `${act.length}/12` : `${act.length}개 반 참여 중`;
  $('#qrToggle').textContent = game.showQr ? '출력 화면 QR 닫기' : '출력 화면에 QR 띄우기';
  $('#qrToggle').classList.toggle('hidden', game.phase === 'lobby');

  // 설명·연습 컨트롤
  const tut = game.tutorial;
  const inTut = tut !== null && tut !== undefined;
  $('#tutBox').classList.toggle('hidden', game.phase !== 'lobby');
  $('#qsetBox').classList.toggle('hidden', game.phase !== 'lobby');
  const qs = QSET_BY_KEY[game.qset] ? game.qset : DEFAULT_QSET;
  if ($('#qsetSel').value !== qs) $('#qsetSel').value = qs;
  $('#qsetSel').disabled = busy;
  renderQList(qs);
  $('#tutStart').classList.toggle('hidden', inTut);
  ['#tutPrev', '#tutNext', '#tutEnd'].forEach((s) => $(s).classList.toggle('hidden', !inTut));
  if (inTut) {
    const t = TUTORIAL[tut];
    const needReveal = t?.reveal && !game.tutorialReveal;
    $('#tutLabel').textContent = `${tut + 1}/${TUTORIAL.length} · ${t?.title || ''}${needReveal ? ' — 다음을 누르면 정답·결과 공개' : ''}`;
    $('#tutPrev').disabled = busy || (tut === 0 && !game.tutorialReveal);
    $('#tutNext').disabled = busy || (tut >= TUTORIAL.length - 1);
    $('#tutNext').textContent = needReveal ? '공개 ▶' : '다음 ▶';
  } else {
    $('#tutLabel').textContent = '';
  }
  $('#nextBtn').disabled = busy || !label || inTut;

  const kind = currentKind();
  const now = kind ? collectSubs(subs, game.round, kind, act) : {};
  const count = Object.keys(now).length;
  $('#subCount').textContent = kind ? `제출 ${count}/${act.length}` : '';
  $('#subCount').classList.toggle('hidden', !kind);

  const q = questionOf(game.round, game.qset);
  $('#classRows').innerHTML = classes.map((c) => {
    const inGame = game.phase === 'lobby' || act.includes(c.id);
    if (!inGame) {
      return `<tr class="grade-${c.grade} inactive"><td><span class="dot"></span>${esc(c.name)}</td><td colspan="5" class="muted">이번 게임 미참여</td></tr>`;
    }
    let cell = '<span class="muted">—</span>';
    if (kind === 'quiz' && c.id in now) {
      const ok = game.phase === 'quiz_reveal' ? (now[c.id] === q.answer ? ' ok' : ' no') : '';
      cell = `<span class="pill${ok}">답 ${esc(now[c.id])}</span>`;
    } else if (kind === 'store' && c.id in now) {
      cell = `<span class="pill">창고 ${esc(now[c.id])}개</span>`;
    } else if (kind) {
      cell = '<span class="muted">미제출</span>';
    }
    const joined = c.id in claims
      ? `<span class="pill ok">참여</span> <button class="mini-btn" style="width:auto;padding:0 8px;font-size:14px" data-release="${c.id}" type="button">해제</button>`
      : '<span class="pill no">대기</span>';
    return `<tr class="grade-${c.grade}">
      <td><span class="dot"></span>${esc(c.name)}</td>
      <td>${joined}</td>
      <td class="num"><b>${c.fruit}</b></td>
      <td class="num">${c.shared || 0}</td>
      <td>${cell}</td>
      <td><button class="mini-btn" data-adj="${c.id}" data-d="-1" type="button" aria-label="${esc(c.name)} 열매 1 빼기">−</button>
          <button class="mini-btn" data-adj="${c.id}" data-d="1" type="button" aria-label="${esc(c.name)} 열매 1 더하기">+</button></td>
    </tr>`;
  }).join('');
}

async function run(fn) {
  if (busy) return;
  busy = true;
  render();
  $('#ctlErr').textContent = '';
  try {
    await fn();
  } catch (e) {
    console.error(e);
    $('#ctlErr').textContent = `처리하지 못했어요: ${e.message}`;
  } finally {
    busy = false;
    render();
  }
}

$('#nextBtn').addEventListener('click', () => {
  if (game?.phase === 'lobby') {
    const ids = activeIds();
    if (!ids.length) { $('#ctlErr').textContent = '반을 고른 선생님이 아직 없어요. 한 반 이상 들어온 뒤 시작해 주세요.'; return; }
    const names = CLASSES.filter((c) => ids.includes(c.id)).map((c) => c.name).join(', ');
    if (!confirm(`${ids.length}개 반으로 시작할까요?\n${names}\n시작한 뒤에 들어온 반은 이번 게임에 참여하지 못해요.`)) return;
  }
  if (game?.phase === 'quiz_open' || game?.phase === 'store_open') {
    const kind = game.phase === 'quiz_open' ? 'quiz' : 'store';
    const total = activeIds().length;
    const n = Object.keys(collectSubs(subs, game.round, kind, activeIds())).length;
    if (n < total && !confirm(`아직 ${total - n}개 반이 내지 않았어요. 마감할까요?`)) return;
  }
  run(() => advance(g));
});
$('#undoBtn').addEventListener('click', () => {
  if (confirm('직전 단계로 되돌릴까요? 그 단계에서 바뀐 열매도 함께 되돌아가요.')) run(() => undo(g));
});
$('#plusBtn').addEventListener('click', () => run(() => extendDeadline(g, game.deadlineAt, 10)));
$('#qrToggle').addEventListener('click', () => run(() => setShowQr(g, !game.showQr)));
$('#tutStart').addEventListener('click', () => run(() => setTutorial(g, 0)));
$('#tutEnd').addEventListener('click', () => run(() => setTutorial(g, null)));
$('#tutNext').addEventListener('click', () => {
  const t = TUTORIAL[game.tutorial];
  if (t?.reveal && !game.tutorialReveal) run(() => setTutorial(g, game.tutorial, true));
  else if (game.tutorial < TUTORIAL.length - 1) run(() => setTutorial(g, game.tutorial + 1));
});
$('#tutPrev').addEventListener('click', () => {
  if (game.tutorialReveal) run(() => setTutorial(g, game.tutorial, false));
  else if (game.tutorial > 0) {
    const prev = TUTORIAL[game.tutorial - 1];
    run(() => setTutorial(g, game.tutorial - 1, !!prev?.reveal));
  }
});
$('#resetBtn').addEventListener('click', () => {
  if (confirm('모든 반을 열매 10개로 되돌리고 처음부터 시작할까요? 선생님들이 고른 반은 그대로 유지돼요.')) run(() => resetGame(g));
});
$('#classRows').addEventListener('click', (e) => {
  const rel = e.target.closest('[data-release]');
  if (rel) {
    const c = classes.find((x) => x.id === rel.dataset.release);
    if (confirm(`${c.name} 선택을 해제할까요? 그 반 선생님은 QR을 다시 찍고 반을 다시 골라야 해요.`)) {
      run(() => releaseClass(g, key, c.id));
    }
    return;
  }
  const b = e.target.closest('[data-adj]');
  if (!b) return;
  const c = classes.find((x) => x.id === b.dataset.adj);
  run(() => adjustFruit(g, c.id, c.fruit + Number(b.dataset.d)));
});

$('#openDisplay').addEventListener('click', () => {
  window.open(`/display?s=${encodeURIComponent(g)}`, 'farm-display', 'popup,width=1280,height=720');
});

// 참여 QR
$('#joinQr').innerHTML = qrSvg(link);
$('#joinLink').href = link;
$('#joinLink').textContent = link;

// 미리 보기 목록
$('#qsetSel').innerHTML = QUESTION_SETS.map((x) => `<option value="${x.key}">${esc(x.name)}</option>`).join('');
$('#qsetSel').addEventListener('change', (e) => {
  const v = e.target.value; // render()가 값을 되돌리기 전에 읽어 둔다
  run(() => setQset(g, v));
});
$('#encList').innerHTML = `<h3 style="font-size:20px;margin-bottom:8px">계절별 인카운터</h3>${
  ENCOUNTERS.map((list, s) => `<p style="margin:0 0 6px"><b>${SEASONS[s]}</b> ${
    list.map((e) => `${esc(e.name)}(×${e.mult}${e.keep !== 1 ? `, ${keepLabel(e.keep)}` : ''})`).join(' · ')}</p>`).join('')}`;
