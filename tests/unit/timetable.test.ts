import { describe, expect, it } from "vitest";
import { findConflicts, generateTimetable, maxPerDay, type GenInput, type GenLesson } from "@/lib/timetable/generator";

/** مدرسة واقعية: ١٢ فصلاً، ١٦ معلماً، ٥ أيام × ٧ حصص، مختبر وحاسب */
function schoolInput(): GenInput {
  const plan: Array<[string, number, boolean, string | null]> = [
    ["QURAN", 4, false, null],
    ["ISL", 3, false, null],
    ["ARB", 6, true, null],
    ["MATH", 6, true, null],
    ["SCI", 4, true, "LAB"],
    ["ENG", 4, false, null],
    ["SOC", 2, false, null],
    ["CS", 2, false, "COMPUTER"],
    ["PE", 2, false, null],
  ];
  const sections = Array.from({ length: 12 }, (_, i) => `S${i + 1}`);
  const teachersBySubject: Record<string, string[]> = {
    QURAN: ["T1", "T2"],
    ISL: ["T3", "T17"],
    ARB: ["T4", "T5", "T6"],
    MATH: ["T7", "T8", "T9"],
    SCI: ["T10", "T11"],
    ENG: ["T12", "T13"],
    SOC: ["T14"],
    CS: ["T15"],
    PE: ["T16"],
  };
  const lessons: GenLesson[] = [];
  sections.forEach((s, i) => {
    for (const [subj, count, heavy, roomKind] of plan) {
      const pool = teachersBySubject[subj]!;
      lessons.push({ sectionId: s, subjectId: subj, teacherId: pool[i % pool.length]!, count, heavy, roomKind });
    }
  });
  return {
    days: [0, 1, 2, 3, 4],
    periods: 7,
    maxConsecutive: 4,
    lessons,
    rooms: [
      { id: "LAB1", kind: "LAB" },
      { id: "LAB2", kind: "LAB" },
      { id: "PC1", kind: "COMPUTER" },
    ],
    teacherFreeDay: { T4: 4, T7: 0, T12: 2 },
    seed: 42,
  };
}

