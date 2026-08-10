"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronRight,
  CirclePower,
  FolderTree,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Tag,
} from "lucide-react";
import {
  CATEGORY_TYPE_LABELS,
  createDefaultClassificationData,
  flattenCategoryTree,
  mergeDefaultClassificationData,
  nextCategoryType,
  sortByOrder,
  type CategoryDefinition,
  type ClassificationData,
  type ClassificationOptionKind,
  type SubjectDefinition,
} from "@/lib/classification";
import {
  readClassificationLocally,
  saveClassificationLocally,
} from "@/lib/local-file-store";

const fieldClass = "focus-ring w-full rounded-xl border border-[#dfe5e1] bg-white px-3 py-2 text-sm text-[#18201d]";
const smallButtonClass = "focus-ring inline-flex items-center justify-center gap-1 rounded-lg border border-[#dfe5e1] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#34423c] transition hover:bg-[#f2f6f3] disabled:cursor-not-allowed disabled:opacity-35";

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function replaceItem<T extends { id: string }>(items: T[], id: string, patch: Partial<T>) {
  return items.map((item) => item.id === id ? { ...item, ...patch } : item);
}

function swapOrder<T extends { id: string; sortOrder: number }>(
  allItems: T[],
  visibleItems: T[],
  id: string,
  direction: -1 | 1,
) {
  const ordered = [...visibleItems].sort((a, b) => a.sortOrder - b.sortOrder);
  const index = ordered.findIndex((item) => item.id === id);
  const other = ordered[index + direction];
  if (index < 0 || !other) return allItems;
  const current = ordered[index];
  return allItems.map((item) => {
    if (item.id === current.id) return { ...item, sortOrder: other.sortOrder };
    if (item.id === other.id) return { ...item, sortOrder: current.sortOrder };
    return item;
  });
}

