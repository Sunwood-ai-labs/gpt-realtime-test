const ensurePassiveTouchListeners = (target) => {
  if (!target || target.__passivePatched) return;
  const originalAdd = target.addEventListener.bind(target);
  target.addEventListener = (type, listener, options) => {
    if (type === 'touchstart' || type === 'touchmove') {
      if (typeof options === 'boolean') {
        return originalAdd(type, listener, { capture: options, passive: true });
      }
      const normalized = { passive: true, ...(options || {}) };
      return originalAdd(type, listener, normalized);
    }
    return originalAdd(type, listener, options);
  };
  target.__passivePatched = true;
};
const importFromUrl = async (u) => new Function('u', 'return import(u)')(u);
const CDN_PRIMARY = 'https://cdn.skypack.dev/' + 'webgl-fluid';
const CDN_FALLBACK = 'https://esm.sh/webgl-fluid';

let WebglFluid = null;
try {
  WebglFluid = (await importFromUrl(CDN_PRIMARY)).default;
} catch {
  WebglFluid = (await importFromUrl(CDN_FALLBACK)).default;
}

const canvas = document.getElementById('fluid-canvas');
ensurePassiveTouchListeners(canvas);
canvas.style.touchAction = 'none';
Object.assign(canvas.style, {
  position: 'fixed',
  inset: '0px',
  width: '100%',
  height: '100%',
  zIndex: '-20'
});

const mq = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = mq.matches;
let fluidInstance = null;

const initFluid = () => {
  if (reduced || fluidInstance) return;
  fluidInstance = WebglFluid(canvas, {
    IMMEDIATE: true,
    TRANSPARENT: true,
    TRIGGER: 'hover',
    DYE_RESOLUTION: 1024,
    SIM_RESOLUTION: 128,
    PRESSURE_ITERATIONS: 20,
    VELOCITY_DISSIPATION: 0.2,
    DENSITY_DISSIPATION: 1.0,
    CURL: 35,
    SPLAT_RADIUS: 0.24,
    SPLAT_FORCE: 6200,
    BLOOM: true,
    BLOOM_INTENSITY: 0.8,
    BLOOM_THRESHOLD: 0.62,
    SUNRAYS: true,
    PAUSED: false
  });
};
initFluid();

let timer = null;
const startLoop = () => {
  if (reduced) return;
  stopLoop();
  timer = setInterval(() => {
    const r = canvas.getBoundingClientRect();
    const x = r.left + Math.random() * r.width;
    const y = r.top + Math.random() * r.height;
    canvas.dispatchEvent(
      new MouseEvent('mousemove', {
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true
      })
    );
  }, 1200);
};
const stopLoop = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};
startLoop();

const toggleBtn = document.getElementById('motionToggle');
const renderMotionLabel = () => {
  if (reduced) {
    return '<i class="fa-solid fa-play-circle text-sm" aria-hidden="true"></i><span class="whitespace-nowrap">背景アニメーションを有効化</span>';
  }
  return '<i class="fa-solid fa-minus-circle text-sm" aria-hidden="true"></i><span class="whitespace-nowrap">動きを少なくする</span>';
};
const apply = () => {
  canvas.style.display = reduced ? 'none' : 'block';
  if (toggleBtn) {
    toggleBtn.innerHTML = renderMotionLabel();
    toggleBtn.setAttribute('aria-pressed', String(!reduced));
  }
  if (!reduced && !fluidInstance) {
    initFluid();
    startLoop();
  }
};
apply();

toggleBtn?.addEventListener('click', () => {
  reduced = !reduced;
  if (reduced) {
    stopLoop();
  }
  apply();
});

mq.addEventListener?.('change', (event) => {
  reduced = event.matches;
  if (reduced) {
    stopLoop();
  } else {
    initFluid();
    startLoop();
  }
  apply();
});

const tests = [];
const add = (n, p, m) => {
  tests.push({ n, p, m });
  if (!p) console.error('[TEST FAIL]', n, m || '');
};
add('import default export is function', typeof WebglFluid === 'function');
add('canvas exists', !!canvas);
add('loop timer started', typeof timer === 'number');
setTimeout(() => {
  if (!reduced) add('canvas visible', canvas.style.display !== 'none');
  window.__fluid_tests__ = tests;
}, 3000);

