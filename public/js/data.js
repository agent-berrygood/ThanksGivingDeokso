// 감사 열매 농장 — 고정 데이터 (반, 인카운터, 문제)

export const START_FRUIT = 10;
export const QUIZ_REWARD = 2;
export const ROUNDS = 8; // 계절 4 × 라운드 2
export const QUIZ_SECONDS = 30;
export const STORE_SECONDS = 55; // 회의 40초 + 제출 15초
// 모든 참여 반이 각각 이만큼 이상 모으면 공동우승
// (시뮬레이션: 모든 반이 매번 절반씩 나누면 거의 항상 넘고, 25%만 나누거나 절반의 반이 안 나누면 못 넘음)
export const JOINT_GOAL = 100;

export const GRADES = [
  { key: 'faith', name: '믿음', school: '4학년', color: '#C2410C' },
  { key: 'hope', name: '소망', school: '5학년', color: '#15803D' },
  { key: 'love', name: '사랑', school: '6학년', color: '#1D4ED8' },
];

export const CLASSES = GRADES.flatMap((g, gi) =>
  [1, 2, 3, 4].map((no) => ({
    id: `${g.key}-${no}`,
    grade: g.key,
    gradeName: g.name,
    school: g.school,
    no,
    name: `${g.name} ${no}반`,
    order: gi * 4 + no,
  }))
);

export const SEASONS = ['봄', '여름', '가을', '추수'];

// keep: 창고에 넣지 않고 남긴 열매가 남는 비율 (1 = 그대로, 0.5 = 절반, 0.25 = 1/4)
export const ENCOUNTERS = [
  [
    { key: 'spring-rain', name: '단비', mult: 3, keep: 1, desc: '촉촉한 단비! 창고 열매가 3배로 불어나요.' },
    { key: 'spring-normal', name: '보통 날씨', mult: 2, keep: 1, desc: '평온한 봄날. 창고 열매가 2배가 돼요.' },
    { key: 'spring-frost', name: '꽃샘추위', mult: 1.5, keep: 0.5, desc: '갑자기 추워졌어요! 창고는 1.5배, 남긴 열매는 절반이 얼어 버려요.' },
  ],
  [
    { key: 'summer-heat', name: '폭염', mult: 3, keep: 0.25, desc: '뜨거운 폭염! 창고는 3배, 남긴 열매는 1/4만 남아요.' },
    { key: 'summer-monsoon', name: '장마', mult: 1.5, keep: 1, desc: '긴 장마. 창고 열매가 1.5배가 돼요.' },
    { key: 'summer-typhoon', name: '태풍', mult: 2, keep: 0.5, desc: '태풍이 지나갔어요! 창고는 2배, 남긴 열매는 절반이 날아가요.' },
  ],
  [
    { key: 'autumn-harvest', name: '풍년', mult: 3, keep: 1, desc: '풍년이에요! 창고 열매가 3배로 불어나요.' },
    { key: 'autumn-normal', name: '보통 날씨', mult: 2, keep: 1, desc: '맑은 가을 하늘. 창고 열매가 2배가 돼요.' },
    { key: 'autumn-locust', name: '메뚜기 떼', mult: 2, keep: 0.5, desc: '메뚜기 떼 습격! 창고는 2배, 남긴 열매는 절반을 먹혀요.' },
  ],
  [
    { key: 'harvest-feast', name: '추수 잔치', mult: 3, keep: 1, desc: '추수 잔치! 창고 열매가 3배로 불어나요.' },
    { key: 'harvest-normal', name: '보통 날씨', mult: 2, keep: 1, desc: '무사히 거둬들였어요. 창고 열매가 2배가 돼요.' },
    { key: 'harvest-crow', name: '까마귀 떼', mult: 2, keep: 0.5, desc: '까마귀 떼가 왔어요! 창고는 2배, 남긴 열매는 절반을 빼앗겨요.' },
  ],
];

export const ENCOUNTER_BY_KEY = Object.fromEntries(ENCOUNTERS.flat().map((e) => [e.key, e]));

