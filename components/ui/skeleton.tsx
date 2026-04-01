export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-cream-200 rounded-xl ${className || ""}`} />;
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-[var(--shadow-card)]">
      <Skeleton className="h-44 w-full rounded-none" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 py-3 px-4">
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-4 w-16 ml-auto" />
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
      <Skeleton className="h-3 w-1/2 mb-3" />
      <Skeleton className="h-8 w-2/3 mb-2" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  );
}
