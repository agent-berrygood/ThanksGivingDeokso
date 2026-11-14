import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStore, clampContribution, drawEncounter, scoreQuiz, simulateAllShare, initialFruits, nextPhase, awards, seasonOf,
  averageFloor, applyJustice, farmMult, villagesOf,
} from '../public/js/logic.js';
import { CLASSES, ENCOUNTERS, QUESTIONS, ENCOUNTER_BY_KEY } from '../public/js/data.js';

const ids = CLASSES.map((c) => c.id);
const all = (v) => Object.fromEntries(ids.map((id) => [id, v]));

test('12개 반, 8문제(O/X·4지선다 번갈아)', () => {
  assert.equal(ids.length, 12);
  assert.equal(QUESTIONS.length, 8);
  QUESTIONS.forEach((q, i) => assert.equal(q.type, i % 2 === 0 ? 'ox' : 'mc'));
});

test('보통 날씨: 모두 10개 넣으면 ×1.5 → 반마다 15개', () => {
  const r = applyStore(all(10), all(10), 'normal-clear');
  assert.equal(r.X, 120);
  assert.equal(r.share, 15);
  ids.forEach((id) => assert.equal(r.perClass[id].after, 15));
});

test('좋음 날씨: 한 반만 0개 → 나머지 18개, 안 낸 반 28개', () => {
  const contrib = all(10);
  contrib['faith-1'] = 0;
  const r = applyStore(all(10), contrib, 'good-rain');
  assert.equal(r.X, 110);
  assert.equal(r.share, 18); // 220 ÷ 12
  assert.equal(r.perClass['faith-1'].after, 28);
  assert.equal(r.perClass['hope-2'].after, 18);
});

test('나쁨 날씨: ×1.5, 남긴 열매 절반(버림)', () => {
  const contrib = all(0);
  contrib['love-1'] = 7; // 12개 중 7개 냄 → 남긴 5 → 절반 2
  const r = applyStore(all(12), contrib, 'bad-typhoon');
  assert.equal(r.X, 7);
  assert.equal(r.share, Math.floor((7 * 1.5) / 12)); // 0
  assert.equal(r.perClass['love-1'].kept, 2);
  assert.equal(r.perClass['faith-1'].kept, 6);
});

test('감사 농사: 맞힌 반은 남긴 열매 ×2.0 먼저, 그다음 날씨', () => {
  const farm = { 'faith-1': 2, 'faith-2': 2.3 };
  const r = applyStore(all(20), all(8), 'bad-crow', ids, farm);
  // 남긴 12 → ×2 = 24 → 나쁨 절반 12, 창고 96 × 1.5 ÷ 12 = 12
  assert.equal(r.perClass['faith-1'].farmed, 24);
  assert.equal(r.perClass['faith-1'].kept, 12);
  assert.equal(r.perClass['faith-1'].after, 24);
  assert.equal(r.perClass['faith-2'].farmed, 27); // 12 × 2.3 = 27.6 → 27
  assert.equal(r.perClass['love-1'].farmed, 12); // 못 맞힘
  assert.equal(r.perClass['love-1'].after, 6 + 12);
});

test('제출값은 0..보유량 정수로 제한', () => {
  assert.equal(clampContribution(15, 10), 10);
  assert.equal(clampContribution(-3, 10), 0);
  assert.equal(clampContribution('4', 10), 4);
  assert.equal(clampContribution(3.7, 10), 3);
  assert.equal(clampContribution('abc', 10), 0);
  const r = applyStore(all(5), all(99), 'normal-clear');
  assert.equal(r.X, 60);
});

test('인카운터: 좋음·보통·나쁨 같은 확률, 반복 가능', () => {
  assert.equal(ENCOUNTERS.length, 3);
  const seen = { good: 0, normal: 0, bad: 0 };
  for (let t = 0; t < 300; t++) {
    const e = drawEncounter(() => t / 300);
    seen[e.tier]++;
    assert.ok(ENCOUNTER_BY_KEY[e.key]);
  }
  assert.deepEqual(seen, { good: 100, normal: 100, bad: 100 });
  assert.equal(drawEncounter(() => 0).tier, 'good');
  assert.equal(drawEncounter(() => 0.99).tier, 'bad');
  assert.equal(seasonOf(7), 3);
});

