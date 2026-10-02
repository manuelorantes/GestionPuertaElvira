import { Badge } from './Badge';

export function OccupancyBar({ occupied, capacity }: { occupied: number; capacity: number }) {
  const isFull = occupied >= capacity;
  const isOverCapacity = occupied > capacity;
  const percentage = Math.min(100, Math.round((occupied / capacity) * 100));

  return (
    <div className="flex items-center gap-2">
      <div
        role="meter"
        aria-label="Ocupación"
        aria-valuenow={occupied}
        aria-valuemin={0}
        aria-valuemax={capacity}
        className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className={`h-full ${isFull ? 'bg-brand-strong' : 'bg-brand'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="min-w-10 text-right text-sm tabular-nums">
        {occupied}/{capacity}
      </span>
      {isOverCapacity && <Badge tone="warning">Sobre el cupo</Badge>}
    </div>
  );
}
