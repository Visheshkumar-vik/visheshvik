// Shared motion: sticky-nav hairline, scroll reveals, section rules drawing in.
document.documentElement.classList.add('js');

(function () {
  const nav = document.querySelector('.nav');
  const onScroll = () => nav && nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const targets = document.querySelectorAll('.reveal, .hero-name, .section');
  if (!('IntersectionObserver' in window)) {
    targets.forEach(el => el.classList.add('visible'));
    return;
  }
  const io = new IntersectionObserver((entries) => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
  }), { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  targets.forEach(el => io.observe(el));
})();
