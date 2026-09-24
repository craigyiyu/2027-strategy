/**
 * Scroll-reveal hook: adds the `is-revealed` class to the element when it
 * enters the viewport, once. Cheap IntersectionObserver with a 12% margin and
 * automatic cleanup. Respects prefers-reduced-motion by no-op'ing the observer
 * and adding the class immediately.
 */
import { useEffect, useRef, type RefObject } from 'react';

export function useReveal<T extends HTMLElement>(
  options: { delay?: number; threshold?: number; once?: boolean } = {},
): RefObject<T> {
  const ref = useRef<T>(null);
  const { delay = 0, threshold = 0.12, once = true } = options;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduced = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      node.classList.add('is-revealed');
      return;
    }
    node.style.transitionDelay = `${delay}ms`;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            node.classList.add('is-revealed');
            if (once) io.unobserve(node);
          } else if (!once) {
            node.classList.remove('is-revealed');
          }
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [delay, threshold, once]);

  return ref;
}
