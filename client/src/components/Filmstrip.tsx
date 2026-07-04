import type { FilmstripFrame } from '../types';

interface FilmstripProps {
  frames: FilmstripFrame[];
}

export function Filmstrip({ frames }: FilmstripProps) {
  if (frames.length === 0) return null;
  return (
    <section>
      <div className="mb-4 mt-10 flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Loading filmstrip</h2>
        <span className="font-mono text-xs text-text-faint">what users see while the page loads</span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border-card bg-white p-4 shadow-card">
        <div className="flex gap-3">
          {frames.map((frame, i) => (
            <figure key={i} className="flex-none">
              <img
                src={frame.dataUri}
                alt={`Page at ${(frame.timingMs / 1000).toFixed(1)}s`}
                className="h-[120px] w-auto rounded-lg border border-border-inner"
              />
              <figcaption className="mt-1.5 text-center font-mono text-[11px] text-text-muted">
                {(frame.timingMs / 1000).toFixed(1)}s
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
