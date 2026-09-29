/**
 * مولّد الجدول المدرسي: توزيع الحصص على خانات (يوم × حصة) بقيود صارمة ومرنة.
 *
 * القيود الصارمة (لا تُكسر أبداً):
 *  - الفصل لا يدرس حصتين في الخانة نفسها.
 *  - المعلم لا يُدرّس فصلين في الخانة نفسها (ولا في خانة مشغولة له في فرع آخر).
 *  - القاعة الخاصة (مختبر، حاسب…) لا تُحجز لفصلين في الخانة نفسها.
 *  - الحد الأقصى للحصص المتتالية للمعلم.
 *  - المادة «الثقيلة» لا تتكرر في اليوم نفسه إلا إذا زادت حصصها عن أيام الأسبوع، وغيرها حتى حصتين (مزدوجة).
 * القيود المرنة (تُحترم ما أمكن):
 *  - يوم الراحة المفضل للمعلم (يُكسر فقط إن تعذّر التسكين بدونه).
 *  - المواد الثقيلة في الحصص الأولى، وتوزيع حصص المادة على أيام مختلفة، وتوازن يوم المعلم.
 *
 * الخوارزمية: تسكين جشع بترتيب الصعوبة + إصلاح بإزاحة حصة واحدة، مع عدة محاولات ببذور مختلفة
 * واختيار الأفضل (أقل حصص غير مسكّنة ثم أقل عقوبة مرنة). حتمية لنفس البذرة.
 */

export interface GenLesson {
  sectionId: string;
  subjectId: string;
  teacherId: string;
  /** عدد الحصص الأسبوعية */
  count: number;
  heavy: boolean;
  /** نوع القاعة المطلوب (مختبر، حاسب…) أو null لقاعة الفصل */
  roomKind: string | null;
}

export interface GenSlot {
  sectionId: string;
  day: number;
  period: number;
  subjectId: string;
  teacherId: string;
  roomId: string | null;
  locked: boolean;
}

export interface GenInput {
  /** أيام الدراسة (0=الأحد…) */
  days: number[];
  /** عدد الحصص اليومية (تُرقّم من 1) */
  periods: number;
  maxConsecutive: number;
  lessons: GenLesson[];
  rooms: Array<{ id: string; kind: string }>;
  teacherFreeDay?: Record<string, number | null | undefined>;
  /** حصص مثبّتة يدوياً (تبقى كما هي وتُحتسب من نصيب المادة) */
  locked?: GenSlot[];
  /** خانات مشغولة للمعلمين خارج نطاق التوليد (فرع آخر) */
  teacherBusy?: Array<{ teacherId: string; day: number; period: number }>;
  seed?: number;
  attempts?: number;
}

export interface GenUnplaced {
  sectionId: string;
  subjectId: string;
  teacherId: string;
  missing: number;
  reason: string;
}

export interface GenResult {
  slots: GenSlot[];
  unplaced: GenUnplaced[];
  /** عقوبة القيود المرنة (أقل = أفضل) */
  penalty: number;
  /** عدد مرات كسر يوم الراحة المفضل */
  freeDayViolations: number;
  attempt: number;
}

/** مولّد أرقام عشوائية ببذرة (mulberry32) */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const k2 = (a: string, d: number, p: number) => `${a}|${d}|${p}`;

/** الحد اليومي لتكرار المادة في الفصل */
export function maxPerDay(lesson: Pick<GenLesson, "heavy" | "count">, dayCount: number) {
  const needed = Math.ceil(lesson.count / Math.max(1, dayCount));
  // الثقيلة: أقل تكرار ممكن؛ غيرها يُسمح بحصة مزدوجة
  return lesson.heavy ? needed : Math.max(2, needed);
}

class State {
  section = new Map<string, number>(); // s|d|p → lesson index (-1 للمثبّت)
  teacher = new Set<string>();
  room = new Set<string>();
  subjectDay = new Map<string, number>(); // s|subj|d → count
  teacherDay = new Map<string, number>(); // t|d → count
  slots: Array<GenSlot & { lesson: number }> = [];

  constructor(private readonly input: GenInput) {
    for (const b of input.teacherBusy ?? []) this.teacher.add(k2(b.teacherId, b.day, b.period));
  }

  teacherRun(teacherId: string, day: number, period: number) {
    // طول سلسلة الحصص المتتالية لو وُضعت حصة في (day, period)
    let run = 1;
    for (let p = period - 1; p >= 1 && this.teacher.has(k2(teacherId, day, p)); p--) run++;
    for (let p = period + 1; p <= this.input.periods && this.teacher.has(k2(teacherId, day, p)); p++) run++;
    return run;
  }

