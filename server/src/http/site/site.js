(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;

  const ICON = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="#1F1513" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    limit: '<svg viewBox="0 0 24 24" fill="none" stroke="#1F1513" stroke-width="3.5" stroke-linecap="round"><path d="M12 6v8M12 18.5v.01"/></svg>',
    avoid: '<svg viewBox="0 0 24 24" fill="none" stroke="#1F1513" stroke-width="3.5" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>',
    none: '<svg viewBox="0 0 24 24" fill="none" stroke="#1F1513" stroke-width="3" stroke-linecap="round"><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.5v.01"/></svg>',
  };
  const CHECK_W = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  /* ------------------------------------------------------------------ data */
  const RESTRICTIONS = [
    { id: 'gluten', name: 'Gluten free', tags: ['gluten'], level: 'avoid' },
    { id: 'milk', name: 'Milk', kind: 'Allergy', tags: ['dairy'], level: 'avoid', strict: true },
    { id: 'peanut', name: 'Peanut', kind: 'Allergy', tags: ['peanut'], level: 'avoid', strict: true },
    { id: 'treenut', name: 'Tree nuts', kind: 'Allergy', tags: ['treenut'], level: 'avoid', strict: true },
    { id: 'soy', name: 'Soy free', tags: ['soy'], level: 'avoid' },
    { id: 'vegan', name: 'Vegan', tags: ['dairy', 'animal', 'honey', 'egg'], level: 'avoid' },
    { id: 'dyes', name: 'No artificial dyes', tags: ['dye'], level: 'limit' },
    { id: 'seed', name: 'Seed oil free', tags: ['seedoil'], level: 'limit' },
  ];
  const BY_ID = Object.fromEntries(RESTRICTIONS.map((r) => [r.id, r]));

  const PRODUCTS = [
    { id: 'crackers', name: 'Cheddar Cheese Crackers', brand: 'Crunch Co. · 198g', pc: 'linear-gradient(160deg,#F7A531,#E0691C)', pc2: 'rgba(255,230,120,.55)', code: '0 41234 56789 3',
      ingr: [['Enriched wheat flour', ['gluten']], ['Cheddar cheese (milk)', ['dairy']], ['Soybean oil', ['seedoil', 'soy']], ['Salt'], ['Paprika'], ['Yeast'], ['Annatto extract (color)']],
      contains: 'wheat, milk, soy' },
    { id: 'gummies', name: 'Sour Rainbow Gummies', brand: 'Sweet Lab · 142g', pc: 'linear-gradient(160deg,#FF5FA2,#8B3CF0)', pc2: 'rgba(120,230,255,.55)', code: '0 70221 33018 6',
      ingr: [['Corn syrup'], ['Sugar'], ['Gelatin', ['animal']], ['Citric acid'], ['Natural flavors'], ['Red 40', ['dye']], ['Yellow 5', ['dye']], ['Blue 1', ['dye']], ['Carnauba wax']] },
    { id: 'granola', name: 'Honey Oat Granola Bar', brand: 'Trailhead · 6 bars', pc: 'linear-gradient(160deg,#D9A15A,#9C5A23)', pc2: 'rgba(255,240,200,.45)', code: '0 85012 77421 9',
      ingr: [['Whole grain oats'], ['Honey', ['honey']], ['Brown rice syrup'], ['Almonds', ['treenut']], ['Canola oil', ['seedoil']], ['Soy lecithin', ['soy']], ['Sea salt']],
      contains: 'almonds, soy', may: ['peanut', 'gluten'], mayText: 'peanuts, wheat' },
    { id: 'chips', name: 'Sea Salt Veggie Chips', brand: 'Rootsy · 141g', pc: 'linear-gradient(160deg,#3A2A2A,#1C1414)', pc2: 'rgba(230,90,50,.75)', code: '0 28400 31122 4',
      ingr: [['Potatoes'], ['Sweet potatoes'], ['Beets'], ['Sunflower oil', ['seedoil']], ['Sea salt']] },
    { id: 'cups', name: 'Peanut Butter Cups', brand: 'Cocoa & Co. · 4 cups', pc: 'linear-gradient(160deg,#F2772E,#B8431A)', pc2: 'rgba(90,45,20,.6)', code: '0 34000 00241 7',
      ingr: [['Sugar'], ['Cocoa butter'], ['Milk', ['dairy']], ['Chocolate'], ['Peanuts', ['peanut']], ['Soy lecithin', ['soy']], ['Dextrose'], ['Salt']],
      contains: 'milk, peanuts, soy' },
    { id: 'yogurt', name: 'Vanilla Coconut Yogurt', brand: 'Palm Grove · 150g', pc: 'linear-gradient(160deg,#9ADBC0,#3FA27C)', pc2: 'rgba(255,255,255,.6)', code: '0 81730 20015 2',
      ingr: [['Coconut cream'], ['Water'], ['Cane sugar'], ['Tapioca starch'], ['Vanilla extract'], ['Pectin'], ['Live cultures']] },
  ];
  const PROD = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
  const RANK = { ok: 0, limit: 1, avoid: 2 };

  /** Mirrors the app's rules: worst flag wins, "may contain" is avoid for strict allergies and limit otherwise, never "safe". */
  function evaluate(p, ids) {
    const rows = [];
    const marks = {};
    let state = ids.length ? 'ok' : 'none';
    for (const id of ids) {
      const r = BY_ID[id];
      const hits = p.ingr.filter((i) => (i[1] || []).some((t) => r.tags.includes(t)));
      let s = 'ok';
      let note = 'Clear';
      if (hits.length) {
        s = r.level;
        note = hits.map((h) => h[0].replace(/ \(.*\)/, '')).join(', ');
        for (const h of hits) if (!marks[h[0]] || RANK[s] > RANK[marks[h[0]]]) marks[h[0]] = s;
      } else if ((p.may || []).some((t) => r.tags.includes(t))) {
        s = r.strict ? 'avoid' : 'limit';
        note = 'May contain';
      }
      rows.push({ name: r.name + (r.kind ? ' allergy' : ''), s, note });
      if (state !== 'none' && RANK[s] > RANK[state]) state = s;
    }
    rows.sort((a, b) => RANK[b.s] - RANK[a.s]);
    return { state, rows, marks };
  }

  const TITLES = {
    ok: ['No conflicts found', 'Fits your profile. Still check the package yourself.'],
    limit: ['Limit', 'Has ingredients you prefer to limit.'],
    avoid: ['Avoid', 'Conflicts with your profile.'],
    none: ['Nothing to check', 'Add something to your profile first.'],
  };

  /* --------------------------------------------------------------- scanner */
  function makeScanner(scr) {
    scr.innerHTML =
      '<div class="cam"></div>' +
      '<div class="scan-title">Scan a barcode</div>' +
      '<div class="pack"><div class="pblob"></div><div class="pname"></div><div class="bc"><span></span><em></em></div></div>' +
      '<div class="frame"><b></b><b></b><b></b><b></b><div class="laser"></div></div>' +
      '<div class="beep">' + ICON.ok + '</div>' +
      '<div class="flash"></div><div class="shutter"></div>' +
      (scr.dataset.scanner === 'demo' ? '<div class="idle-msg">Tap a product to scan it</div>' : '') +
      '<div class="sheet"><div class="grab"></div><div class="v-top"><div class="v-ico"></div><div class="v-state"></div></div><div class="v-name"></div><div class="v-sub"></div><div class="v-rows"></div><div class="v-ingr"></div><div class="v-note">Tappy is a guide, not medical advice. Always check the package.</div></div>';
    const pack = $('.pack', scr);
    let token = 0;
    const api = {
      product: null,
      setProduct(p) {
        api.product = p;
        pack.style.setProperty('--pc', p.pc);
        pack.style.setProperty('--pc2', p.pc2);
        $('.pname', scr).textContent = p.name;
        $('.bc em', scr).textContent = p.code;
      },
      render(ids) {
        const p = api.product;
        if (!p) return null;
        const v = evaluate(p, ids);
        const ico = $('.v-ico', scr);
        ico.className = 'v-ico ' + v.state;
        if (v.state === 'none') ico.style.background = '#E9E1DE'; else ico.style.background = '';
        ico.innerHTML = ICON[v.state];
        const st = $('.v-state', scr);
        st.className = 'v-state ' + v.state;
        st.textContent = TITLES[v.state][0];
        $('.v-name', scr).textContent = p.name;
        $('.v-sub', scr).textContent = p.brand.split(' · ')[0] + ' · ' + TITLES[v.state][1];
        $('.v-rows', scr).innerHTML = v.rows.slice(0, 4).map((r, i) =>
          '<div class="v-row ' + r.s + '" style="transition-delay:' + (0.45 + i * 0.08) + 's"><span class="m">' + ICON[r.s] + '</span>' + '<span class="rn">' + r.name + '</span><small>' + r.note + '</small></div>').join('');
        const ingr = p.ingr.map((i) => v.marks[i[0]] ? '<mark class="' + v.marks[i[0]] + '">' + i[0] + '</mark>' : i[0]).join(', ');
        $('.v-ingr', scr).innerHTML = '<b>Ingredients:</b> ' + ingr + '.' +
          (p.contains ? ' <b>Contains:</b> ' + p.contains + '.' : '') +
          (p.mayText ? ' <b>May contain:</b> ' + p.mayText + '.' : '');
        return v;
      },
      async scan(p, ids) {
        const my = ++token;
        if (scr.classList.contains('aim') || scr.classList.contains('result')) {
          scr.className = 'scr';
          await wait(reduced ? 0 : 550);
          if (my !== token) return;
        }
        api.setProduct(p);
        api.render(ids);
        scr.className = 'scr';
        void scr.offsetWidth;
        scr.classList.add('aim');
        await wait(reduced ? 0 : 1250);
        if (my !== token) return;
        scr.classList.add('lock');
        if (navigator.vibrate && scr.dataset.scanner === 'demo') { try { navigator.vibrate(18); } catch (e) { /* ignore */ } }
        await wait(reduced ? 0 : 750);
        if (my !== token) return;
        scr.classList.remove('lock');
        scr.classList.add('result');
      },
      reset() { token++; scr.className = 'scr'; },
    };
    return api;
  }

  /** Phone screens are laid out at 268px wide (the hero phone) and scaled to fit smaller phones. */
  function fitScreens() {
    $$('.screen').forEach((scn) => {
      const k = scn.clientWidth / 268;
      if (!k) return;
      scn.querySelectorAll(':scope > .scr, :scope > .sc, :scope > .status').forEach((el) => {
        el.style.inset = '0 auto auto 0';
        el.style.width = '268px';
        if (!el.classList.contains('status')) el.style.height = scn.clientHeight / k + 'px';
        el.style.transformOrigin = '0 0';
        el.style.scale = String(k);
      });
    });
  }
  fitScreens();
  addEventListener('resize', fitScreens);

  const scanners = {};
  $$('[data-scanner]').forEach((el) => { scanners[el.dataset.scanner] = makeScanner(el); });

  /* ------------------------------------------------------------------ hero */
  const heroProfile = ['gluten', 'milk', 'peanut', 'dyes'];
  const heroOrder = ['crackers', 'yogurt', 'gummies', 'granola'];
  let heroI = 0;
  let heroVisible = true;
  async function heroLoop() {
    for (;;) {
      if (heroVisible && !document.hidden) {
        await scanners.hero.scan(PROD[heroOrder[heroI++ % heroOrder.length]], heroProfile);
        await wait(3400);
      } else {
        await wait(600);
      }
    }
  }

  /* ----------------------------------------------------------- intro + nav */
  requestAnimationFrame(() => setTimeout(() => {
    document.documentElement.classList.add('loaded');
    document.body.classList.add('loaded');
    setTimeout(heroLoop, reduced ? 0 : 900);
  }, 60));
  $$('.hero h1 .w > span').forEach((s, i) => { s.style.transitionDelay = (0.08 + i * 0.08) + 's'; });

  const nav = $('#nav');
  const progress = $('#progress');
  let lastY = scrollY;

  /* -------------------------------------------------------------- marquee */
  const DIETS = ['Gluten free', 'Low FODMAP', 'Vegan', 'Low histamine', 'Seed oil free', 'Pregnancy', 'Peanut', 'GERD', 'Paleo', 'Lactose free', 'Mediterranean', 'Sesame', 'PCOS', 'Eggs', 'Caffeine free', 'Autoimmune protocol', 'Tree nuts', 'Pescatarian', 'Alpha gal', 'Soy'];
  const INGR = ['Red 40', 'Carrageenan', 'Whey', 'Soy lecithin', 'Maltodextrin', 'High fructose corn syrup', 'Titanium dioxide', 'Casein', 'Canola oil', 'BHT', 'Sucralose', 'Yellow 5', 'Gelatin', 'Malt extract', 'Potassium bromate', 'Natural flavors', 'Annatto', 'Xanthan gum'];
  const COLORS = ['#22C55E', '#FFB800', '#E04D2A', '#B4274F', '#7C9CFF', '#38BDF8'];
  function fill(el, list, offset) {
    const html = list.map((t, i) => '<span class="tag" style="--c:' + COLORS[(i + offset) % COLORS.length] + '">' + t + '</span>').join('');
    el.innerHTML = html + html;
    el.setAttribute('aria-hidden', 'true');
  }
  fill($('#trackA'), DIETS, 0);
  fill($('#trackB'), INGR, 3);

  /* ------------------------------------------------------- scrub headline */
  const scrub = $('#scrubHead');
  const words = scrub.textContent.trim().split(/\s+/);
  scrub.setAttribute('aria-label', scrub.textContent.trim());
  scrub.innerHTML = words.map((w) => '<span class="sw" aria-hidden="true">' + w + '</span>').join(' ');
  const sws = $$('.sw', scrub);

  /* ----------------------------------------------------------------- story */
  const story = $('#story');
  const steps = $$('.step', story);
  const dots = $$('#dots i');
  const scs = $$('.sc', story);
  const picks = $$('[data-pick]', story);
  const storyPhone = $('#storyPhone');
  let storyIdx = -1;
  scanners.storyResult.setProduct(PROD.granola);
  scanners.storyResult.render(['gluten', 'peanut', 'seed']);
  let storyTimer = 0;
  async function storyScanLoop(gen) {
    while (gen === storyTimer) {
      await scanners.story.scan(PROD.granola, ['gluten', 'peanut', 'seed']);
      await wait(400);
      if (gen !== storyTimer) return;
      scanners.story.reset();
      await wait(900);
    }
  }
  function setStory(i) {
    if (i === storyIdx) return;
    storyIdx = i;
    steps.forEach((s, k) => { s.classList.toggle('on', k === i); s.classList.toggle('past', k < i); });
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
    scs.forEach((s, k) => s.classList.toggle('on', k === i));
    const rot = [[-14, 6], [12, 4], [-10, -2], [14, 6]][i];
    storyPhone.style.transform = 'rotateY(' + rot[0] + 'deg) rotateX(' + rot[1] + 'deg)';
    storyTimer++;
    if (i === 1) storyScanLoop(storyTimer);
    else scanners.story.reset();
  }
  setStory(0);

  /* ------------------------------------------------------------------ demo */
  const selected = new Set(['gluten', 'peanut', 'dyes']);
  const toggles = $('#toggles');
  toggles.innerHTML = RESTRICTIONS.map((r) =>
    '<button class="tg" type="button" data-id="' + r.id + '" aria-pressed="' + selected.has(r.id) + '"><span class="cb">' + CHECK_W + '</span>' + r.name + (r.kind ? ' <small>' + r.kind + '</small>' : '') + '</button>').join('');
  const shelf = $('#shelf');
  shelf.innerHTML = PRODUCTS.map((p) =>
    '<button class="prod" type="button" data-id="' + p.id + '" aria-pressed="false"><span class="badge"></span><div class="mini"><i style="--pc:' + p.pc + ';--pc2:' + p.pc2 + '"></i></div><b>' + p.name + '</b><span>' + p.brand.split(' · ')[0] + '</span></button>').join('');
  const scanned = new Set();
  const demo = scanners.demo;
  function updateBadges() {
    $$('.prod', shelf).forEach((b) => {
      const badge = $('.badge', b);
      if (!scanned.has(b.dataset.id)) return;
      const v = evaluate(PROD[b.dataset.id], [...selected]);
      badge.className = 'badge show ' + v.state;
      badge.innerHTML = ICON[v.state];
      b.setAttribute('aria-label', PROD[b.dataset.id].name + ': ' + TITLES[v.state][0]);
    });
  }
  toggles.addEventListener('click', (e) => {
    const b = e.target.closest('.tg');
    if (!b) return;
    const id = b.dataset.id;
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    b.setAttribute('aria-pressed', String(selected.has(id)));
    if (demo.product) demo.render([...selected]);
    updateBadges();
  });
  const demoPhone = $('#demoPhone');
  function fly(fromEl) {
    if (reduced) return Promise.resolve();
    const a = fromEl.getBoundingClientRect();
    const t = demoPhone.getBoundingClientRect();
    if (t.bottom < 0 || t.top > innerHeight) return Promise.resolve();
    const f = document.createElement('div');
    f.className = 'flyer';
    f.style.background = fromEl.style.getPropertyValue('--pc');
    f.style.left = a.left + 'px';
    f.style.top = a.top + 'px';
    document.body.appendChild(f);
    const dx = t.left + t.width / 2 - (a.left + a.width / 2);
    const dy = t.top + t.height / 2 - (a.top + a.height / 2);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      f.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.6) rotate(-12deg)';
      f.style.opacity = '0';
    }));
    return wait(520).then(() => setTimeout(() => f.remove(), 400));
  }
  async function scanDemo(id, btn) {
    $$('.prod', shelf).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    if (btn) {
      const t = demoPhone.getBoundingClientRect();
      if (t.top < 0 || t.bottom > innerHeight) { demoPhone.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); await wait(reduced ? 0 : 450); }
      else await fly($('.mini i', btn));
    }
    await demo.scan(PROD[id], [...selected]);
    scanned.add(id);
    updateBadges();
  }
  shelf.addEventListener('click', (e) => {
    const b = e.target.closest('.prod');
    if (b) scanDemo(b.dataset.id, b);
  });
  if (fine) {
    demoPhone.parentElement.addEventListener('mousemove', (e) => {
      const r = demoPhone.parentElement.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      demoPhone.style.transform = 'rotateY(' + (x * 22) + 'deg) rotateX(' + (-y * 14) + 'deg)';
    });
    demoPhone.parentElement.addEventListener('mouseleave', () => { demoPhone.style.transform = ''; });
  }

  /* -------------------------------------------------------------- reveals */
  function countUp(el) {
    const end = Number(el.dataset.count);
    if (reduced) { el.textContent = String(end); return; }
    const t0 = performance.now();
    const dur = 1600;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = String(Math.round(end * (1 - Math.pow(1 - k, 4))));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  let demoStarted = false;
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const el = en.target;
      if (el.dataset.count) countUp(el);
      else if (el.id === 'demo') {
        if (!demoStarted) { demoStarted = true; setTimeout(() => scanDemo('granola', null), 500); }
      } else el.classList.add('in');
      io.unobserve(el);
    }
  }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal').forEach((el, i) => { el.style.transitionDelay = ((i % 4) * 0.08) + 's'; io.observe(el); });
  $$('[data-count]').forEach((el) => io.observe(el));
  io.observe($('#demo'));

  const heroIO = new IntersectionObserver((e) => { heroVisible = e[0].isIntersecting; });
  heroIO.observe($('#stage'));

  /* ---------------------------------------------------------- card tilt */
  if (fine && !reduced) {
    $$('[data-tilt]').forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', x * 100 + '%');
        card.style.setProperty('--my', y * 100 + '%');
        card.style.transform = 'perspective(900px) rotateX(' + ((0.5 - y) * 7) + 'deg) rotateY(' + ((x - 0.5) * 7) + 'deg) translateY(-4px)';
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
  }

  /* ---------------------------------------------------- hero mouse tilt */
  const stageInner = $('#stageInner');
  const floats = $$('[data-depth]', stageInner);
  let mx = 0, my = 0, cx = 0, cy = 0;
  if (fine && !reduced) {
    addEventListener('mousemove', (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
  }

  /* ------------------------------------------------------------ frame loop */
  const wordmark = $('#wordmark');
  const final = $('.final');
  function frame() {
    const y = scrollY;
    const docH = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = 'scaleX(' + (docH > 0 ? y / docH : 0) + ')';
    if (Math.abs(y - lastY) > 6) { nav.classList.toggle('hide', y > lastY && y > 400); lastY = y; }

    // hero: ease towards mouse, sink a little on scroll
    cx += (mx - cx) * 0.08; cy += (my - cy) * 0.08;
    if (heroVisible && !reduced) {
      const s = Math.min(y, 900);
      stageInner.style.transform = 'translateY(' + (s * 0.12) + 'px) rotateY(' + (cx * 16) + 'deg) rotateX(' + (-cy * 12 + s * 0.01) + 'deg)';
      floats.forEach((f) => { f.style.translate = (cx * 30 * f.dataset.depth) + 'px ' + (cy * 24 * f.dataset.depth - s * 0.05 * f.dataset.depth) + 'px'; });
    }

    // scrubbed headline
    const r = scrub.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (innerHeight * 0.9 - r.top) / (innerHeight * 0.55)));
    const on = Math.round(k * sws.length);
    sws.forEach((w, i) => w.classList.toggle('on', i < on));

    // pinned story
    const sr = story.getBoundingClientRect();
    const p = Math.min(0.9999, Math.max(0, -sr.top / (sr.height - innerHeight)));
    setStory(Math.floor(p * 4));
    const sub = p * 4;
    picks.forEach((o) => o.classList.toggle('sel', sub > 0.12 + Number(o.dataset.pick) * 0.22));

    // wordmark rise
    const fr = final.getBoundingClientRect();
    const wk = Math.min(1, Math.max(0, (innerHeight - fr.top) / fr.height));
    wordmark.style.setProperty('--wy', (40 - wk * 40) + '%');

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
