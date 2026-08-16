import type { CategoryDefinition, ClassificationData } from "./classification";

export interface QuestionTextRecord {
  questionKey: string;
  questionNumber: string | null;
  questionText: string;
  answerText: string;
  explanationText: string;
}

export interface ConfirmedClassificationExample extends QuestionTextRecord {
  questionCardId: string;
  subjectId: string;
  categoryId: string;
}

export interface MiddleUnitCandidate {
  id: string;
  subjectId: string;
  name: string;
  majorName: string;
  profile: string;
}

export interface RankedClassificationCandidate {
  categoryId: string;
  categoryName: string;
  majorName: string;
  score: number;
  matchedTerms: string[];
}

export interface LocalClassificationResult {
  questionKey: string;
  confidence: number;
  isConfident: boolean;
  candidates: RankedClassificationCandidate[];
  reason: string;
}

export const LOCAL_CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.72;
export const LOCAL_CLASSIFICATION_MARGIN_THRESHOLD = 0.16;

const MIDDLE_UNIT_KEYWORDS: Record<string, string[]> = {
  "고대 국가의 성장": ["고조선", "부여", "고구려", "백제", "신라", "가야", "삼국", "광개토 대왕", "장수왕", "진흥왕", "율령", "골품제", "화백 회의", "통일 신라", "발해", "남북국"],
  "고려의 통치 체제와 정치 변동": ["고려", "태조 왕건", "광종", "성종", "2성 6부", "도병마사", "식목도감", "문벌 귀족", "무신 정변", "권문세족", "공민왕", "전민변정도감"],
  "조선의 성립과 발전": ["조선 건국", "태조 이성계", "정도전", "태종", "세종", "세조", "성종", "경국대전", "의정부", "6조", "훈구", "사림", "사화", "붕당"],
  "조선 후기의 새로운 흐름": ["임진왜란", "병자호란", "비변사", "환국", "영조", "정조", "탕평책", "세도 정치", "실학", "수원 화성", "규장각"],
  "국제 관계와 대외 교류": ["조공", "책봉", "왜구", "여진", "거란", "몽골", "원 간섭기", "명", "청", "강감찬", "윤관", "대마도", "사대교린", "통신사", "연행사"],
  "수취 체제와 경제생활": ["전시과", "과전법", "직전법", "공법", "대동법", "영정법", "균역법", "상평통보", "장시", "공인", "도고", "농업 생산력", "모내기법"],
  "신분제와 사회 구조": ["골품", "문벌 귀족", "권문세족", "양반", "중인", "상민", "천민", "노비", "신분제", "향촌 사회", "향약", "신분 변동"],
  "다양한 사상과 문화 교류": ["불교", "유교", "성리학", "실학", "풍수지리", "도교", "과거제", "팔만대장경", "직지", "훈민정음", "성균관", "서원", "문화 교류"],
  "국제 질서의 변동과 개항": ["세도 정치", "흥선 대원군", "통상 수교 거부", "병인양요", "신미양요", "운요호", "강화도 조약", "개항", "위정척사", "임오군란", "조미 수호 통상 조약"],
  "근대 국가 수립을 위한 노력": ["갑신정변", "동학 농민 운동", "갑오개혁", "을미개혁", "독립 협회", "대한 제국", "광무개혁", "만민 공동회", "홍범 14조", "근대 국가"],
  "개항 이후 사회·경제의 변화와 문화 변동": ["개항장", "거류지", "상권 수호", "방곡령", "근대 시설", "전차", "전신", "우정총국", "근대 교육", "신문", "신소설", "국문 연구"],
  "국권 침탈과 국권 수호 운동": ["러일 전쟁", "을사늑약", "한일 신협약", "군대 해산", "경술국치", "의병", "애국 계몽 운동", "신민회", "헤이그 특사", "안중근", "국채 보상 운동"],

  "제국주의 질서와 일제의 식민 통치 정책": ["무단 통치", "헌병 경찰", "토지 조사 사업", "회사령", "문화 통치", "민족 분열 통치", "산미 증식 계획", "국가 총동원", "민족 말살", "창씨개명", "징용", "징병", "일제 식민 통치"],
  "경제 구조의 변화와 경제생활": ["토지 조사 사업", "산미 증식 계획", "회사령", "관세 철폐", "일본 자본", "농민 몰락", "소작쟁의", "노동쟁의", "화폐 정리 사업", "경제 수탈", "식민지 경제"],
  "민족 운동의 전개와 분화": ["3·1 운동", "대한민국 임시 정부", "무장 독립 전쟁", "봉오동 전투", "청산리 대첩", "의열단", "한인 애국단", "신간회", "민족 유일당", "사회주의", "민족주의"],
  "사회 문화의 변화와 대중 운동": ["물산 장려 운동", "민립 대학 설립 운동", "문맹 퇴치", "브나로드 운동", "형평 운동", "소년 운동", "여성 운동", "농촌 계몽", "대중문화", "근대 문학"],
  "독립 국가 건설 노력": ["한국 독립당", "조선 독립 동맹", "조선 건국 동맹", "한국 광복군", "조선 의용대", "건국 강령", "삼균주의", "민족 혁명당", "해방 준비", "독립 국가 건설"],
  "냉전 체제와 대한민국 정부 수립": ["광복", "미군정", "모스크바 3국 외상 회의", "신탁 통치", "좌우 합작", "남북 협상", "5·10 총선거", "제헌 국회", "대한민국 정부 수립", "반민특위", "농지 개혁"],
  "6·25 전쟁과 남북 분단의 고착화": ["6·25 전쟁", "한국 전쟁", "인천 상륙 작전", "1·4 후퇴", "정전 협정", "휴전", "이산가족", "남북 분단", "한미 상호 방위 조약", "전쟁 피해"],
  "민주화를 위한 노력": ["이승만", "3·15 부정 선거", "4·19 혁명", "5·16 군사 정변", "유신 체제", "부마 민주 항쟁", "5·18 민주화 운동", "전두환", "4·13 호헌", "민주화 운동"],
  "산업화의 성과와 사회·환경 문제": ["경제 개발 5개년 계획", "수출 주도", "한일 협정", "서독 광부", "파독 간호사", "베트남 파병", "경부 고속 국도", "새마을 운동", "중화학 공업", "수출 100억 달러", "3저 호황", "산업화", "도시화", "노동 운동", "전태일", "환경 문제", "외화 획득"],
  "6월 민주 항쟁 이후의 민주화": ["6월 민주 항쟁", "6·29 민주화 선언", "대통령 직선제", "5년 단임", "지방 자치", "문민정부", "평화적 정권 교체", "민주주의 발전", "시민 사회"],
  "외환 위기 극복과 사회·문화의 변동": ["외환 위기", "IMF", "금 모으기 운동", "구조 조정", "정리 해고", "비정규직", "정보화", "세계화", "다문화 사회", "저출산", "고령화", "한류"],
  "한반도 평화와 동아시아 공존을 위한 노력": ["7·4 남북 공동 성명", "남북 기본 합의서", "6·15 남북 공동 선언", "10·4 선언", "남북 정상 회담", "이산가족 상봉", "개성 공단", "금강산 관광", "한반도 평화", "동아시아 공존"],

  "역사 기행과 동아시아 역사 탐구": ["역사 기행", "동아시아", "지역사", "문화유산", "답사", "역사 탐구", "공간", "장소"],
  "동아시아의 생태환경과 사람들의 생활": ["계절풍", "벼농사", "유목", "농경", "생태환경", "기후", "황허", "양쯔강", "해양", "생활 방식"],
  "동아시아 지역 간 교류의 시작": ["선사 교류", "청동기", "철기", "한사군", "조공 책봉", "율령", "한자", "불교", "고대 동아시아", "교류 시작"],
  "종교와 사상을 중심으로 한 지역 간 교류": ["불교 전파", "유교", "성리학", "율령", "한자 문화권", "견당사", "도왜인", "종교 교류", "사상 교류"],
  "몽골의 팽창과 17세기 전후 동아시아 전쟁": ["몽골 제국", "원", "몽골 침입", "임진왜란", "정유재란", "병자호란", "명청 교체", "17세기", "동아시아 전쟁"],
  "동아시아 지역 내외 교류 양상의 다양화": ["은 유통", "감합 무역", "조공 무역", "해금", "왜구", "류큐", "화교", "서양 상인", "나가사키", "교역망"],
  "동아시아 지역에서 전개된 제국주의 열강의 침략 전쟁": ["아편 전쟁", "청일 전쟁", "러일 전쟁", "난징 조약", "시모노세키 조약", "포츠머스 조약", "제국주의", "침략 전쟁"],
  "아시아·태평양 전쟁과 이에 맞선 저항과 연대": ["만주 사변", "중일 전쟁", "태평양 전쟁", "난징 대학살", "항일 전쟁", "연합 전선", "일본군 위안부", "저항", "연대"],
  "제국주의 열강의 침략과 생태환경의 변화": ["식민지 개발", "자원 수탈", "철도", "플랜테이션", "광산", "산림 파괴", "생태환경 변화", "제국주의"],
  "냉전 시기 동아시아의 전쟁과 정치·사회적 변화": ["냉전", "국공 내전", "중화인민공화국", "한국 전쟁", "베트남 전쟁", "문화 대혁명", "55년 체제", "분단", "사회주의"],
  "동아시아 각국의 경제·문화 발달과 교류": ["고도성장", "개혁 개방", "아시아의 네 마리 용", "대중문화", "한류", "경제 협력", "문화 교류", "동아시아 경제"],
  "상호 공존의 지역 질서 형성을 위한 연대와 참여": ["동아시아 공동체", "아세안", "APEC", "역사 갈등", "영토 갈등", "시민 연대", "평화", "공존", "지역 협력"],

  "인류의 출현과 선사 문화": ["인류 출현", "구석기", "신석기", "채집", "수렵", "농경", "목축", "정착 생활", "선사 문화"],
  "문명의 발생과 초기 국가들": ["메소포타미아", "이집트", "인더스", "황허", "문명 발생", "도시 국가", "문자", "청동기", "초기 국가"],
  "동아시아 세계의 형성": ["춘추 전국", "진", "한", "수", "당", "율령", "유교", "불교", "동아시아 문화권", "고대 중국"],
  "동아시아 세계의 발전 및 변동": ["송", "요", "금", "원", "명", "청", "몽골 제국", "정복 왕조", "상업 발전", "은 유통", "명청 교체"],
  "서아시아의 여러 제국과 이슬람 세계의 형성": ["페르시아", "아케메네스", "사산", "이슬람", "무함마드", "칼리프", "우마이야", "아바스", "오스만", "이슬람 세계"],
  "인도의 역사와 다양한 종교·문화의 출현": ["인더스", "아리아인", "브라만교", "불교", "힌두교", "마우리아", "쿠샨", "굽타", "무굴", "카스트", "인도 문화"],
  "고대 지중해 세계": ["그리스", "아테네", "스파르타", "페르시아 전쟁", "알렉산드로스", "헬레니즘", "로마", "공화정", "제정", "크리스트교"],
  "유럽 세계의 형성과 변화": ["게르만", "프랑크 왕국", "봉건제", "장원제", "교황", "십자군", "르네상스", "종교 개혁", "절대 왕정", "대항해 시대"],
  "시민 혁명과 산업 혁명": ["영국 혁명", "미국 혁명", "프랑스 혁명", "자유주의", "민족주의", "산업 혁명", "증기 기관", "자본주의", "노동 문제", "사회주의"],
  "제국주의와 민족 운동": ["제국주의", "사회 진화론", "아프리카 분할", "인도 민족 운동", "중국 혁명", "오스만 제국", "라틴아메리카", "민족 자결", "반제국주의"],
  "두 차례의 세계 대전과 국제 질서의 변화": ["제1차 세계 대전", "베르사유 체제", "러시아 혁명", "대공황", "파시즘", "나치", "제2차 세계 대전", "국제 연맹", "국제 연합"],
  "냉전과 탈냉전": ["냉전", "트루먼 독트린", "마셜 계획", "NATO", "바르샤바 조약", "쿠바 미사일 위기", "데탕트", "소련 해체", "탈냉전"],
  "21세기의 세계와 세계시민의 과제": ["세계화", "정보화", "기후 변화", "난민", "테러", "빈곤", "인권", "지속 가능 발전", "세계 시민", "국제 협력"],
};

