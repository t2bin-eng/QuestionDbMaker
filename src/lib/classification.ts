export type CategoryType = "major" | "middle" | "minor" | "topic";
export type ClassificationOptionKind = "difficulty" | "questionType";

export interface SubjectDefinition {
  id: string;
  name: string;
  curriculum: string;
  sortOrder: number;
  isActive: boolean;
}

export interface CategoryDefinition {
  id: string;
  subjectId: string;
  parentId: string | null;
  categoryType: CategoryType;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface TagDefinition {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ClassificationOption {
  id: string;
  kind: ClassificationOptionKind;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ClassificationData {
  version: 1;
  subjects: SubjectDefinition[];
  categories: CategoryDefinition[];
  tags: TagDefinition[];
  options: ClassificationOption[];
  updatedAt: string;
}

export const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  major: "대단원",
  middle: "중단원",
  minor: "소단원",
  topic: "주제",
};

const DEFAULT_SUBJECTS = [
  {
    id: "subject-history-1",
    name: "한국사1",
    curriculum: "2022 개정",
    majors: [
      {
        name: "근대 이전 한국사의 이해",
        middles: [
          "고대 국가의 성장",
          "고려의 통치 체제와 정치 변동",
          "조선의 성립과 발전",
          "조선 후기의 새로운 흐름",
        ],
      },
      {
        name: "근대 이전 한국사의 사회·문화와 대외 관계",
        middles: [
          "국제 관계와 대외 교류",
          "수취 체제와 경제생활",
          "신분제와 사회 구조",
          "다양한 사상과 문화 교류",
        ],
      },
      {
        name: "근대 국가 수립의 노력",
        middles: [
          "국제 질서의 변동과 개항",
          "근대 국가 수립을 위한 노력",
          "개항 이후 사회·경제의 변화와 문화 변동",
          "국권 침탈과 국권 수호 운동",
        ],
      },
    ],
  },
  {
    id: "subject-history-2",
    name: "한국사2",
    curriculum: "2022 개정",
    majors: [
      {
        name: "일제 식민 통치와 민족 운동",
        middles: [
          "제국주의 질서와 일제의 식민 통치 정책",
          "경제 구조의 변화와 경제생활",
          "민족 운동의 전개와 분화",
          "사회 문화의 변화와 대중 운동",
          "독립 국가 건설 노력",
        ],
      },
      {
        name: "대한민국의 발전",
        middles: [
          "냉전 체제와 대한민국 정부 수립",
          "6·25 전쟁과 남북 분단의 고착화",
          "민주화를 위한 노력",
          "산업화의 성과와 사회·환경 문제",
        ],
      },
      {
        name: "오늘날의 대한민국",
        middles: [
          "6월 민주 항쟁 이후의 민주화",
          "외환 위기 극복과 사회·문화의 변동",
          "한반도 평화와 동아시아 공존을 위한 노력",
        ],
      },
    ],
  },
  {
    id: "subject-east-asian-history-trip",
    name: "동아시아 역사 기행",
    curriculum: "2022 개정",
    majors: [
      {
        name: "동아시아로 떠나는 역사 기행",
        middles: [
          "역사 기행과 동아시아 역사 탐구",
          "동아시아의 생태환경과 사람들의 생활",
        ],
      },
      {
        name: "교류와 갈등의 현장에서 만난 역사",
        middles: [
          "동아시아 지역 간 교류의 시작",
          "종교와 사상을 중심으로 한 지역 간 교류",
          "몽골의 팽창과 17세기 전후 동아시아 전쟁",
          "동아시아 지역 내외 교류 양상의 다양화",
        ],
      },
      {
        name: "침략과 저항의 현장에서 만난 역사",
        middles: [
          "동아시아 지역에서 전개된 제국주의 열강의 침략 전쟁",
          "아시아·태평양 전쟁과 이에 맞선 저항과 연대",
          "제국주의 열강의 침략과 생태환경의 변화",
        ],
      },
      {
        name: "평화와 공존의 현장에서 만난 역사",
        middles: [
          "냉전 시기 동아시아의 전쟁과 정치·사회적 변화",
          "동아시아 각국의 경제·문화 발달과 교류",
          "상호 공존의 지역 질서 형성을 위한 연대와 참여",
        ],
      },
    ],
  },
  {
    id: "subject-world-history",
    name: "세계사",
    curriculum: "2022 개정",
    majors: [
      {
        name: "인류의 출현과 문명의 발생",
        middles: ["인류의 출현과 선사 문화", "문명의 발생과 초기 국가들"],
      },
      {
        name: "동아시아 지역의 역사",
        middles: ["동아시아 세계의 형성", "동아시아 세계의 발전 및 변동"],
      },
      {
        name: "서아시아·인도 지역의 역사",
        middles: ["서아시아의 여러 제국과 이슬람 세계의 형성", "인도의 역사와 다양한 종교·문화의 출현"],
      },
      {
        name: "유럽·아메리카 지역의 역사",
        middles: ["고대 지중해 세계", "유럽 세계의 형성과 변화", "시민 혁명과 산업 혁명"],
      },
      {
        name: "제국주의와 두 차례 세계 대전",
        middles: ["제국주의와 민족 운동", "두 차례의 세계 대전과 국제 질서의 변화"],
      },
      {
        name: "현대 세계의 변화",
        middles: ["냉전과 탈냉전", "21세기의 세계와 세계시민의 과제"],
      },
    ],
  },
] as const;

const DEFAULT_TAGS: TagDefinition[] = [
  { id: "tag-source", name: "사료 분석", color: "#1f6b4f", sortOrder: 0, isActive: true },
  { id: "tag-timeline", name: "연표", color: "#4976a8", sortOrder: 1, isActive: true },
  { id: "tag-map", name: "지도", color: "#b4772c", sortOrder: 2, isActive: true },
];

const DEFAULT_OPTIONS: ClassificationOption[] = [
  { id: "difficulty-low", kind: "difficulty", name: "하", sortOrder: 0, isActive: true },
  { id: "difficulty-mid", kind: "difficulty", name: "중", sortOrder: 1, isActive: true },
  { id: "difficulty-high", kind: "difficulty", name: "상", sortOrder: 2, isActive: true },
  { id: "type-choice", kind: "questionType", name: "객관식", sortOrder: 0, isActive: true },
  { id: "type-written", kind: "questionType", name: "서술형", sortOrder: 1, isActive: true },
];

export function createDefaultClassificationData(): ClassificationData {
  const subjects: SubjectDefinition[] = DEFAULT_SUBJECTS.map((subject, sortOrder) => ({
    id: subject.id,
    name: subject.name,
    curriculum: subject.curriculum,
    sortOrder,
    isActive: true,
  }));
  const categories: CategoryDefinition[] = DEFAULT_SUBJECTS.flatMap((subject) =>
    subject.majors.flatMap((major, majorOrder) => {
      const majorId = `category-${subject.id.replace("subject-", "")}-${majorOrder + 1}`;
      return [
        {
          id: majorId,
          subjectId: subject.id,
          parentId: null,
          categoryType: "major" as const,
          name: major.name,
          sortOrder: majorOrder,
          isActive: true,
        },
        ...major.middles.map((name, middleOrder) => ({
          id: `${majorId}-middle-${middleOrder + 1}`,
          subjectId: subject.id,
          parentId: majorId,
          categoryType: "middle" as const,
          name,
          sortOrder: middleOrder,
          isActive: true,
        })),
      ];
    }),
  );
  return {
    version: 1,
    subjects,
    categories,
    tags: DEFAULT_TAGS.map((tag) => ({ ...tag })),
    options: DEFAULT_OPTIONS.map((option) => ({ ...option })),
    updatedAt: new Date().toISOString(),
  };
}

export function mergeDefaultClassificationData(stored: ClassificationData): ClassificationData {
  const subjects = stored.subjects.map((subject) =>
    subject.name.replace(/\s/g, "") === "한국사" ? { ...subject, name: "한국사1" } : { ...subject },
  );
  const categories = stored.categories.map((category) => ({ ...category }));

  DEFAULT_SUBJECTS.forEach((template, subjectOrder) => {
    let subject = subjects.find((item) => item.name.replace(/\s/g, "") === template.name.replace(/\s/g, ""));
    if (!subject) {
      subject = {
        id: template.id,
        name: template.name,
        curriculum: template.curriculum,
        sortOrder: Math.max(-1, ...subjects.map((item) => item.sortOrder)) + 1,
        isActive: true,
      };
      subjects.push(subject);
    } else if (!subject.curriculum.trim()) {
      subject.curriculum = template.curriculum;
    }

    template.majors.forEach((majorTemplate, majorOrder) => {
      const majorId = `category-${template.id.replace("subject-", "")}-${majorOrder + 1}`;
      let major = categories.find((category) => category.id === majorId) ?? categories.find((category) =>
        category.subjectId === subject.id &&
        category.parentId === null &&
        category.name.replace(/\s/g, "") === majorTemplate.name.replace(/\s/g, ""),
      );
      if (major) {
        major.subjectId = subject.id;
        major.parentId = null;
        major.categoryType = "major";
        major.name = majorTemplate.name;
        major.sortOrder = majorOrder;
      } else {
        major = {
          id: majorId,
          subjectId: subject.id,
          parentId: null,
          categoryType: "major",
          name: majorTemplate.name,
          sortOrder: majorOrder,
          isActive: true,
        };
        categories.push(major);
      }

      majorTemplate.middles.forEach((name, middleOrder) => {
        const middleId = `${majorId}-middle-${middleOrder + 1}`;
        const middle = categories.find((category) => category.id === middleId) ?? categories.find((category) =>
          category.subjectId === subject.id &&
          category.parentId === major.id &&
          category.name.replace(/\s/g, "") === name.replace(/\s/g, ""),
        );
        if (middle) {
          middle.subjectId = subject.id;
          middle.parentId = major.id;
          middle.categoryType = "middle";
          middle.name = name;
          middle.sortOrder = middleOrder;
        } else {
          categories.push({
            id: middleId,
            subjectId: subject.id,
            parentId: major.id,
            categoryType: "middle",
            name,
            sortOrder: middleOrder,
            isActive: true,
          });
        }
      });
    });

    if (subject.sortOrder < 0) subject.sortOrder = subjectOrder;
  });

  const tags = [...stored.tags];
  DEFAULT_TAGS.forEach((template) => {
    if (!tags.some((tag) => tag.name === template.name)) tags.push({ ...template, sortOrder: tags.length });
  });
  const options = [...stored.options];
  DEFAULT_OPTIONS.forEach((template) => {
    if (!options.some((option) => option.kind === template.kind && option.name === template.name)) {
      options.push({
        ...template,
        sortOrder: options.filter((option) => option.kind === template.kind).length,
      });
    }
  });

  return {
    ...stored,
    subjects,
    categories,
    tags,
    options,
    updatedAt: new Date().toISOString(),
  };
}

export function nextCategoryType(parent: CategoryDefinition | null): CategoryType {
  if (!parent) return "major";
  if (parent.categoryType === "major") return "middle";
  if (parent.categoryType === "middle") return "minor";
  return "topic";
}

export function sortByOrder<T extends { sortOrder: number; name: string }>(items: T[]) {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ko"));
}

export function normalizeSortOrder<T extends { sortOrder: number; name: string }>(items: T[]) {
  return sortByOrder(items).map((item, index) => ({
    ...item,
    sortOrder: index,
  }));
}

export function flattenCategoryTree(categories: CategoryDefinition[], subjectId: string) {
  const subjectCategories = categories.filter((category) => category.subjectId === subjectId);
  const result: Array<CategoryDefinition & { depth: number }> = [];
  const visit = (parentId: string | null, depth: number) => {
    sortByOrder(subjectCategories.filter((category) => category.parentId === parentId))
      .forEach((category) => {
        result.push({ ...category, depth });
        visit(category.id, depth + 1);
      });
  };
  visit(null, 0);
  return result;
}
