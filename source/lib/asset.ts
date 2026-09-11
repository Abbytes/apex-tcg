/** Prefix public files with Vite's base (Grok `/`, GitHub Pages `/apex/`). */
export function asset(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const trimmed = path.replace(/^\//, "");
  return `${base.endsWith("/") ? base : `${base}/`}${trimmed}`;
}
