/**
 * لغة المعادلات لخاصية FORMULA — محلّل ومقيّم آمن (دون eval).
 *
 * الصيغة مشابهة لمعادلات Notion:
 *   prop("الدرجة") * 2
 *   if(prop("مكتمل"), "منجز", "قيد العمل")
 *   dateBetween(prop("الموعد"), today(), "days")
 *   concat(prop("الاسم"), " - ", prop("الصف"))
 * تتوفر أسماء عربية بديلة للدوال: إذا، دمج، طول، تقريب، اليوم، الآن، خاصية.
 */

export type FormulaValue = number | string | boolean | Date | null | FormulaValue[];

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormulaError";
  }
}

// ---------------------------------------------------------------------
// المحلل اللفظي
// ---------------------------------------------------------------------

type Token =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "paren"; value: "(" | ")" }
  | { type: "comma" }
  | { type: "eof" };

const OPERATORS = ["==", "!=", ">=", "<=", "&&", "||", ">", "<", "+", "-", "*", "/", "%", "!", "?", ":"];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const input = src.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/،/g, ",");
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j]!)) j++;
      const raw = input.slice(i, j);
      const value = Number(raw);
      if (Number.isNaN(value)) throw new FormulaError(`رقم غير صالح: ${raw}`);
      tokens.push({ type: "number", value });
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "“" || ch === "”") {
      const close = ch === "“" ? "”" : ch;
      let j = i + 1;
      let out = "";
      while (j < input.length && input[j] !== close && !(close === "”" && input[j] === '"')) {
        if (input[j] === "\\" && j + 1 < input.length) {
          out += input[j + 1];
          j += 2;
          continue;
        }
        out += input[j];
        j++;
      }
      if (j >= input.length) throw new FormulaError("نص غير مغلق بعلامة تنصيص");
      tokens.push({ type: "string", value: out });
      i = j + 1;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", value: ch });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }
    const op = OPERATORS.find((o) => input.startsWith(o, i));
    if (op) {
      tokens.push({ type: "op", value: op });
      i += op.length;
      continue;
    }
    if (/[\p{L}_]/u.test(ch)) {
      let j = i;
      while (j < input.length && /[\p{L}\p{N}_]/u.test(input[j]!)) j++;
      tokens.push({ type: "ident", value: input.slice(i, j) });
      i = j;
      continue;
    }
    throw new FormulaError(`رمز غير متوقع: ${ch}`);
  }
  tokens.push({ type: "eof" });
  return tokens;
}

// ---------------------------------------------------------------------
// شجرة التعبير
// ---------------------------------------------------------------------

