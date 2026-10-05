// Shown immediately on navigation while the server renders the next page.
export function PageLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Memuatkan">
      <div className="h-6 w-40 rounded bg-neutral-bg" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-16 rounded-xl bg-neutral-bg" />)}
      </div>
      <div className="h-48 rounded-xl bg-neutral-bg" />
    </div>
  );
}
