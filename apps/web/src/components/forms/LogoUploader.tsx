'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, X, Crop, ZoomIn, ZoomOut, Check } from 'lucide-react';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
const ALLOWED_EXT = '.png, .jpg, .jpeg, .svg, .webp';

interface LogoUploaderProps {
  value: string;
  onChange: (url: string) => void;
  onUploaded?: (files: { url: string; name: string; size: number }[]) => void;
}

export default function LogoUploader({ value, onChange, onUploaded }: LogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Crop state
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [rawUrl, setRawUrl] = useState('');
  const [showCrop, setShowCrop] = useState(false);
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(`Invalid file type. Allowed: ${ALLOWED_EXT}`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
      return;
    }

    setRawFile(file);
    const url = URL.createObjectURL(file);
    setRawUrl(url);
    setShowCrop(true);
    setScale(1);
    setOffsetX(0);
    setOffsetY(0);

    // Preload image
    const img = new Image();
    img.onload = () => { imgRef.current = img; drawCropPreview(img, 1, 0, 0); };
    img.src = url;
  }

  const drawCropPreview = useCallback((img: HTMLImageElement, s: number, ox: number, oy: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 200; // square crop area
    canvas.width = size;
    canvas.height = size;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, size, size);

    // Calculate scaled dimensions to fit, then apply user scale + offset
    const aspect = img.width / img.height;
    let drawW: number, drawH: number;
    if (aspect >= 1) {
      drawH = size;
      drawW = size * aspect;
    } else {
      drawW = size;
      drawH = size / aspect;
    }
    drawW *= s;
    drawH *= s;

    const dx = (size - drawW) / 2 + ox;
    const dy = (size - drawH) / 2 + oy;

    ctx.drawImage(img, dx, dy, drawW, drawH);
  }, []);

  useEffect(() => {
    if (imgRef.current && showCrop) {
      drawCropPreview(imgRef.current, scale, offsetX, offsetY);
    }
  }, [scale, offsetX, offsetY, showCrop, drawCropPreview]);

  function handleMouseDown(e: React.MouseEvent) {
    setDragging(true);
    setDragStart({ x: e.clientX - offsetX, y: e.clientY - offsetY });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    setOffsetX(e.clientX - dragStart.x);
    setOffsetY(e.clientY - dragStart.y);
  }

  function handleMouseUp() {
    setDragging(false);
  }

  async function applyCrop() {
    const canvas = canvasRef.current;
    if (!canvas || !rawFile) return;

    setBusy(true);
    setError('');

    try {
      // Convert canvas to blob
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png', 0.9)
      );
      if (!blob) throw new Error('Failed to process image');

      // Upload via ImageKit (same as existing uploader)
      const publicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
      const endpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;

      if (publicKey && endpoint) {
        const body = new FormData();
        body.append('file', blob, rawFile.name);
        body.append('fileName', rawFile.name);
        body.append('folder', 'trescrm/logos');
        body.append('publicKey', publicKey);
        const resp = await fetch(`${endpoint}/upload`, { method: 'POST', body });
        const data = await resp.json();
        if (data.url) {
          onChange(data.url);
          onUploaded?.([{ url: data.url, name: data.name, size: blob.size }]);
        } else {
          throw new Error('Upload failed');
        }
      } else {
        // No ImageKit configured — use data URL as fallback (dev mode)
        const dataUrl = canvas.toDataURL('image/png', 0.9);
        onChange(dataUrl);
      }

      setShowCrop(false);
      if (rawUrl) URL.revokeObjectURL(rawUrl);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    onChange('');
    setRawFile(null);
    setShowCrop(false);
    setScale(1);
    setOffsetX(0);
    setOffsetY(0);
    if (rawUrl) URL.revokeObjectURL(rawUrl);
    setRawUrl('');
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Logo <span className="text-gray-400 font-normal">(optional)</span></label>
        {value && (
          <button type="button" onClick={clear} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
            <X size={12} /> Remove
          </button>
        )}
      </div>

      {/* Crop modal */}
      {showCrop && (
        <div className="rounded-xl border bg-white p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-600 flex items-center gap-1.5"><Crop size={14} /> Crop & position your logo</p>
            <p className="text-xs text-gray-400">Drag to reposition</p>
          </div>

          {/* Canvas crop area */}
          <div className="flex justify-center">
            <div
              className="relative border-2 border-dashed border-gray-300 rounded-lg overflow-hidden cursor-move"
              style={{ width: 200, height: 200 }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <canvas ref={canvasRef} className="w-full h-full" />
              <div className="absolute inset-0 pointer-events-none border-2 border-[#1a73e8]/30 rounded-lg" />
            </div>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
              aria-label="Zoom out"
            >
              <ZoomOut size={16} />
            </button>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.05}
              value={scale}
              onChange={e => setScale(parseFloat(e.target.value))}
              className="w-32 accent-[#1a73e8]"
              aria-label="Zoom level"
            />
            <button
              type="button"
              onClick={() => setScale(s => Math.min(3, s + 0.1))}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
              aria-label="Zoom in"
            >
              <ZoomIn size={16} />
            </button>
            <span className="text-xs text-gray-400 w-10 text-right">{Math.round(scale * 100)}%</span>
          </div>

          {/* Apply / Cancel */}
          <div className="flex items-center gap-2 justify-end">
            <button type="button" onClick={() => { setShowCrop(false); if (rawUrl) URL.revokeObjectURL(rawUrl); }} className="px-3 py-1.5 text-sm rounded-md border hover:bg-gray-50 min-h-[36px]">
              Cancel
            </button>
            <button type="button" onClick={applyCrop} disabled={busy} className="px-3 py-1.5 text-sm rounded-md bg-[#1a73e8] text-white hover:bg-[#1557b0] min-h-[36px] flex items-center gap-1.5 disabled:opacity-50">
              {busy ? 'Processing...' : <><Check size={14} /> Apply</>}
            </button>
          </div>
        </div>
      )}

      {/* Current logo preview */}
      {!showCrop && value && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border">
          <img src={value} alt="Logo preview" className="h-12 w-12 rounded-md object-contain border bg-white" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-600 truncate">{rawFile?.name || 'Uploaded logo'}</p>
            <p className="text-xs text-gray-400">{rawFile ? `${(rawFile.size / 1024).toFixed(0)} KB` : 'Ready'}</p>
          </div>
          <button type="button" onClick={() => inputRef.current?.click()} className="text-xs text-[#1a73e8] hover:underline">
            Change
          </button>
        </div>
      )}

      {/* Upload button (shown when no logo or not cropping) */}
      {!showCrop && !value && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 hover:border-[#1a73e8]/40 hover:bg-[#e8f0fe]/30 text-sm text-gray-500 hover:text-gray-700 transition-colors min-h-[48px]"
        >
          <Upload size={16} />
          Choose logo image
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={ALLOWED_TYPES.join(',')}
        onChange={handleSelect}
      />

      {/* Validation info */}
      {!error && !value && !showCrop && (
        <p className="text-xs text-gray-400">PNG, JPG, SVG, or WebP. Max 2MB.</p>
      )}
      {error && (
        <p className="text-xs text-red-500" role="alert">{error}</p>
      )}
    </div>
  );
}
