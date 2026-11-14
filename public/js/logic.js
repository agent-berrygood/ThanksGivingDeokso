// 감사 열매 농장 — 순수 게임 로직 (브라우저·node 공용, Firebase 의존 없음)
import {
  CLASSES, ENCOUNTERS, ENCOUNTER_BY_KEY, START_FRUIT, ROUNDS, JOINT_GOAL, questionsOf,
  FARM_MULT, JUSTICE_PER_VILLAGE, VILLAGE_BONUS,
} from './data.js';

export const ALL_IDS = CLASSES.map((c) => c.id);
// 이번 게임에 참여하는 반 (시작 전이면 전체)
export const activeOf = (game) => (game?.active?.length ? game.active : ALL_IDS);

export const seasonOf = (round) => Math.floor(round / 2);
export const roundInSeason = (round) => (round % 2) + 1;
export const questionOf = (round, qset) => questionsOf(qset)[round];

// 정수 0..fruit 로 맞춤
export function clampContribution(value, fruit) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, Math.max(0, Math.floor(fruit)));
}

// 반 친구들이 각자 낸 숫자들의 평균 (소수점 버림). 각 숫자는 0..보유량으로 맞춘다.
export function averageFloor(values, fruit) {
  const list = (values || []).map((v) => clampContribution(v, fruit));
  if (!list.length) return 0;
  return Math.floor(list.reduce((x, y) => x + y, 0) / list.length + 1e-9);
}

// 좋음·보통·나쁨 중 하나를 같은 확률로, 그 안에서 카드 하나를 뽑는다 (이전 결과와 무관)
export function drawEncounter(rng = Math.random) {
  const pickOf = (list) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  const tier = pickOf(ENCOUNTERS);
  return ENCOUNTER_BY_KEY[pickOf(tier.cards).key];
}

// answers: { classId: 'O' | 'X' | '1'..'4' }  → { classId: 맞혔는지 }
export function scoreQuiz(answers, correct, classIds = CLASSES.map((c) => c.id)) {
  const out = {};
  for (const id of classIds) out[id] = answers[id] === correct;
  return out;
}

// 정의 창고: 누적 열매 → 이웃 마을 수
export const villagesOf = (justiceTotal) => Math.floor((justiceTotal || 0) / JUSTICE_PER_VILLAGE);

// 이번 라운드 정의 창고에 낸 열매를 빼고, 누적·이웃 마을 수를 계산한다
// 이번 라운드에 새로 생긴 마을은 이번 라운드에 1개 이상 낸 반의 '우리 반 마을'이 된다
// fruits: { id: 보유 }, gifts: { id: 낸 수 }, prevTotal: 지난 라운드까지 누적, mine: { id: 지금까지 우리 반 마을 }
export function applyJustice(fruits, gifts, prevTotal = 0, classIds = CLASSES.map((c) => c.id), mine = {}) {
  const perClass = {};
  let added = 0;
  for (const id of classIds) {
    const before = fruits[id] ?? 0;
    const g = clampContribution(gifts[id] ?? 0, before);
    added += g;
    perClass[id] = { before, g, after: before - g, eligible: g >= 1 };
  }
  const total = (prevTotal || 0) + added;
  const villages = villagesOf(total);
  const built = villages - villagesOf(prevTotal || 0);
  for (const id of classIds) {
    const p = perClass[id];
    p.credit = p.eligible ? built : 0;
    p.villages = (mine[id] || 0) + p.credit;
  }
  return { added, total, villages, built, perClass };
}

// 감사 농사 배율: 맞힌 반만. 이번 라운드 정의 창고에 낸 반은 우리 반 마을 1개당 +0.3
export function farmMult(correct, eligible, villages) {
  if (!correct) return 1;
  return Math.round((FARM_MULT + (eligible ? VILLAGE_BONUS * villages : 0)) * 100) / 100;
}

const floorSafe = (x) => Math.floor(x + 1e-9);

