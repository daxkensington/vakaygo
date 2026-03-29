export function ListingSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-[var(--shadow-card)] animate-pulse">
      <div className="h-48 bg-cream-200" />
      <div className="p-4 space-y-3">
        <div className="flex justify-between">
          <div className="h-3 w-24 bg-cream-200 rounded" />
          <div className="h-3 w-12 bg-cream-200 rounded" />
        </div>
        <div className="h-4 w-full bg-cream-200 rounded" />
        <div className="h-4 w-2/3 bg-cream-200 rounded" />
        <div className="h-4 w-16 bg-cream-200 rounded" />
      </div>
    </div>
  );
}

export function ListingSkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <ListingSkeleton key={i} />
      ))}
    </div>
  );
}
