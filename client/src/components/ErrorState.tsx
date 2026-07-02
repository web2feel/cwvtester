interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="mt-16 flex flex-col items-center gap-4 text-center">
      <div className="max-w-md rounded-2xl border border-bad-border bg-bad-bg p-5 text-[13.5px] text-bad-text">
        {message}
      </div>
      <button
        onClick={onRetry}
        className="rounded-lg border border-border-control bg-white px-4 py-2 text-[13px] font-semibold text-text-primary hover:bg-surface-muted"
      >
        Try again
      </button>
    </div>
  );
}