  place(slot: GenSlot, lesson: number) {
    this.section.set(k2(slot.sectionId, slot.day, slot.period), lesson);
    this.teacher.add(k2(slot.teacherId, slot.day, slot.period));
    if (slot.roomId) this.room.add(k2(slot.roomId, slot.day, slot.period));
    const sd = `${slot.sectionId}|${slot.subjectId}|${slot.day}`;
    this.subjectDay.set(sd, (this.subjectDay.get(sd) ?? 0) + 1);
    const td = `${slot.teacherId}|${slot.day}`;
    this.teacherDay.set(td, (this.teacherDay.get(td) ?? 0) + 1);
    this.slots.push({ ...slot, lesson });
  }

  remove(index: number) {
    const [slot] = this.slots.splice(index, 1);
    if (!slot) return;
    this.section.delete(k2(slot.sectionId, slot.day, slot.period));
    this.teacher.delete(k2(slot.teacherId, slot.day, slot.period));
    if (slot.roomId) this.room.delete(k2(slot.roomId, slot.day, slot.period));
    const sd = `${slot.sectionId}|${slot.subjectId}|${slot.day}`;
    this.subjectDay.set(sd, (this.subjectDay.get(sd) ?? 1) - 1);
    const td = `${slot.teacherId}|${slot.day}`;
    this.teacherDay.set(td, (this.teacherDay.get(td) ?? 1) - 1);
    return slot;
  }
}

interface Candidate {
  day: number;
  period: number;
  roomId: string | null;
  score: number;
  freeDayBroken: boolean;
}

export function generateTimetable(input: GenInput): GenResult {
  const attempts = Math.max(1, input.attempts ?? 6);
  let best: GenResult | null = null;
  for (let i = 0; i < attempts; i++) {
    const result = attempt(input, (input.seed ?? 1) + i * 7919, i);
    if (!best || better(result, best)) best = result;
    if (best.unplaced.length === 0 && best.freeDayViolations === 0 && i >= 1) break;
  }
  return best!;
}

function better(a: GenResult, b: GenResult) {
  const ma = a.unplaced.reduce((s, u) => s + u.missing, 0);
  const mb = b.unplaced.reduce((s, u) => s + u.missing, 0);
  if (ma !== mb) return ma < mb;
  if (a.freeDayViolations !== b.freeDayViolations) return a.freeDayViolations < b.freeDayViolations;
  return a.penalty < b.penalty;
}