function ActivityBadge({ active }: { active: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${active ? "bg-[#dcefe5] text-[#1f6b4f]" : "bg-[#eef0ef] text-[#77817c]"}`}>
      {active ? "사용 중" : "비활성"}
    </span>
  );
}

function ExtraOptionGroup({
  title,
  kind,
  data,
  onPersist,
}: {
  title: string;
  kind: ClassificationOptionKind;
  data: ClassificationData;
  onPersist: (next: ClassificationData, message: string) => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const options = sortByOrder(data.options.filter((option) => option.kind === kind));

  async function add() {
    const name = newName.trim();
    if (!name || options.some((option) => option.name === name)) return;
    setNewName("");
    await onPersist({
      ...data,
      options: [...data.options, {
        id: makeId(kind),
        kind,
        name,
        sortOrder: options.length,
        isActive: true,
      }],
    }, `${title} 항목을 추가했습니다.`);
  }

  return (
    <section className="rounded-2xl border border-[#e3e8e4] bg-white p-5">
      <h3 className="font-bold">{title}</h3>
      <div className="mt-3 flex gap-2">
        <input
          aria-label={`${title} 추가`}
          className={fieldClass}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void add();
          }}
          placeholder="새 항목"
        />
        <button className={smallButtonClass} onClick={() => void add()}><Plus size={14} />추가</button>
      </div>
      <div className="mt-3 space-y-2">
        {options.map((option, index) => (
          <div key={option.id} className={`flex items-center gap-2 rounded-xl border border-[#edf0ee] p-2 ${option.isActive ? "" : "bg-[#f5f6f5] opacity-65"}`}>
            <input
              aria-label={`${title} 이름`}
              className="min-w-0 flex-1 bg-transparent px-1 text-sm outline-none"
              defaultValue={option.name}
              onBlur={(event) => {
                const name = event.target.value.trim();
                if (name && name !== option.name) {
                  void onPersist({
                    ...data,
                    options: replaceItem(data.options, option.id, { name }),
                  }, `${title} 이름을 수정했습니다.`);
                }
              }}
            />
            <button aria-label="위로" className={smallButtonClass} disabled={index === 0} onClick={() => void onPersist({
              ...data,
              options: swapOrder(data.options, options, option.id, -1),
            }, `${title} 순서를 변경했습니다.`)}><ArrowUp size={13} /></button>
            <button aria-label="아래로" className={smallButtonClass} disabled={index === options.length - 1} onClick={() => void onPersist({
              ...data,
              options: swapOrder(data.options, options, option.id, 1),
            }, `${title} 순서를 변경했습니다.`)}><ArrowDown size={13} /></button>
            <button aria-label={option.isActive ? "비활성화" : "활성화"} className={smallButtonClass} onClick={() => void onPersist({
              ...data,
              options: replaceItem(data.options, option.id, { isActive: !option.isActive }),
            }, `${title} 항목을 ${option.isActive ? "비활성화" : "활성화"}했습니다.`)}><CirclePower size={13} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CategoriesManager() {
  const [data, setData] = useState<ClassificationData>(() => createDefaultClassificationData());
  const [selectedSubjectId, setSelectedSubjectId] = useState("subject-history");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectCurriculum, setNewSubjectCurriculum] = useState("2022 개정");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryParentId, setNewCategoryParentId] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingCategoryParentId, setEditingCategoryParentId] = useState("");
  const [newTagName, setNewTagName] = useState("");

  useEffect(() => {
    let cancelled = false;
    void readClassificationLocally<ClassificationData>()
      .then(async (stored) => {
        if (cancelled) return;
        const next = stored?.version === 1
          ? mergeDefaultClassificationData(stored)
          : createDefaultClassificationData();
        setData(next);
        setSelectedSubjectId(sortByOrder(next.subjects)[0]?.id ?? "");
        await saveClassificationLocally(next);
        if (!cancelled) setMessage("2022 개정 교육과정 기본 분류를 확인했습니다.");
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "분류 체계를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function persist(next: ClassificationData, successMessage: string) {
    const withTimestamp = { ...next, updatedAt: new Date().toISOString() };
    setData(withTimestamp);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await saveClassificationLocally(withTimestamp);
      setMessage(successMessage);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "분류 체계를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const subjects = useMemo(() => data ? sortByOrder(data.subjects) : [], [data]);
  const selectedSubject = data?.subjects.find((subject) => subject.id === selectedSubjectId) ?? null;
  const categoryTree = useMemo(
    () => data && selectedSubjectId ? flattenCategoryTree(data.categories, selectedSubjectId) : [],
    [data, selectedSubjectId],
  );

  if (loading) {
    return <div className="grid min-h-80 place-items-center rounded-2xl border border-[#e3e8e4] bg-white"><LoaderCircle className="animate-spin text-[#1f6b4f]" size={26} /></div>;
  }
  async function addSubject() {
    const name = newSubjectName.trim();
    if (!name || data.subjects.some((subject) => subject.name === name)) return;
    const subject: SubjectDefinition = {
      id: makeId("subject"),
      name,
      curriculum: newSubjectCurriculum.trim(),
      sortOrder: data.subjects.length,
      isActive: true,
    };
    setNewSubjectName("");
    setSelectedSubjectId(subject.id);
    await persist({ ...data, subjects: [...data.subjects, subject] }, "과목을 추가했습니다.");
  }

  async function addCategory() {
    if (!selectedSubject) return;
    const name = newCategoryName.trim();
    if (!name) return;
    const parent = data.categories.find((category) => category.id === newCategoryParentId) ?? null;
    const siblings = data.categories.filter((category) =>
      category.subjectId === selectedSubject.id &&
      category.parentId === (parent?.id ?? null),
    );
    const category: CategoryDefinition = {
      id: makeId("category"),
      subjectId: selectedSubject.id,
      parentId: parent?.id ?? null,
      categoryType: nextCategoryType(parent),
      name,
      sortOrder: siblings.length,
      isActive: true,
    };
    setNewCategoryName("");
    await persist({ ...data, categories: [...data.categories, category] }, `${CATEGORY_TYPE_LABELS[category.categoryType]}을 추가했습니다.`);
  }

  function beginCategoryEdit(category: CategoryDefinition) {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
    setEditingCategoryParentId(category.parentId ?? "");
  }

  function descendantIds(categoryId: string) {
    const result = new Set<string>();
    const visit = (id: string) => {
      data.categories.filter((category) => category.parentId === id).forEach((category) => {
        result.add(category.id);
        visit(category.id);
      });
    };
    visit(categoryId);
    return result;
  }

  async function saveCategoryEdit() {
    const category = data.categories.find((item) => item.id === editingCategoryId);
    const name = editingCategoryName.trim();
    if (!category || !name) return;
    const parent = data.categories.find((item) => item.id === editingCategoryParentId) ?? null;
    await persist({
      ...data,
      categories: replaceItem(data.categories, category.id, {
        name,
        parentId: parent?.id ?? null,
        categoryType: nextCategoryType(parent),
      }),
    }, "단원 정보를 수정했습니다.");
    setEditingCategoryId("");
  }

  async function addTag() {
    const name = newTagName.trim();
    if (!name || data.tags.some((tag) => tag.name === name)) return;
    setNewTagName("");
    await persist({
      ...data,
      tags: [...data.tags, {
        id: makeId("tag"),
        name,
        color: "#1f6b4f",
        sortOrder: data.tags.length,
        isActive: true,
      }],
    }, "태그를 추가했습니다.");
  }

  async function restoreCurriculumDefaults() {
    await persist(
      mergeDefaultClassificationData(data),
      "빠진 2022 개정 과목과 대단원·중단원을 다시 채웠습니다.",
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          {saving && <><LoaderCircle className="animate-spin text-[#1f6b4f]" size={15} />저장 중</>}
          {!saving && message && <span role="status" className="font-medium text-[#1f6b4f]">{message}</span>}
          {error && <span role="alert" className="font-medium text-[#a1433b]">{error}</span>}
        </div>
        <button className={smallButtonClass} disabled={saving} onClick={() => void restoreCurriculumDefaults()}>
          <RefreshCw size={13} />2022 기본 분류 다시 채우기
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-[#e3e8e4] bg-white p-5">
          <div className="flex items-center gap-2"><BookOpen size={18} className="text-[#1f6b4f]" /><h2 className="font-bold">과목과 교육과정</h2></div>
          <div className="mt-4 space-y-2">
            {subjects.map((subject) => {
              const categoryCount = data.categories.filter((category) => category.subjectId === subject.id).length;
              return (
                <button
                  key={subject.id}
                  onClick={() => {
                    setSelectedSubjectId(subject.id);
                    setNewCategoryParentId("");
                    setEditingCategoryId("");
                  }}
                  className={`focus-ring flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${selectedSubjectId === subject.id ? "border-[#80aa97] bg-[#eef6f1]" : "border-[#edf0ee] hover:bg-[#f8faf8]"} ${subject.isActive ? "" : "opacity-55"}`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#dcefe5] font-bold text-[#1f6b4f]">{subject.name[0]}</span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{subject.name}</b>
                    <small className="text-[#6d7772]">{subject.curriculum || "교육과정 미지정"} · 분류 {categoryCount}개</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              );
            })}
          </div>
          <div className="mt-5 border-t border-[#edf0ee] pt-4">
            <h3 className="text-xs font-bold text-[#59645f]">새 과목</h3>
            <input aria-label="새 과목명" className={`${fieldClass} mt-2`} value={newSubjectName} onChange={(event) => setNewSubjectName(event.target.value)} placeholder="과목명" />
            <input aria-label="새 교육과정" className={`${fieldClass} mt-2`} value={newSubjectCurriculum} onChange={(event) => setNewSubjectCurriculum(event.target.value)} placeholder="예: 2022 개정" />
            <button className={`${smallButtonClass} mt-2 w-full`} onClick={() => void addSubject()}><Plus size={14} />과목 추가</button>
          </div>
        </aside>

        <main className="space-y-5">
          {selectedSubject && (
            <>
              <section className="rounded-2xl border border-[#e3e8e4] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2"><h2 className="text-lg font-bold">{selectedSubject.name}</h2><ActivityBadge active={selectedSubject.isActive} /></div>
                    <p className="mt-1 text-xs text-[#6d7772]">과목 정보와 표시 순서를 관리합니다.</p>
                  </div>
                  <div className="flex gap-2">
                    <button className={smallButtonClass} disabled={subjects[0]?.id === selectedSubject.id} onClick={() => void persist({
                      ...data,
                      subjects: swapOrder(data.subjects, subjects, selectedSubject.id, -1),
                    }, "과목 순서를 변경했습니다.")}><ArrowUp size={13} />위로</button>
                    <button className={smallButtonClass} disabled={subjects.at(-1)?.id === selectedSubject.id} onClick={() => void persist({
                      ...data,
                      subjects: swapOrder(data.subjects, subjects, selectedSubject.id, 1),
                    }, "과목 순서를 변경했습니다.")}><ArrowDown size={13} />아래로</button>
                    <button className={smallButtonClass} onClick={() => void persist({
                      ...data,
                      subjects: replaceItem(data.subjects, selectedSubject.id, { isActive: !selectedSubject.isActive }),
                    }, `과목을 ${selectedSubject.isActive ? "비활성화" : "활성화"}했습니다.`)}><CirclePower size={13} />{selectedSubject.isActive ? "비활성화" : "활성화"}</button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-[#6d7772]">과목명<input key={`${selectedSubject.id}-name`} className={`${fieldClass} mt-1`} defaultValue={selectedSubject.name} onBlur={(event) => {
                    const name = event.target.value.trim();
                    if (name && name !== selectedSubject.name) void persist({
                      ...data,
                      subjects: replaceItem(data.subjects, selectedSubject.id, { name }),
                    }, "과목명을 수정했습니다.");
                  }} /></label>
                  <label className="text-xs text-[#6d7772]">교육과정<input key={`${selectedSubject.id}-curriculum`} className={`${fieldClass} mt-1`} defaultValue={selectedSubject.curriculum} onBlur={(event) => {
                    const curriculum = event.target.value.trim();
                    if (curriculum !== selectedSubject.curriculum) void persist({
                      ...data,
                      subjects: replaceItem(data.subjects, selectedSubject.id, { curriculum }),
                    }, "교육과정을 수정했습니다.");
                  }} /></label>
                </div>
              </section>

              <section className="rounded-2xl border border-[#e3e8e4] bg-white p-5">
                <div className="flex items-center gap-2"><FolderTree size={18} className="text-[#1f6b4f]" /><h2 className="font-bold">단원과 주제</h2></div>
                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_220px_auto]">
                  <input aria-label="새 단원명" className={fieldClass} value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} onKeyDown={(event) => {
                    if (event.key === "Enter") void addCategory();
                  }} placeholder="새 단원 또는 주제 이름" />
                  <select aria-label="상위 분류" className={fieldClass} value={newCategoryParentId} onChange={(event) => setNewCategoryParentId(event.target.value)}>
                    <option value="">최상위 대단원</option>
                    {categoryTree.filter((category) => category.isActive).map((category) => <option key={category.id} value={category.id}>{"　".repeat(category.depth)}{category.name} 아래</option>)}
                  </select>
                  <button className={smallButtonClass} onClick={() => void addCategory()}><Plus size={14} />추가</button>
                </div>

                {!categoryTree.length && <p className="mt-5 rounded-xl border border-dashed border-[#d6ddd8] p-7 text-center text-sm text-[#6d7772]">대단원을 먼저 추가하세요. 하위 항목을 선택하면 중단원·소단원·주제로 자동 분류됩니다.</p>}
                <div className="mt-4 space-y-2">
                  {categoryTree.map((category, index) => {
                    const siblings = data.categories.filter((item) => item.subjectId === category.subjectId && item.parentId === category.parentId);
                    const siblingOrder = sortByOrder(siblings);
                    const blockedParents = descendantIds(category.id);
                    return (
                      <div key={category.id}>
                        <div className={`flex items-center gap-2 rounded-xl border border-[#edf0ee] p-2.5 ${category.isActive ? "" : "bg-[#f5f6f5] opacity-60"}`} style={{ marginLeft: Math.min(category.depth, 4) * 22 }}>
                          <span className="rounded-md bg-[#eef5f0] px-2 py-1 text-[10px] font-semibold text-[#1f6b4f]">{CATEGORY_TYPE_LABELS[category.categoryType]}</span>
                          <b className="min-w-0 flex-1 truncate text-sm">{category.name}</b>
                          <button aria-label="수정" className={smallButtonClass} onClick={() => beginCategoryEdit(category)}><Pencil size={13} /></button>
                          <button aria-label="위로" className={smallButtonClass} disabled={siblingOrder[0]?.id === category.id} onClick={() => void persist({
                            ...data,
                            categories: swapOrder(data.categories, siblings, category.id, -1),
                          }, "단원 순서를 변경했습니다.")}><ArrowUp size={13} /></button>
                          <button aria-label="아래로" className={smallButtonClass} disabled={siblingOrder.at(-1)?.id === category.id} onClick={() => void persist({
                            ...data,
                            categories: swapOrder(data.categories, siblings, category.id, 1),
                          }, "단원 순서를 변경했습니다.")}><ArrowDown size={13} /></button>
                          <button aria-label={category.isActive ? "비활성화" : "활성화"} className={smallButtonClass} onClick={() => void persist({
                            ...data,
                            categories: replaceItem(data.categories, category.id, { isActive: !category.isActive }),
                          }, `단원을 ${category.isActive ? "비활성화" : "활성화"}했습니다.`)}><CirclePower size={13} /></button>
                        </div>
                        {editingCategoryId === category.id && (
                          <div className="ml-6 mt-2 grid gap-2 rounded-xl bg-[#f3f7f4] p-3 sm:grid-cols-[1fr_220px_auto]">
                            <input aria-label="분류 이름 수정" className={fieldClass} value={editingCategoryName} onChange={(event) => setEditingCategoryName(event.target.value)} />
                            <select aria-label="상위 분류 수정" className={fieldClass} value={editingCategoryParentId} onChange={(event) => setEditingCategoryParentId(event.target.value)}>
                              <option value="">최상위 대단원</option>
                              {categoryTree.filter((item) => item.id !== category.id && !blockedParents.has(item.id)).map((item) => <option key={item.id} value={item.id}>{"　".repeat(item.depth)}{item.name}</option>)}
                            </select>
                            <button className={smallButtonClass} onClick={() => void saveCategoryEdit()}><Save size={13} />저장</button>
                          </div>
                        )}
                        {index < categoryTree.length - 1 && null}
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </main>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="rounded-2xl border border-[#e3e8e4] bg-white p-5">
          <div className="flex items-center gap-2"><Tag size={18} className="text-[#1f6b4f]" /><h3 className="font-bold">사용자 태그</h3></div>
          <div className="mt-3 flex gap-2">
            <input aria-label="새 태그" className={fieldClass} value={newTagName} onChange={(event) => setNewTagName(event.target.value)} onKeyDown={(event) => {
              if (event.key === "Enter") void addTag();
            }} placeholder="새 태그" />
            <button className={smallButtonClass} onClick={() => void addTag()}><Plus size={14} />추가</button>
          </div>
          <div className="mt-3 space-y-2">
            {sortByOrder(data.tags).map((tagItem, index, ordered) => (
              <div key={tagItem.id} className={`flex items-center gap-2 rounded-xl border border-[#edf0ee] p-2 ${tagItem.isActive ? "" : "opacity-55"}`}>
                <input aria-label="태그 색상" type="color" className="size-7 rounded border-0 bg-transparent p-0" value={tagItem.color} onChange={(event) => void persist({
                  ...data,
                  tags: replaceItem(data.tags, tagItem.id, { color: event.target.value }),
                }, "태그 색상을 변경했습니다.")} />
                <input aria-label="태그 이름" className="min-w-0 flex-1 bg-transparent text-sm outline-none" defaultValue={tagItem.name} onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (name && name !== tagItem.name) void persist({
                    ...data,
                    tags: replaceItem(data.tags, tagItem.id, { name }),
                  }, "태그 이름을 수정했습니다.");
                }} />
                <button aria-label="태그 위로" className={smallButtonClass} disabled={index === 0} onClick={() => void persist({
                  ...data,
                  tags: swapOrder(data.tags, ordered, tagItem.id, -1),
                }, "태그 순서를 변경했습니다.")}><ArrowUp size={13} /></button>
                <button aria-label="태그 아래로" className={smallButtonClass} disabled={index === ordered.length - 1} onClick={() => void persist({
                  ...data,
                  tags: swapOrder(data.tags, ordered, tagItem.id, 1),
                }, "태그 순서를 변경했습니다.")}><ArrowDown size={13} /></button>
                <button aria-label="태그 상태 변경" className={smallButtonClass} onClick={() => void persist({
                  ...data,
                  tags: replaceItem(data.tags, tagItem.id, { isActive: !tagItem.isActive }),
                }, `태그를 ${tagItem.isActive ? "비활성화" : "활성화"}했습니다.`)}><CirclePower size={13} /></button>
              </div>
            ))}
          </div>
        </section>
        <ExtraOptionGroup title="난이도" kind="difficulty" data={data} onPersist={persist} />
        <ExtraOptionGroup title="문항 유형" kind="questionType" data={data} onPersist={persist} />
      </div>
    </div>
  );
}
