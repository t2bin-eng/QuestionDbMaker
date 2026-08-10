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
      "근대 이전 한국사의 이해",
      "근대 이전 한국사의 탐구",
      "근대 국가 수립의 노력",
    ],
  },
  {
    id: "subject-history-2",
    name: "한국사2",
    curriculum: "2022 개정",
    majors: [
      "일제 식민 통치와 민족운동",
      "대한민국의 발전",
      "오늘날의 대한민국",
    ],
  },
  {
    id: "subject-east-asian-history-trip",
    name: "동아시아 역사 기행",
    curriculum: "2022 개정",
    majors: [
      "동아시아로 떠나는 역사 기행",
      "교류와 갈등의 현장에서 만난 역사",
      "침략과 저항의 현장에서 만난 역사",
      "평화와 공존의 현장에서 만난 역사",
    ],
  },
  {
    id: "subject-world-history",
    name: "세계사",
    curriculum: "2022 개정",
    majors: [
      "지역 세계의 형성",
      "교역망의 확대",
      "국민 국가의 형성",
      "현대 세계의 과제",
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
    subject.majors.map((name, sortOrder) => ({
      id: `category-${subject.id.replace("subject-", "")}-${sortOrder + 1}`,
      subjectId: subject.id,
      parentId: null,
      categoryType: "major" as const,
      name,
      sortOrder,
      isActive: true,
    })),
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

    template.majors.forEach((name, sortOrder) => {
      const exists = categories.some((category) =>
        category.subjectId === subject.id &&
        category.parentId === null &&
        category.name.replace(/\s/g, "") === name.replace(/\s/g, ""),
      );
      if (!exists) {
        categories.push({
          id: `category-${template.id.replace("subject-", "")}-${sortOrder + 1}`,
          subjectId: subject.id,
          parentId: null,
          categoryType: "major",
          name,
          sortOrder,
          isActive: true,
        });
      }
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
