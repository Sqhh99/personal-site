import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

function release(targets: gsap.TweenTarget) {
  const els = gsap.utils.toArray<HTMLElement>(targets);
  for (const el of els) el.setAttribute('data-in', '');
  gsap.set(els, { clearProps: 'transform' });
}

/**
 * Homepage motion. Scoped to #home-page, sequenced on a timeline, then
 * ScrollTrigger-batched for the cards. Transform only — copy stays visible
 * if the module loads late. gsap.matchMedia() reverts when the query drops.
 */
export function initHomeMotion(root: HTMLElement | null): () => void {
  if (!root) return () => undefined;

  const mm = gsap.matchMedia();

  mm.add(
    {
      reduceMotion: '(prefers-reduced-motion: reduce)',
      allowMotion: '(prefers-reduced-motion: no-preference)',
    },
    (context) => {
      const reduceMotion = Boolean(context.conditions?.reduceMotion);
      const hero = gsap.utils.toArray<HTMLElement>('[data-enter="hero"]', root);
      const heading = gsap.utils.toArray<HTMLElement>('[data-enter="heading"]', root);
      const cards = gsap.utils.toArray<HTMLElement>('[data-enter="card"]', root);
      const rule = root.querySelector<HTMLElement>('[data-enter="rule"]');

      if (reduceMotion) {
        gsap.set([rule, ...hero, ...heading, ...cards].filter(Boolean), { autoAlpha: 1, y: 0, scaleX: 1 });
        release([rule, ...hero, ...heading, ...cards].filter(Boolean));
        return;
      }

      const tl = gsap.timeline({
        defaults: { ease: 'power3.out', duration: 0.8 },
      });

      if (rule) {
        tl.fromTo(
          rule,
          { scaleX: 0 },
          {
            scaleX: 1,
            duration: 0.7,
            ease: 'power2.out',
            transformOrigin: 'left center',
            onComplete: () => rule.setAttribute('data-in', ''),
          },
          0.08,
        );
      }

      tl.fromTo(
        hero,
        { y: 14 },
        { y: 0, stagger: 0.09, onComplete: () => release(hero) },
        rule ? '-=0.45' : 0,
      ).fromTo(
        heading,
        { y: 10 },
        { y: 0, stagger: 0.06, onComplete: () => release(heading) },
        '-=0.5',
      );

      if (cards.length > 0) {
        ScrollTrigger.batch(cards, {
          start: 'top 90%',
          once: true,
          interval: 0.12,
          onEnter: (batch) => {
            gsap.fromTo(
              batch,
              { y: 18 },
              {
                y: 0,
                duration: 0.75,
                ease: 'power3.out',
                stagger: 0.08,
                overwrite: true,
                onComplete: () => release(batch),
              },
            );
          },
        });
      }
    },
    root,
  );

  const onPageHide = () => mm.revert();
  window.addEventListener('pagehide', onPageHide, { once: true });

  return () => {
    window.removeEventListener('pagehide', onPageHide);
    mm.revert();
  };
}
