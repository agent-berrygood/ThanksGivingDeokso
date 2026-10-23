// 감사 열매 농장 — 고정 데이터 (반, 인카운터, 문제)

export const START_FRUIT = 10;
export const QUIZ_REWARD = 2;
export const ROUNDS = 8; // 계절 4 × 라운드 2
export const QUIZ_SECONDS = 30;
export const STORE_SECONDS = 55; // 회의 40초 + 제출 15초

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

// 라운드 순서대로 8문제: 계절마다 O/X 1개(라운드 1) + 4지선다 1개(라운드 2)
export const QUESTIONS = [
  { type: 'ox', q: '씨앗이 싹트려면 물이 필요하다', answer: 'O' },
  { type: 'mc', q: '봄꽃이 아닌 것은?', options: ['개나리', '진달래', '벚꽃', '국화'], answer: '4' },
  { type: 'ox', q: '수박은 여름에 나는 과일이다', answer: 'O' },
  { type: 'mc', q: '여름 과일이 아닌 것은?', options: ['수박', '참외', '복숭아', '귤'], answer: '4' },
  { type: 'ox', q: '추석은 음력 8월 15일이다', answer: 'O' },
  { type: 'mc', q: '우리가 먹는 쌀은 어떤 식물에서 얻을까요?', options: ['보리', '벼', '밀', '옥수수'], answer: '2' },
  { type: 'ox', q: '미국의 추수감사절은 11월 넷째 주 목요일이다', answer: 'O' },
  { type: 'mc', q: "영어로 '감사합니다'는?", options: ['Hello', 'Sorry', 'Thank you', 'Goodbye'], answer: '3' },
];

export const PHASE_LABEL = {
  lobby: '시작 전',
  quiz_open: '감사 농사 — 의논하고 답 내기',
  quiz_reveal: '감사 농사 — 정답 공개',
  store_open: '창고 회의 — 열매 나누기',
  store_locked: '창고 마감',
  encounter_reveal: '랜덤 인카운터 공개',
  result: '최종 결과',
};