function normalizeText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[^0-9A-Za-z가-힣·]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ko-KR");
}

function compact(value: string) {
  return normalizeText(value).replace(/\s/g, "");
}

function bigrams(value: string) {
  const source = compact(value);
  const result = new Set<string>();
  for (let index = 0; index < source.length - 1; index += 1) {
    result.add(source.slice(index, index + 2));
  }
  return result;
}

function diceSimilarity(left: string, right: string) {
  const leftTerms = bigrams(left);
  const rightTerms = bigrams(right);
  if (!leftTerms.size || !rightTerms.size) return 0;
  let intersection = 0;
  leftTerms.forEach((term) => {
    if (rightTerms.has(term)) intersection += 1;
  });
  return (2 * intersection) / (leftTerms.size + rightTerms.size);
}

function categoryParentName(categories: CategoryDefinition[], category: CategoryDefinition) {
  return categories.find((item) => item.id === category.parentId)?.name ?? "";
}

export function buildMiddleUnitCandidates(data: ClassificationData, subjectId: string) {
  return data.categories
    .filter((category) =>
      category.subjectId === subjectId &&
      category.categoryType === "middle" &&
      category.isActive,
    )
    .sort((left, right) => {
      const leftParent = data.categories.find((item) => item.id === left.parentId)?.sortOrder ?? 0;
      const rightParent = data.categories.find((item) => item.id === right.parentId)?.sortOrder ?? 0;
      return leftParent - rightParent || left.sortOrder - right.sortOrder;
    })
    .map<MiddleUnitCandidate>((category) => {
      const majorName = categoryParentName(data.categories, category);
      const keywords = MIDDLE_UNIT_KEYWORDS[category.name] ?? [];
      return {
        id: category.id,
        subjectId,
        name: category.name,
        majorName,
        profile: [majorName, category.name, ...keywords].join(" · "),
      };
    });
}

