import type { ReactNode } from "react";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-7 shadow-[var(--shadow-card)]">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="grid size-12 place-items-center rounded-[12px] bg-navy-700 text-white shadow-[inset_0_-2px_0_rgba(0,0,0,.15)] dark:text-[#0f172a]">
          <svg viewBox="0 0 64 64" className="size-7" aria-hidden>
            <path d="M18 44V22l14 12 14-12v22" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h1 className="mt-4 text-[22px] font-bold leading-tight text-fg">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-[14px] leading-6 text-fg-3">{subtitle}</p> : null}
      </div>
      {children}
      {footer ? <div className="mt-6 border-t border-line pt-4 text-center text-[13px] text-fg-3">{footer}</div> : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 rounded-md bg-danger-50 px-3 py-2 text-[13px] leading-6 text-danger-700">
      {message}
    </div>
  );
}
