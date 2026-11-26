/* Scroll changes only the photo crop. Text and controls remain in the document flow. */
(() => {
  const stories = [...document.querySelectorAll('.highlight-story')];
  if (!stories.length || !('IntersectionObserver' in window)) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Set();
  const clamp = value => Math.max(0, Math.min(1, value));
  let frame = 0;

  function paint() {
    frame = 0;
    if (reducedMotion.matches) return;
    const viewport = innerHeight;
    for (const story of active) {
      const photo = story.querySelector('.highlight-image');
      const bounds = photo.getBoundingClientRect();
      const travel = clamp((viewport - bounds.top) / (viewport + bounds.height));
      const opening = Math.sin(Math.PI * travel);
      photo.style.setProperty('--photo-inset-x', `${(1 - opening) * 14}%`);
      photo.style.setProperty('--photo-inset-y', `${(1 - opening) * 9}%`);
      photo.style.setProperty('--photo-y', `${(travel - .5) * 13}%`);
      photo.style.setProperty('--photo-scale', String(1.14 + (1 - opening) * .13));
    }
  }

  function schedule() {
    if (!reducedMotion.matches && !frame && active.size) frame = requestAnimationFrame(paint);
  }

  const observer = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting) active.add(target);
      else active.delete(target);
    }
    schedule();
  }, { rootMargin: '100px 0px' });

  stories.forEach(story => observer.observe(story));
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  addEventListener('pageshow', schedule);
  reducedMotion.addEventListener('change', schedule);
})();