export function inferSubjectIdFromFileName(data: ClassificationData, fileName: string) {
  const normalized = compact(fileName);
  return data.subjects
    .filter((subject) => subject.isActive)
    .sort((left, right) => right.name.length - left.name.length)
    .find((subject) => normalized.includes(compact(subject.name)))?.id ?? null;
}

function textForSimilarity(record: QuestionTextRecord) {
  return [record.explanationText, record.answerText, record.questionText].filter(Boolean).join(" ");
}

function scoreCandidate(
  record: QuestionTextRecord,
  candidate: MiddleUnitCandidate,
  examples: ConfirmedClassificationExample[],
) {
  const question = compact(record.questionText);
  const answer = compact(record.answerText);
  const explanation = compact(record.explanationText);
  const terms = [candidate.name, ...(MIDDLE_UNIT_KEYWORDS[candidate.name] ?? [])];
  let score = 0;
  const matchedTerms: string[] = [];

  terms.forEach((term, index) => {
    const normalizedTerm = compact(term);
    if (normalizedTerm.length < 2) return;
    let termScore = 0;
    if (explanation.includes(normalizedTerm)) termScore += index === 0 ? 6 : 4.2;
    if (answer.includes(normalizedTerm)) termScore += index === 0 ? 4 : 2.8;
    if (question.includes(normalizedTerm)) termScore += index === 0 ? 3.5 : 1.9;
    if (termScore > 0) {
      score += termScore;
      matchedTerms.push(term);
    }
  });

  const matchingExamples = examples.filter((example) => example.categoryId === candidate.id);
  const questionText = textForSimilarity(record);
  const exampleSimilarity = matchingExamples.reduce((best, example) =>
    Math.max(best, diceSimilarity(questionText, textForSimilarity(example))), 0);
  if (exampleSimilarity >= 0.18) score += exampleSimilarity * 12;

  return {
    categoryId: candidate.id,
    categoryName: candidate.name,
    majorName: candidate.majorName,
    score,
    matchedTerms: matchedTerms.slice(0, 6),
  } satisfies RankedClassificationCandidate;
}

