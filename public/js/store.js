// Firestore 읽기·쓰기 — 진행자 동작과 공용 구독
import {
  db, doc, collection, getDoc, getDocs, setDoc, writeBatch, query, orderBy, limit, onSnapshot, serverTimestamp,
} from './fb.js';
import { CLASSES, START_FRUIT, QUIZ_SECONDS, STORE_SECONDS } from './data.js';
import {
  nextPhase, scoreQuiz, applyStore, drawEncounter, questionOf, randomToken,
} from './logic.js';

export const refs = (g) => ({
  game: doc(db, 'games', g),
  classes: collection(db, 'games', g, 'classes'),
  keys: collection(db, 'games', g, 'keys'),
  subs: collection(db, 'games', g, 'subs'),
  snaps: collection(db, 'games', g, 'snaps'),
  secret: doc(db, 'secrets', g),
});

export const subId = (round, kind, classId, token) => `${round}-${kind}-${classId}-${token}`;

export function validGameId(g) {
  return /^[a-z0-9][a-z0-9-]{2,39}$/.test(g || '');
}

// 이 기기를 진행자로 등록 (이미 등록돼 있으면 그대로)
export async function claimAdmin(g, pin, uid) {
  const ref = doc(db, 'games', g, 'admins', uid);
  try {
    const s = await getDoc(ref);
    if (s.exists()) return true;
  } catch (e) { /* 없으면 아래에서 생성 */ }
  await setDoc(ref, { pin: String(pin) });
  return true;
}

export async function isAdmin(g, uid) {
  try {
    return (await getDoc(doc(db, 'games', g, 'admins', uid))).exists();
  } catch (e) {
    return false;
  }
}

// 새 게임: PIN 저장 → 진행자 등록 → 초기화
export async function createGame(g, pin, uid) {
  await setDoc(refs(g).secret, { pin: String(pin) });
  await claimAdmin(g, pin, uid);
  await resetGame(g);
}

// 게임 초기화. 반 토큰(QR)은 유지한다.
export async function resetGame(g) {
  const r = refs(g);
  const [keySnap, subSnap, snapSnap] = await Promise.all([getDocs(r.keys), getDocs(r.subs), getDocs(r.snaps)]);
  const tokens = Object.fromEntries(keySnap.docs.map((d) => [d.id, d.data().token]));
  // 지난 판의 제출·되돌리기 기록 삭제 (400개씩)
  const stale = [...subSnap.docs, ...snapSnap.docs];
  for (let i = 0; i < stale.length; i += 400) {
    const b = writeBatch(db);
    stale.slice(i, i + 400).forEach((d) => b.delete(d.ref));
    await b.commit();
  }
  const b = writeBatch(db);
  b.set(r.game, {
    phase: 'lobby', round: 0, deadlineAt: null, history: [], last: null, updatedAt: serverTimestamp(),
  });
  for (const c of CLASSES) {
    b.set(doc(r.classes, c.id), {
      grade: c.grade, no: c.no, name: c.name, order: c.order, fruit: START_FRUIT, shared: 0, correct: 0,
    });
    b.set(doc(r.keys, c.id), { token: tokens[c.id] || randomToken() });
  }
  await b.commit();
}

export async function loadKeys(g) {
  const s = await getDocs(refs(g).keys);
  return Object.fromEntries(s.docs.map((d) => [d.id, d.data().token]));
}

const toMap = (snap) => Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));

// 제출 문서 → { classId: value } (해당 라운드·종류만)
export function collectSubs(subDocs, round, kind) {
  const out = {};
  for (const s of subDocs) if (s.round === round && s.kind === kind) out[s.classId] = s.value;
  return out;
}

