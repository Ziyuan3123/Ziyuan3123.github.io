/* 网站动效：GSAP（入场、贴纸拖动）+ Rough Notation（简历手绘标注）
   库文件都放在 assets/js 里，不依赖国外 CDN。系统设置“减少动态效果”时全部跳过。 */
(function () {
  var root = document.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !window.gsap) { root.classList.remove('gs-pre'); return; }

  gsap.registerPlugin(Draggable, InertiaPlugin);
  root.classList.add('gs');

  var stage = document.getElementById('stage');
  var title = document.querySelector('.title');
  var stickers = gsap.utils.toArray('.sticker');
  var ip = document.getElementById('ip');
  var paint = document.querySelector('.paint');

  /* 每张贴纸原本的倾斜角度 */
  stickers.forEach(function (s) {
    s._r = parseFloat(getComputedStyle(s).getPropertyValue('--r')) || 0;
    gsap.set(s, { rotation: s._r });
  });

  /* ---------- 入场动画 ---------- */
  function intro() {
    var waves = paint.querySelectorAll('g[filter] path');
    var sun = paint.querySelector('g[filter] ellipse');
    var dots = paint.querySelectorAll('g[opacity] circle');
    var marks = paint.querySelectorAll('g[stroke] path');

    var tl = gsap.timeline({ defaults: { ease: 'back.out(1.7)' } });
    tl.set([title, stickers, ip, '.sign', '.lang', '.hint'], { autoAlpha: 0 })
      .call(function () { root.classList.remove('gs-pre'); })
      .from(waves, { y: 260, duration: 1, ease: 'power3.out', stagger: .08 }, 0)
      .from(sun, { scale: 0, transformOrigin: '50% 50%', duration: 1.1, ease: 'elastic.out(1,.5)' }, .3)
      .fromTo(title, { autoAlpha: 0, y: -90, rotation: -18 }, { autoAlpha: 1, y: 0, rotation: -6, duration: .9 }, .25)
      .from(title.querySelector('small'), { x: -40, autoAlpha: 0, duration: .6, ease: 'power2.out' }, .75)
      .fromTo(stickers, { autoAlpha: 0, scale: 0, rotation: function (i, s) { return s._r + (i % 2 ? 40 : -40); } },
        { autoAlpha: 1, scale: 1, rotation: function (i, s) { return s._r; }, duration: 1, ease: 'elastic.out(1,.55)', stagger: .12 }, .6)
      .fromTo(ip, { autoAlpha: 0, yPercent: 45 }, { autoAlpha: 1, yPercent: 0, duration: .9, ease: 'back.out(1.3)' }, .8)
      .from(dots, { scale: 0, transformOrigin: '50% 50%', duration: .5, stagger: .05 }, 1)
      .from(marks, { scale: 0, rotation: 90, transformOrigin: '50% 50%', duration: .6, stagger: .06 }, 1.05)
      .to(['.sign', '.lang', '.hint'], { autoAlpha: 1, duration: .4, ease: 'power1.out' }, 1.3);

    /* 背景里的小十字和星星慢慢转，像在闪 */
    gsap.to(marks, { rotation: '+=12', transformOrigin: '50% 50%', duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: { each: .3, from: 'random' }, delay: 2 });
    gsap.to(dots, { scale: 1.6, transformOrigin: '50% 50%', duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: { each: .4, from: 'random' }, delay: 2 });
  }

  /* ---------- 贴纸：悬停摇一摇，可以拖着甩 ---------- */
  stickers.forEach(function (s) {
    var over = function () { gsap.to(s, { scale: 1.12, rotation: -s._r, duration: .4, ease: 'back.out(3)', overwrite: 'auto' }); };
    var out = function () { gsap.to(s, { scale: 1, rotation: s._r, duration: .5, ease: 'elastic.out(1,.4)', overwrite: 'auto' }); };
    s.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') over(); });
    s.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') out(); });
    s.addEventListener('focus', over);
    s.addEventListener('blur', out);

    var dragged = false;
    Draggable.create(s, {
      type: 'x,y', bounds: stage, inertia: true, edgeResistance: .7,
      dragClickables: true, minimumMovement: 6, zIndexBoost: true,
      onPress: function () { dragged = false; },
      onDragStart: function () { dragged = true; gsap.to(s, { scale: 1.15, rotation: s._r + 8, duration: .25, overwrite: 'auto' }); },
      onDrag: function () { gsap.to(s, { rotation: s._r + gsap.utils.clamp(-25, 25, this.deltaX * 2), duration: .3, overwrite: 'auto' }); },
      onRelease: function () { if (dragged) gsap.to(s, { scale: 1, rotation: s._r, duration: .7, ease: 'elastic.out(1,.4)', overwrite: 'auto' }); }
    });
    /* 拖完松手不要当成“点击”去打开页面 */
    s.addEventListener('click', function (e) {
      if (dragged) { e.stopImmediatePropagation(); e.preventDefault(); dragged = false; }
    }, true);
  });

  /* ---------- 弹出页面：弹进来 + 内容依次出现 ---------- */
  var group = null, openId = null;
  var pieces = '.intent>div,.h3,.tl-item,.chips>span,.skill-group,.contact>*,.filters,.deck,.deck-nav,.btn';

  function annotate() {
    if (group) { group.forEach(function (a) { a.remove(); }); group = null; }
    if (openId !== 'resume' || !window.RoughNotation) return;
    var R = RoughNotation, list = [];
    var add = function (sel, opt) {
      document.querySelectorAll('#resume ' + sel).forEach(function (el) {
        list.push(R.annotate(el, Object.assign({ animationDuration: 600, padding: 3 }, opt)));
      });
    };
    add('.intent>div:first-child b', { type: 'underline', color: '#0a9ae6', strokeWidth: 3 });
    add('.award', { type: 'circle', color: '#ff5a5f', strokeWidth: 2.5, padding: 8 });
    add('.tl-item li>b', { type: 'highlight', color: '#ffe680', multiline: true });
    add('.hl', { type: 'box', color: '#ff5a5f', strokeWidth: 2.5, padding: 4 });
    group = list;
    R.annotationGroup(list).show();
  }

  function onSheet(id) {
    openId = id;
    if (group) { group.forEach(function (a) { a.remove(); }); group = null; }
    var sheet = id && document.getElementById(id);
    if (!sheet) return;
    var panel = sheet.querySelector('.panel');
    var items = sheet.querySelectorAll(pieces);
    gsap.killTweensOf([panel, items]);
    gsap.timeline()
      .fromTo(panel, { scale: .86, rotation: -3, y: 50 }, { scale: 1, rotation: 0, y: 0, duration: .55, ease: 'back.out(1.6)' })
      .fromTo(items, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: .35, ease: 'power2.out', stagger: { amount: .6 }, clearProps: 'transform' }, .15)
      .call(annotate);
  }
  document.addEventListener('sheet', function (e) { onSheet(e.detail); });
  document.addEventListener('lang', function () { if (openId === 'resume') setTimeout(annotate, 50); });
  addEventListener('resize', function () { if (openId === 'resume' && group) annotate(); });

  /* 字体加载完再开始，避免动到一半字体突然变样 */
  var started = false;
  function start() {
    if (started) return; started = true;
    if (window.avoidTitle) avoidTitle();
    intro();
    var open = document.querySelector('.sheet.open');
    if (open) onSheet(open.id);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start);
  setTimeout(start, 1500);
})();
