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
    expect(data.categories.filter((category) => category.categoryType === "major")).toHaveLength(14);
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
