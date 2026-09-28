"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 16, fontWeight: 500 }}>حدث خطأ غير متوقع</p>
          <p style={{ color: "#6b7280", fontSize: 14 }}>نعتذر عن ذلك. يمكنك المحاولة مجدداً.</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "6px 14px", borderRadius: 6, border: "1px solid #e5e5e2", background: "white", cursor: "pointer" }}>
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
