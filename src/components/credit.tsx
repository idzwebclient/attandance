// Small, quiet credit line at the bottom of every screen.
export function Credit({ className = "" }: { className?: string }) {
  return <p className={`no-print py-4 text-center text-[11px] text-muted/70 ${className}`}>By Trulab Studio</p>;
}
