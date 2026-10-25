// 감사 열매 농장 — 순수 게임 로직 (브라우저·node 공용, Firebase 의존 없음)
import {
  CLASSES, ENCOUNTERS, ENCOUNTER_BY_KEY, START_FRUIT, QUIZ_REWARD, ROUNDS, JOINT_GOAL, questionsOf,
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

// 같은 계절 앞 라운드에서 나온 인카운터는 제외하고 같은 확률로 뽑는다
export function drawEncounter(round, history = [], rng = Math.random) {
  const season = seasonOf(round);
  const used = new Set(
    history.filter((h) => h.enc && seasonOf(h.round) === season && h.round !== round).map((h) => h.enc)
  );
  const pool = ENCOUNTERS[season].filter((e) => !used.has(e.key));
  const pick = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  return pick;
}

// answers: { classId: 'O' | 'X' | '1'..'4' }  → { classId: 보상 }
export function scoreQuiz(answers, correct, classIds = CLASSES.map((c) => c.id)) {
  const out = {};
  for (const id of classIds) out[id] = answers[id] === correct ? QUIZ_REWARD : 0;
  return out;
}

const floorSafe = (x) => Math.floor(x + 1e-9);

// fruits: { classId: 보유 }, contributions: { classId: 낸 수 } (없으면 0)
export function applyStore(fruits, contributions, encounterKey, classIds = CLASSES.map((c) => c.id)) {
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
    const kept = floorSafe(leftover * enc.keep);
    // 받은 몫 가운데 다른 반이 낸 열매에서 온 부분
    const fromOthers = Math.min(share, floorSafe(((X - c[id]) * enc.mult) / n));
    perClass[id] = { before, c: c[id], leftover, kept, share, fromOthers, after: kept + share };
  }
  return { enc: enc.key, X, mult: enc.mult, keep: enc.keep, pool, share, n, perClass };
}

export function initialFruits(classIds = CLASSES.map((c) => c.id)) {
  return Object.fromEntries(classIds.map((id) => [id, START_FRUIT]));
}

// 같은 퀴즈 결과·같은 인카운터에서 12개 반이 매 라운드 열매를 전부 창고에 넣었다면?
// history: [{ round, quiz: {id: 보상}, enc: key }]
export function simulateAllShare(history, classIds = CLASSES.map((c) => c.id)) {
  let fruits = initialFruits(classIds);
  for (const h of [...history].sort((a, b) => a.round - b.round)) {
    for (const id of classIds) fruits[id] += h.quiz?.[id] ?? 0;
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
  const lowest = ranked[ranked.length - 1];
  return {
    ranked,
    gradeWinners: byGrade,
    sharer,
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
    case 'lobby': return { phase: 'quiz_open', round: 0 };
    case 'quiz_open': return { phase: 'quiz_reveal', round };
    case 'quiz_reveal': return { phase: 'store_open', round };
    case 'store_open': return { phase: 'store_locked', round };
    case 'store_locked': return { phase: 'encounter_reveal', round };
    case 'encounter_reveal':
      return round + 1 >= ROUNDS ? { phase: 'result', round } : { phase: 'quiz_open', round: round + 1 };
    default: return null;
  }
}

export const NEXT_LABEL = {
  lobby: '게임 시작 (봄 라운드 1)',
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