export function classifyQuestionLocally(
  record: QuestionTextRecord,
  candidates: MiddleUnitCandidate[],
  examples: ConfirmedClassificationExample[] = [],
): LocalClassificationResult {
  const ranked = candidates
    .map((candidate) => scoreCandidate(record, candidate, examples))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
  const first = ranked[0];
  const second = ranked[1];
  const evidence = Math.min(1, (first?.score ?? 0) / 12);
  const margin = first?.score
    ? Math.max(0, Math.min(1, (first.score - (second?.score ?? 0)) / first.score))
    : 0;
  const confidence = Number((evidence * 0.48 + margin * 0.52).toFixed(3));
  const isConfident = Boolean(
    first &&
    first.score >= 5 &&
    confidence >= LOCAL_CLASSIFICATION_CONFIDENCE_THRESHOLD &&
    margin >= LOCAL_CLASSIFICATION_MARGIN_THRESHOLD,
  );
  const matched = first?.matchedTerms.slice(0, 3).join(", ") ?? "";
  return {
    questionKey: record.questionKey,
    confidence,
    isConfident,
    candidates: ranked,
    reason: first
      ? matched ? `핵심 개념 일치: ${matched}` : "중단원 설명 및 확정 문항과의 유사도"
      : "활성화된 중단원 후보가 없습니다.",
  };
}
