import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Upload, Shirt, Download, RefreshCw, X, Check,
  Sliders, ChevronDown, Sparkles, Sun, Moon,
  Zap, Crown, Lock, ZoomIn, ZoomOut, RotateCcw,
  Layers, Move, Maximize2, SplitSquareHorizontal,
  HelpCircle
} from 'lucide-react';
// ===================== HELPERS =====================
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function useObjectUrlCleanup() {
  const lastUrlRef = useRef(null);
  const setUrl = useCallback((next) => {
    if (lastUrlRef.current && lastUrlRef.current !== next) {
      try { URL.revokeObjectURL(lastUrlRef.current); } catch { }
    }
    lastUrlRef.current = next;
  }, []);
  useEffect(() => () => {
    if (lastUrlRef.current) {
      try { URL.revokeObjectURL(lastUrlRef.current); } catch { }
    }
  }, []);
  return setUrl;
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    try { URL.revokeObjectURL(url); } catch { }
  }, 1500);
}
function isTypingTarget(el) {
  const tag = el?.tagName?.toLowerCase();
  if (!tag) return false;
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  return false;
}
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !!window.matchMedia?.(query)?.matches;
  });
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);
  return matches;
}
// ===================== FAST “GIGAPIXEL-ISH” PROCESSOR (UNCHANGED) =====================
const FastImageProcessor = {
  clamp(n, a, b) { return Math.max(a, Math.min(b, n)); },
  detectBackground(imageData) {
    const { data, width, height } = imageData;
    let dark = 0, light = 0;
    const samples = Math.min(64, width);
    for (let i = 0; i < samples; i++) {
      const x = Math.floor((i / samples) * width);
      const top = (x * 4);
      const bot = (((height - 1) * width + x) * 4);
      if (top < data.length && bot < data.length) {
        const tb = (data[top] + data[top + 1] + data[top + 2]) / 3;
        const bb = (data[bot] + data[bot + 1] + data[bot + 2]) / 3;
        tb < 128 ? dark++ : light++;
        bb < 128 ? dark++ : light++;
      }
    }
    return dark > light ? 'black' : 'white';
  },
  hasColors(data) {
    let colorful = 0;
    let checked = 0;
    const step = 64;
    const len = data.length;
    for (let i = 0; i < len; i += 4 * step) {
      if (data[i + 3] < 20) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 235 && g > 235 && b > 235) continue;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max > 0 && ((max - min) / max) > 0.12) colorful++;
      checked++;
    }
    return checked > 0 && (colorful / checked) > 0.05;
  },
  processBlackBg(data) {
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      const luma = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (luma < 40) {
        data[i + 3] = (luma < 20) ? 0 : Math.round((luma - 20) * 12);
      }
    }
  },
  processWhiteBg(data) {
    const hasColor = this.hasColors(data);
    const len = data.length;
    if (hasColor) {
      for (let i = 0; i < len; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max - min;
        const luma = r * 0.299 + g * 0.587 + b * 0.114;
        if (luma > 245 && sat < 15) { data[i + 3] = 0; continue; }
        if (sat > 16) {
          if (luma > 230) data[i + 3] = Math.max(0, 255 - (luma - 230) * 10);
          else data[i + 3] = 255;
        } else {
          let alpha = 255 - luma;
          if (luma > 215) alpha = 0;
          else alpha = Math.min(255, alpha * 1.4);
          data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
          data[i + 3] = alpha;
        }
      }
    } else {
      for (let i = 0; i < len; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        if (gray > 225) { data[i + 3] = 0; }
        else {
          data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
          data[i + 3] = Math.min(255, (255 - gray) * 1.3);
        }
      }
    }
    return hasColor;
  },
  async classify(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const w = canvas.width, h = canvas.height;
    const chunkW = Math.min(100, w), chunkH = Math.min(100, h);
    const img = ctx.getImageData((w - chunkW) / 2, (h - chunkH) / 2, chunkW, chunkH);
    const d = img.data;
    let satSum = 0, satCount = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 50) {
        const max = Math.max(d[i], d[i + 1], d[i + 2]);
        const min = Math.min(d[i], d[i + 1], d[i + 2]);
        satSum += (max - min);
        satCount++;
      }
    }
    const avgSat = satCount ? satSum / satCount : 0;
    return { isLineArt: avgSat < 15 };
  },
  addFilmGrain(canvas, strength = 3) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 30) continue;
      const noise = (Math.random() - 0.5) * strength;
      data[i] = this.clamp(data[i] + noise, 0, 255);
      data[i + 1] = this.clamp(data[i + 1] + noise, 0, 255);
      data[i + 2] = this.clamp(data[i + 2] + noise, 0, 255);
    }
    ctx.putImageData(imgData, 0, 0);
  },
  fastBlur(data, width, height, radius) {
    const len = width * height * 4;
    const rad = Math.floor(radius);
    const out = new Uint8ClampedArray(len);
    for (let y = 0; y < height; y++) {
      const rowStart = y * width * 4;
      for (let x = 0; x < width; x++) {
        if (data[rowStart + x * 4 + 3] === 0) continue;
        let r = 0, g = 0, b = 0, c = 0;
        const start = Math.max(0, x - rad);
        const end = Math.min(width - 1, x + rad);
        for (let k = start; k <= end; k++) {
          const idx = rowStart + k * 4;
          r += data[idx]; g += data[idx + 1]; b += data[idx + 2]; c++;
        }
        const i = rowStart + x * 4;
        out[i] = r / c; out[i + 1] = g / c; out[i + 2] = b / c; out[i + 3] = data[i + 3];
      }
    }
    const final = new Uint8ClampedArray(len);
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        if (out[idx + 3] === 0) continue;
        let r = 0, g = 0, b = 0, c = 0;
        const start = Math.max(0, y - rad);
        const end = Math.min(height - 1, y + rad);
        for (let k = start; k <= end; k++) {
          const kidx = (k * width + x) * 4;
          r += out[kidx]; g += out[kidx + 1]; b += out[kidx + 2]; c++;
        }
        final[idx] = r / c; final[idx + 1] = g / c; final[idx + 2] = b / c; final[idx + 3] = out[idx + 3];
      }
    }
    return final;
  },
  deblockLite(canvas, strength = 0.38, flatThreshold = 18) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const w = canvas.width, h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const s = this.clamp(strength, 0, 1);
    const idx = (x, y) => ((y * w + x) << 2);
    const lumaAt = (j) => d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = idx(x, y);
        if (d[i + 3] < 20) continue;
        const iL = idx(x - 1, y), iR = idx(x + 1, y), iU = idx(x, y - 1), iD = idx(x, y + 1);
        const c = lumaAt(i), aL = lumaAt(iL), aR = lumaAt(iR), aU = lumaAt(iU), aD = lumaAt(iD);
        const range = Math.max(c, aL, aR, aU, aD) - Math.min(c, aL, aR, aU, aD);
        if (range < flatThreshold) {
          for (let ch = 0; ch < 3; ch++) {
            const avg = (d[iL + ch] + d[iR + ch] + d[iU + ch] + d[iD + ch]) * 0.25;
            d[i + ch] = this.clamp(d[i + ch] * (1 - s) + avg * s, 0, 255);
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  },
  cheapDenoise(canvas, strength = 0.42) {
    const s = this.clamp(strength, 0, 0.85);
    if (s <= 0.001) return;
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const ds = this.clamp(1 - s, 0.35, 0.85);
    const dw = Math.max(1, Math.round(w * ds));
    const dh = Math.max(1, Math.round(h * ds));
    const tmp = document.createElement('canvas');
    tmp.width = dw; tmp.height = dh;
    const tctx = tmp.getContext('2d');
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(canvas, 0, 0, dw, dh);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tmp, 0, 0, w, h);
    tmp.width = 0;
  },
  smartSharpen(canvas, amount, radius) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imgData = ctx.getImageData(0, 0, w, h);
    const blurred = this.fastBlur(imgData.data, w, h, radius);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 20) continue;
      for (let c = 0; c < 3; c++) {
        const val = d[i + c];
        d[i + c] = this.clamp(val + (val - blurred[i + c]) * amount, 0, 255);
      }
    }
    ctx.putImageData(imgData, 0, 0);
  },
  casSharpen(canvas, strength = 0.7) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const w = canvas.width, h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const out = new Uint8ClampedArray(d.length);
    const s = this.clamp(strength, 0, 1);
    const idx = (x, y) => ((y * w + x) << 2);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = idx(x, y);
        const a = d[i + 3];
        if (a < 20) { out[i + 3] = a; continue; }
        const xm = x > 0 ? x - 1 : x, xp = x < w - 1 ? x + 1 : x;
        const ym = y > 0 ? y - 1 : y, yp = y < h - 1 ? y + 1 : y;
        const iL = idx(xm, y), iR = idx(xp, y), iU = idx(x, ym), iD = idx(x, yp);
        for (let c = 0; c < 3; c++) {
          const center = d[i + c];
          const mn = Math.min(d[iL + c], d[iR + c], d[iU + c], d[iD + c], center);
          const mx = Math.max(d[iL + c], d[iR + c], d[iU + c], d[iD + c], center);
          const range = mx - mn;
          const k = range > 0 ? (s * (range / 255)) : 0;
          const avg = (d[iL + c] + d[iR + c] + d[iU + c] + d[iD + c]) * 0.25;
          const v = center + (center - avg) * (0.75 + k);
          out[i + c] = this.clamp(v, 0, 255);
        }
        out[i + 3] = a;
      }
    }
    img.data.set(out);
    ctx.putImageData(img, 0, 0);
  },
  upscale(sourceCanvas, targetW, targetH, mode = 'auto') {
    if (targetW <= sourceCanvas.width) {
      const copy = document.createElement('canvas');
      copy.width = targetW; copy.height = targetH;
      const ctx = copy.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sourceCanvas, 0, 0, targetW, targetH);
      return copy;
    }
    const srcW = sourceCanvas.width;
    const scale = targetW / srcW;
    const stepMul = scale > 4 ? 1.6 : 2.0;
    const isSmall = Math.max(sourceCanvas.width, sourceCanvas.height) <= 900;
    const preferNearest = (mode === 'nearest') || (mode === 'auto' && isSmall);
    let current = sourceCanvas;
    let curW = current.width;
    while (curW * stepMul <= targetW) {
      const nextW = Math.round(curW * stepMul);
      const nextH = Math.round(current.height * stepMul);
      const step = document.createElement('canvas');
      step.width = nextW; step.height = nextH;
      const ctx = step.getContext('2d');
      ctx.imageSmoothingEnabled = !preferNearest;
      ctx.drawImage(current, 0, 0, nextW, nextH);
      if (current !== sourceCanvas) { current.width = 0; }
      current = step;
      curW = nextW;
    }
    const final = document.createElement('canvas');
    final.width = targetW; final.height = targetH;
    const fctx = final.getContext('2d');
    fctx.imageSmoothingEnabled = true;
    fctx.imageSmoothingQuality = 'high';
    fctx.drawImage(current, 0, 0, targetW, targetH);
    return final;
  },
  cleanupAlpha(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < 8) d[i + 3] = 0;
      else if (a > 247) d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  },
  quantizeBitDepth(canvas, mode = '555') {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    const is565 = mode === '565';
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 10) continue;
      if (is565) {
        d[i] = (d[i] & 0xF8);
        d[i + 1] = (d[i + 1] & 0xFC);
        d[i + 2] = (d[i + 2] & 0xF8);
      } else {
        d[i] = (d[i] & 0xF8);
        d[i + 1] = (d[i + 1] & 0xF8);
        d[i + 2] = (d[i + 2] & 0xF8);
      }
    }
    ctx.putImageData(img, 0, 0);
  },
  applyPodSimulation(pixels, podSettings) {
    const sat = clamp(podSettings?.saturationReduction ?? 1, 0.2, 1);
    const bright = clamp(podSettings?.darknessIncrease ?? 1, 0.2, 2);
    const contrast = clamp(podSettings?.contrastReduction ?? 1, 0.2, 2);
    for (let i = 0; i < pixels.length; i += 4) {
      const a = pixels[i + 3];
      if (a < 5) continue;
      let r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const gray = r * 0.299 + g * 0.587 + b * 0.114;
      r = gray + (r - gray) * sat;
      g = gray + (g - gray) * sat;
      b = gray + (b - gray) * sat;
      r *= bright; g *= bright; b *= bright;
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;
      pixels[i] = clamp(r, 0, 255);
      pixels[i + 1] = clamp(g, 0, 255);
      pixels[i + 2] = clamp(b, 0, 255);
    }
  },
  async createCutoutBlobUrl(file) {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await new Promise(r => (img.onload = r));
    const start = performance.now();
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const bgType = this.detectBackground(imgData);
    let hasColors = false;
    if (bgType === 'black') this.processBlackBg(imgData.data);
    else hasColors = this.processWhiteBg(imgData.data);
    ctx.putImageData(imgData, 0, 0);
    const cls = await this.classify(canvas);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    try { URL.revokeObjectURL(img.src); } catch { }
    return {
      cutoutUrl: URL.createObjectURL(blob),
      width: canvas.width, height: canvas.height,
      detectedBackground: bgType, hasColors, classification: cls,
      ms: performance.now() - start
    };
  },
  async exportFinal({ cutoutUrl, cutoutW, cutoutH, targetW, targetH, podSettings, classification }) {
    const start = performance.now();
    const img = new Image();
    img.src = cutoutUrl;
    await new Promise(r => (img.onload = r));
    const tW = targetW > 0 ? targetW : cutoutW;
    const tH = targetH > 0 ? targetH : cutoutH;
    const scale = Math.min(tW / cutoutW, tH / cutoutH);
    const finalW = Math.max(1, Math.round(cutoutW * scale));
    const finalH = Math.max(1, Math.round(cutoutH * scale));
    const tempC = document.createElement('canvas');
    tempC.width = cutoutW; tempC.height = cutoutH;
    tempC.getContext('2d').drawImage(img, 0, 0);
    const isLineArt = !!classification?.isLineArt;
    const upscaleMode = isLineArt ? 'nearest' : 'auto';
    const upscaledCanvas = this.upscale(tempC, finalW, finalH, upscaleMode);
    tempC.width = 0;
    const isUpscale = scale > 1.15;
    const s = scale;
    const denoiseStrength = s >= 8 ? 0.58 : s >= 6 ? 0.52 : s >= 4 ? 0.42 : 0.28;
    const casStrength = s >= 8 ? 0.82 : s >= 6 ? 0.78 : s >= 4 ? 0.70 : 0.60;
    const deblockStrength = s >= 8 ? 0.50 : s >= 6 ? 0.45 : s >= 4 ? 0.38 : 0.32;
    const flatThr = s >= 8 ? 22 : s >= 6 ? 20 : 18;
    if (isUpscale) {
      this.deblockLite(upscaledCanvas, deblockStrength, flatThr);
      this.cheapDenoise(upscaledCanvas, denoiseStrength);
      this.casSharpen(upscaledCanvas, casStrength);
      if (!isLineArt && s < 6) this.smartSharpen(upscaledCanvas, 0.22, 1.05);
      if (s < 6) this.addFilmGrain(upscaledCanvas, isLineArt ? 2 : 3);
    } else if (isLineArt) {
      this.casSharpen(upscaledCanvas, 0.55);
    }
    const out = document.createElement('canvas');
    out.width = tW; out.height = tH;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    const dx = Math.round((tW - finalW) / 2);
    const dy = Math.round((tH - finalH) / 2);
    ctx.drawImage(upscaledCanvas, dx, dy);
    if (upscaledCanvas) upscaledCanvas.width = 0;
    if (
      podSettings?.saturationReduction < 1 ||
      podSettings?.darknessIncrease < 1 ||
      podSettings?.contrastReduction < 1
    ) {
      const data = ctx.getImageData(0, 0, tW, tH);
      this.applyPodSimulation(data.data, podSettings);
      ctx.putImageData(data, 0, 0);
    }
    this.cleanupAlpha(out);
    if (scale >= 3) this.quantizeBitDepth(out, isLineArt ? '555' : '565');
    const blob = await new Promise((resolve, reject) => {
      out.toBlob((b) => (b ? resolve(b) : reject('Canvas blob failed')), 'image/png');
    });
    return { blob, width: tW, height: tH, ms: performance.now() - start };
  }
};
// ===================== CSS FILTERS (instant preview) =====================
const getCssFilters = (settings) => ({
  filter: `saturate(${settings.saturationReduction}) brightness(${settings.darknessIncrease}) contrast(${settings.contrastReduction})`,
  willChange: 'filter',
});
// ===================== TOAST =====================
function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, toast.ms ?? 2600);
    return () => clearTimeout(t);
  }, [toast, onClose]);
  if (!toast) return null;
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[80] px-3">
      <div className="bg-black/80 border border-white/10 backdrop-blur-xl rounded-2xl px-4 py-3 shadow-2xl flex items-start gap-3 max-w-[92vw]">
        <div className={`mt-0.5 w-2.5 h-2.5 rounded-full ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-400'}`} />
        <div className="text-sm text-slate-200 leading-snug">{toast.msg}</div>
        <button onClick={onClose} className="ml-2 text-slate-400 hover:text-white">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
