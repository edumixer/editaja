import { cn } from "@/lib/utils";
export function LogoMark({ className }: { className?: string }) {
  return (
    <div className={cn("brand-gradient grid size-9 place-items-center rounded-xl shadow-lg shadow-primary/30", className)}>
      <svg viewBox="0 0 24 24" className="size-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none" />
        <path d="M3 7v10" opacity=".55" />
      </svg>
    </div>
  );
}
export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-lg font-bold tracking-tight">Edita<span className="brand-text">Já</span></span>
    </div>
  );
}