describe("مولّد الجدول", () => {
  it("يسكّن كل الحصص دون أي تعارض صارم", () => {
    const input = schoolInput();
    const result = generateTimetable(input);
    const total = input.lessons.reduce((s, l) => s + l.count, 0);
    expect(result.unplaced).toEqual([]);
    expect(result.slots).toHaveLength(total);
    const heavy = (s: string, subj: string) => input.lessons.find((l) => l.sectionId === s && l.subjectId === subj)!.heavy;
    const counts = (s: string, subj: string) => input.lessons.find((l) => l.sectionId === s && l.subjectId === subj)!.count;
    expect(findConflicts(result.slots, { periods: 7, maxConsecutive: 4, heavy, counts, dayCount: 5 })).toEqual([]);
  });

  it("يحترم عدد الحصص الأسبوعية لكل مادة في كل فصل", () => {
    const input = schoolInput();
    const result = generateTimetable(input);
    for (const l of input.lessons) {
      expect(result.slots.filter((s) => s.sectionId === l.sectionId && s.subjectId === l.subjectId)).toHaveLength(l.count);
    }
  });

  it("يحجز القاعات الخاصة ولا يكررها في الخانة نفسها", () => {
    const result = generateTimetable(schoolInput());
    const sci = result.slots.filter((s) => s.subjectId === "SCI");
    expect(sci.every((s) => s.roomId === "LAB1" || s.roomId === "LAB2")).toBe(true);
    const cs = result.slots.filter((s) => s.subjectId === "CS");
    expect(cs.every((s) => s.roomId === "PC1")).toBe(true);
  });

  it("يحترم يوم الراحة المفضل للمعلم", () => {
    const result = generateTimetable(schoolInput());
    expect(result.freeDayViolations).toBe(0);
    expect(result.slots.some((s) => s.teacherId === "T4" && s.day === 4)).toBe(false);
    expect(result.slots.some((s) => s.teacherId === "T7" && s.day === 0)).toBe(false);
  });

  it("يفضّل المواد الثقيلة في الحصص الأولى", () => {
    const result = generateTimetable(schoolInput());
    const heavy = result.slots.filter((s) => ["ARB", "MATH", "SCI"].includes(s.subjectId));
    const avg = heavy.reduce((s, x) => s + x.period, 0) / heavy.length;
    const light = result.slots.filter((s) => ["PE", "SOC"].includes(s.subjectId));
    const avgLight = light.reduce((s, x) => s + x.period, 0) / light.length;
    expect(avg).toBeLessThan(avgLight);
  });

  it("يُبقي الحصص المثبّتة في مكانها ويحسبها من نصيب المادة", () => {
    const input = schoolInput();
    const lesson = input.lessons.find((l) => l.sectionId === "S1" && l.subjectId === "PE")!;
    input.locked = [{ sectionId: "S1", day: 3, period: 7, subjectId: "PE", teacherId: lesson.teacherId, roomId: null, locked: true }];
    const result = generateTimetable(input);
    const pe = result.slots.filter((s) => s.sectionId === "S1" && s.subjectId === "PE");
    expect(pe).toHaveLength(2);
    expect(pe.some((s) => s.day === 3 && s.period === 7 && s.locked)).toBe(true);
  });

  it("لا يستخدم خانات المعلم المشغولة في فرع آخر", () => {
    const input = schoolInput();
    input.teacherBusy = [0, 1, 2, 3, 4].map((day) => ({ teacherId: "T16", day, period: 1 }));
    const result = generateTimetable(input);
    expect(result.slots.some((s) => s.teacherId === "T16" && s.period === 1)).toBe(false);
  });

  it("يبلّغ عن الحصص التي تعذّر تسكينها مع السبب", () => {
    const input = schoolInput();
    // معلم واحد لكل الرياضيات: ٧٢ حصة > ٣٥ خانة
    input.lessons = input.lessons.map((l) => (l.subjectId === "MATH" ? { ...l, teacherId: "T7" } : l));
    const result = generateTimetable({ ...input, attempts: 2 });
    const math = result.unplaced.filter((u) => u.subjectId === "MATH");
    expect(math.length).toBeGreaterThan(0);
    expect(math[0]!.reason).toContain("المعلم");
    expect(findConflicts(result.slots, { periods: 7, maxConsecutive: 4 })).toEqual([]);
  });

  it("حتمي لنفس البذرة", () => {
    const a = generateTimetable(schoolInput());
    const b = generateTimetable(schoolInput());
    expect(a.slots).toEqual(b.slots);
  });

  it("فحص التعارضات يكتشف ازدواج المعلم والقاعة والتتابع", () => {
    const conflicts = findConflicts(
      [
        { sectionId: "A", day: 0, period: 1, subjectId: "M", teacherId: "T", roomId: "R" },
        { sectionId: "B", day: 0, period: 1, subjectId: "M", teacherId: "T", roomId: "R" },
        { sectionId: "C", day: 1, period: 1, subjectId: "M", teacherId: "X", roomId: null },
        { sectionId: "C", day: 1, period: 2, subjectId: "E", teacherId: "X", roomId: null },
        { sectionId: "D", day: 1, period: 3, subjectId: "E", teacherId: "X", roomId: null },
      ],
      { periods: 7, maxConsecutive: 2 },
    );
    expect(conflicts.map((c) => c.kind).sort()).toEqual(["consecutive", "room", "teacher"]);
  });

  it("الحد اليومي لتكرار المادة", () => {
    expect(maxPerDay({ heavy: true, count: 4 }, 5)).toBe(1);
    expect(maxPerDay({ heavy: true, count: 6 }, 5)).toBe(2);
    expect(maxPerDay({ heavy: false, count: 2 }, 5)).toBe(2);
    expect(maxPerDay({ heavy: false, count: 11 }, 5)).toBe(3);
  });
});
