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

// Project figures: click to enlarge, then left and right through that project's figures.
(function () {
  const groups = new Map();
  document.querySelectorAll('.proj-figs img').forEach(img => {
    const key = img.closest('.proj') || img.closest('.proj-figs');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(img);
  });
  if (!groups.size) return;

  const lb = document.createElement('div');
  lb.className = 'lb';
  lb.hidden = true;
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', 'Figure viewer');
  lb.innerHTML =
    '<button class="lb-close" type="button" aria-label="Close">&times;</button>' +
    '<button class="lb-prev" type="button" aria-label="Previous figure">&lsaquo;</button>' +
    '<figure class="lb-fig"><img class="lb-img" alt="" /><figcaption class="lb-cap"><span class="lb-count"></span><span class="lb-text"></span></figcaption></figure>' +
    '<button class="lb-next" type="button" aria-label="Next figure">&rsaquo;</button>';
  document.body.appendChild(lb);
  const big = lb.querySelector('.lb-img');
  const count = lb.querySelector('.lb-count');
  const text = lb.querySelector('.lb-text');
  let list = [], idx = 0, lastFocus = null;

  function fit() {
    if (!big.naturalWidth) return;
    const fig = lb.querySelector('.lb-fig');
    const capH = lb.querySelector('.lb-cap').offsetHeight;
    const cs = getComputedStyle(fig);
    const availW = fig.clientWidth;
    const availH = fig.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - capH;
    const scale = Math.min(2, availW / big.naturalWidth, availH / big.naturalHeight);
    big.style.width = Math.round(big.naturalWidth * scale) + 'px';
  }
  function show(i) {
    idx = (i + list.length) % list.length;
    const src = list[idx];
    const fig = src.closest('figure');
    const cap = fig && fig.querySelector('figcaption');
    big.style.width = '';
    big.src = src.currentSrc || src.src;
    big.alt = src.alt || '';
    text.textContent = cap ? cap.textContent : (src.alt || '');
    count.textContent = list.length > 1 ? (idx + 1) + ' / ' + list.length : '';
    if (big.complete) fit();
    [list[(idx + 1) % list.length], list[(idx - 1 + list.length) % list.length]].forEach(n => { const p = new Image(); p.src = n.currentSrc || n.src; });
  }
  big.addEventListener('load', fit);
  window.addEventListener('resize', () => { if (!lb.hidden) fit(); });

  function open(group, i) {
    list = group;
    lastFocus = document.activeElement;
    lb.classList.toggle('single', group.length < 2);
    lb.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    show(i);
    lb.querySelector('.lb-close').focus();
  }
  function close() {
    lb.hidden = true;
    document.documentElement.style.overflow = '';
    big.removeAttribute('src');
    if (lastFocus) lastFocus.focus();
  }

  groups.forEach(group => group.forEach((img, i) => {
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', 'Enlarge figure: ' + (img.alt || ''));
    img.addEventListener('click', () => open(group, i));
    img.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(group, i); }
    });
  }));

  lb.querySelector('.lb-close').addEventListener('click', close);
  lb.querySelector('.lb-prev').addEventListener('click', e => { e.stopPropagation(); show(idx - 1); });
  lb.querySelector('.lb-next').addEventListener('click', e => { e.stopPropagation(); show(idx + 1); });
  lb.addEventListener('click', e => {
    if (e.target === lb || e.target.classList.contains('lb-fig')) close();
  });
  document.addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(idx - 1);
    else if (e.key === 'ArrowRight') show(idx + 1);
    else if (e.key === 'Tab') {
      const f = [...lb.querySelectorAll('button')].filter(b => getComputedStyle(b).visibility !== 'hidden');
      const k = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
  let x0 = null, y0 = null;
  lb.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) show(idx + (dx < 0 ? 1 : -1));
    x0 = y0 = null;
  });
})();

// Demo videos: play muted while on screen, pause when scrolled away. A viewer's own pause sticks.
(function () {
  const vids = document.querySelectorAll('video[data-autoplay]');
  if (!vids.length || !('IntersectionObserver' in window)) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  if (reduce || saveData) return;
  vids.forEach(v => {
    let auto = false, userPaused = false;
    v.addEventListener('pause', () => { if (!auto && !v.ended) userPaused = true; auto = false; });
    v.addEventListener('play', () => { if (!auto) userPaused = false; auto = false; });
    new IntersectionObserver(entries => entries.forEach(en => {
      if (en.isIntersecting && en.intersectionRatio >= 0.5) {
        if (v.paused && !userPaused) { auto = true; v.muted = true; v.play().catch(() => { auto = false; }); }
      } else if (!v.paused) { auto = true; v.pause(); }
    }), { threshold: [0, 0.5] }).observe(v);
  });
})();

