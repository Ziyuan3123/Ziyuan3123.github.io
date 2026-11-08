/* 赛车手 IP：头盔随鼠标左右转动（oil-motion 图集方案）
 * 用法：页面里放 <div id="ip"></div>，再引入本脚本。
 * 素材：racer-half.webp，只存正面到最右的 19 帧（5 列），向左转时左右镜像画出来，文件小一半。
 * 页面先显示静态正面图 racer-front.webp，等整页加载完再下载图集，不抢首屏流量。
 */
(function () {
  var FRAMES = 37, COLS = 5, CW = 358, CH = 606, CENTER = 18;
  var src = (document.currentScript && document.currentScript.src.replace(/[^/]*$/, '')) + 'racer-half.webp';

  function mount(host) {
    var cv = document.createElement('canvas');
    cv.width = CW; cv.height = CH;
    cv.className = 'racer-canvas';
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', '戴头盔的赛车手形象，会转头看向鼠标');
    cv.style.cssText = 'height:100%;width:auto;aspect-ratio:' + CW + '/' + CH + ';display:block';
    var ctx = cv.getContext('2d');
    var img = new Image();
    var cur = CENTER, target = CENTER, drawn = -1, raf = 0;
    var still = matchMedia('(prefers-reduced-motion: reduce)').matches;

    function draw(i) {
      if (i === drawn) return;
      drawn = i;
      ctx.clearRect(0, 0, CW, CH);
      var k = Math.abs(i - CENTER), flip = i < CENTER;
      ctx.save();
      if (flip) { ctx.translate(CW, 0); ctx.scale(-1, 1); }
      ctx.drawImage(img, (k % COLS) * CW, Math.floor(k / COLS) * CH, CW, CH, 0, 0, CW, CH);
      ctx.restore();
    }
    function tick() {
      cur += (target - cur) * 0.18;
      if (Math.abs(target - cur) < 0.05) cur = target;
      draw(Math.round(cur));
      raf = cur === target ? 0 : requestAnimationFrame(tick);
    }
    function aim(x) {
      if (still) return;
      var r = cv.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var reach = Math.max(window.innerWidth * 0.38, 240);
      var t = Math.max(-1, Math.min(1, (x - cx) / reach));
      target = CENTER + t * CENTER;
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function home() { target = CENTER; if (!raf) raf = requestAnimationFrame(tick); }

    img.onload = function () {
      host.querySelectorAll('img,.ip-ph').forEach(function (n) { n.remove(); });
      host.appendChild(cv);
      draw(CENTER);
      window.addEventListener('pointermove', function (e) { aim(e.clientX); }, { passive: true });
      document.documentElement.addEventListener('pointerleave', home);
      window.addEventListener('blur', home);
    };
    if (document.readyState === 'complete') img.src = src;
    else window.addEventListener('load', function () { img.src = src; });
  }

  function start() {
    var host = document.getElementById('ip') || document.querySelector('[data-racer-follow]');
    if (host) mount(host);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
