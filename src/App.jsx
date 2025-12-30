import React, { useState, useRef, useCallback } from 'react';
import { Upload, Wand2, Shirt, ZoomIn, Download, Sparkles, Lock, RefreshCw, ChevronDown, Eye, Sliders, X, Check, Menu, Github } from 'lucide-react';

// ============== IMAGE PROCESSING ENGINE ==============
// Converted from Python BackgroundRemover class

const ImageProcessor = {
  // POD Print Settings
  podSettings: {
    saturationReduction: 0.82,
    darknessIncrease: 0.89,
    contrastReduction: 0.91,
    warmthBoost: 1.02,
    greenReduction: 0.98,
  },

  // Detect if background is black or white
  detectBackgroundColor(imageData) {
    const { data, width, height } = imageData;
    const edgePixels = [];

    // Sample all edges
    for (let x = 0; x < width; x++) {
      const topIdx = x * 4;
      const bottomIdx = ((height - 1) * width + x) * 4;
      edgePixels.push((data[topIdx] + data[topIdx + 1] + data[topIdx + 2]) / 3);
      edgePixels.push((data[bottomIdx] + data[bottomIdx + 1] + data[bottomIdx + 2]) / 3);
    }
    for (let y = 0; y < height; y++) {
      const leftIdx = (y * width) * 4;
      const rightIdx = (y * width + width - 1) * 4;
      edgePixels.push((data[leftIdx] + data[leftIdx + 1] + data[leftIdx + 2]) / 3);
      edgePixels.push((data[rightIdx] + data[rightIdx + 1] + data[rightIdx + 2]) / 3);
    }

    const meanEdgeValue = edgePixels.reduce((a, b) => a + b, 0) / edgePixels.length;
    return meanEdgeValue < 128 ? 'black' : 'white';
  },

  // RGB to HSV conversion
  rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) {
      h = 0;
    } else {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [h, s, v];
  },

  // HSV to RGB conversion
  hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  },

  // Process black background
  processBlackBackground(imageData) {
    const { data, width, height } = imageData;
    const output = new Uint8ClampedArray(data.length);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const [h, s, v] = this.rgbToHsv(r, g, b);
      const isBlack = v < 0.20;
      
      output[i] = r;
      output[i + 1] = g;
      output[i + 2] = b;
      output[i + 3] = isBlack ? 0 : 255;
    }

    return new ImageData(output, width, height);
  },

  // Process white background (sketch effect)
  processWhiteBackground(imageData) {
    const { data, width, height } = imageData;
    const output = new Uint8ClampedArray(data.length);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      let gray = (r * 0.299 + g * 0.587 + b * 0.114);
      gray = Math.min(255, gray + 40);
      const alpha = 255 - gray;
      
      output[i] = 0;
      output[i + 1] = 0;
      output[i + 2] = 0;
      output[i + 3] = alpha;
    }

    return new ImageData(output, width, height);
  },

  // Apply POD print simulation
  applyPodSimulation(imageData, settings = this.podSettings) {
    const { data, width, height } = imageData;
    const output = new Uint8ClampedArray(data.length);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      
      if (a === 0) {
        output[i] = r; output[i + 1] = g; output[i + 2] = b; output[i + 3] = a;
        continue;
      }

      let [h, s, v] = this.rgbToHsv(r, g, b);
      s *= settings.saturationReduction;
      v *= settings.darknessIncrease;
      let [newR, newG, newB] = this.hsvToRgb(h, s, v);
      
      newR = Math.min(255, newR * settings.warmthBoost);
      newG = Math.min(255, newG * settings.greenReduction);
      
      newR = Math.max(0, Math.min(255, (newR / 255 - 0.5) * settings.contrastReduction + 0.5) * 255);
      newG = Math.max(0, Math.min(255, (newG / 255 - 0.5) * settings.contrastReduction + 0.5) * 255);
      newB = Math.max(0, Math.min(255, (newB / 255 - 0.5) * settings.contrastReduction + 0.5) * 255);
      
      output[i] = newR;
      output[i + 1] = newG;
      output[i + 2] = newB;
      output[i + 3] = a;
    }

    return new ImageData(output, width, height);
  },

  // Main processing function
  async processImage(file, applyPod = true, podSettings = this.podSettings) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const bgColor = this.detectBackgroundColor(imageData);
        
        if (bgColor === 'black') {
          imageData = this.processBlackBackground(imageData);
        } else {
          imageData = this.processWhiteBackground(imageData);
        }
        
        if (applyPod) {
          imageData = this.applyPodSimulation(imageData, podSettings);
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        resolve({
          canvas,
          dataUrl: canvas.toDataURL('image/png'),
          width: canvas.width,
          height: canvas.height,
          detectedBackground: bgColor
        });
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
};