test('친구들 숫자 평균: 소수점 버림, 보유량 넘으면 보유량으로', () => {
  assert.equal(averageFloor([0, 0, 0, 1, 1], 10), 0); // 0.4
  assert.equal(averageFloor([3, 4, 4], 10), 3); // 3.67
  assert.equal(averageFloor([10, 50], 10), 10);
  assert.equal(averageFloor([], 10), 0);
});

test('퀴즈 채점: 맞힌 반만 true, 미제출은 false', () => {
  const s = scoreQuiz({ 'faith-1': 'O', 'faith-2': 'X' }, 'O');
  assert.equal(s['faith-1'], true);
  assert.equal(s['faith-2'], false);
  assert.equal(s['love-4'], false);
});

test('정의 창고: 누적 24개마다 이웃 마을, 1개 이상 낸 반만 자격', () => {
  const gifts = all(1);
  gifts['love-4'] = 0;
  gifts['hope-1'] = 5;
  const r = applyJustice(all(10), gifts, 40);
  assert.equal(r.added, 15);
  assert.equal(r.total, 55);
  assert.equal(r.villages, 2);
  assert.equal(r.built, 1);
  assert.equal(r.perClass['hope-1'].after, 5);
  assert.equal(r.perClass['love-4'].eligible, false);
  assert.equal(r.perClass['faith-1'].eligible, true);
  assert.equal(villagesOf(23), 0);
  assert.equal(villagesOf(24), 1);
});

test('감사 농사 배율: 기본 ×2.0, 낸 반은 우리 반 마을당 +0.3, 틀리면 ×1', () => {
  assert.equal(farmMult(true, true, 3), 2.9);
  assert.equal(farmMult(true, false, 3), 2);
  assert.equal(farmMult(false, true, 3), 1);
});

test('모두 나눴다면 시뮬레이션', () => {
  const history = [{ round: 0, quiz: all(true), enc: 'good-rain' }];
  const sim = simulateAllShare(history);
  // 10 × 12 × 2 ÷ 12 = 20
  assert.equal(sim.fruits['faith-1'], 20);
  assert.equal(sim.total, 240);
  assert.deepEqual(initialFruits()['love-4'], 10);
});

test('상태 전이: 8라운드 후 결과', () => {
  let s = { phase: 'lobby', round: 0 };
  const seen = [];
  while (s.phase !== 'result') {
    s = nextPhase(s.phase, s.round);
    seen.push(s.phase);
  }
  assert.equal(seen.filter((p) => p === 'encounter_reveal').length, 8);
  assert.equal(seen.filter((p) => p === 'justice_open').length, 8);
  assert.equal(seen[0], 'justice_open');
  assert.equal(s.round, 7);
});

test('시상: 학년별 1등, 나눔상, 정의상, 동점은 나눈 반 우선', () => {
  const classes = CLASSES.map((c) => ({ ...c, fruit: 10, shared: 0 }));
  classes.find((c) => c.id === 'hope-3').fruit = 30;
  classes.find((c) => c.id === 'hope-2').fruit = 30;
  classes.find((c) => c.id === 'hope-2').shared = 5;
  classes.find((c) => c.id === 'love-4').shared = 40;
  classes.find((c) => c.id === 'faith-3').justice = 9;
  const a = awards(classes);
  assert.equal(a.justice.id, 'faith-3');
  assert.equal(a.gradeWinners.hope.id, 'hope-2');
  assert.equal(a.sharer.id, 'love-4');
  assert.equal(a.ranked[0].id, 'hope-2');
});

import { jointWin, activeOf, ALL_IDS } from '../public/js/logic.js';
import { JOINT_GOAL, PRACTICE_ROUND } from '../public/js/data.js';

test('2개 반만 참여: ÷2로 나눔', () => {
  const two = ['faith-1', 'love-3'];
  const r = applyStore({ 'faith-1': 10, 'love-3': 10 }, { 'faith-1': 10, 'love-3': 0 }, 'good-rain', two);
  assert.equal(r.n, 2);
  assert.equal(r.share, 10); // 10 × 2 ÷ 2
  assert.equal(r.perClass['faith-1'].after, 10);
  assert.equal(r.perClass['love-3'].after, 20);
  assert.equal(r.perClass['love-3'].fromOthers, 10); // 받은 10개 모두 다른 반 몫
  assert.equal(r.perClass['faith-1'].fromOthers, 0);
  assert.equal(r.perClass['hope-1'], undefined);
});