// 다음 단계로 진행. 직전 상태를 snaps에 남겨 되돌릴 수 있게 한다.
export async function advance(g, rng = Math.random) {
  const r = refs(g);
  const [gameSnap, classSnap, subSnap] = await Promise.all([getDoc(r.game), getDocs(r.classes), getDocs(r.subs)]);
  const game = gameSnap.data();
  const classes = toMap(classSnap);
  const subs = subSnap.docs.map((d) => d.data());
  const next = nextPhase(game.phase, game.round);
  if (!next) return game;

  const b = writeBatch(db);
  b.set(doc(r.snaps, String(Date.now()).padStart(15, '0')), { game, classes, seq: Date.now(), at: serverTimestamp() });

  const now = Date.now();
  const update = { phase: next.phase, round: next.round, updatedAt: serverTimestamp(), deadlineAt: null };
  const history = [...(game.history || [])];
  const entry = (round) => {
    let h = history.find((x) => x.round === round);
    if (!h) {
      h = { round };
      history.push(h);
    }
    return h;
  };

  if (next.phase === 'quiz_open') {
    update.deadlineAt = now + QUIZ_SECONDS * 1000;
    update.last = null;
  }

  if (next.phase === 'quiz_reveal') {
    const q = questionOf(game.round);
    const answers = collectSubs(subs, game.round, 'quiz');
    const delta = scoreQuiz(answers, q.answer);
    for (const c of CLASSES) {
      if (!delta[c.id]) continue;
      b.update(doc(r.classes, c.id), {
        fruit: classes[c.id].fruit + delta[c.id], correct: (classes[c.id].correct || 0) + 1,
      });
    }
    entry(game.round).quiz = delta;
    update.history = history;
    update.last = { quiz: { answers, correct: q.answer, delta } };
  }

  if (next.phase === 'store_open') {
    update.deadlineAt = now + STORE_SECONDS * 1000;
    update.last = game.last || null;
  }

  if (next.phase === 'store_locked') {
    update.last = game.last || null;
  }

  if (next.phase === 'encounter_reveal') {
    const contributions = collectSubs(subs, game.round, 'store');
    const fruits = Object.fromEntries(CLASSES.map((c) => [c.id, classes[c.id].fruit]));
    const enc = drawEncounter(game.round, history, rng);
    const res = applyStore(fruits, contributions, enc.key);
    for (const c of CLASSES) {
      const p = res.perClass[c.id];
      b.update(doc(r.classes, c.id), { fruit: p.after, shared: (classes[c.id].shared || 0) + p.c });
    }
    Object.assign(entry(game.round), { enc: enc.key, X: res.X, share: res.share });
    update.history = history;
    update.last = { store: res };
  }

  if (next.phase === 'result') {
    update.last = game.last || null;
  }

  b.update(r.game, update);
  await b.commit();
  return { ...game, ...update };
}

// 직전 단계로 되돌리기
export async function undo(g) {
  const r = refs(g);
  const s = await getDocs(query(r.snaps, orderBy('seq', 'desc'), limit(1)));
  if (s.empty) return false;
  const snap = s.docs[0];
  const { game, classes } = snap.data();
  const b = writeBatch(db);
  b.set(r.game, { ...game, updatedAt: serverTimestamp() });
  for (const [id, c] of Object.entries(classes)) b.set(doc(r.classes, id), c);
  b.delete(snap.ref);
  await b.commit();
  return true;
}

// 진행자가 반 열매를 직접 조정
export async function adjustFruit(g, classId, fruit) {
  const b = writeBatch(db);
  b.update(doc(refs(g).classes, classId), { fruit: Math.max(0, Math.floor(fruit)) });
  await b.commit();
}

export async function extendDeadline(g, currentDeadline, seconds) {
  const base = Math.max(Date.now(), currentDeadline || 0);
  const b = writeBatch(db);
  b.update(refs(g).game, { deadlineAt: base + seconds * 1000 });
  await b.commit();
}

// 공용 구독: game, classes(배열), subs(진행자만)
export function watch(g, { onGame, onClasses, onSubs, onError }) {
  const r = refs(g);
  const offs = [];
  if (onGame) offs.push(onSnapshot(r.game, (s) => onGame(s.exists() ? s.data() : null), onError));
  if (onClasses) {
    offs.push(onSnapshot(r.classes, (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order);
      onClasses(list);
    }, onError));
  }
  if (onSubs) offs.push(onSnapshot(r.subs, (s) => onSubs(s.docs.map((d) => d.data())), onError));
  return () => offs.forEach((f) => f());
}
