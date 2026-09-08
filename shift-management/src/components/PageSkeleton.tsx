export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-64 animate-pulse rounded-md bg-slate-200" />
      <div className="space-y-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-10 animate-pulse rounded-md bg-slate-100"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
