/**
 * A decorative country flag. Rendered as an emoji wherever the platform can
 * draw one and hidden where it cannot (see lib/flag-emoji.ts and the
 * `.flag-emoji` rule in app/globals.css). Never the only carrier of meaning:
 * the destination or currency name always sits next to it.
 *
 * No hooks, so it works in server and client components alike.
 */
export function Flag({ children, className }: { children: string | null | undefined; className?: string }) {
  if (!children) return null;
  return (
    <span aria-hidden="true" className={className ? `flag-emoji ${className}` : "flag-emoji"}>
      {children}
    </span>
  );
}