// ===================== PINCH + PAN + ZOOM HOOK =====================
function usePinchPanZoom({ minZoom = 0.6, maxZoom = 6, defaultZoom = 1.1 } = {}) {
  const [zoom, setZoom] = useState(defaultZoom);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map());
  const gesture = useRef({
    mode: 'none', // 'pinch' | 'pan'
    startZoom: defaultZoom,
    startPan: { x: 0, y: 0 },
    startDist: 0,
    startMid: { x: 0, y: 0 },
    panStart: { x: 0, y: 0 },
  });
  const reset = useCallback(() => {
    setZoom(defaultZoom);
    setPan({ x: 0, y: 0 });
  }, [defaultZoom]);
  const onPointerDown = useCallback((e) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      gesture.current.mode = 'pinch';
      gesture.current.startZoom = zoom;
      gesture.current.startPan = pan;
      gesture.current.startDist = dist || 1;
      gesture.current.startMid = mid;
      return;
    }
    if (pts.length === 1 && zoom > 1) {
      gesture.current.mode = 'pan';
      gesture.current.panStart = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }, [pan, zoom]);
  const onPointerMove = useCallback((e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy) || 1;
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const factor = dist / gesture.current.startDist;
      const nextZoom = clamp(gesture.current.startZoom * factor, minZoom, maxZoom);
      // gentle pan toward pinch midpoint (keeps subject stable-ish)
      const mx = mid.x - gesture.current.startMid.x;
      const my = mid.y - gesture.current.startMid.y;
      setZoom(nextZoom);
      setPan({
        x: gesture.current.startPan.x + mx,
        y: gesture.current.startPan.y + my
      });
      return;
    }
    if (pts.length === 1 && gesture.current.mode === 'pan' && zoom > 1) {
      setPan({ x: e.clientX - gesture.current.panStart.x, y: e.clientY - gesture.current.panStart.y });
    }
  }, [maxZoom, minZoom, zoom]);
  const onPointerUp = useCallback((e) => {
    pointers.current.delete(e.pointerId);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { }
    const pts = pointers.current.size;
    if (pts < 2 && gesture.current.mode === 'pinch') {
      gesture.current.mode = 'none';
    }
    if (pts === 0) {
      gesture.current.mode = 'none';
    }
  }, []);
  const onWheel = useCallback((e) => {
    e.preventDefault();
    const step = (e.ctrlKey || e.metaKey) ? 0.22 : 0.12;
    const dir = e.deltaY > 0 ? -step : step;
    setZoom(z => clamp(z + dir, minZoom, maxZoom));
  }, [minZoom, maxZoom]);
  const zoomIn = useCallback(() => setZoom(z => clamp(z + 0.25, minZoom, maxZoom)), [minZoom, maxZoom]);
  const zoomOut = useCallback(() => setZoom(z => clamp(z - 0.25, minZoom, maxZoom)), [minZoom, maxZoom]);
  const toggleQuickZoom = useCallback(() => {
    setZoom(z => (z < 1.5 ? 2 : defaultZoom));
    setPan({ x: 0, y: 0 });
  }, [defaultZoom]);
  return {
    zoom, pan, setZoom, setPan,
    onPointerDown, onPointerMove, onPointerUp,
    onWheel,
    zoomIn, zoomOut,
    reset,
    toggleQuickZoom
  };
}
// ===================== ZOOMABLE IMAGE =====================
function ZoomableImage({
  src,
  alt,
  className,
  containerClassName,
  style = {},
  defaultZoom = 1.1,
  hint = true
}) {
  const {
    zoom, pan,
    onPointerDown, onPointerMove, onPointerUp,
    onWheel,
    zoomIn, zoomOut,
    reset,
    toggleQuickZoom
  } = usePinchPanZoom({ defaultZoom, minZoom: 0.6, maxZoom: 6 });
  const containerRef = useRef(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);
  const showHint = hint && zoom > 1.01;
  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${containerClassName}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
      onDoubleClick={toggleQuickZoom}
      style={{
        touchAction: 'none',
        cursor: zoom > 1 ? 'grab' : 'default',
      }}
    >
      <img
        src={src}
        alt={alt}
        className={className}
        draggable={false}
        style={{
          ...style,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: 'transform 0.08s ease-out',
          willChange: 'transform'
        }}
      />
      {/* Controls */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/70 backdrop-blur-md rounded-full px-2 py-1.5 shadow-xl border border-white/10">
        <button onClick={zoomOut} className="p-2 hover:bg-white/10 rounded-full text-white/80 hover:text-white" aria-label="Zoom out">
          <ZoomOut size={16} />
        </button>
        <span className="px-3 min-w-[62px] text-center text-xs font-mono text-white/90">{Math.round(zoom * 100)}%</span>
        <button onClick={zoomIn} className="p-2 hover:bg-white/10 rounded-full text-white/80 hover:text-white" aria-label="Zoom in">
          <ZoomIn size={16} />
        </button>
        <div className="w-px h-5 bg-white/20 mx-1" />
        <button onClick={reset} className="p-2 hover:bg-white/10 rounded-full text-white/80 hover:text-white" aria-label="Reset view">
          <RotateCcw size={16} />
        </button>
      </div>
      {showHint && (
        <div className="absolute top-2 left-2 bg-black/55 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-white/70 flex items-center gap-1 max-w-[72%]">
          <Move size={10} /> Drag to pan • Pinch to zoom
        </div>
      )}
    </div>
  );
}
// ===================== COMPARE VIEW (aligned) =====================
function CompareView({
  beforeSrc,
  afterSrc,
  afterStyle,
  defaultZoom = 1.35,
  onColorClickHint = false
}) {
  const [pos, setPos] = useState(50);
  const draggingSlider = useRef(false);
  const containerRef = useRef(null);
  const {
    zoom, pan,
    onPointerDown, onPointerMove, onPointerUp,
    onWheel,
    zoomIn, zoomOut,
    reset,
    toggleQuickZoom
  } = usePinchPanZoom({ defaultZoom, minZoom: 0.6, maxZoom: 6 });
  // wheel
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);
  const setByClientX = useCallback((clientX) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(clamp(pct, 0, 100));
  }, []);
  // mouse drag slider (desktop)
  useEffect(() => {
    const onMove = (e) => { if (draggingSlider.current) setByClientX(e.clientX); };
    const onUp = () => { draggingSlider.current = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [setByClientX]);
  const clipRight = 100 - pos;
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden rounded-2xl select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        // if user starts on slider handle, don’t steal for pan/pinch
        const isHandle = e.target?.closest?.('[data-compare-handle="1"]');
        if (isHandle) return;
        onPointerDown(e);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
      onDoubleClick={toggleQuickZoom}
    >
      {/* Transformed viewport (shared for both images => perfect alignment) */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center',
          willChange: 'transform'
        }}
      >
        {/* AFTER (base) */}
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src={afterSrc}
            alt="Cutout"
            draggable={false}
            className="w-full h-full object-contain drop-shadow-2xl"
            style={afterStyle}
          />
        </div>
        {/* BEFORE clipped */}
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${clipRight}% 0 0)` }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src={beforeSrc}
              alt="Original"
              draggable={false}
              className="w-full h-full object-contain drop-shadow-2xl"
            />
          </div>
        </div>
      </div>
      {/* Slider */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white/80 shadow-lg z-20"
        style={{ left: `${pos}%`, transform: 'translateX(-50%)' }}
        onMouseDown={(e) => { draggingSlider.current = true; setByClientX(e.clientX); e.stopPropagation(); }}
        onTouchStart={(e) => { draggingSlider.current = true; setByClientX(e.touches[0].clientX); e.stopPropagation(); }}
        onTouchMove={(e) => { if (draggingSlider.current) setByClientX(e.touches[0].clientX); e.stopPropagation(); }}
        onTouchEnd={() => (draggingSlider.current = false)}
      >
        <div
          data-compare-handle="1"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-xl flex items-center justify-center border-2 border-white/50"
          onPointerDown={(e) => { draggingSlider.current = true; setByClientX(e.clientX); e.stopPropagation(); }}
          onPointerMove={(e) => { if (draggingSlider.current) setByClientX(e.clientX); e.stopPropagation(); }}
          onPointerUp={() => (draggingSlider.current = false)}
          onPointerCancel={() => (draggingSlider.current = false)}
          style={{ touchAction: 'none', cursor: 'ew-resize' }}
        >
          <div className="flex gap-0.5">
            <ChevronDown size={14} className="text-slate-700 rotate-90" />
            <ChevronDown size={14} className="text-slate-700 -rotate-90" />
          </div>
        </div>
      </div>
      {/* Labels */}
      <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] text-white/90 font-medium z-30">Original</div>
      <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] text-white/90 font-medium z-30">Cutout</div>
      {/* Controls */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/70 backdrop-blur-md rounded-full px-2 py-1.5 shadow-xl border border-white/10 z-30">
        <button onClick={zoomOut} className="p-2 hover:bg-white/10 rounded-full text-white/80 hover:text-white" aria-label="Zoom out">
          <ZoomOut size={16} />
        </button>
        <span className="px-3 min-w-[62px] text-center text-xs font-mono text-white/90">{Math.round(zoom * 100)}%</span>
        <button onClick={zoomIn} className="p-2 hover:bg-white/10 rounded-full text-white/80 hover:text-white" aria-label="Zoom in">
          <ZoomIn size={16} />
        </button>
        <div className="w-px h-5 bg-white/20 mx-1" />
        <button onClick={reset} className="p-2 hover:bg-white/10 rounded-full text-white/80 hover:text-white" aria-label="Reset view">
          <RotateCcw size={16} />
        </button>
      </div>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/45 backdrop-blur-sm px-3 py-1 rounded-full text-[9px] text-white/60 z-20 max-w-[92%] text-center">
        Drag slider • Pinch/Wheel zoom • Drag to pan
        {onColorClickHint ? ' • Change shirt color below' : ''}
      </div>
    </div>
  );
}
// ===================== “VIRTUAL CANVAS” WRAPPER =====================
function VirtualCanvasFrame({ targetW, targetH, fallbackW, fallbackH, children }) {
  const w = targetW > 0 ? targetW : (fallbackW || 1);
  const h = targetH > 0 ? targetH : (fallbackH || 1);
  const aspect = w / h;
  return (
    <div className="w-full h-full flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-full max-h-full rounded-2xl overflow-hidden relative" style={{ aspectRatio: aspect }}>
        {children}
      </div>
    </div>
  );
}
// ===================== SHORTCUTS MODAL =====================
function ShortcutsModal({ open, onClose }) {
  if (!open) return null;
  const shortcuts = [
    { keys: 'Ctrl/⌘ + V', desc: 'Paste an image from clipboard (desktop)' },
    { keys: 'Shift + / ( ? )', desc: 'Open/close shortcuts' },
    { keys: 'Wheel / Pinch', desc: 'Zoom in/out in preview' },
    { keys: 'Double Tap/Click', desc: 'Toggle quick zoom (1× ↔ 2×)' },
    { keys: 'Drag (zoomed)', desc: 'Pan around the image' },
    { keys: 'Compare: drag slider', desc: 'Reveal original vs cutout' },
  ];
  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#14141a] border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
              <HelpCircle size={18} className="text-violet-300" />
            </div>
            <div>
              <div className="text-white font-bold">Keyboard & Touch Shortcuts</div>
              <div className="text-[11px] text-slate-500">Fast workflow tips</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-6">
          <div className="space-y-3">
            {shortcuts.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-4 bg-slate-900/40 border border-white/5 rounded-2xl px-4 py-3">
                <div className="text-[12px] text-slate-200">{s.desc}</div>
                <div className="shrink-0 text-[11px] font-mono text-violet-300 bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 rounded-xl">
                  {s.keys}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 text-[10px] text-slate-500">
            Mobile: use the Paste button if supported by your browser.
          </div>
        </div>
      </div>
    </div>
  );
}
// ===================== MOBILE SETTINGS SHEET (with swipe down) =====================
function MobileSheet({ open, title, onClose, children, footer }) {
  const startY = useRef(null);
  const dragging = useRef(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="absolute bottom-0 left-0 right-0 max-h-[78vh] rounded-t-3xl bg-[#0c0c0f] border-t border-white/10 overflow-hidden pb-safe"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Drag handle + header */}
        <div
          className="p-3 border-b border-white/10"
          onPointerDown={(e) => {
            dragging.current = true;
            startY.current = e.clientY;
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return;
            if (startY.current == null) return;
            const dy = e.clientY - startY.current;
            if (dy > 140) {
              dragging.current = false;
              startY.current = null;
              onClose?.();
            }
          }}
          onPointerUp={() => {
            dragging.current = false;
            startY.current = null;
          }}
          onPointerCancel={() => {
            dragging.current = false;
            startY.current = null;
          }}
          style={{ touchAction: 'pan-y' }}
        >
          <div className="mx-auto w-12 h-1.5 rounded-full bg-white/10 mb-2" />
          <div className="flex items-center justify-between">
            <div className="text-white font-bold">{title}</div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-slate-300" aria-label="Close settings">
              <X size={18} />
            </button>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Swipe down, tap outside, or press Esc</div>
        </div>
        <div className="p-4 overflow-y-auto max-h-[calc(78vh-120px)]">
          {children}
        </div>
        {footer && (
          <div className="p-4 border-t border-white/10 bg-[#08080a]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
// ===================== MAIN APP =====================
export default function App() {
  // layout rules: treat small tablets like mobile => desktop only at lg+
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [originalImage, setOriginalImage] = useState(null);
  const [originalFile, setOriginalFile] = useState(null);
  const [cutoutUrl, setCutoutUrl] = useState(null);
  const [cutoutMeta, setCutoutMeta] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [selectedColor, setSelectedColor] = useState('black');
  const [detectedBg, setDetectedBg] = useState(null);
  const [viewMode, setViewMode] = useState('compare');
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState('original');
  const [targetDimensions, setTargetDimensions] = useState({ width: 0, height: 0 });
  const [customWidth, setCustomWidth] = useState('');
  const [customHeight, setCustomHeight] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [imageSize, setImageSize] = useState(null);
  const MAX_DIMENSION = 8000;
  const [isPro, setIsPro] = useState(false);
  const [showProModal, setShowProModal] = useState(false);
  const [podSettings, setPodSettings] = useState({
    saturationReduction: 1.0,
    darknessIncrease: 1.0,
    contrastReduction: 1.0,
  });
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  // mobile workflow: collapse original by default after load
  const [mobileOriginalOpen, setMobileOriginalOpen] = useState(false);
  const [mobileResultOpen, setMobileResultOpen] = useState(true);
  // Collapsible sidebar (desktop)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pr_sidebar_open') ?? 'true'); }
    catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('pr_sidebar_open', JSON.stringify(sidebarOpen)); } catch { }
  }, [sidebarOpen]);
  const fileInputRef = useRef(null);
  const FREE_LIMIT = 5;
  const [usageCount, setUsageCount] = useState(() => {
    try {
      const saved = localStorage.getItem('printready_usage');
      const data = saved ? JSON.parse(saved) : { count: 0, date: new Date().toDateString() };
      return data.date !== new Date().toDateString() ? 0 : data.count;
    } catch { return 0; }
  });
  const setOriginalUrlTracked = useObjectUrlCleanup();
  const setCutoutUrlTracked = useObjectUrlCleanup();
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, type = 'ok', ms = 2600) => {
    setToast({ msg, type, ms });
  }, []);
  const shirtColors = useMemo(() => ({
    dark: [
      { name: 'black', bg: '#0a0a0a', label: 'Black' },
      { name: 'charcoal', bg: '#1f2937', label: 'Charcoal' },
      { name: 'navy', bg: '#1e3a5f', label: 'Navy' },
      { name: 'forest', bg: '#064e3b', label: 'Forest' },
      { name: 'maroon', bg: '#7f1d1d', label: 'Maroon' },
      { name: 'purple', bg: '#581c87', label: 'Purple' },
    ],
    light: [
      { name: 'white', bg: '#fafafa', label: 'White' },
      { name: 'cream', bg: '#fef3c7', label: 'Cream' },
      { name: 'heather', bg: '#9ca3af', label: 'Heather' },
      { name: 'sky', bg: '#7dd3fc', label: 'Sky' },
      { name: 'pink', bg: '#fbcfe8', label: 'Pink' },
      { name: 'mint', bg: '#a7f3d0', label: 'Mint' },
    ]
  }), []);
  const allColors = useMemo(() => [...shirtColors.dark, ...shirtColors.light], [shirtColors]);
  const currentColor = useMemo(() => allColors.find(c => c.name === selectedColor) || allColors[0], [allColors, selectedColor]);
  const isLightShirt = useMemo(() => shirtColors.light.some(c => c.name === selectedColor), [shirtColors, selectedColor]);
  const mobileQuickColors = useMemo(() => {
    // show light first if current is light, else dark first
    const first = isLightShirt ? shirtColors.light : shirtColors.dark;
    const second = isLightShirt ? shirtColors.dark : shirtColors.light;
    return [...first, ...second];
  }, [isLightShirt, shirtColors]);
  const cssFilters = useMemo(() => getCssFilters(podSettings), [podSettings]);
  const saveUsage = (count) => {
    try {
      localStorage.setItem('printready_usage', JSON.stringify({ count, date: new Date().toDateString() }));
    } catch { }
  };
  const hasImage = !!originalImage;
  // ===== Paste: button (mobile/tablet + desktop) =====
  const pasteFromClipboard = useCallback(async () => {
    try {
      if (!navigator.clipboard?.read) {
        showToast('Paste not supported on this browser — use Upload.', 'error');
        return null;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types?.find(t => t.startsWith('image/'));
        if (type) {
          const blob = await item.getType(type);
          const file = new File([blob], `pasted-${Date.now()}.png`, { type });
          return file;
        }
      }
      showToast('Clipboard has no image — copy an image first.', 'error');
      return null;
    } catch {
      showToast('Paste blocked by browser — use Upload.', 'error');
      return null;
    }
  }, [showToast]);
  // ✅ Upload/Paste: compute cutout ONCE and cache
  const handleFileSelect = useCallback(async (file) => {
    if (!file?.type?.startsWith('image/')) return;
    if (!isPro && usageCount >= FREE_LIMIT) {
      setShowProModal(true);
      return;
    }
    const origUrl = URL.createObjectURL(file);
    setOriginalUrlTracked(origUrl);
    setOriginalImage(origUrl);
    setOriginalFile(file);
    setProcessing(true);
    try {
      const result = await FastImageProcessor.createCutoutBlobUrl(file);
      setCutoutUrlTracked(result.cutoutUrl);
      setCutoutUrl(result.cutoutUrl);
      setCutoutMeta({
        width: result.width,
        height: result.height,
        detectedBackground: result.detectedBackground,
        hasColors: result.hasColors,
        classification: result.classification,
        ms: result.ms
      });
      setDetectedBg(result.detectedBackground);
      setSelectedColor(result.detectedBackground === 'black' ? 'black' : 'white');
      const outW = targetDimensions.width > 0 ? targetDimensions.width : result.width;
      const outH = targetDimensions.height > 0 ? targetDimensions.height : result.height;
      setImageSize({
        original: `${result.width}×${result.height}`,
        output: `${outW}×${outH}`,
        design: `${result.width}×${result.height}`,
        mode: result.classification?.isLineArt ? 'line-art' : 'photo'
      });
      // best default view
      setViewMode('compare');
      // mobile: minimize original, focus on result
      setMobileOriginalOpen(false);
      setMobileResultOpen(true);
      const newCount = usageCount + 1;
      setUsageCount(newCount);
      saveUsage(newCount);
    } catch (err) {
      console.error('Cutout error:', err);
      showToast('Failed to process image. Try another file.', 'error');
    } finally {
      setProcessing(false);
    }
  }, [isPro, usageCount, targetDimensions.width, targetDimensions.height, setOriginalUrlTracked, setCutoutUrlTracked, showToast]);
  const handlePasteButton = useCallback(async () => {
    const file = await pasteFromClipboard();
    if (file) handleFileSelect(file);
  }, [pasteFromClipboard, handleFileSelect]);
  const handleUploadButton = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  // ✅ Preset switch: NO processing
  useEffect(() => {
    if (!cutoutMeta) return;
    const outW = targetDimensions.width > 0 ? targetDimensions.width : cutoutMeta.width;
    const outH = targetDimensions.height > 0 ? targetDimensions.height : cutoutMeta.height;
    setImageSize(prev => ({
      ...(prev || {}),
      original: `${cutoutMeta.width}×${cutoutMeta.height}`,
      output: `${outW}×${outH}`,
      design: `${cutoutMeta.width}×${cutoutMeta.height}`,
      mode: cutoutMeta.classification?.isLineArt ? 'line-art' : 'photo'
    }));
  }, [targetDimensions.width, targetDimensions.height, cutoutMeta]);
  // Drag & drop: landing + workspace (desktop reliable)
  const [dragActive, setDragActive] = useState(false);
  const onDragOver = useCallback((e) => {
    e.preventDefault();
    // do not fight mobile scroll: only show overlay when files exist
    if (e.dataTransfer?.types?.includes('Files')) {
      setDragActive(true);
    }
  }, []);
  const onDragLeave = useCallback((e) => {
    // leaving window / main container
    if (e.currentTarget === e.target) setDragActive(false);
  }, []);
  const onDropAny = useCallback((e) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);
  // ✅ Download: export enhancement ONLY here
  const downloadImage = useCallback(async () => {
    if (!cutoutUrl || !cutoutMeta) return;
    setProcessing(true);
    try {
      const res = await FastImageProcessor.exportFinal({
        cutoutUrl,
        cutoutW: cutoutMeta.width,
        cutoutH: cutoutMeta.height,
        targetW: targetDimensions.width,
        targetH: targetDimensions.height,
        podSettings,
        classification: cutoutMeta.classification
      });
      downloadBlob(res.blob, `printready-${Date.now()}.png`);
      showToast('PNG downloaded.', 'ok');
    } catch (e) {
      console.error('Export error:', e);
      showToast('Export failed. Try again.', 'error');
    } finally {
      setProcessing(false);
    }
  }, [cutoutUrl, cutoutMeta, targetDimensions.width, targetDimensions.height, podSettings, showToast]);
  const resetAll = useCallback(() => {
    setOriginalImage(null);
    setOriginalFile(null);
    setCutoutUrl(null);
    setCutoutMeta(null);
    setDetectedBg(null);
    setImageSize(null);
    setViewMode('compare');
    setSelectedPreset('original');
    setTargetDimensions({ width: 0, height: 0 });
    setCustomWidth('');
    setCustomHeight('');
    setShowCustomInput(false);
    setMobileSettingsOpen(false);
    setMobileOriginalOpen(false);
    setMobileResultOpen(true);
    setDragActive(false);
  }, []);
  const resetSettings = useCallback(() => {
    setPodSettings({
      saturationReduction: 1.0,
      darknessIncrease: 1.0,
      contrastReduction: 1.0,
    });
  }, []);
  const simulatePrint = useCallback(() => {
    setPodSettings({
      saturationReduction: 0.82,
      darknessIncrease: 0.89,
      contrastReduction: 0.91,
    });
  }, []);
  // Desktop global paste (Ctrl/Cmd+V)
  useEffect(() => {
    const onPaste = async (e) => {
      if (isTypingTarget(document.activeElement)) return;
      const items = e.clipboardData?.items;
      if (items && items.length) {
        for (const it of items) {
          if (it.type?.startsWith('image/')) {
            const file = it.getAsFile();
            if (file) {
              e.preventDefault();
              handleFileSelect(file);
              return;
            }
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleFileSelect]);
  // Shortcuts modal toggle
  useEffect(() => {
    const onKeyDown = (e) => {
      if (isTypingTarget(document.activeElement)) return;
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcuts(s => !s);
      }
      if (!isDesktop && e.key === 'Escape' && mobileSettingsOpen) {
        setMobileSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDesktop, mobileSettingsOpen]);
  // ===================== Sidebar Content (desktop + mobile settings) =====================
  const SidebarContent = useCallback(({ dense = false, hideColorSection = false }) => (
    <div className={`${dense ? 'space-y-5' : 'space-y-6'}`}>
      {/* Size Presets */}
      <section className="glass-panel rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-white flex items-center gap-2">
            <Maximize2 size={14} className="text-violet-400" /> Size Preset
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'original', label: 'Original', width: 0, height: 0, desc: 'No resize' },
            { id: 'tshirt', label: 'T-Shirt', width: 4500, height: 5400, desc: '4500×5400' },
            { id: 'hoodie', label: 'Hoodie', width: 4500, height: 4800, desc: '4500×4800' },
            { id: 'mug', label: 'Mug 11oz', width: 2700, height: 1100, desc: '2700×1100' },
            { id: 'poster', label: 'Poster 18×24', width: 5400, height: 7200, desc: '5400×7200', pro: true },
            { id: 'phone', label: 'Phone Case', width: 1300, height: 2000, desc: '1300×2000' },
          ].map(preset => {
            const needsPro = preset.pro && !isPro;
            return (
              <button
                key={preset.id}
                onClick={() => {
                  if (needsPro) { setShowProModal(true); return; }
                  setSelectedPreset(preset.id);
                  setTargetDimensions({ width: preset.width, height: preset.height });
                  setShowCustomInput(false);
                }}
                className={[
                  'py-2.5 px-2 rounded-lg text-center transition-all relative',
                  (selectedPreset === preset.id && !showCustomInput)
                    ? 'bg-violet-600 text-white'
                    : (needsPro ? 'bg-slate-800/50 text-slate-500' : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700')
                ].join(' ')}
              >
                {needsPro && <Lock size={10} className="absolute top-1 right-1 text-slate-600" />}
                <div className="font-semibold text-xs">{preset.label}</div>
                <div className="text-[9px] opacity-70">{preset.desc}</div>
              </button>
            );
          })}
        </div>
        {/* Custom size */}
        <button
          onClick={() => {
            setShowCustomInput(!showCustomInput);
            if (!showCustomInput) setSelectedPreset('custom');
          }}
          className={[
            'w-full mt-2 py-2.5 px-3 rounded-lg text-center transition-all',
            showCustomInput ? 'bg-violet-600 text-white' : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700'
          ].join(' ')}
        >
          <div className="font-semibold text-xs">Custom Size</div>
          <div className="text-[9px] opacity-70">Up to {MAX_DIMENSION}×{MAX_DIMENSION}px</div>
        </button>
        {showCustomInput && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-slate-500 mb-1 block">Width</label>
                <input
                  type="number"
                  value={customWidth}
                  onChange={(e) => setCustomWidth(e.target.value)}
                  placeholder="4500"
                  max={MAX_DIMENSION}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div className="flex items-end pb-2 text-slate-500">×</div>
              <div className="flex-1">
                <label className="text-[10px] text-slate-500 mb-1 block">Height</label>
                <input
                  type="number"
                  value={customHeight}
                  onChange={(e) => setCustomHeight(e.target.value)}
                  placeholder="5400"
                  max={MAX_DIMENSION}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>
            <button
              onClick={() => {
                const w = Math.min(MAX_DIMENSION, Math.max(0, parseInt(customWidth, 10) || 0));
                const h = Math.min(MAX_DIMENSION, Math.max(0, parseInt(customHeight, 10) || 0));
                if (w > 0 && h > 0) setTargetDimensions({ width: w, height: h });
              }}
              className="w-full py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-xs font-medium text-white transition-all"
            >
              Apply Custom Size
            </button>
          </div>
        )}
      </section>
      {/* Colors (Desktop only – keep original good UX) */}
      {!hideColorSection && (
        <section>
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Mockup Colors</h3>
          <div className="mb-4">
            <span className="text-[10px] text-slate-600 mb-2 block flex items-center gap-1"><Moon size={10} /> Dark</span>
            <div className="grid grid-cols-6 gap-2">
              {shirtColors.dark.map(c => (
                <button
                  key={c.name}
                  onClick={() => setSelectedColor(c.name)}
                  title={c.label}
                  className={[
                    'h-9 rounded-lg border-2 transition-all',
                    selectedColor === c.name ? 'border-violet-500 scale-110 shadow-lg shadow-violet-500/20' : 'border-transparent hover:border-white/20'
                  ].join(' ')}
                  style={{ backgroundColor: c.bg }}
                />
              ))}
            </div>
          </div>
          <div>
            <span className="text-[10px] text-slate-600 mb-2 block flex items-center gap-1"><Sun size={10} /> Light</span>
            <div className="grid grid-cols-6 gap-2">
              {shirtColors.light.map(c => (
                <button
                  key={c.name}
                  onClick={() => setSelectedColor(c.name)}
                  title={c.label}
                  className={[
                    'h-9 rounded-lg border-2 transition-all',
                    selectedColor === c.name ? 'border-violet-500 scale-110 shadow-lg shadow-violet-500/20' : 'border-transparent hover:border-white/20'
                  ].join(' ')}
                  style={{ backgroundColor: c.bg }}
                />
              ))}
            </div>
          </div>
        </section>
      )}
      {/* Print Simulation */}
      <section>
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="w-full flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4"
        >
          <span className="flex items-center gap-2">
            <Sliders size={12} /> Print Simulation
          </span>
          <ChevronDown size={14} className={`transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
        </button>
        {settingsOpen && (
          <div className="space-y-5">
            {[
              { label: 'Saturation', key: 'saturationReduction', min: 0.5, max: 1 },
              { label: 'Brightness', key: 'darknessIncrease', min: 0.6, max: 1 },
              { label: 'Contrast', key: 'contrastReduction', min: 0.7, max: 1 },
            ].map(s => (
              <div key={s.key} className={`${!originalFile ? 'opacity-40 pointer-events-none' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-300 font-medium">{s.label}</span>
                  <span className="text-xs font-mono text-violet-400 bg-slate-800/50 px-2 py-0.5 rounded tabular-nums">
                    {Math.round(podSettings[s.key] * 100)}
                  </span>
                </div>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={0.01}
                  value={podSettings[s.key]}
                  onChange={(e) => setPodSettings(p => ({ ...p, [s.key]: parseFloat(e.target.value) }))}
                  disabled={!originalFile}
                  className="w-full h-2 bg-slate-800 rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500
                    [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-violet-500/30
                    [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing
                    [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110
                    [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:bg-violet-500 [&::-moz-range-thumb]:border-0"
                  style={{ touchAction: 'none' }}
                />
              </div>
            ))}
            <div className="flex gap-2">
              <button
                onClick={simulatePrint}
                disabled={!originalFile}
                className="flex-1 py-2 bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Shirt size={12} /> Simulate Print
              </button>
              <button
                onClick={resetSettings}
                disabled={!originalFile}
                className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium text-slate-400 flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <RotateCcw size={12} /> Reset 100%
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  ), [MAX_DIMENSION, customHeight, customWidth, isPro, originalFile, podSettings, selectedColor, selectedPreset, settingsOpen, shirtColors.dark, shirtColors.light, showCustomInput, simulatePrint, resetSettings]);
  // ===================== DEFAULT LANDING (ONLY UPLOAD) =====================
  const Landing = (
    <div className="w-full h-full flex items-center justify-center px-4">
      <div
        onDrop={(e) => { onDropAny(e); }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className="max-w-xl w-full glass-panel rounded-3xl p-8 sm:p-12 border-2 border-dashed border-white/10 hover:border-violet-500/50 transition-all text-center"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files?.[0])}
        />
        <div className="w-20 h-20 sm:w-28 sm:h-28 bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <Upload className="text-violet-400" size={40} />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Drop your design here</h2>
        <p className="text-slate-400 text-sm sm:text-base mb-5">
          PNG, JPG, WebP • Black or white background
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={handleUploadButton}
            className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold flex items-center justify-center gap-2"
          >
            <Upload size={18} /> Upload
          </button>
          <button
            onClick={handlePasteButton}
            className="w-full py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 font-bold flex items-center justify-center gap-2"
          >
            <Upload size={18} /> Paste
          </button>
        </div>
        <div className="mt-5 text-[12px] text-slate-500">
          Desktop: Ctrl/⌘+V works globally. Mobile: Paste works only if your browser supports it.
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-2"><Zap size={14} className="text-emerald-500" /> One-time cutout</span>
          <span className="flex items-center gap-2"><Zap size={14} className="text-emerald-500" /> Instant preview</span>
          <span className="flex items-center gap-2"><Zap size={14} className="text-emerald-500" /> Export enhancement on download</span>
        </div>
      </div>
    </div>
  );
  // ===================== WORKSPACE PANELS =====================
  const OriginalPanel = (
    <div className="min-w-0 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Original</h3>
        <button onClick={resetAll} className="text-slate-500 hover:text-white p-1.5 hover:bg-white/5 rounded-lg transition-all" aria-label="Reset all">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 transparency-grid rounded-2xl overflow-hidden relative min-h-[260px]">
        <VirtualCanvasFrame
          targetW={targetDimensions.width}
          targetH={targetDimensions.height}
          fallbackW={cutoutMeta?.width}
          fallbackH={cutoutMeta?.height}
        >
          <ZoomableImage
            src={originalImage}
            alt="Original"
            className="w-full h-full object-contain drop-shadow-2xl"
            containerClassName="w-full h-full flex items-center justify-center"
            defaultZoom={1.1}
            hint={!isDesktop}
          />
        </VirtualCanvasFrame>
        {imageSize && (
          <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-slate-400 z-20">
            {imageSize.original}
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={handleUploadButton} className="py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2">
          <Upload size={16} /> Upload
        </button>
        <button onClick={handlePasteButton} className="py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2">
          <Upload size={16} /> Paste
        </button>
      </div>
    </div>
  );
  const ResultPanel = (
    <div className="min-w-0 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
          {viewMode === 'mockup' ? 'Mockup' : 'Compare'}
        </h3>
        <div className="flex items-center gap-2">
          {cutoutMeta?.classification && (
            <span className="text-[10px] text-slate-500 bg-slate-800/50 px-2 py-1 rounded-full">
              {cutoutMeta.classification.isLineArt ? 'line-art auto' : 'photo auto'}
            </span>
          )}
          {cutoutUrl && (
            <span className="text-[10px] text-slate-500 bg-slate-800/50 px-2 py-1 rounded-full">
              {currentColor?.label}
            </span>
          )}
        </div>
      </div>
      <div
        className={[
          'flex-1 rounded-2xl overflow-hidden relative min-h-[260px]',
          'fabric-texture'
        ].join(' ')}
        style={{ backgroundColor: currentColor?.bg }}
      >
        {viewMode === 'mockup' && (
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 w-20 h-6 border-b-4 rounded-b-[100px]"
            style={{ borderColor: isLightShirt ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }}
          />
        )}
        {processing ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <RefreshCw className="animate-spin text-violet-500 mx-auto mb-4" size={48} />
              <p className="text-base text-slate-300">Working…</p>
            </div>
          </div>
        ) : cutoutUrl ? (
          viewMode === 'compare' ? (
            <VirtualCanvasFrame
              targetW={targetDimensions.width}
              targetH={targetDimensions.height}
              fallbackW={cutoutMeta?.width}
              fallbackH={cutoutMeta?.height}
            >
              <CompareView
                beforeSrc={originalImage}
                afterSrc={cutoutUrl}
                afterStyle={cssFilters}
                defaultZoom={1.35}
                onColorClickHint={!isDesktop}
              />
            </VirtualCanvasFrame>
          ) : (
            <VirtualCanvasFrame
              targetW={targetDimensions.width}
              targetH={targetDimensions.height}
              fallbackW={cutoutMeta?.width}
              fallbackH={cutoutMeta?.height}
            >
              <ZoomableImage
                src={cutoutUrl}
                alt="Cutout"
                className="w-full h-full object-contain drop-shadow-2xl"
                containerClassName="w-full h-full flex items-center justify-center"
                style={cssFilters}
                defaultZoom={1.1}
                hint={!isDesktop}
              />
            </VirtualCanvasFrame>
          )
        ) : null}
        {cutoutUrl && !processing && (
          <>
            <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] flex items-center gap-1.5 text-white z-20">
              <Sparkles size={10} className="text-amber-400" />
              {viewMode === 'mockup' ? 'POD Preview' : 'Original vs Cutout'}
            </div>
            {imageSize && (
              <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-slate-400 flex items-center gap-1 z-20">
                {(targetDimensions.width > 0 || targetDimensions.height > 0) && <Maximize2 size={10} />}
                {imageSize.output}
              </div>
            )}
          </>
        )}
      </div>
      {cutoutUrl && (
        <div className="mt-3 flex gap-2">
          {[
            { mode: 'mockup', icon: Shirt, label: 'Mockup' },
            { mode: 'compare', icon: SplitSquareHorizontal, label: 'Compare' },
          ].map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={[
                'flex-1 py-3 sm:py-4 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2',
                viewMode === mode
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20'
                  : 'bg-white/5 hover:bg-white/10 text-slate-400'
              ].join(' ')}
            >
              <Icon size={18} /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
  // ===================== DESKTOP HEADER (unchanged feel) =====================
  const Header = (
    <header className="h-14 border-b border-white/5 flex items-center justify-between px-3 sm:px-6 bg-[#0c0c0f]/90 backdrop-blur-xl z-20 shrink-0">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-xl shadow-lg shadow-violet-500/20">
          <Shirt size={18} className="text-white" />
        </div>
        <div>
          <span className="font-bold tracking-tight text-white text-lg">PrintReady</span>
          <span className="text-violet-400 text-[10px] font-semibold ml-2 bg-violet-500/10 px-2 py-0.5 rounded-full">STUDIO</span>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        {detectedBg && (
          <span className={`hidden sm:flex text-xs px-2 py-1 rounded-full font-medium items-center gap-1.5 ${detectedBg === 'black' ? 'bg-slate-800 text-slate-300' : 'bg-white/10 text-white'}`}>
            {detectedBg === 'black' ? <Moon size={12} /> : <Sun size={12} />}
            {detectedBg} bg
          </span>
        )}
        {cutoutMeta?.classification && (
          <span className="hidden sm:inline-flex text-xs px-2 py-1 rounded-full font-medium bg-violet-500/10 text-violet-300">
            {cutoutMeta.classification.isLineArt ? 'line-art' : 'photo'}
          </span>
        )}
        {isDesktop && hasImage && (
          <button
            onClick={() => setSidebarOpen(s => !s)}
            className="hidden lg:flex px-3 py-1.5 rounded-full text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 items-center gap-2"
            title={sidebarOpen ? 'Hide panel' : 'Show panel'}
          >
            <Sliders size={14} className="text-violet-300" />
            {sidebarOpen ? 'Hide' : 'Show'}
          </button>
        )}
        <button
          onClick={() => setShowShortcuts(true)}
          className="hidden sm:flex px-3 py-1.5 rounded-full text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 items-center gap-2"
          title="Shortcuts ( ? )"
        >
          <HelpCircle size={14} className="text-violet-300" />
          Shortcuts
        </button>
        {!isPro && <span className="hidden sm:inline text-xs text-slate-500">{Math.max(0, FREE_LIMIT - usageCount)} free left</span>}
        <button
          onClick={() => isPro ? setIsPro(false) : setShowProModal(true)}
          className={[
            'px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold transition-all',
            isPro
              ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-orange-500/20'
              : 'bg-violet-600 hover:bg-violet-500 text-white'
          ].join(' ')}
        >
          {isPro ? <span className="flex items-center gap-1.5"><Crown size={12} /> PRO</span> : 'Upgrade'}
        </button>
      </div>
    </header>
  );
  // ===================== PRO MODAL =====================
  const ProModal = showProModal ? (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#14141a] rounded-3xl p-8 max-w-md w-full border border-white/10 shadow-2xl">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Crown size={32} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Upgrade to Pro</h2>
          <p className="text-slate-400 mb-6">You've used your {FREE_LIMIT} free designs today.</p>
          <div className="bg-slate-800/50 rounded-2xl p-6 mb-6 text-left">
            <h3 className="font-semibold text-white mb-4">Pro includes:</h3>
            <ul className="space-y-3 text-sm">
              {['Unlimited designs', '2× and 4× export enhancement', 'No watermark', 'Advanced controls', 'Priority support'].map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-slate-300">
                  <Check size={16} className="text-emerald-500" />{f}
                </li>
              ))}
            </ul>
          </div>
          <button onClick={() => { setIsPro(true); setShowProModal(false); }} className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl font-bold text-white shadow-lg mb-3">
            Go Pro — $9/month
          </button>
          <button onClick={() => setShowProModal(false)} className="w-full py-3 text-slate-500 hover:text-slate-300 text-sm">Maybe later</button>
        </div>
      </div>
    </div>
  ) : null;
  // ===================== MOBILE QUICK COLORS (ONE place only) =====================
  const MobileQuickColorsBar = (!isDesktop && hasImage && (viewMode === 'mockup' || viewMode === 'compare')) ? (
    <div className="mt-3 glass-panel rounded-xl p-3">
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
        Quick Colors
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        {mobileQuickColors.map(c => (
          <button
            key={c.name}
            onClick={() => setSelectedColor(c.name)}
            className={[
              'shrink-0 w-9 h-9 rounded-xl border-2 transition-all',
              selectedColor === c.name ? 'border-violet-500 scale-105' : 'border-white/10 hover:border-white/30'
            ].join(' ')}
            style={{ backgroundColor: c.bg }}
            title={c.label}
            aria-label={`Set color ${c.label}`}
          />
        ))}
      </div>
      <div className="mt-2 text-[10px] text-slate-500">
        Colors stay accessible without opening Settings.
      </div>
    </div>
  ) : null;
  // ===================== DESKTOP WORKSPACE LAYOUT (two panels + sidebar always visible) =====================
  const DesktopWorkspace = (
    <div className="flex-1 flex overflow-hidden">
      <main
        className="flex-1 overflow-hidden p-3 sm:p-4 lg:p-6"
        onDrop={onDropAny}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <div className="h-full grid grid-cols-2 gap-3 sm:gap-4 lg:gap-6 overflow-hidden">
          <div className="min-w-0 flex flex-col overflow-hidden">{OriginalPanel}</div>
          <div className="min-w-0 flex flex-col overflow-hidden">{ResultPanel}</div>
        </div>
      </main>
      <aside
        className={`hidden lg:flex border-l border-white/5 bg-[#0c0c0f]/90 backdrop-blur-xl flex-col shrink-0 transition-all duration-200 ease-out ${sidebarOpen ? 'w-[360px]' : 'w-[72px]'}`}
      >
        <div className="p-3 border-b border-white/5 flex items-center justify-between">
          <div className={`text-xs font-bold text-white/80 ${sidebarOpen ? '' : 'hidden'}`}>
            Controls
          </div>
          <button
            onClick={() => setSidebarOpen(s => !s)}
            className="p-2 rounded-xl hover:bg-white/5 text-slate-300"
            title={sidebarOpen ? 'Collapse' : 'Expand'}
          >
            <ChevronDown size={16} className={`transition-transform ${sidebarOpen ? 'rotate-90' : '-rotate-90'}`} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 ${sidebarOpen ? '' : 'px-2'}">
          {sidebarOpen ? (
            <SidebarContent />
          ) : (
            <div className="flex flex-col items-center gap-2 pt-2">
              <button
                onClick={() => setSidebarOpen(true)}
                className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center"
                title="Open panel"
              >
                <Sliders size={18} className="text-violet-300" />
              </button>
              <button
                onClick={downloadImage}
                disabled={!cutoutUrl || processing}
                className="w-12 h-12 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 disabled:opacity-40 flex items-center justify-center"
                title="Download PNG"
              >
                <Download size={18} className="text-white" />
              </button>
              <button
                onClick={handlePasteButton}
                className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center"
                title="Paste"
              >
                <Upload size={18} className="text-violet-300" />
              </button>
              <button
                onClick={handleUploadButton}
                className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center"
                title="Upload"
              >
                <Upload size={18} className="text-violet-300" />
              </button>
            </div>
          )}
        </div>
        {sidebarOpen && (
          <div className="p-5 bg-[#08080a] border-t border-white/5">
            <button
              onClick={downloadImage}
              disabled={!cutoutUrl || processing}
              className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-lg shadow-violet-900/30 transition-all active:scale-[0.98] text-base"
            >
              <Download size={20} /> Download PNG
            </button>
            <p className="text-[10px] text-center text-slate-600 mt-3">
              {isPro ? 'Export enhancement enabled • PNG with transparency' : 'Free tier'}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
  // ===================== MOBILE / SMALL TABLET WORKSPACE (stacked + bottom bar) =====================
  const MobileWorkspace = (
    <div
      className="flex-1 overflow-y-auto px-3 pt-3 pb-24"
      onDrop={onDropAny}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      {/* Collapsible Original */}
      <div className="glass-panel rounded-2xl p-3 mb-3">
        <button
          onClick={() => setMobileOriginalOpen(v => !v)}
          className="w-full flex items-center justify-between"
        >
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Original</div>
          <ChevronDown size={18} className={`text-slate-400 transition-transform ${mobileOriginalOpen ? 'rotate-180' : ''}`} />
        </button>
        {mobileOriginalOpen && (
          <div className="mt-3">
            <div className="transparency-grid rounded-2xl overflow-hidden relative min-h-[240px]">
              <VirtualCanvasFrame
                targetW={targetDimensions.width}
                targetH={targetDimensions.height}
                fallbackW={cutoutMeta?.width}
                fallbackH={cutoutMeta?.height}
              >
                <ZoomableImage
                  src={originalImage}
                  alt="Original"
                  className="w-full h-full object-contain drop-shadow-2xl"
                  containerClassName="w-full h-full flex items-center justify-center"
                  defaultZoom={1.1}
                  hint={false}
                />
              </VirtualCanvasFrame>
              {imageSize && (
                <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-slate-400 z-20">
                  {imageSize.original}
                </div>
              )}
            </div>
          </div>
        )}
        {!mobileOriginalOpen && (
          <div className="mt-2 text-[11px] text-slate-500">
            Minimized for faster workflow. Expand anytime.
          </div>
        )}
      </div>
      {/* Result (default open) */}
      <div className="glass-panel rounded-2xl p-3">
        <button
          onClick={() => setMobileResultOpen(v => !v)}
          className="w-full flex items-center justify-between"
        >
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Result • {viewMode === 'mockup' ? 'Mockup' : 'Compare'}
          </div>
          <ChevronDown size={18} className={`text-slate-400 transition-transform ${mobileResultOpen ? 'rotate-180' : ''}`} />
        </button>
        {mobileResultOpen && (
          <div className="mt-3">
            {ResultPanel}
            {MobileQuickColorsBar}
          </div>
        )}
      </div>
      {/* Drag overlay hint for mobile (light) */}
      {dragActive && (
        <div className="fixed inset-0 z-[70] bg-violet-500/10 backdrop-blur-[2px] pointer-events-none">
          <div className="absolute inset-4 rounded-3xl border-2 border-dashed border-violet-400/60" />
        </div>
      )}
    </div>
  );
  // ===================== MAIN RENDER =====================
  return (
    <div
      className="h-[100dvh] flex flex-col bg-[#0c0c0f] text-slate-200 overflow-hidden font-['SF_Pro_Display',-apple-system,BlinkMacSystemFont,sans-serif]"
      onDrop={onDropAny}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <Toast toast={toast} onClose={() => setToast(null)} />
      <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      {ProModal}
      {Header}
      {/* global drag overlay (desktop + landing) */}
      {dragActive && (
        <div className="fixed inset-0 z-[60] bg-violet-500/10 backdrop-blur-[2px] pointer-events-none">
          <div className="absolute inset-6 rounded-3xl border-2 border-dashed border-violet-400/60" />
        </div>
      )}
      {!hasImage ? (
        <div className="flex-1 overflow-hidden">
          {Landing}
        </div>
      ) : (
        <>
          {isDesktop ? DesktopWorkspace : MobileWorkspace}
        </>
      )}
      {/* Mobile Settings Sheet */}
      <MobileSheet
        open={mobileSettingsOpen}
        title="Settings"
        onClose={() => setMobileSettingsOpen(false)}
        footer={
          <button
            onClick={() => { setMobileSettingsOpen(false); downloadImage(); }}
            disabled={!cutoutUrl || processing}
            className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 disabled:opacity-40 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2"
          >
            <Download size={18} /> Download PNG
          </button>
        }
      >
        {/* IMPORTANT: no color swatches duplication on mobile */}
        <SidebarContent dense hideColorSection />
      </MobileSheet>
      {/* Mobile Bottom Bar (only after image loaded) */}
      {!isDesktop && hasImage && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#0c0c0f]/90 backdrop-blur-xl pb-safe"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="p-2 flex items-center gap-2">
            <button
              onClick={handleUploadButton}
              className="flex-1 py-3 rounded-xl bg-violet-600 text-white font-bold text-sm"
            >
              Upload
            </button>
            <button
              onClick={handlePasteButton}
              className="py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 font-bold text-sm"
            >
              Paste
            </button>
            <button
              onClick={() => setMobileSettingsOpen(true)}
              className="py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 font-bold text-sm"
            >
              Settings
            </button>
            <button
              onClick={downloadImage}
              disabled={!cutoutUrl || processing}
              className="py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold text-sm disabled:opacity-40"
            >
              PNG
            </button>
          </div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files?.[0])}
      />
    </div>
  );
}