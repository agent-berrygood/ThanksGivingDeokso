import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStore, clampContribution, drawEncounter, scoreQuiz, simulateAllShare, initialFruits, nextPhase, awards, seasonOf,
} from '../public/js/logic.js';
import { CLASSES, ENCOUNTERS, QUESTIONS } from '../public/js/data.js';

const ids = CLASSES.map((c) => c.id);
const all = (v) => Object.fromEntries(ids.map((id) => [id, v]));

test('12개 반, 8문제(계절마다 O/X 1 + 4지선다 1)', () => {
  assert.equal(ids.length, 12);
  assert.equal(QUESTIONS.length, 8);
  QUESTIONS.forEach((q, i) => assert.equal(q.type, i % 2 === 0 ? 'ox' : 'mc'));
});

test('PRD 예시: 모두 10개, 배수 2 → 반마다 20개', () => {
  const r = applyStore(all(10), all(10), 'spring-normal');
  assert.equal(r.X, 120);
  assert.equal(r.share, 20);
  ids.forEach((id) => assert.equal(r.perClass[id].after, 20));
});

test('PRD 예시: 한 반만 0개 → 나머지 18개, 안 낸 반 28개', () => {
  const contrib = all(10);
  contrib['faith-1'] = 0;
  const r = applyStore(all(10), contrib, 'spring-normal');
  assert.equal(r.X, 110);
  assert.equal(r.share, 18);
  assert.equal(r.perClass['faith-1'].after, 28);
  assert.equal(r.perClass['hope-2'].after, 18);
});

test('꽃샘추위: ×1.5, 남긴 열매 절반(버림)', () => {
  const contrib = all(0);
  contrib['love-1'] = 7; // 12개 중 7개 냄 → 남긴 5 → 절반 2
  const r = applyStore(all(12), contrib, 'spring-frost');
  assert.equal(r.X, 7);
  assert.equal(r.share, Math.floor((7 * 1.5) / 12)); // 0
  assert.equal(r.perClass['love-1'].kept, 2);
  assert.equal(r.perClass['faith-1'].kept, 6);
});

test('폭염: ×3, 남긴 열매 1/4(버림)', () => {
  const r = applyStore(all(10), all(2), 'summer-heat');
  assert.equal(r.X, 24);
  assert.equal(r.share, 6);
  ids.forEach((id) => {
    assert.equal(r.perClass[id].kept, 2); // 8 × 1/4
    assert.equal(r.perClass[id].after, 8);
  });
});

test('제출값은 0..보유량 정수로 제한', () => {
  assert.equal(clampContribution(15, 10), 10);
  assert.equal(clampContribution(-3, 10), 0);
  assert.equal(clampContribution('4', 10), 4);
  assert.equal(clampContribution(3.7, 10), 3);
  assert.equal(clampContribution('abc', 10), 0);
  const r = applyStore(all(5), all(99), 'spring-normal');
  assert.equal(r.X, 60);
});

test('같은 계절 두 라운드에는 다른 인카운터', () => {
  for (let season = 0; season < 4; season++) {
    for (let k = 0; k < 3; k++) {
      const first = ENCOUNTERS[season][k];
      const r1 = season * 2;
      const history = [{ round: r1, enc: first.key }];
      for (let t = 0; t < 30; t++) {
        const e = drawEncounter(r1 + 1, history, () => t / 30);
        assert.notEqual(e.key, first.key);
        assert.ok(ENCOUNTERS[season].some((x) => x.key === e.key));
      }
    }
  }
  assert.equal(seasonOf(7), 3);
});

test('퀴즈 채점: 맞힌 반만 +2, 미제출은 0', () => {
  const s = scoreQuiz({ 'faith-1': 'O', 'faith-2': 'X' }, 'O');
  assert.equal(s['faith-1'], 2);
  assert.equal(s['faith-2'], 0);
  assert.equal(s['love-4'], 0);
});

test('모두 나눴다면 시뮬레이션', () => {
  const history = [{ round: 0, quiz: all(2), enc: 'spring-rain' }];
  const sim = simulateAllShare(history);
  // 12 × 12 × 3 ÷ 12 = 36
  assert.equal(sim.fruits['faith-1'], 36);
  assert.equal(sim.total, 432);
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
  assert.equal(s.round, 7);
});

test('시상: 학년별 1등, 나눔상, 동점은 나눈 반 우선', () => {
  const classes = CLASSES.map((c) => ({ ...c, fruit: 10, shared: 0 }));
  classes.find((c) => c.id === 'hope-3').fruit = 30;
  classes.find((c) => c.id === 'hope-2').fruit = 30;
  classes.find((c) => c.id === 'hope-2').shared = 5;
  classes.find((c) => c.id === 'love-4').shared = 40;
  const a = awards(classes);
  assert.equal(a.gradeWinners.hope.id, 'hope-2');
  assert.equal(a.sharer.id, 'love-4');
  assert.equal(a.ranked[0].id, 'hope-2');
});
