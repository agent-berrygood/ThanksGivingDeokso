import { ready, params } from './fb.js';
import { CLASSES, QUESTIONS, ENCOUNTERS, SEASONS } from './data.js';
import { NEXT_LABEL, questionOf, seasonOf } from './logic.js';
import {
  watch, advance, undo, resetGame, adjustFruit, extendDeadline, isAdmin, loadKeys, collectSubs,
} from './store.js';
import { $, esc, roundLabel, phaseLabel, startTicker, keepLabel } from './ui.js';

const g = (params.get('g') || '').toLowerCase();
let game = null;
let classes = [];
let subs = [];
let busy = false;

const user = await ready();
if (!g || !(await isAdmin(g, user.uid))) {
  location.replace(`/?g=${encodeURIComponent(g)}`);
  throw new Error('not admin');
}
$('#gameName').textContent = g;

startTicker(() => game?.deadlineAt, $('#timer'));

watch(g, {
  onGame: (v) => { game = v; render(); },
  onClasses: (v) => { classes = v; render(); },
  onSubs: (v) => { subs = v; render(); },
  onError: (e) => { $('#ctlErr').textContent = `연결 오류: ${e.message}`; },
});

function currentKind() {
  if (!game) return null;
  if (game.phase === 'quiz_open' || game.phase === 'quiz_reveal') return 'quiz';
  if (['store_open', 'store_locked', 'encounter_reveal'].includes(game.phase)) return 'store';
  return null;
}

function previewText() {
  if (!game) return '불러오는 중…';
  const q = questionOf(game.round);
  const optText = (qq) => (qq.type === 'ox' ? 'O / X' : qq.options.map((o, i) => `${i + 1}) ${o}`).join('  '));
  const answerText = (qq) => (qq.type === 'ox' ? qq.answer : `${qq.answer}번 ${qq.options[Number(qq.answer) - 1]}`);
  switch (game.phase) {
    case 'lobby':
      return '출력 창을 프로젝터에 띄우고, 반 선생님 12명이 QR로 들어왔는지 확인한 뒤 시작하세요.';
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

  const kind = currentKind();
  const now = kind ? collectSubs(subs, game.round, kind) : {};
  const count = Object.keys(now).length;
  $('#subCount').textContent = kind ? `제출 ${count}/12` : '';
  $('#subCount').classList.toggle('hidden', !kind);

  const q = questionOf(game.round);
  $('#classRows').innerHTML = classes.map((c) => {
    let cell = '<span class="muted">—</span>';
    if (kind === 'quiz' && c.id in now) {
      const ok = game.phase === 'quiz_reveal' ? (now[c.id] === q.answer ? ' ok' : ' no') : '';
      cell = `<span class="pill${ok}">답 ${esc(now[c.id])}</span>`;
    } else if (kind === 'store' && c.id in now) {
      cell = `<span class="pill">창고 ${esc(now[c.id])}개</span>`;
    } else if (kind) {
      cell = '<span class="muted">미제출</span>';
    }
    return `<tr class="grade-${c.grade}">
      <td><span class="dot"></span>${esc(c.name)}</td>
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
  if (game?.phase === 'quiz_open' || game?.phase === 'store_open') {
    const kind = game.phase === 'quiz_open' ? 'quiz' : 'store';
    const n = Object.keys(collectSubs(subs, game.round, kind)).length;
    if (n < 12 && !confirm(`아직 ${12 - n}개 반이 내지 않았어요. 마감할까요?`)) return;
  }
  run(() => advance(g));
});
$('#undoBtn').addEventListener('click', () => {
  if (confirm('직전 단계로 되돌릴까요? 그 단계에서 바뀐 열매도 함께 되돌아가요.')) run(() => undo(g));
});
$('#plusBtn').addEventListener('click', () => run(() => extendDeadline(g, game.deadlineAt, 10)));
$('#resetBtn').addEventListener('click', () => {
  if (confirm('모든 반을 열매 10개로 되돌리고 처음부터 시작할까요? QR은 그대로 쓸 수 있어요.')) run(() => resetGame(g));
});
$('#classRows').addEventListener('click', (e) => {
  const b = e.target.closest('[data-adj]');
  if (!b) return;
  const c = classes.find((x) => x.id === b.dataset.adj);
  run(() => adjustFruit(g, c.id, c.fruit + Number(b.dataset.d)));
});

$('#openDisplay').addEventListener('click', () => {
  window.open(`/display?g=${encodeURIComponent(g)}`, 'farm-display', 'popup,width=1280,height=720');
});

// 미리 보기 목록
$('#qList').innerHTML = `<h3 style="font-size:20px;margin-bottom:8px">감사 농사 문제</h3><ol style="margin:0;padding-left:22px;line-height:1.7">${
  QUESTIONS.map((q, i) => `<li><b>${SEASONS[Math.floor(i / 2)]} ${(i % 2) + 1}</b> ${esc(q.q)} → <b>${
    q.type === 'ox' ? q.answer : `${q.answer}) ${esc(q.options[Number(q.answer) - 1])}`}</b></li>`).join('')}</ol>`;
$('#encList').innerHTML = `<h3 style="font-size:20px;margin-bottom:8px">계절별 인카운터</h3>${
  ENCOUNTERS.map((list, s) => `<p style="margin:0 0 6px"><b>${SEASONS[s]}</b> ${
    list.map((e) => `${esc(e.name)}(×${e.mult}${e.keep !== 1 ? `, ${keepLabel(e.keep)}` : ''})`).join(' · ')}</p>`).join('')}`;

// QR
const keys = await loadKeys(g);
$('#qrGrid').innerHTML = CLASSES.map((c) => {
  const url = `${location.origin}/teacher?g=${encodeURIComponent(g)}&c=${c.id}&t=${keys[c.id] || ''}`;
  let svg = '';
  if (window.qrcode) {
    const qr = window.qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    svg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }
  return `<div class="qr-card grade-${c.grade}"><h3>${esc(c.name)}</h3>${svg}<div><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></div></div>`;
}).join('');
$('#printQr').addEventListener('click', () => {
  $('#qrPanel').open = true;
  window.print();
});
