interface LoadingStateProps {
  stage: string;
}

export function LoadingState({ stage }: LoadingStateProps) {
  return (
    <div className="mt-16 flex flex-col items-center gap-4 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-control border-t-brand" />
      <p key={stage} className="animate-fadeIn font-mono text-sm text-text-muted">
        {stage}
      </p>
    </div>
  );
}
