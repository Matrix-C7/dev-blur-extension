// Content script — runs in every frame (incl. the Shopify theme editor preview iframe).
// Only <img>, <video> and elements with a raster CSS background-image are blurred.
// SVGs, icon-sized images, iframes and the page itself are never touched.
(() => {
  // A copy left over from before an extension reload has a dead runtime — replace it.
  const previous = window.__imageBlur;
  if (previous?.isAlive()) return;
  previous?.dispose();
  const runtime = chrome.runtime;
  window.__imageBlur = { isAlive: () => !!runtime?.id, dispose };

  const ATTR_MEDIA = 'data-ib-blur';   // <img> / <video>
  const ATTR_BG = 'data-ib-bg';        // element with background-image
  const ATTR_POS = 'data-ib-pos';      // bg host that needed position: relative
  const ATTR_REVEAL = 'data-ib-reveal';
  const HTML_NS = 'http://www.w3.org/1999/xhtml';
  const SKIP_TAGS = new Set([
    'html', 'body', 'head', 'script', 'style', 'link', 'meta', 'noscript', 'template',
    'iframe', 'frame', 'object', 'embed', 'canvas', 'svg', 'br', 'source', 'track'
  ]);
  const WATCHED_ATTRS = ['src', 'srcset', 'poster', 'style', 'class'];

  let settings = { ...IB.DEFAULTS };
  let active = false;
  const roots = new Set();             // document + discovered shadow roots
  const styleNodes = new Map();        // root -> <style>
  const pending = new Set();
  let flushTimer = null;
  let revealed = new Set();

  const mutationObserver = new MutationObserver(onMutations);
  const sizeObserver = new ResizeObserver((entries) => entries.forEach((e) => queue(e.target)));

  // ---------- styles ----------

  function cssText() {
    const blur = `blur(${settings.blurAmount}px)`;
    return `
      [${ATTR_MEDIA}] { filter: ${blur} !important; transition: filter .15s ease !important; }
      [${ATTR_BG}] { isolation: isolate !important; }
      [${ATTR_POS}] { position: relative !important; }
      [${ATTR_BG}]::after {
        content: "" !important; position: absolute !important; inset: 0 !important;
        z-index: -1 !important; pointer-events: none !important; border-radius: inherit !important;
        -webkit-backdrop-filter: ${blur} !important; backdrop-filter: ${blur} !important;
        transition: backdrop-filter .15s ease !important;
      }
      [${ATTR_MEDIA}][${ATTR_REVEAL}] { filter: none !important; }
      [${ATTR_BG}][${ATTR_REVEAL}]::after { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
    `;
  }

  function injectStyle(root) {
    let node = styleNodes.get(root);
    if (!node) {
      node = document.createElement('style');
      node.id = 'ib-blur-style';
      styleNodes.set(root, node);
    }
    node.textContent = cssText();
    const parent = root === document ? document.documentElement : root;
    if (parent && node.parentNode !== parent) parent.appendChild(node);
  }

  function refreshStyles() {
    styleNodes.forEach((node) => { node.textContent = cssText(); });
  }

  // ---------- roots / observing ----------

  const OBSERVE_OPTS = { childList: true, subtree: true, attributes: true, attributeFilter: WATCHED_ATTRS };

  function addRoot(root) {
    if (roots.has(root)) return;
    roots.add(root);
    injectStyle(root);
    mutationObserver.observe(root, OBSERVE_OPTS);
    queueRoot(root);
  }

  function queueRoot(root) {
    queue(root === document ? document.documentElement : root);
  }

  function rescanAll() {
    roots.forEach(queueRoot);
  }

  // The Shopify theme editor re-renders the preview document in place
  // (document.open/write, or swapping <html>). That throws away our <style>
  // and erases event listeners, so check and repair regularly.
  function heal() {
    if (!active) return;
    bindListeners();
    const node = styleNodes.get(document);
    if (document.documentElement && node?.parentNode !== document.documentElement) {
      injectStyle(document);
      mutationObserver.observe(document, OBSERVE_OPTS);
      rescanAll();
    }
    styleNodes.forEach((n, root) => { if (root !== document && n.parentNode !== root) injectStyle(root); });
  }

  function shadowRootOf(el) {
    if (el.shadowRoot) return el.shadowRoot;
    try { return chrome.dom?.openOrClosedShadowRoot?.(el) || null; } catch { return null; }
  }

  function queue(node) {
    if (!active || !node) return;
    pending.add(node);
    if (!flushTimer) flushTimer = setTimeout(flush, 50);
  }

  function onMutations(records) {
    for (const r of records) {
      if (r.type === 'childList') {
        r.addedNodes.forEach((n) => { if (n.nodeType === 1) queue(n); });
      } else {
        queue(r.target);
      }
    }
  }

  function flush() {
    flushTimer = null;
    heal();
    const nodes = [...pending];
    pending.clear();
    for (const node of nodes) {
      if (!node.isConnected) continue;
      if (node.nodeType === 1) evaluate(node);
      node.querySelectorAll?.('*').forEach(evaluate);
    }
  }

  // ---------- detection ----------

  function isSvgUrl(url) {
    return /^data:image\/svg/i.test(url) || /\.svg(\?|#|$)/i.test(url);
  }

  function tooSmall(el) {
    const r = el.getBoundingClientRect();
    return r.width < settings.minSize || r.height < settings.minSize;
  }

  function evaluate(el) {
    const shadow = shadowRootOf(el);
    if (shadow) addRoot(shadow);

    if (el.namespaceURI !== HTML_NS) return;   // skips <svg> and everything inside it
    const tag = el.localName;
    if (tag === 'img' || tag === 'video') return evaluateMedia(el, tag);
    if (SKIP_TAGS.has(tag)) return;
    evaluateBackground(el);
  }

  function evaluateMedia(el, tag) {
    if (tag === 'img' && isSvgUrl(el.currentSrc || el.src || '')) return unmarkMedia(el);
    if (tooSmall(el)) {
      unmarkMedia(el);
      sizeObserver.observe(el);   // re-check when it grows (lazy load, carousel, tab switch)
      return;
    }
    sizeObserver.unobserve(el);
    if (!el.hasAttribute(ATTR_MEDIA)) el.setAttribute(ATTR_MEDIA, '');
  }

  function evaluateBackground(el) {
    const cs = getComputedStyle(el);
    const bg = cs.backgroundImage;
    if (!bg || bg === 'none') return unmarkBg(el);

    const urls = [...bg.matchAll(/url\((['"]?)(.*?)\1\)/g)].map((m) => m[2]);
    if (!urls.some((u) => !isSvgUrl(u)) || tooSmall(el)) return unmarkBg(el);

    if (!el.hasAttribute(ATTR_BG)) {
      if (cs.position === 'static') el.setAttribute(ATTR_POS, '');
      el.setAttribute(ATTR_BG, '');
    }
  }

  function unmarkMedia(el) {
    el.removeAttribute(ATTR_MEDIA);
    el.removeAttribute(ATTR_REVEAL);
  }

  function unmarkBg(el) {
    if (!el.hasAttribute(ATTR_BG)) return;
    el.removeAttribute(ATTR_BG);
    el.removeAttribute(ATTR_POS);
    el.removeAttribute(ATTR_REVEAL);
  }

  function unmarkAll() {
    const selector = `[${ATTR_MEDIA}],[${ATTR_BG}],[${ATTR_POS}],[${ATTR_REVEAL}]`;
    roots.forEach((root) => {
      root.querySelectorAll(selector).forEach((el) => {
        [ATTR_MEDIA, ATTR_BG, ATTR_POS, ATTR_REVEAL].forEach((a) => el.removeAttribute(a));
      });
    });
    revealed.clear();
  }

  // ---------- events ----------

  // Lazy-loaded images and videos often have no size until they load;
  // a late stylesheet can add background images anywhere.
  function onLoad(e) {
    const tag = e.target?.localName;
    if (tag === 'link' || tag === 'style') rescanAll(); else queue(e.target);
  }

  function onPointerMove(e) {
    lastPoint = { x: e.clientX, y: e.clientY };
    if (!moveFrame) moveFrame = requestAnimationFrame(updateReveal);
  }

  function clearReveal() {
    lastPoint = null;
    updateReveal();
  }

  // Safe to call repeatedly: addEventListener ignores duplicate (type, fn, capture).
  function bindListeners() {
    document.addEventListener('load', onLoad, true);
    document.addEventListener('loadedmetadata', onLoad, true);
    document.addEventListener('DOMContentLoaded', rescanAll);
    window.addEventListener('load', rescanAll);
    document.addEventListener('pointermove', onPointerMove, { passive: true, capture: true });
    document.addEventListener('pointerleave', clearReveal, true);
    document.documentElement?.addEventListener('pointerleave', clearReveal);
    window.addEventListener('blur', clearReveal);
  }

  // ---------- hover reveal ----------
  // Uses hit-testing instead of :hover so images under overlay links
  // (common on Shopify product cards) still reveal.

  let moveFrame = null;
  let lastPoint = null;

  function collectAtPoint(root, x, y, out, depth = 0) {
    for (const el of root.elementsFromPoint(x, y)) {
      if (el.hasAttribute(ATTR_MEDIA) || el.hasAttribute(ATTR_BG)) out.add(el);
      const shadow = depth < 3 && shadowRootOf(el);
      if (shadow && shadow !== root) collectAtPoint(shadow, x, y, out, depth + 1);
    }
  }

  function updateReveal() {
    moveFrame = null;
    const next = new Set();
    if (active && settings.revealOnHover && lastPoint) {
      collectAtPoint(document, lastPoint.x, lastPoint.y, next);
    }
    revealed.forEach((el) => { if (!next.has(el)) el.removeAttribute(ATTR_REVEAL); });
    next.forEach((el) => { if (!revealed.has(el)) el.setAttribute(ATTR_REVEAL, ''); });
    revealed = next;
  }

  // ---------- enable / disable ----------

  function topHostname() {
    try { if (window.top === window) return location.hostname; } catch { /* cross-origin */ }
    const ao = location.ancestorOrigins;
    if (ao && ao.length) {
      try { return new URL(ao[ao.length - 1]).hostname; } catch { /* ignore */ }
    }
    return location.hostname;
  }

  function shouldBeActive() {
    if (!settings.enabled) return false;
    const sites = settings.disabledSites || [];
    return !sites.includes(topHostname()) && !sites.includes(location.hostname);
  }

  function start() {
    active = true;
    console.info('[Image Blur] active in', location.href);
    bindListeners();
    if (document.documentElement) {
      addRoot(document);
    } else {
      document.addEventListener('readystatechange', () => addRoot(document), { once: true });
    }
    roots.forEach((root) => {
      injectStyle(root);
      queueRoot(root);
    });
  }

  function stop() {
    active = false;
    pending.clear();
    unmarkAll();
  }

  function apply(next) {
    const prev = settings;
    settings = next;
    const shouldRun = shouldBeActive();

    if (!shouldRun) {
      if (active) stop();
      return;
    }
    if (!active) return start();

    refreshStyles();
    if (prev.minSize !== next.minSize) rescanAll();
    if (!next.revealOnHover) updateReveal();
  }

  function dispose() {
    active = false;
    clearInterval(healTimer);
    window.removeEventListener('keydown', onKeyDown, true);
    mutationObserver.disconnect();
    sizeObserver.disconnect();
    styleNodes.forEach((node) => node.remove());
  }

  // ---------- shortcut fallback ----------
  // Bound even while blur is off, so Alt+L can turn it back on.

  const SHORTCUTS = { KeyL: 'toggle-blur', KeyK: 'toggle-site' };

  function onKeyDown(e) {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat) return;
    const command = SHORTCUTS[e.code];
    if (!command || !runtime?.id) return;
    e.preventDefault();
    e.stopPropagation();
    runtime.sendMessage({ type: 'shortcut', command }).catch(() => { /* worker restarting */ });
  }

  function bindKeys() {
    window.addEventListener('keydown', onKeyDown, true);
  }

  bindKeys();

  const healTimer = setInterval(() => {
    if (!runtime?.id) return dispose();
    bindKeys();
    heal();
  }, 1000);

  IB.load().then(apply);
  IB.onChange(apply);
})();
