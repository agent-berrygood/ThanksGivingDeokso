// 화면 공용 도우미
import { SEASONS, PHASE_LABEL, ROUNDS } from './data.js';
import { seasonOf, roundInSeason } from './logic.js';

export const $ = (sel, root = document) => root.querySelector(sel);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function roundLabel(game) {
  if (!game || game.phase === 'lobby') return '시작 전';
  if (game.phase === 'result') return '최종 결과';
  return `${SEASONS[seasonOf(game.round)]} ${roundInSeason(game.round)}라운드 · ${game.round + 1}/${ROUNDS}`;
}

export const phaseLabel = (p) => PHASE_LABEL[p] || '';

export function secondsLeft(deadlineAt) {
  if (!deadlineAt) return null;
  return Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
}

// 남은 시간을 1초마다 그리는 타이머
export function startTicker(getDeadline, el) {
  const draw = () => {
    const s = secondsLeft(getDeadline());
    if (s === null) {
      el.textContent = '';
      el.classList.remove('zero');
      return;
    }
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    el.classList.toggle('zero', s === 0);
  };
  draw();
  return setInterval(draw, 250);
}

export function signed(n) {
  return n > 0 ? `+${n}` : n < 0 ? `${n}` : '±0';
}

export const keepLabel = (keep) => (keep === 1 ? '' : keep === 0.5 ? '남긴 열매 절반' : keep === 0.25 ? '남긴 열매 1/4' : `남긴 열매 ×${keep}`);
