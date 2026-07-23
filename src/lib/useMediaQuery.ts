import { useEffect, useState } from 'react';

/** SSR-safe: returns `false` until mounted client-side (matches server render, no flash from a
 *  wrongly-guessed initial value), then tracks the query live via the native change event. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
