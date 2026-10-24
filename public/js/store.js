// Firestore 읽기·쓰기 — 진행자 동작과 공용 구독
import {
  db, doc, collection, getDoc, getDocs, setDoc, deleteDoc, writeBatch, query, orderBy, limit, onSnapshot, serverTimestamp,
} from './fb.js';
import { CLASSES, START_FRUIT, QUIZ_SECONDS, STORE_SECONDS } from './data.js';
import {
  nextPhase, scoreQuiz, applyStore, drawEncounter, questionOf, randomToken,
} from './logic.js';

export const refs = (g) => ({
  game: doc(db, 'games', g),
  classes: collection(db, 'games', g, 'classes'),
  joinKey: doc(db, 'games', g, 'keys', 'join'),
  subs: collection(db, 'games', g, 'subs'),
  snaps: collection(db, 'games', g, 'snaps'),
});

export const claimsRef = (g, key) => collection(db, 'games', g, 'joins', key, 'claims');
export const subId = (round, kind, classId) => `${round}_${kind}_${classId}`;

export const joinUrl = (g, key) => `${location.origin}/t?s=${encodeURIComponent(g)}&k=${encodeURIComponent(key)}`;

const LAST = 'farm:lastSession';
export const rememberSession = (g) => { try { localStorage.setItem(LAST, g); } catch (e) { /* 저장 불가 */ } };
export const lastSession = () => { try { return localStorage.getItem(LAST) || ''; } catch (e) { return ''; } };

export async function isAdmin(g, uid) {
  if (!g) return false;
  try {
    return (await getDoc(doc(db, 'games', g, 'admins', uid))).exists();
  } catch (e) {
    return false;
  }
}

// 새 세션: 이 기기를 진행자로 등록하고 초기화
export async function createSession(uid) {
  const g = randomToken(8);
  await setDoc(doc(db, 'games', g, 'admins', uid), { at: serverTimestamp() });
  await resetGame(g);
  rememberSession(g);
  return g;
}

// 게임 초기화. 참여 키(QR)와 반 선택은 유지한다.
export async function resetGame(g) {
  const r = refs(g);
  let key = null;
  try {
    const k = await getDoc(r.joinKey);
    if (k.exists()) key = k.data().token;
  } catch (e) { /* 새 세션 */ }
  const [subSnap, snapSnap] = await Promise.all([getDocs(r.subs), getDocs(r.snaps)]);
  const stale = [...subSnap.docs, ...snapSnap.docs];
  for (let i = 0; i < stale.length; i += 400) {
    const b = writeBatch(db);
    stale.slice(i, i + 400).forEach((d) => b.delete(d.ref));
    await b.commit();
  }
  const b = writeBatch(db);
  b.set(r.game, {
    phase: 'lobby', round: 0, deadlineAt: null, history: [], last: null, showQr: false, updatedAt: serverTimestamp(),
  });
  for (const c of CLASSES) {
    b.set(doc(r.classes, c.id), {
      grade: c.grade, no: c.no, name: c.name, order: c.order, fruit: START_FRUIT, shared: 0, correct: 0,
    });
  }
  if (!key) b.set(r.joinKey, { token: randomToken(12) });
  await b.commit();
}

export async function loadJoinKey(g) {
  return (await getDoc(refs(g).joinKey)).data()?.token || '';
}

// 반 선택 (선생님) / 해제 (진행자 또는 본인)
export function claimClass(g, key, classId, uid) {
  return setDoc(doc(claimsRef(g, key), classId), { uid, at: serverTimestamp() });
}
export function releaseClass(g, key, classId) {
  return deleteDoc(doc(claimsRef(g, key), classId));
}
export function watchClaims(g, key, cb, onError) {
  return onSnapshot(claimsRef(g, key), (s) => {
    cb(Object.fromEntries(s.docs.map((d) => [d.id, d.data()])));
  }, onError);
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
  const update = { phase: next.phase, round: next.round, updatedAt: serverTimestamp(), deadlineAt: null, showQr: false };
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

  if (next.phase === 'store_locked' || next.phase === 'result') {
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

export async function setShowQr(g, on) {
  const b = writeBatch(db);
  b.update(refs(g).game, { showQr: !!on });
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

// QR SVG (qrcode-generator 전역 사용)
export function qrSvg(text, cell = 6) {
  if (!window.qrcode) return '';
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
}