type Node =
  | { kind: "literal"; value: FormulaValue }
  | { kind: "unary"; op: string; arg: Node }
  | { kind: "binary"; op: string; left: Node; right: Node }
  | { kind: "ternary"; cond: Node; then: Node; else: Node }
  | { kind: "call"; name: string; args: Node[] };

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos]!;
  }
  private next(): Token {
    return this.tokens[this.pos++]!;
  }
  private isOp(value: string): boolean {
    const t = this.peek();
    return (t.type === "op" && t.value === value) || (t.type === "ident" && t.value === value);
  }

  parse(): Node {
    const node = this.ternary();
    if (this.peek().type !== "eof") throw new FormulaError("صيغة غير مكتملة أو رموز زائدة");
    return node;
  }

  private ternary(): Node {
    const cond = this.or();
    if (this.isOp("?")) {
      this.next();
      const then = this.ternary();
      if (!this.isOp(":")) throw new FormulaError("يتوقع «:» في التعبير الشرطي");
      this.next();
      const otherwise = this.ternary();
      return { kind: "ternary", cond, then, else: otherwise };
    }
    return cond;
  }

  private or(): Node {
    let left = this.and();
    while (this.isOp("||") || this.isOp("or") || this.isOp("أو")) {
      this.next();
      left = { kind: "binary", op: "||", left, right: this.and() };
    }
    return left;
  }

  private and(): Node {
    let left = this.not();
    while (this.isOp("&&") || this.isOp("and") || this.isOp("و")) {
      this.next();
      left = { kind: "binary", op: "&&", left, right: this.not() };
    }
    return left;
  }

  private not(): Node {
    if (this.isOp("!") || this.isOp("not") || this.isOp("ليس")) {
      this.next();
      return { kind: "unary", op: "!", arg: this.not() };
    }
    return this.comparison();
  }

  private comparison(): Node {
    const left = this.additive();
    const t = this.peek();
    if (t.type === "op" && ["==", "!=", ">", "<", ">=", "<="].includes(t.value)) {
      this.next();
      return { kind: "binary", op: t.value, left, right: this.additive() };
    }
    return left;
  }

  private additive(): Node {
    let left = this.multiplicative();
    for (;;) {
      const t = this.peek();
      if (t.type === "op" && (t.value === "+" || t.value === "-")) {
        this.next();
        left = { kind: "binary", op: t.value, left, right: this.multiplicative() };
      } else return left;
    }
  }

  private multiplicative(): Node {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t.type === "op" && (t.value === "*" || t.value === "/" || t.value === "%")) {
        this.next();
        left = { kind: "binary", op: t.value, left, right: this.unary() };
      } else return left;
    }
  }

  private unary(): Node {
    const t = this.peek();
    if (t.type === "op" && t.value === "-") {
      this.next();
      return { kind: "unary", op: "-", arg: this.unary() };
    }
    return this.primary();
  }

  private primary(): Node {
    const t = this.next();
    switch (t.type) {
      case "number":
        return { kind: "literal", value: t.value };
      case "string":
        return { kind: "literal", value: t.value };
      case "paren": {
        if (t.value !== "(") throw new FormulaError("قوس إغلاق غير متوقع");
        const inner = this.ternary();
        const close = this.next();
        if (close.type !== "paren" || close.value !== ")") throw new FormulaError("قوس غير مغلق");
        return inner;
      }
      case "ident": {
        const name = t.value;
        if (name === "true" || name === "صح") return { kind: "literal", value: true };
        if (name === "false" || name === "خطأ") return { kind: "literal", value: false };
        const open = this.peek();
        if (open.type === "paren" && open.value === "(") {
          this.next();
          const args: Node[] = [];
          if (!(this.peek().type === "paren" && (this.peek() as { value: string }).value === ")")) {
            args.push(this.ternary());
            while (this.peek().type === "comma") {
              this.next();
              args.push(this.ternary());
            }
          }
          const close = this.next();
          if (close.type !== "paren" || close.value !== ")") throw new FormulaError(`قوس غير مغلق في ${name}`);
          return { kind: "call", name, args };
        }
        throw new FormulaError(`اسم غير معروف: ${name}`);
      }
      default:
        throw new FormulaError("صيغة غير مكتملة");
    }
  }
}

export function parseFormula(expression: string): Node {
  if (!expression.trim()) throw new FormulaError("المعادلة فارغة");
  return new Parser(tokenize(expression)).parse();
}

// ---------------------------------------------------------------------
// التقييم
// ---------------------------------------------------------------------

export interface FormulaContext {
  /** قيمة خاصية بالاسم */
  getProp: (name: string) => FormulaValue;
  now?: Date;
}

const ALIASES: Record<string, string> = {
  خاصية: "prop",
  إذا: "if",
  اذا: "if",
  دمج: "concat",
  طول: "length",
  تقريب: "round",
  اليوم: "today",
  الآن: "now",
  الان: "now",
  فارغ: "empty",
  أدنى: "min",
  أعلى: "max",
  مجموع: "sum",
};

export function isEmptyValue(v: FormulaValue): boolean {
  return v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

export function toText(v: FormulaValue): string {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.map(toText).join("، ");
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  return v;
}

function toNumber(v: FormulaValue): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === null) return 0;
  if (v instanceof Date) return v.getTime();
  if (Array.isArray(v)) return v.length;
  const n = Number(String(v).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
  if (Number.isNaN(n)) throw new FormulaError(`لا يمكن تحويل «${v}» إلى رقم`);
  return n;
}

function toBool(v: FormulaValue): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

function toDate(v: FormulaValue): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string" && v) {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "number") return new Date(v);
  return null;
}

function compare(a: FormulaValue, b: FormulaValue): number {
  if (a instanceof Date || b instanceof Date) {
    return (toDate(a)?.getTime() ?? 0) - (toDate(b)?.getTime() ?? 0);
  }
  if (typeof a === "number" || typeof b === "number") return toNumber(a) - toNumber(b);
  return toText(a).localeCompare(toText(b), "ar");
}

function equals(a: FormulaValue, b: FormulaValue): boolean {
  if (a instanceof Date || b instanceof Date) return toDate(a)?.getTime() === toDate(b)?.getTime();
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (typeof a === "boolean" || typeof b === "boolean") return toBool(a) === toBool(b);
  return toText(a) === toText(b);
}

const UNIT_MS: Record<string, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 7 * 86_400_000,
};

