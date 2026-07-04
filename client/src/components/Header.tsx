interface HeaderProps {
  view: 'dashboard' | 'history';
  onGoDashboard: () => void;
  onGoHistory: () => void;
}

export function Header({ view, onGoDashboard, onGoHistory }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border-card bg-[rgba(250,250,250,0.82)] backdrop-blur-md backdrop-saturate-[1.8]">
      <div className="mx-auto flex h-[60px] max-w-content items-center justify-between gap-5 px-6">
        <div onClick={onGoDashboard} className="flex cursor-pointer items-center gap-[11px]">
          <div className="flex h-[30px] w-[30px] items-end justify-center gap-[2.5px] rounded-[9px] bg-brand px-1.5 py-[7px] shadow-[0_1px_2px_rgba(227,90,42,0.4)]">
            <span className="h-[7px] w-[3px] rounded-sm bg-white opacity-70" />
            <span className="h-[12px] w-[3px] rounded-sm bg-white" />
            <span className="h-[9px] w-[3px] rounded-sm bg-white opacity-85" />
          </div>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Core Web Vitals Tester</span>
          <span className="rounded-pill border border-border-control px-[7px] py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-text-faint">
            Beta
          </span>
        </div>
        <div>
          <button
            onClick={onGoHistory}
            className={
              view === 'history'
                ? 'rounded-lg bg-brand-tint px-3 py-2 text-[13px] font-semibold text-brand-tintText'
                : 'rounded-lg px-3 py-2 text-[13px] font-medium text-text-muted hover:bg-surface-muted3 hover:text-text-primary'
            }
          >
            History
          </button>
        </div>
      </div>
    </header>
  );
}