// ============== MAIN APP ==============

export default function App() {
  const [originalImage, setOriginalImage] = useState(null);
  const [originalFile, setOriginalFile] = useState(null);
  const [processedImage, setProcessedImage] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [selectedColor, setSelectedColor] = useState('black');
  const [showSettings, setShowSettings] = useState(false);
  const [detectedBg, setDetectedBg] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [podSettings, setPodSettings] = useState({
    saturationReduction: 0.82,
    darknessIncrease: 0.89,
    contrastReduction: 0.91,
    warmthBoost: 1.02,
    greenReduction: 0.98,
  });
  const [isPro, setIsPro] = useState(false);
  const [usageCount, setUsageCount] = useState(() => {
    const saved = localStorage.getItem('printready_usage');
    const data = saved ? JSON.parse(saved) : { count: 0, date: new Date().toDateString() };
    if (data.date !== new Date().toDateString()) {
      return 0;
    }
    return data.count;
  });
  
  const fileInputRef = useRef(null);

  const shirtColors = [
    { name: 'black', bg: '#1a1a1a', text: '#ffffff' },
    { name: 'white', bg: '#ffffff', text: '#1a1a1a' },
    { name: 'navy', bg: '#1e3a5f', text: '#ffffff' },
    { name: 'heather gray', bg: '#9ca3af', text: '#1a1a1a' },
    { name: 'red', bg: '#dc2626', text: '#ffffff' },
    { name: 'forest', bg: '#166534', text: '#ffffff' },
    { name: 'royal blue', bg: '#1d4ed8', text: '#ffffff' },
    { name: 'maroon', bg: '#7f1d1d', text: '#ffffff' },
    { name: 'purple', bg: '#7c3aed', text: '#ffffff' },
    { name: 'orange', bg: '#ea580c', text: '#ffffff' },
  ];

  const saveUsage = (count) => {
    localStorage.setItem('printready_usage', JSON.stringify({
      count,
      date: new Date().toDateString()
    }));
  };

  const handleFileSelect = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      alert('Please select a valid image file');
      return;
    }

    if (!isPro && usageCount >= 3) {
      alert('You\'ve reached your free limit of 3 designs today. Upgrade to PRO for unlimited access!');
      return;
    }

    setOriginalImage(URL.createObjectURL(file));
    setOriginalFile(file);
    setProcessing(true);

    try {
      const result = await ImageProcessor.processImage(file, true, podSettings);
      setProcessedImage(result.dataUrl);
      setDetectedBg(result.detectedBackground);
      const newCount = usageCount + 1;
      setUsageCount(newCount);
      saveUsage(newCount);
    } catch (error) {
      console.error('Processing error:', error);
      alert('Error processing image. Please try another file.');
    } finally {
      setProcessing(false);
    }
  }, [podSettings, isPro, usageCount]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const reprocessImage = useCallback(async () => {
    if (!originalFile) return;
    
    setProcessing(true);
    try {
      const result = await ImageProcessor.processImage(originalFile, true, podSettings);
      setProcessedImage(result.dataUrl);
    } catch (error) {
      console.error('Reprocessing error:', error);
    } finally {
      setProcessing(false);
    }
  }, [originalFile, podSettings]);

  const downloadImage = useCallback(() => {
    if (!processedImage) return;
    const link = document.createElement('a');
    link.download = `printready-design-${Date.now()}.png`;
    link.href = processedImage;
    link.click();
  }, [processedImage]);

  const resetAll = () => {
    setOriginalImage(null);
    setOriginalFile(null);
    setProcessedImage(null);
    setDetectedBg(null);
    setCompareMode(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700/50 backdrop-blur-sm bg-slate-900/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center">
              <Shirt className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <span className="text-lg sm:text-xl font-bold">PrintReady</span>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="text-slate-400 text-xs sm:text-sm hidden sm:inline">
              {isPro ? '∞ unlimited' : `${3 - usageCount} free left today`}
            </span>
            <button 
              onClick={() => setIsPro(!isPro)}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-medium transition-all text-xs sm:text-sm ${
                isPro 
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white' 
                  : 'bg-violet-600 hover:bg-violet-500 text-white'
              }`}
            >
              {isPro ? '⭐ PRO' : 'Upgrade'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Hero */}
        {!originalImage && (
          <div className="text-center mb-8 sm:mb-12">
            <h1 className="text-2xl sm:text-4xl font-bold mb-3 sm:mb-4 leading-tight">
              POD-Ready Designs in{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">
                Seconds
              </span>
            </h1>
            <p className="text-slate-400 text-sm sm:text-lg max-w-2xl mx-auto px-4">
              Smart background detachment that works on ANY shirt color. 
              See realistic print preview before you upload.
            </p>
            
            {/* Feature badges */}
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mt-6">
              {['Smart Detachment', 'POD Preview', '100% Private'].map((feature, i) => (
                <span key={i} className="px-3 py-1 bg-slate-800/50 rounded-full text-xs sm:text-sm text-slate-300 flex items-center gap-1">
                  <Check className="w-3 h-3 text-green-400" />
                  {feature}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6 sm:gap-8">
          {/* Left Column */}
          <div className="space-y-4 sm:space-y-6">
            {/* Upload Zone */}
            {!originalImage ? (
              <div 
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="bg-slate-800/50 border-2 border-dashed border-slate-600 rounded-2xl p-8 sm:p-12 text-center hover:border-violet-500/50 hover:bg-slate-800/70 transition-all cursor-pointer group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileSelect(e.target.files[0])}
                  className="hidden"
                />
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-violet-600/20 group-hover:scale-110 transition-all">
                  <Upload className="w-7 h-7 sm:w-8 sm:h-8 text-slate-400 group-hover:text-violet-400" />
                </div>
                <p className="text-base sm:text-lg font-medium mb-2">Drop your design here</p>
                <p className="text-slate-500 text-sm mb-4">PNG, JPG, WebP — any size</p>
                <div className="inline-block px-6 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-medium transition-all">
                  Or click to browse
                </div>
              </div>
            ) : (
              /* Original Image Preview */
              <div className="bg-slate-800/30 rounded-2xl p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
                    <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-violet-400" />
                    Original
                    {detectedBg && (
                      <span className="text-xs bg-slate-700 px-2 py-1 rounded-full">
                        {detectedBg} bg
                      </span>
                    )}
                  </h3>
                  <button onClick={resetAll} className="text-slate-400 hover:text-white p-2 hover:bg-slate-700 rounded-lg transition-all">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="relative rounded-xl overflow-hidden transparency-grid">
                  <img src={originalImage} alt="Original" className="w-full h-auto max-h-48 sm:max-h-64 object-contain" />
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full mt-4 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm transition-all"
                >
                  Upload Different Image
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileSelect(e.target.files[0])}
                  className="hidden"
                />
              </div>
            )}

            {/* POD Settings */}
            <div className="bg-slate-800/30 rounded-2xl p-4 sm:p-6">
              <button onClick={() => setShowSettings(!showSettings)} className="w-full flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
                  <Sliders className="w-4 h-4 sm:w-5 sm:h-5 text-violet-400" />
                  Print Simulation
                </h3>
                <ChevronDown className={`w-5 h-5 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
              </button>
              
              {showSettings && (
                <div className="mt-4 space-y-4">
                  {[
                    { key: 'saturationReduction', label: 'Color Saturation', min: 0.5, max: 1 },
                    { key: 'darknessIncrease', label: 'Brightness', min: 0.7, max: 1 },
                    { key: 'contrastReduction', label: 'Contrast', min: 0.7, max: 1 },
                  ].map(({ key, label, min, max }) => (
                    <div key={key}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-400">{label}</span>
                        <span className="text-violet-400 font-mono">{(podSettings[key] * 100).toFixed(0)}%</span>
                      </div>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={0.01}
                        value={podSettings[key]}
                        onChange={(e) => setPodSettings(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                        className="w-full"
                      />
                    </div>
                  ))}
                  <button
                    onClick={reprocessImage}
                    disabled={!originalImage || processing}
                    className="w-full mt-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${processing ? 'animate-spin' : ''}`} />
                    Apply Changes
                  </button>
                </div>
              )}
            </div>

            {/* Processing Indicator */}
            {processing && (
              <div className="bg-violet-600/20 border border-violet-500/30 rounded-2xl p-6 text-center">
                <div className="w-10 h-10 sm:w-12 sm:h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="font-medium">Processing...</p>
                <p className="text-sm text-slate-400">Applying smart detachment</p>
              </div>
            )}

            {/* Download */}
            {processedImage && (
              <div className="bg-slate-800/30 rounded-2xl p-4 sm:p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm sm:text-base">
                  <Download className="w-4 h-4 sm:w-5 sm:h-5 text-violet-400" />
                  Download
                </h3>
                <button
                  onClick={downloadImage}
                  className="w-full px-4 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download PNG (Transparent)
                </button>
                <p className="text-xs text-slate-500 mt-2 text-center">
                  High quality PNG with transparency
                </p>
              </div>
            )}
          </div>

          {/* Right Column - Preview */}
          <div className="space-y-4 sm:space-y-6">
            {/* Shirt Preview */}
            <div 
              className="rounded-2xl p-6 sm:p-8 transition-all duration-500 relative overflow-hidden min-h-[350px] sm:min-h-[400px] flex items-center justify-center"
              style={{ backgroundColor: shirtColors.find(c => c.name === selectedColor)?.bg }}
            >
              {/* T-shirt collar */}
              <div 
                className="absolute top-4 left-1/2 -translate-x-1/2 w-16 sm:w-20 h-5 sm:h-6 border-b-4 rounded-b-full opacity-20"
                style={{ borderColor: shirtColors.find(c => c.name === selectedColor)?.text }}
              />

              {/* Design Preview */}
              <div className="relative w-full max-w-[280px] sm:max-w-xs aspect-square flex items-center justify-center">
                {processedImage ? (
                  <img 
                    src={compareMode ? originalImage : processedImage}
                    alt="Preview"
                    className="max-w-full max-h-full object-contain drop-shadow-2xl transition-all"
                  />
                ) : processing ? (
                  <div className="w-14 h-14 border-4 border-current border-t-transparent rounded-full animate-spin opacity-30"
                    style={{ borderColor: shirtColors.find(c => c.name === selectedColor)?.text }}
                  />
                ) : (
                  <div className="text-center opacity-40">
                    <Shirt className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-2" style={{ color: shirtColors.find(c => c.name === selectedColor)?.text }} />
                    <p className="text-sm" style={{ color: shirtColors.find(c => c.name === selectedColor)?.text }}>
                      Upload to preview
                    </p>
                  </div>
                )}
              </div>

              {/* Badges */}
              {processedImage && (
                <>
                  <div className="absolute top-3 sm:top-4 right-3 sm:right-4 bg-black/40 backdrop-blur-sm px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs flex items-center gap-1.5 text-white">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    {compareMode ? 'Original' : 'POD Preview'}
                  </div>
                  
                  <button
                    onMouseDown={() => setCompareMode(true)}
                    onMouseUp={() => setCompareMode(false)}
                    onMouseLeave={() => setCompareMode(false)}
                    onTouchStart={() => setCompareMode(true)}
                    onTouchEnd={() => setCompareMode(false)}
                    className="absolute bottom-3 sm:bottom-4 right-3 sm:right-4 bg-black/40 backdrop-blur-sm px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs flex items-center gap-1.5 text-white hover:bg-black/60 transition-all"
                  >
                    <Eye className="w-3 h-3" />
                    Hold to compare
                  </button>
                </>
              )}
            </div>

            {/* Color Selector */}
            <div className="bg-slate-800/30 rounded-2xl p-4 sm:p-6">
              <h3 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Preview on Colors</h3>
              <div className="flex gap-2 sm:gap-3 flex-wrap">
                {shirtColors.map(color => (
                  <button
                    key={color.name}
                    onClick={() => setSelectedColor(color.name)}
                    className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl transition-all ${
                      selectedColor === color.name 
                        ? 'ring-2 ring-violet-500 ring-offset-2 ring-offset-slate-900 scale-110' 
                        : 'hover:scale-105'
                    }`}
                    style={{ 
                      backgroundColor: color.bg, 
                      border: color.name === 'white' ? '1px solid #374151' : 'none' 
                    }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>

            {/* How it works */}
            <div className="bg-slate-800/30 rounded-2xl p-4 sm:p-6">
              <h3 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Why PrintReady?</h3>
              <div className="space-y-3">
                {[
                  { icon: '🎨', title: 'Smart Detachment', desc: 'Not a sticker — design blends with fabric' },
                  { icon: '👁️', title: 'True POD Preview', desc: 'See actual print colors before uploading' },
                  { icon: '🔒', title: '100% Private', desc: 'Processed in your browser, nothing uploaded' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-xl">{item.icon}</span>
                    <div>
                      <p className="font-medium text-sm">{item.title}</p>
                      <p className="text-xs text-slate-500">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 mt-12 py-6 text-center text-slate-500 text-xs sm:text-sm">
        <p>PrintReady — POD-ready designs without the guesswork</p>
        <p className="mt-1">100% client-side. Your designs never leave your browser.</p>
      </footer>
    </div>
  );
}