function normalizeUnit(unit: string): string {
  const map: Record<string, string> = {
    دقائق: "minutes",
    ساعات: "hours",
    أيام: "days",
    ايام: "days",
    أسابيع: "weeks",
    اسابيع: "weeks",
    أشهر: "months",
    اشهر: "months",
    سنوات: "years",
  };
  return map[unit] ?? unit;
}

function dateAdd(date: Date, amount: number, unitRaw: string): Date {
  const unit = normalizeUnit(unitRaw);
  const d = new Date(date.getTime());
  if (unit === "months") d.setUTCMonth(d.getUTCMonth() + amount);
  else if (unit === "years") d.setUTCFullYear(d.getUTCFullYear() + amount);
  else if (UNIT_MS[unit]) return new Date(d.getTime() + amount * UNIT_MS[unit]!);
  else throw new FormulaError(`وحدة زمنية غير معروفة: ${unitRaw}`);
  return d;
}

function dateBetween(a: Date, b: Date, unitRaw: string): number {
  const unit = normalizeUnit(unitRaw);
  if (unit === "months" || unit === "years") {
    const months = (a.getUTCFullYear() - b.getUTCFullYear()) * 12 + (a.getUTCMonth() - b.getUTCMonth());
    return unit === "years" ? Math.trunc(months / 12) : months;
  }
  const ms = UNIT_MS[unit];
  if (!ms) throw new FormulaError(`وحدة زمنية غير معروفة: ${unitRaw}`);
  return Math.trunc((a.getTime() - b.getTime()) / ms);
}

function flatten(values: FormulaValue[]): FormulaValue[] {
  return values.flatMap((v) => (Array.isArray(v) ? flatten(v) : [v]));
}

function arity(name: string, args: Node[], min: number, max = min): void {
  if (args.length < min || args.length > max) {
    throw new FormulaError(`الدالة ${name} تتطلب ${min === max ? min : `${min}–${max}`} وسائط`);
  }
}

function evaluate(node: Node, ctx: FormulaContext, depth = 0): FormulaValue {
  if (depth > 200) throw new FormulaError("المعادلة معقّدة جداً");
  const ev = (n: Node) => evaluate(n, ctx, depth + 1);
  switch (node.kind) {
    case "literal":
      return node.value;
    case "unary": {
      const v = ev(node.arg);
      return node.op === "-" ? -toNumber(v) : !toBool(v);
    }
    case "ternary":
      return toBool(ev(node.cond)) ? ev(node.then) : ev(node.else);
    case "binary": {
      if (node.op === "&&") return toBool(ev(node.left)) && toBool(ev(node.right));
      if (node.op === "||") return toBool(ev(node.left)) || toBool(ev(node.right));
      const l = ev(node.left);
      const r = ev(node.right);
      switch (node.op) {
        case "+":
          if (typeof l === "string" || typeof r === "string") return toText(l) + toText(r);
          return toNumber(l) + toNumber(r);
        case "-":
          return toNumber(l) - toNumber(r);
        case "*":
          return toNumber(l) * toNumber(r);
        case "/": {
          const d = toNumber(r);
          if (d === 0) throw new FormulaError("قسمة على صفر");
          return toNumber(l) / d;
        }
        case "%": {
          const d = toNumber(r);
          if (d === 0) throw new FormulaError("قسمة على صفر");
          return toNumber(l) % d;
        }
        case "==":
          return equals(l, r);
        case "!=":
          return !equals(l, r);
        case ">":
          return compare(l, r) > 0;
        case "<":
          return compare(l, r) < 0;
        case ">=":
          return compare(l, r) >= 0;
        case "<=":
          return compare(l, r) <= 0;
      }
      throw new FormulaError(`عامل غير معروف: ${node.op}`);
    }
    case "call":
      return callFunction(ALIASES[node.name] ?? node.name, node.args, ctx, ev);
  }
}

