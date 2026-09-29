/** أرقام هوية وهمية صالحة للاختبارات فقط */

/** رقم هوية سعودي صالح (خوارزمية لون) يبدأ بـ 1 — للاختبار فقط */
export function fakeNationalId(seed: number): string {
  const body = `1${String(100000000 + (seed % 899999999)).slice(0, 8)}`;
  for (let check = 0; check <= 9; check++) {
    const id = `${body}${check}`;
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      const d = Number(id[i]);
      if (i % 2 === 0) {
        const x = d * 2;
        sum += Math.floor(x / 10) + (x % 10);
      } else sum += d;
    }
    if (sum % 10 === 0) return id;
  }
  throw new Error("unreachable");
}