test('참여 반: 시작 전에는 전체, 시작 후에는 확정 목록', () => {
  assert.deepEqual(activeOf(null), ALL_IDS);
  assert.deepEqual(activeOf({ active: ['hope-2'] }), ['hope-2']);
});

test('공동우승: 모든 반이 목표 이상일 때만', () => {
  assert.equal(JOINT_GOAL, 150);
  assert.equal(jointWin([{ fruit: 150 }, { fruit: 350 }]), true);
  assert.equal(jointWin([{ fruit: 149 }, { fruit: 999 }]), false);
  assert.equal(jointWin([]), false);
});

test('연습 라운드 예시: 단비(좋음 ×2), 4개 반', () => {
  const ids = PRACTICE_ROUND.names.map((_, i) => `p${i}`);
  const r = applyStore(Object.fromEntries(ids.map((id) => [id, 10])), Object.fromEntries(ids.map((id, i) => [id, PRACTICE_ROUND.contrib[i]])), PRACTICE_ROUND.encounter, ids);
  assert.equal(r.X, 25);
  assert.equal(r.share, 12); // 50 ÷ 4
  assert.deepEqual(ids.map((id) => r.perClass[id].after), [12, 17, 22, 12]);
});

import { QUESTION_SETS, DEFAULT_QSET } from '../public/js/data.js';
import { questionOf } from '../public/js/logic.js';

test('문제 세트: 세트마다 8문제, 계절마다 O/X + 4지선다, 정답 형식', () => {
  assert.equal(DEFAULT_QSET, 'set2');
  for (const s of QUESTION_SETS) {
    assert.equal(s.questions.length, 8, s.key);
    s.questions.forEach((q, i) => {
      assert.equal(q.type, i % 2 === 0 ? 'ox' : 'mc');
      if (q.type === 'ox') assert.ok(['O', 'X'].includes(q.answer));
      else {
        assert.equal(q.options.length, 4);
        assert.ok(['1', '2', '3', '4'].includes(q.answer));
      }
    });
  }
  const set2 = QUESTION_SETS[0].questions;
  assert.ok(set2.some((q) => q.answer === 'X'), '새 세트에는 X 정답도 있다');
  const set1Texts = new Set(QUESTION_SETS[1].questions.map((q) => q.q));
  assert.ok(set2.every((q) => !set1Texts.has(q.q)), '새 세트는 이전 문제와 겹치지 않는다');
});

test('questionOf: 세트 지정, 없으면 기본 세트', () => {
  assert.equal(questionOf(0).q, QUESTION_SETS[0].questions[0].q);
  assert.equal(questionOf(0, 'set1').q, '씨앗이 싹트려면 물이 필요하다');
  assert.equal(questionOf(2, 'nope').answer, 'X');
});

test('정의 창고: 새 마을은 그 라운드에 낸 반만 얻는다 (늦게 내면 지난 마을은 없음)', () => {
  // 1라운드: 1~11반 2개씩(사랑 4반 0) → 누적 22, 마을 0
  const g1 = all(2);
  g1['love-4'] = 0;
  const r1 = applyJustice(all(10), g1, 0, ids, {});
  assert.equal(r1.villages, 0);
  // 2라운드: 같은 반들이 2개씩 → 누적 44, 마을 1 → 1~11반만 얻음
  const mine1 = Object.fromEntries(ids.map((id) => [id, r1.perClass[id].villages]));
  const r2 = applyJustice(all(10), g1, r1.total, ids, mine1);
  assert.equal(r2.built, 1);
  assert.equal(r2.perClass['faith-1'].villages, 1);
  assert.equal(r2.perClass['love-4'].villages, 0);
  // 3라운드: 12개 반 모두 1개 → 누적 56, 마을 2 → 새 마을 1개는 모두 얻음
  const mine2 = Object.fromEntries(ids.map((id) => [id, r2.perClass[id].villages]));
  const r3 = applyJustice(all(10), all(1), r2.total, ids, mine2);
  assert.equal(r3.villages, 2);
  assert.equal(r3.perClass['faith-1'].villages, 2);
  assert.equal(r3.perClass['love-4'].villages, 1);
  assert.equal(farmMult(true, true, r3.perClass['love-4'].villages), 2.3);
  assert.equal(farmMult(true, true, r3.perClass['faith-1'].villages), 2.6);
});