// fruits: { classId: 보유 }, contributions: { classId: 낸 수 } (없으면 0)
// farm: { classId: 감사 농사 배율 } (없으면 1) — 남긴 열매에 먼저 곱하고, 그다음 날씨의 keep을 곱한다
export function applyStore(fruits, contributions, encounterKey, classIds = CLASSES.map((c) => c.id), farm = {}) {
  const enc = ENCOUNTER_BY_KEY[encounterKey];
  if (!enc) throw new Error(`unknown encounter ${encounterKey}`);
  const c = {};
  let X = 0;
  for (const id of classIds) {
    c[id] = clampContribution(contributions[id] ?? 0, fruits[id] ?? 0);
    X += c[id];
  }
  const n = classIds.length;
  const pool = X * enc.mult;
  const share = floorSafe(pool / n);
  const perClass = {};
  for (const id of classIds) {
    const before = fruits[id] ?? 0;
    const leftover = before - c[id];
    const fm = farm[id] ?? 1;
    const farmed = floorSafe(leftover * fm);
    const kept = floorSafe(farmed * enc.keep);
    // 받은 몫 가운데 다른 반이 낸 열매에서 온 부분
    const fromOthers = Math.min(share, floorSafe(((X - c[id]) * enc.mult) / n));
    perClass[id] = { before, c: c[id], leftover, farm: fm, farmed, kept, share, fromOthers, after: kept + share };
  }
  return { enc: enc.key, tier: enc.tier, X, mult: enc.mult, keep: enc.keep, pool, share, n, perClass };
}

export function initialFruits(classIds = CLASSES.map((c) => c.id)) {
  return Object.fromEntries(classIds.map((id) => [id, START_FRUIT]));
}

// 같은 인카운터에서 참여한 반이 매 라운드 열매를 전부 감사 창고에 넣었다면? (전부 넣으면 남긴 열매가 없어 감사 농사·정의 창고는 영향 없음)
// history: [{ round, enc: key }]
export function simulateAllShare(history, classIds = CLASSES.map((c) => c.id)) {
  let fruits = initialFruits(classIds);
  for (const h of [...history].sort((a, b) => a.round - b.round)) {
    if (!h.enc) continue;
    const r = applyStore(fruits, fruits, h.enc, classIds);
    fruits = Object.fromEntries(classIds.map((id) => [id, r.perClass[id].after]));
  }
  return { fruits, total: Object.values(fruits).reduce((a, b) => a + b, 0) };
}

// 열매 많은 순, 동점이면 창고에 더 많이 넣은 반이 앞
export function rank(classes) {
  return [...classes].sort((a, b) => b.fruit - a.fruit || (b.shared ?? 0) - (a.shared ?? 0) || a.order - b.order);
}

// 모든 반이 목표 이상이면 공동우승
export function jointWin(classes, goal = JOINT_GOAL) {
  return classes.length > 0 && classes.every((c) => c.fruit >= goal);
}

export function awards(classes, goal = JOINT_GOAL) {
  const ranked = rank(classes);
  const byGrade = {};
  for (const c of ranked) if (!byGrade[c.grade]) byGrade[c.grade] = c;
  const sharer = [...classes].sort((a, b) => (b.shared ?? 0) - (a.shared ?? 0) || b.fruit - a.fruit || a.order - b.order)[0];
  const justice = [...classes].sort((a, b) => (b.justice ?? 0) - (a.justice ?? 0) || b.fruit - a.fruit || a.order - b.order)[0];
  const lowest = ranked[ranked.length - 1];
  return {
    ranked,
    gradeWinners: byGrade,
    sharer,
    justice,
    winner: ranked[0],
    lowest,
    joint: jointWin(classes, goal),
    goal,
    total: classes.reduce((a, c) => a + c.fruit, 0),
  };
}

// 다음 단계 계산 (상태 전이표)
export function nextPhase(phase, round) {
  switch (phase) {
    case 'lobby': return { phase: 'justice_open', round: 0 };
    case 'justice_open': return { phase: 'quiz_open', round };
    case 'quiz_open': return { phase: 'quiz_reveal', round };
    case 'quiz_reveal': return { phase: 'store_open', round };
    case 'store_open': return { phase: 'store_locked', round };
    case 'store_locked': return { phase: 'encounter_reveal', round };
    case 'encounter_reveal':
      return round + 1 >= ROUNDS ? { phase: 'result', round } : { phase: 'justice_open', round: round + 1 };
    default: return null;
  }
}

export const NEXT_LABEL = {
  lobby: '게임 시작 (봄 라운드 1)',
  justice_open: '정의 창고 마감, 감사 농사 시작',
  quiz_open: '마감하고 정답 공개',
  quiz_reveal: '창고 회의 시작',
  store_open: '창고 마감',
  store_locked: '랜덤 인카운터 뽑기',
  encounter_reveal: '다음 라운드',
  result: '',
};

export function randomToken(len = 10, rng = Math.random) {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += abc[Math.floor(rng() * abc.length)];
  return s;
}
