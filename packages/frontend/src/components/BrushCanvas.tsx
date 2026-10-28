import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Photo, Stroke, normalizePoint, denormalizePoint } from '@shotpik/shared';
import {
  Undo,
  Trash2,
  X,
  Check,
  Paintbrush,
  Loader2
} from 'lucide-react';

export interface BrushCanvasProps {
  isOpen: boolean;
  onClose: () => void;
  photo: Photo | null;
  initialStrokes?: Stroke[];
  onSave: (photoId: string, strokes: Stroke[]) => Promise<void> | void;
  isSaving?: boolean;
}

const COLOR_SWATCHES = [
  '#ef4444', // Red
  '#eab308', // Yellow
  '#22c55e', // Green
  '#3b82f6', // Blue
];

const BRUSH_WIDTHS = [
  { label: 'Mảnh', value: 2 },
  { label: 'Vừa', value: 4 },
  { label: 'Đậm', value: 8 },
];

export const BrushCanvas: React.FC<BrushCanvasProps> = ({
  isOpen,
  onClose,
  photo,
  initialStrokes = [],
  onSave,
  isSaving = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [currentColor, setCurrentColor] = useState<string>(COLOR_SWATCHES[0]);
  const [currentWidth, setCurrentWidth] = useState<number>(4);
  const [isDrawing, setIsDrawing] = useState(false);

  // Exact bounding box of the rendered image within container
  const [canvasRect, setCanvasRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>({ left: 0, top: 0, width: 0, height: 0 });

  // Initialize strokes when modal opens or photo changes
  useEffect(() => {
    if (isOpen) {
      setStrokes(initialStrokes || []);
      setCurrentStroke(null);
    }
  }, [isOpen, photo, initialStrokes]);

  // Measure and align canvas strictly over fitted image
  const updateCanvasLayout = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img || !img.complete || img.naturalWidth === 0) return;

    const cRect = container.getBoundingClientRect();
    const iRect = img.getBoundingClientRect();

    const width = Math.max(1, Math.round(iRect.width));
    const height = Math.max(1, Math.round(iRect.height));
    const left = Math.round(iRect.left - cRect.left);
    const top = Math.round(iRect.top - cRect.top);

    setCanvasRect({ left, top, width, height });

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }
  }, []);

  // Redraw strokes onto canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;

    for (const stroke of allStrokes) {
      if (!stroke.points || stroke.points.length === 0) continue;

      ctx.beginPath();
      ctx.strokeStyle = stroke.color || '#ef4444';
      ctx.lineWidth = stroke.width || 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const firstPt = denormalizePoint(stroke.points[0], canvas.width, canvas.height);
      ctx.moveTo(firstPt.x, firstPt.y);

      if (stroke.points.length === 1) {
        ctx.lineTo(firstPt.x + 0.5, firstPt.y + 0.5);
      } else {
        for (let i = 1; i < stroke.points.length; i++) {
          const pt = denormalizePoint(stroke.points[i], canvas.width, canvas.height);
          ctx.lineTo(pt.x, pt.y);
        }
      }
      ctx.stroke();
    }
  }, [strokes, currentStroke]);

  // Trigger redraw whenever layout or strokes change
  useEffect(() => {
    redraw();
  }, [redraw, canvasRect]);

  // ResizeObserver on container to recalculate dimensions on resize
  useEffect(() => {
    if (!isOpen) return;

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      updateCanvasLayout();
    });

    observer.observe(container);

    window.addEventListener('resize', updateCanvasLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateCanvasLayout);
    };
  }, [isOpen, updateCanvasLayout]);

  if (!isOpen || !photo) {
    return null;
  }

  // Pointer stroke handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const normalizedPt = normalizePoint(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height
    );

    const newStroke: Stroke = {
      points: [normalizedPt],
      color: currentColor,
      width: currentWidth,
    };

    setIsDrawing(true);
    setCurrentStroke(newStroke);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentStroke) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const normalizedPt = normalizePoint(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height
    );

    setCurrentStroke((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        points: [...prev.points, normalizedPt],
      };
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentStroke) return;
    setIsDrawing(false);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture was already released
    }

    if (currentStroke.points.length > 0) {
      setStrokes((prev) => [...prev, currentStroke]);
    }
    setCurrentStroke(null);
  };

  const handleUndo = () => {
    setStrokes((prev) => prev.slice(0, -1));
  };

  const handleClearAll = () => {
    setStrokes([]);
    setCurrentStroke(null);
  };

  const handleSave = async () => {
    await onSave(photo.id, strokes);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950 select-none animate-fade-in">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800 z-20">
        <div className="flex items-center gap-2">
          <Paintbrush className="w-4 h-4 text-rose-500" />
          <span className="font-semibold text-xs sm:text-sm text-zinc-100 truncate max-w-[200px] sm:max-w-md">
            Vẽ khoanh vùng: {photo.fileName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
            <span>Huỷ</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-950/40 transition-all cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            <span>Lưu khoanh vùng</span>
          </button>
        </div>
      </div>

      {/* Main Drawing Viewport */}
      <div
        ref={containerRef}
        className="relative flex-1 w-full h-full flex items-center justify-center p-4 overflow-hidden touch-none"
      >
        <img
          ref={imgRef}
          src={photo.fullUrl || photo.thumbUrl}
          alt={photo.fileName}
          onLoad={updateCanvasLayout}
          className="max-w-full max-h-full object-contain pointer-events-none select-none rounded shadow-2xl"
          draggable={false}
        />

        {canvasRect.width > 0 && canvasRect.height > 0 && (
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              left: `${canvasRect.left}px`,
              top: `${canvasRect.top}px`,
              width: `${canvasRect.width}px`,
              height: `${canvasRect.height}px`,
              touchAction: 'none',
              cursor: 'crosshair',
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        )}
      </div>

      {/* Bottom Floating Control Bar */}
      <div className="p-3 bg-zinc-900 border-t border-zinc-800 flex flex-wrap items-center justify-center gap-3 sm:gap-6 z-20">
        {/* Colors */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-400 font-medium hidden sm:inline">Màu vẽ:</span>
          <div className="flex items-center gap-1.5">
            {COLOR_SWATCHES.map((color) => {
              const isSelected = currentColor === color;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setCurrentColor(color)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform ${
                    isSelected
                      ? 'ring-2 ring-offset-2 ring-offset-zinc-900 ring-white scale-110'
                      : 'hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`Màu ${color}`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 text-white drop-shadow" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Brush widths */}
        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
          {BRUSH_WIDTHS.map((width) => (
            <button
              key={width.value}
              type="button"
              onClick={() => setCurrentWidth(width.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                currentWidth === width.value
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {width.label}
            </button>
          ))}
        </div>

        {/* Action Controls: Undo & Clear */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleUndo}
            disabled={strokes.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-xs text-zinc-300 transition-colors"
            title="Hoàn tác nét vẽ trước"
          >
            <Undo className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Hoàn tác</span>
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={strokes.length === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-rose-950/40 hover:text-rose-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs text-zinc-300 transition-colors"
            title="Xoá tất cả nét vẽ"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Xoá hết</span>
          </button>
        </div>
      </div>
    </div>
  );
};
