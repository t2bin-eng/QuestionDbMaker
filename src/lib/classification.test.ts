import { describe, expect, it } from "vitest";
import {
  createDefaultClassificationData,
  flattenCategoryTree,
  mergeDefaultClassificationData,
  nextCategoryType,
  type CategoryDefinition,
} from "./classification";

describe("classification", () => {
  it("provides usable default metadata", () => {
    const data = createDefaultClassificationData();
    expect(data.subjects.map((subject) => subject.name)).toEqual([
      "한국사1",
      "한국사2",
      "동아시아 역사 기행",
      "세계사",
    ]);
    expect(data.categories.filter((category) => category.categoryType === "major")).toHaveLength(16);
    expect(data.categories.filter((category) => category.categoryType === "middle")).toHaveLength(49);
    expect(data.options.filter((option) => option.kind === "difficulty").map((option) => option.name)).toEqual(["하", "중", "상"]);
    expect(data.options.filter((option) => option.kind === "questionType").map((option) => option.name)).toEqual(["객관식", "서술형"]);
  });

  it("merges curriculum defaults without removing custom classification", () => {
    const stored = createDefaultClassificationData();
    stored.subjects = [{
      id: "subject-history",
      name: "한국사",
      curriculum: "2022 개정",
      sortOrder: 0,
      isActive: true,
    }];
    stored.categories = [{
      id: "custom-major",
      subjectId: "subject-history",
      parentId: null,
      categoryType: "major",
      name: "교사 재구성 단원",
      sortOrder: 0,
      isActive: true,
    }];

    const merged = mergeDefaultClassificationData(stored);
    expect(merged.subjects.map((subject) => subject.name)).toContain("한국사1");
    expect(merged.subjects.map((subject) => subject.name)).toContain("세계사");
    expect(merged.categories.some((category) => category.id === "custom-major")).toBe(true);
    expect(merged.categories.some((category) => category.name === "근대 이전 한국사의 이해")).toBe(true);
    expect(merged.categories.some((category) => category.name === "고대 국가의 성장")).toBe(true);
  });

  it("migrates legacy default majors and preserves their identifiers", () => {
    const stored = createDefaultClassificationData();
    stored.categories = stored.categories
      .filter((category) => category.categoryType === "major" && !category.id.endsWith("-5") && !category.id.endsWith("-6"))
      .map((category) => {
        if (category.id === "category-history-1-2") return { ...category, name: "근대 이전 한국사의 탐구" };
        if (category.id === "category-world-history-1") return { ...category, name: "지역 세계의 형성" };
        if (category.id === "category-world-history-2") return { ...category, name: "교역망의 확대" };
        if (category.id === "category-world-history-3") return { ...category, name: "국민 국가의 형성" };
        if (category.id === "category-world-history-4") return { ...category, name: "현대 세계의 과제" };
        return category;
      });

    const merged = mergeDefaultClassificationData(stored);
    expect(merged.categories.find((category) => category.id === "category-history-1-2")?.name)
      .toBe("근대 이전 한국사의 사회·문화와 대외 관계");
    expect(merged.categories.find((category) => category.id === "category-world-history-1")?.name)
      .toBe("인류의 출현과 문명의 발생");
    expect(merged.categories.filter((category) => category.categoryType === "major")).toHaveLength(16);
    expect(merged.categories.filter((category) => category.categoryType === "middle")).toHaveLength(49);
  });

  it("places every middle unit under the matching major unit", () => {
    const data = createDefaultClassificationData();
    const history = data.subjects.find((subject) => subject.name === "한국사1")!;
    const tree = flattenCategoryTree(data.categories, history.id);
    const major = tree.find((category) => category.name === "근대 이전 한국사의 이해")!;
    const middleNames = tree
      .filter((category) => category.parentId === major.id)
      .map((category) => category.name);

    expect(middleNames).toEqual([
      "고대 국가의 성장",
      "고려의 통치 체제와 정치 변동",
      "조선의 성립과 발전",
      "조선 후기의 새로운 흐름",
    ]);
  });

  it("infers the hierarchy level from the parent", () => {
    const major = { categoryType: "major" } as CategoryDefinition;
    const middle = { categoryType: "middle" } as CategoryDefinition;
    const minor = { categoryType: "minor" } as CategoryDefinition;
    expect(nextCategoryType(null)).toBe("major");
    expect(nextCategoryType(major)).toBe("middle");
    expect(nextCategoryType(middle)).toBe("minor");
    expect(nextCategoryType(minor)).toBe("topic");
  });

  it("flattens categories in hierarchy and sort order", () => {
    const base = {
      subjectId: "history",
      isActive: true,
    };
    const categories: CategoryDefinition[] = [
      { ...base, id: "major-b", parentId: null, categoryType: "major", name: "근현대", sortOrder: 1 },
      { ...base, id: "middle-a", parentId: "major-a", categoryType: "middle", name: "고대 국가", sortOrder: 0 },
      { ...base, id: "major-a", parentId: null, categoryType: "major", name: "전근대", sortOrder: 0 },
    ];

    expect(flattenCategoryTree(categories, "history").map(({ id, depth }) => [id, depth])).toEqual([
      ["major-a", 0],
      ["middle-a", 1],
      ["major-b", 0],
    ]);
  });
});