// 문제 세트: 라운드 순서대로 8문제, 계절마다 O/X 1개(라운드 1) + 4지선다 1개(라운드 2)
// 진행자 컨트롤의 시작 전 화면에서 세트를 고른다. 첫 번째 세트가 기본값.
export const QUESTION_SETS = [
  {
    key: 'set2',
    name: '2회차 문제',
    questions: [
      { type: 'ox', q: '개구리는 겨울잠을 자고 봄에 깨어난다', answer: 'O' },
      { type: 'mc', q: '꽃의 꿀을 모으며 꽃가루를 옮겨 주는 곤충은?', options: ['꿀벌', '모기', '바퀴벌레', '무당벌레'], answer: '1' },
      { type: 'ox', q: '여름에는 겨울보다 낮이 짧다', answer: 'X' },
      { type: 'mc', q: '비가 그친 뒤 하늘에 생기는 일곱 빛깔 띠는?', options: ['구름', '번개', '무지개', '안개'], answer: '3' },
      { type: 'ox', q: '가을에 단풍이 들면 나뭇잎이 초록색으로 바뀐다', answer: 'X' },
      { type: 'mc', q: '추석을 대표하는 음식은?', options: ['떡국', '송편', '팥죽', '냉면'], answer: '2' },
      { type: 'ox', q: '벼를 거두어 껍질을 벗기면 쌀이 된다', answer: 'O' },
      { type: 'mc', q: '고마운 마음을 전하는 말이 아닌 것은?', options: ['감사합니다', '고마워요', '덕분이에요', '미안해요'], answer: '4' },
    ],
  },
  {
    key: 'set1',
    name: '1회차 문제',
    questions: [
      { type: 'ox', q: '씨앗이 싹트려면 물이 필요하다', answer: 'O' },
      { type: 'mc', q: '봄꽃이 아닌 것은?', options: ['개나리', '진달래', '벚꽃', '국화'], answer: '4' },
      { type: 'ox', q: '수박은 여름에 나는 과일이다', answer: 'O' },
      { type: 'mc', q: '여름 과일이 아닌 것은?', options: ['수박', '참외', '복숭아', '귤'], answer: '4' },
      { type: 'ox', q: '추석은 음력 8월 15일이다', answer: 'O' },
      { type: 'mc', q: '우리가 먹는 쌀은 어떤 식물에서 얻을까요?', options: ['보리', '벼', '밀', '옥수수'], answer: '2' },
      { type: 'ox', q: '미국의 추수감사절은 11월 넷째 주 목요일이다', answer: 'O' },
      { type: 'mc', q: "영어로 '감사합니다'는?", options: ['Hello', 'Sorry', 'Thank you', 'Goodbye'], answer: '3' },
    ],
  },
];
export const DEFAULT_QSET = QUESTION_SETS[0].key;
export const QSET_BY_KEY = Object.fromEntries(QUESTION_SETS.map((s) => [s.key, s]));
// 기본 세트의 문제 (예전 코드·테스트 호환)
export const QUESTIONS = QUESTION_SETS[0].questions;
export const questionsOf = (qset) => (QSET_BY_KEY[qset] || QUESTION_SETS[0]).questions;

// 시작 전 설명·연습 슬라이드 (reveal: '다음'을 한 번 더 눌러 정답·결과를 공개하는 슬라이드)
export const TUTORIAL = [
  { key: 'welcome', title: '감사 열매 농장' },
  { key: 'round', title: '한 라운드는 이렇게' },
  { key: 'store', title: '감사 창고 계산' },
  { key: 'weather', title: '계절마다 날씨가 바뀌어요' },
  { key: 'practiceQ', title: '연습 문제', reveal: true },
  { key: 'practiceRound', title: '연습 라운드', reveal: true },
  { key: 'joint', title: '이기는 방법은 두 가지' },
  { key: 'ready', title: '준비됐나요?' },
];

export const PRACTICE_QUESTION = { type: 'ox', q: '감사는 좋은 일이 있을 때만 하는 것이다', answer: 'X', note: '범사에 감사하라 (데살로니가전서 5:18)' };

// 연습 라운드 예시: 4개 반이 각자 낸 열매 (모두 10개에서 시작)
export const PRACTICE_ROUND = {
  names: ['가 반', '나 반', '다 반', '라 반'],
  start: 10,
  contrib: [10, 5, 0, 10],
  encounter: 'spring-rain',
};

export const PHASE_LABEL = {
  lobby: '시작 전',
  quiz_open: '감사 농사 — 의논하고 답 내기',
  quiz_reveal: '감사 농사 — 정답 공개',
  store_open: '창고 회의 — 열매 나누기',
  store_locked: '창고 마감',
  encounter_reveal: '랜덤 인카운터 공개',
  result: '최종 결과',
};