function attempt(input: GenInput, seed: number, index: number): GenResult {
  const rand = seededRandom(seed);
  const state = new State(input);
  const dayCount = input.days.length;
  const roomsByKind = new Map<string, string[]>();
  for (const r of input.rooms) roomsByKind.set(r.kind, [...(roomsByKind.get(r.kind) ?? []), r.id]);

  // الحصص المثبّتة أولاً
  const remaining = input.lessons.map((l) => l.count);
  for (const s of input.locked ?? []) {
    const li = input.lessons.findIndex((l) => l.sectionId === s.sectionId && l.subjectId === s.subjectId);
    state.place({ ...s, locked: true }, li);
    if (li >= 0) remaining[li] = Math.max(0, remaining[li]! - 1);
  }

  const teacherLoad = new Map<string, number>();
  for (const l of input.lessons) teacherLoad.set(l.teacherId, (teacherLoad.get(l.teacherId) ?? 0) + l.count);

  // وحدات التسكين: حصة واحدة لكل وحدة، مرتبة بالصعوبة
  const units: number[] = [];
  input.lessons.forEach((l, i) => {
    for (let n = 0; n < remaining[i]!; n++) units.push(i);
  });
  const jitter = new Map(input.lessons.map((_, i) => [i, rand()]));
  const difficulty = (i: number) => {
    const l = input.lessons[i]!;
    const roomScarcity = l.roomKind ? 40 / Math.max(1, roomsByKind.get(l.roomKind)?.length ?? 0) : 0;
    return (teacherLoad.get(l.teacherId) ?? 0) + roomScarcity + (l.heavy ? 6 : 0) + (jitter.get(i) ?? 0) * 4;
  };
  units.sort((a, b) => difficulty(b) - difficulty(a));

  const candidates = (li: number, allowFreeDay: boolean, ignore: "none" | "section" | "teacher" = "none"): Candidate[] => {
    const l = input.lessons[li]!;
    const out: Candidate[] = [];
    const freeDay = input.teacherFreeDay?.[l.teacherId];
    const cap = maxPerDay(l, dayCount);
    for (const day of input.days) {
      const broken = freeDay !== null && freeDay !== undefined && freeDay === day;
      if (broken && !allowFreeDay) continue;
      const sameDay = state.subjectDay.get(`${l.sectionId}|${l.subjectId}|${day}`) ?? 0;
      if (sameDay >= cap) continue;
      for (let period = 1; period <= input.periods; period++) {
        const sectionBusy = state.section.has(k2(l.sectionId, day, period));
        const teacherBusy = state.teacher.has(k2(l.teacherId, day, period));
        if (ignore === "none" && (sectionBusy || teacherBusy)) continue;
        // في وضع الإصلاح: نبحث عن خانة يكون فيها طرف واحد فقط مشغولاً (لإزاحة حصته)
        if (ignore === "section" && (teacherBusy || !sectionBusy)) continue;
        if (ignore === "teacher" && (sectionBusy || !teacherBusy)) continue;
        if (!teacherBusy && state.teacherRun(l.teacherId, day, period) > input.maxConsecutive) continue;
        let roomId: string | null = null;
        if (l.roomKind) {
          const rooms = roomsByKind.get(l.roomKind) ?? [];
          roomId = rooms.find((r) => !state.room.has(k2(r, day, period))) ?? null;
          if (rooms.length && !roomId) continue;
        }
        let score = 0;
        if (l.heavy) score += period * 3;
        else score += (input.periods - period) * 0.3;
        score += sameDay * 12; // توزيع المادة على الأيام
        score += (state.teacherDay.get(`${l.teacherId}|${day}`) ?? 0) * 1.5; // توازن يوم المعلم
        // حصتان للمادة في اليوم نفسه: الأفضل أن تكونا متتاليتين
        if (sameDay > 0) {
          const adjacent = [period - 1, period + 1].some((p) => {
            const at = state.section.get(k2(l.sectionId, day, p));
            return at !== undefined && at >= 0 && input.lessons[at]!.subjectId === l.subjectId;
          });
          if (!adjacent) score += 6;
        }
        if (broken) score += 50;
        score += rand() * 0.8;
        out.push({ day, period, roomId, score, freeDayBroken: broken });
      }
    }
    return out.sort((a, b) => a.score - b.score);
  };

  let freeDayViolations = 0;
  const missing = new Map<number, number>();
  const tryPlace = (li: number, allowFreeDay: boolean): boolean => {
    const l = input.lessons[li]!;
    const direct = candidates(li, allowFreeDay)[0];
    if (direct) {
      state.place({ sectionId: l.sectionId, day: direct.day, period: direct.period, subjectId: l.subjectId, teacherId: l.teacherId, roomId: direct.roomId, locked: false }, li);
      if (direct.freeDayBroken) freeDayViolations++;
      return true;
    }
    // إصلاح: خانة يشغلها طرف واحد (الفصل أو المعلم) بحصة غير مثبّتة يمكن نقلها لمكان آخر
    for (const mode of ["section", "teacher"] as const) {
      for (const c of candidates(li, allowFreeDay, mode)) {
        const occupantIndex = state.slots.findIndex((s) => s.day === c.day && s.period === c.period && (mode === "section" ? s.sectionId === l.sectionId : s.teacherId === l.teacherId));
        if (occupantIndex < 0) continue;
        const occupant = state.slots[occupantIndex]!;
        if (occupant.locked || occupant.lesson < 0) continue;
        state.remove(occupantIndex);
        // بعد الإزاحة يجب أن تكون الخانة صالحة فعلاً للحصة الحالية (قيد التتابع والقاعة)
        const fits = candidates(li, allowFreeDay).find((x) => x.day === c.day && x.period === c.period);
        if (fits) {
          state.place({ sectionId: l.sectionId, day: c.day, period: c.period, subjectId: l.subjectId, teacherId: l.teacherId, roomId: fits.roomId, locked: false }, li);
          const alt = candidates(occupant.lesson, false)[0];
          if (alt) {
            const ol = input.lessons[occupant.lesson]!;
            state.place({ sectionId: ol.sectionId, day: alt.day, period: alt.period, subjectId: ol.subjectId, teacherId: ol.teacherId, roomId: alt.roomId, locked: false }, occupant.lesson);
            if (fits.freeDayBroken) freeDayViolations++;
            return true;
          }
          state.remove(state.slots.length - 1);
        }
        // تراجع
        state.place({ ...occupant, locked: false }, occupant.lesson);
      }
    }
    return false;
  };

  for (const li of units) {
    if (tryPlace(li, false)) continue;
    if (tryPlace(li, true)) continue;
    missing.set(li, (missing.get(li) ?? 0) + 1);
  }

  const unplaced: GenUnplaced[] = [...missing.entries()].map(([li, n]) => {
    const l = input.lessons[li]!;
    return { sectionId: l.sectionId, subjectId: l.subjectId, teacherId: l.teacherId, missing: n, reason: explain(input, state, li) };
  });

  // العقوبة المرنة النهائية
  let penalty = 0;
  for (const s of state.slots) {
    const l = s.lesson >= 0 ? input.lessons[s.lesson] : null;
    if (l?.heavy) penalty += Math.max(0, s.period - 3);
  }
  for (const v of state.subjectDay.values()) if (v > 1) penalty += (v - 1) * 2;

  return {
    slots: state.slots.map(({ lesson: _lesson, ...s }) => s),
    unplaced,
    penalty,
    freeDayViolations,
    attempt: index,
  };
}