function callFunction(name: string, args: Node[], ctx: FormulaContext, ev: (n: Node) => FormulaValue): FormulaValue {
  const now = ctx.now ?? new Date();
  switch (name) {
    case "prop": {
      arity(name, args, 1);
      const key = ev(args[0]!);
      if (typeof key !== "string") throw new FormulaError("prop يتطلب اسم الخاصية نصاً");
      return ctx.getProp(key);
    }
    case "if":
      arity(name, args, 3);
      return toBool(ev(args[0]!)) ? ev(args[1]!) : ev(args[2]!);
    case "concat":
      return args.map((a) => toText(ev(a))).join("");
    case "join": {
      arity(name, args, 2);
      const list = ev(args[0]!);
      return (Array.isArray(list) ? list : [list]).map(toText).join(toText(ev(args[1]!)));
    }
    case "length": {
      arity(name, args, 1);
      const v = ev(args[0]!);
      return Array.isArray(v) ? v.length : toText(v).length;
    }
    case "contains":
      arity(name, args, 2);
      return toText(ev(args[0]!)).includes(toText(ev(args[1]!)));
    case "lower":
      arity(name, args, 1);
      return toText(ev(args[0]!)).toLowerCase();
    case "upper":
      arity(name, args, 1);
      return toText(ev(args[0]!)).toUpperCase();
    case "replaceAll":
      arity(name, args, 3);
      return toText(ev(args[0]!)).split(toText(ev(args[1]!))).join(toText(ev(args[2]!)));
    case "format":
      arity(name, args, 1);
      return toText(ev(args[0]!));
    case "toNumber":
      arity(name, args, 1);
      return toNumber(ev(args[0]!));
    case "empty":
      arity(name, args, 1);
      return isEmptyValue(ev(args[0]!));
    case "round": {
      arity(name, args, 1, 2);
      const places = args[1] ? toNumber(ev(args[1])) : 0;
      const f = 10 ** places;
      return Math.round(toNumber(ev(args[0]!)) * f) / f;
    }
    case "floor":
      arity(name, args, 1);
      return Math.floor(toNumber(ev(args[0]!)));
    case "ceil":
      arity(name, args, 1);
      return Math.ceil(toNumber(ev(args[0]!)));
    case "abs":
      arity(name, args, 1);
      return Math.abs(toNumber(ev(args[0]!)));
    case "sqrt":
      arity(name, args, 1);
      return Math.sqrt(toNumber(ev(args[0]!)));
    case "pow":
      arity(name, args, 2);
      return toNumber(ev(args[0]!)) ** toNumber(ev(args[1]!));
    case "min":
    case "max":
    case "sum": {
      const values = flatten(args.map(ev)).filter((v) => !isEmptyValue(v)).map(toNumber);
      if (name === "sum") return values.reduce((a, b) => a + b, 0);
      if (values.length === 0) return null;
      return name === "min" ? Math.min(...values) : Math.max(...values);
    }
    case "now":
      arity(name, args, 0);
      return now;
    case "today": {
      arity(name, args, 0);
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    }
    case "dateAdd":
    case "dateSubtract": {
      arity(name, args, 3);
      const d = toDate(ev(args[0]!));
      if (!d) return null;
      const amount = toNumber(ev(args[1]!));
      return dateAdd(d, name === "dateAdd" ? amount : -amount, toText(ev(args[2]!)));
    }
    case "dateBetween": {
      arity(name, args, 3);
      const a = toDate(ev(args[0]!));
      const b = toDate(ev(args[1]!));
      if (!a || !b) return null;
      return dateBetween(a, b, toText(ev(args[2]!)));
    }
    case "year":
    case "month":
    case "day": {
      arity(name, args, 1);
      const d = toDate(ev(args[0]!));
      if (!d) return null;
      if (name === "year") return d.getUTCFullYear();
      if (name === "month") return d.getUTCMonth() + 1;
      return d.getUTCDate();
    }
    default:
      throw new FormulaError(`دالة غير معروفة: ${name}`);
  }
}

export interface FormulaResult {
  value: FormulaValue;
  error: string | null;
}

/** تقييم معادلة مع التقاط الأخطاء وإرجاع رسالة عربية بدلاً من الاستثناء */
export function evaluateFormula(expression: string, ctx: FormulaContext): FormulaResult {
  try {
    return { value: evaluate(parseFormula(expression), ctx), error: null };
  } catch (err) {
    return { value: null, error: err instanceof FormulaError ? err.message : "خطأ في المعادلة" };
  }
}

/** أسماء الخصائص المستخدمة في معادلة (لكشف الاعتماد الدائري) */
export function referencedProps(expression: string): string[] {
  const names: string[] = [];
  const walk = (node: Node) => {
    if (node.kind === "call") {
      const fn = ALIASES[node.name] ?? node.name;
      if (fn === "prop" && node.args[0]?.kind === "literal" && typeof node.args[0].value === "string") names.push(node.args[0].value);
      node.args.forEach(walk);
    } else if (node.kind === "binary") {
      walk(node.left);
      walk(node.right);
    } else if (node.kind === "unary") walk(node.arg);
    else if (node.kind === "ternary") {
      walk(node.cond);
      walk(node.then);
      walk(node.else);
    }
  };
  try {
    walk(parseFormula(expression));
  } catch {
    return [];
  }
  return names;
}