function explain(input: GenInput, state: State, li: number): string {
  const l = input.lessons[li]!;
  const total = input.days.length * input.periods;
  const sectionLoad = input.lessons.filter((x) => x.sectionId === l.sectionId).reduce((s, x) => s + x.count, 0);
  if (sectionLoad > total) return "مجموع حصص الفصل يتجاوز خانات الأسبوع";
  const teacherLoad = input.lessons.filter((x) => x.teacherId === l.teacherId).reduce((s, x) => s + x.count, 0) + (input.teacherBusy ?? []).filter((b) => b.teacherId === l.teacherId).length;
  if (teacherLoad > total) return "حصص المعلم تتجاوز خانات الأسبوع";
  if (l.roomKind && !input.rooms.some((r) => r.kind === l.roomKind)) return "لا توجد قاعة من النوع المطلوب";
  void state;
  return "تعارض بين أوقات المعلم والفصل (جرّب تخفيف القيود أو تغيير الإسناد)";
}

export interface Conflict {
  kind: "section" | "teacher" | "room" | "consecutive" | "subject_day";
  day: number;
  period: number;
  message: string;
}

/** فحص جدول كامل للتعارضات الصارمة (للاختبارات ولتحقق النقل اليدوي) */
export function findConflicts(slots: Array<Omit<GenSlot, "locked">>, opts: { periods: number; maxConsecutive: number; heavy?: (sectionId: string, subjectId: string) => boolean; dayCount?: number; counts?: (sectionId: string, subjectId: string) => number }): Conflict[] {
  const out: Conflict[] = [];
  const seen = { section: new Set<string>(), teacher: new Set<string>(), room: new Set<string>() };
  const teacherCells = new Map<string, Set<number>>();
  const subjectDay = new Map<string, number>();
  for (const s of slots) {
    const sk = k2(s.sectionId, s.day, s.period);
    if (seen.section.has(sk)) out.push({ kind: "section", day: s.day, period: s.period, message: "الفصل لديه حصتان في الوقت نفسه" });
    seen.section.add(sk);
    const tk = k2(s.teacherId, s.day, s.period);
    if (seen.teacher.has(tk)) out.push({ kind: "teacher", day: s.day, period: s.period, message: "المعلم مرتبط بحصتين في الوقت نفسه" });
    seen.teacher.add(tk);
    if (s.roomId) {
      const rk = k2(s.roomId, s.day, s.period);
      if (seen.room.has(rk)) out.push({ kind: "room", day: s.day, period: s.period, message: "القاعة محجوزة لفصلين في الوقت نفسه" });
      seen.room.add(rk);
    }
    const td = `${s.teacherId}|${s.day}`;
    teacherCells.set(td, (teacherCells.get(td) ?? new Set()).add(s.period));
    const sd = `${s.sectionId}|${s.subjectId}|${s.day}`;
    subjectDay.set(sd, (subjectDay.get(sd) ?? 0) + 1);
  }
  for (const [td, periods] of teacherCells) {
    let run = 0;
    for (let p = 1; p <= opts.periods; p++) {
      run = periods.has(p) ? run + 1 : 0;
      if (run > opts.maxConsecutive) {
        out.push({ kind: "consecutive", day: Number(td.split("|")[1]), period: p, message: `تجاوز الحد الأقصى للحصص المتتالية (${opts.maxConsecutive})` });
        break;
      }
    }
  }
  if (opts.heavy) {
    for (const [sd, n] of subjectDay) {
      const [sectionId, subjectId, day] = sd.split("|") as [string, string, string];
      const cap = maxPerDay({ heavy: opts.heavy(sectionId, subjectId), count: opts.counts?.(sectionId, subjectId) ?? 0 }, opts.dayCount ?? 5);
      if (n > cap) out.push({ kind: "subject_day", day: Number(day), period: 0, message: "تكرار المادة في اليوم نفسه أكثر من المسموح" });
    }
  }
  return out;
}
