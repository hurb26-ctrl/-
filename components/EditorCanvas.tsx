
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SlideData, Rect, Point, HandleType, TextOverlay } from '../types';
import { COLORS, HANDLE_SIZE, MIN_RECT_SIZE, ZOOM_STEP, MAX_ZOOM, MIN_ZOOM, PAN_STEP } from '../constants';

interface EditorCanvasProps {
  slide: SlideData;
  selectedOverlayId: string | null;
  onSelectionChange: (rect: Rect | null) => void;
  onOverlaySelect: (id: string | null) => void;
  onUpdateOverlays: (overlays: TextOverlay[]) => void;
}

const EditorCanvas: React.FC<EditorCanvasProps> = ({ 
  slide, 
  selectedOverlayId,
  onSelectionChange, 
  onOverlaySelect,
  onUpdateOverlays 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [selection, setSelection] = useState<Rect | null>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [isResizingSelection, setIsResizingSelection] = useState(false);
  const [isDraggingOverlay, setIsDraggingOverlay] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  
  const [dragType, setDragType] = useState<'move' | HandleType | null>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  const [isSpacePressed, setIsSpacePressed] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.code === 'Space') {
        if (isInput) return;
        setIsSpacePressed(e.type === 'keydown');
        if (e.type === 'keydown') e.preventDefault();
        return;
      }

      if (e.type === 'keydown' && !isInput) {
        if (e.code === 'ArrowUp') {
          setOffset(prev => ({ ...prev, y: prev.y + PAN_STEP }));
          e.preventDefault();
        } else if (e.code === 'ArrowDown') {
          setOffset(prev => ({ ...prev, y: prev.y - PAN_STEP }));
          e.preventDefault();
        } else if (e.code === 'ArrowLeft') {
          setOffset(prev => ({ ...prev, x: prev.x + PAN_STEP }));
          e.preventDefault();
        } else if (e.code === 'ArrowRight') {
          setOffset(prev => ({ ...prev, x: prev.x - PAN_STEP }));
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKey);
    };
  }, []);

  useEffect(() => {
    const img = new Image();
    img.src = slide.dataUrl;
    img.onload = () => {
      setImage(img);
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        const scale = Math.min(
          (clientWidth - 80) / img.width,
          (clientHeight - 80) / img.height
        );
        setZoom(scale);
        setOffset({
          x: (clientWidth - img.width * scale) / 2,
          y: (clientHeight - img.height * scale) / 2
        });
      }
    };
  }, [slide.dataUrl]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelNative = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = -e.deltaY;
        const factor = delta > 0 ? (1 + ZOOM_STEP) : (1 - ZOOM_STEP);
        setZoom(prevZoom => {
          const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom * factor));
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return prevZoom;
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          setOffset(prevOffset => {
            const wx = (mouseX - prevOffset.x) / prevZoom;
            const wy = (mouseY - prevOffset.y) / prevZoom;
            return { x: mouseX - wx * newZoom, y: mouseY - wy * newZoom };
          });
          return newZoom;
        });
      } else if (!isSpacePressed) {
        setOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }
    };

    container.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => container.removeEventListener('wheel', handleWheelNative);
  }, [zoom, isSpacePressed]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !image) return;

    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    ctx.drawImage(image, 0, 0);

    slide.overlays.forEach(overlay => {
      ctx.fillStyle = overlay.backgroundColor;
      ctx.fillRect(overlay.rect.x, overlay.rect.y, overlay.rect.width, overlay.rect.height);
      
      if (overlay.id === selectedOverlayId) {
        ctx.strokeStyle = COLORS.primary;
        ctx.lineWidth = 2 / zoom;
        ctx.strokeRect(overlay.rect.x, overlay.rect.y, overlay.rect.width, overlay.rect.height);
      }

      ctx.fillStyle = overlay.fontColor;
      ctx.font = `${overlay.fontWeight} ${overlay.fontSize}px ${overlay.fontFamily}, sans-serif`;
      // Apply letter spacing
      if (ctx.letterSpacing !== undefined) {
        ctx.letterSpacing = `${overlay.letterSpacing || 0}px`;
      }
      
      const lines = overlay.newText.split('\n');
      const lineHeight = overlay.fontSize * 1.2;
      const totalTextHeight = lines.length * lineHeight;

      ctx.textAlign = (overlay.hAlign || 'left') as CanvasTextAlign;
      ctx.textBaseline = 'top';

      let tx = overlay.rect.x;
      if (overlay.hAlign === 'center') tx = overlay.rect.x + overlay.rect.width / 2;
      else if (overlay.hAlign === 'right') tx = overlay.rect.x + overlay.rect.width;

      let ty = overlay.rect.y;
      if (overlay.vAlign === 'middle') ty = overlay.rect.y + (overlay.rect.height - totalTextHeight) / 2;
      else if (overlay.vAlign === 'bottom') ty = overlay.rect.y + overlay.rect.height - totalTextHeight;

      lines.forEach((line, index) => {
        ctx.fillText(line, tx, ty + index * lineHeight);
      });
      
      // Reset letter spacing
      if (ctx.letterSpacing !== undefined) {
        ctx.letterSpacing = '0px';
      }
    });

    if (selection) {
      ctx.strokeStyle = COLORS.primary;
      ctx.lineWidth = 2 / zoom;
      ctx.strokeRect(selection.x, selection.y, selection.width, selection.height);
      ctx.fillStyle = COLORS.overlay;
      ctx.fillRect(selection.x, selection.y, selection.width, selection.height);

      const handles: Point[] = [
        { x: selection.x, y: selection.y },
        { x: selection.x + selection.width / 2, y: selection.y },
        { x: selection.x + selection.width, y: selection.y },
        { x: selection.x + selection.width, y: selection.y + selection.height / 2 },
        { x: selection.x + selection.width, y: selection.y + selection.height },
        { x: selection.x + selection.width / 2, y: selection.y + selection.height },
        { x: selection.x, y: selection.y + selection.height },
        { x: selection.x, y: selection.y + selection.height / 2 },
      ];

      ctx.fillStyle = COLORS.handle;
      handles.forEach(h => {
        ctx.fillRect(h.x - (HANDLE_SIZE / 2) / zoom, h.y - (HANDLE_SIZE / 2) / zoom, HANDLE_SIZE / zoom, HANDLE_SIZE / zoom);
      });
    }

    ctx.restore();
  }, [image, slide.overlays, selection, zoom, offset, selectedOverlayId]);

  useEffect(() => {
    draw();
  }, [draw]);

  const getCanvasCoords = (e: React.MouseEvent | any): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - offset.x) / zoom,
      y: (e.clientY - rect.top - offset.y) / zoom
    };
  };

  const getScreenCoords = (e: React.MouseEvent | any): Point => ({ x: e.clientX, y: e.clientY });

  const isPointInRect = (p: Point, rect: Rect) => {
    return p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
  };

  const getHandleAt = (p: Point, rect: Rect): HandleType | null => {
    const tolerance = HANDLE_SIZE / zoom;
    const hx = [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
    const hy = [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
    const types: (HandleType | null)[][] = [
      ['nw', 'n', 'ne'],
      ['w', null, 'e'],
      ['sw', 's', 'se']
    ];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const type = types[i][j];
        if (type && Math.abs(p.x - hx[j]) < tolerance && Math.abs(p.y - hy[i]) < tolerance) return type;
      }
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isSpacePressed || e.button === 1) {
      setIsPanning(true);
      setStartPoint(getScreenCoords(e));
      return;
    }

    const p = getCanvasCoords(e);
    
    if (selection) {
      const handle = getHandleAt(p, selection);
      if (handle) {
        setIsResizingSelection(true);
        setDragType(handle);
        setStartPoint(p);
        return;
      }
    }

    const clickedOverlay = [...slide.overlays].reverse().find(o => isPointInRect(p, o.rect));
    if (clickedOverlay) {
      onOverlaySelect(clickedOverlay.id);
      setIsDraggingOverlay(true);
      setStartPoint(p);
      setSelection(null);
      onSelectionChange(null);
      return;
    }

    onOverlaySelect(null);
    setIsDrawing(true);
    const newSelection = { x: p.x, y: p.y, width: 0, height: 0 };
    setSelection(newSelection);
    setStartPoint(p);
    onSelectionChange(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const screenP = getScreenCoords(e);
    const canvasP = getCanvasCoords(e);
    
    if (canvasRef.current) {
      if (isSpacePressed || isPanning) canvasRef.current.style.cursor = isPanning ? 'grabbing' : 'grab';
      else if (isDraggingOverlay) canvasRef.current.style.cursor = 'grabbing';
      else if (isResizingSelection) canvasRef.current.style.cursor = 'nwse-resize';
      else if (slide.overlays.some(o => isPointInRect(canvasP, o.rect))) canvasRef.current.style.cursor = 'pointer';
      else if (selection && getHandleAt(canvasP, selection)) canvasRef.current.style.cursor = 'crosshair';
      else canvasRef.current.style.cursor = 'default';
    }

    if (isPanning && startPoint) {
      const dx = screenP.x - startPoint.x;
      const dy = screenP.y - startPoint.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setStartPoint(screenP);
      return;
    }

    if (isDrawing && startPoint) {
      const x = Math.min(canvasP.x, startPoint.x);
      const y = Math.min(canvasP.y, startPoint.y);
      const width = Math.abs(canvasP.x - startPoint.x);
      const height = Math.abs(canvasP.y - startPoint.y);
      setSelection({ x, y, width, height });
    } else if (isResizingSelection && selection && startPoint && dragType) {
      const dx = canvasP.x - startPoint.x;
      const dy = canvasP.y - startPoint.y;
      let newRect = { ...selection };
      if (dragType.includes('e')) newRect.width += dx;
      if (dragType.includes('w')) { newRect.x += dx; newRect.width -= dx; }
      if (dragType.includes('s')) newRect.height += dy;
      if (dragType.includes('n')) { newRect.y += dy; newRect.height -= dy; }
      setSelection(newRect);
      setStartPoint(canvasP);
    } else if (isDraggingOverlay && selectedOverlayId && startPoint) {
      const dx = canvasP.x - startPoint.x;
      const dy = canvasP.y - startPoint.y;
      const newOverlays = slide.overlays.map(ov => ov.id === selectedOverlayId ? { ...ov, rect: { ...ov.rect, x: ov.rect.x + dx, y: ov.rect.y + dy } } : ov);
      onUpdateOverlays(newOverlays);
      setStartPoint(canvasP);
    }
  };

  const handleMouseUp = () => {
    if (isDrawing || isResizingSelection) {
      if (selection && (selection.width < MIN_RECT_SIZE || selection.height < MIN_RECT_SIZE)) {
        setSelection(null);
        onSelectionChange(null);
      } else {
        onSelectionChange(selection);
      }
    }
    setIsDrawing(false);
    setIsDraggingOverlay(false);
    setIsResizingSelection(false);
    setIsPanning(false);
    setStartPoint(null);
  };

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden bg-[#0f172a] flex items-center justify-center select-none">
      <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onContextMenu={(e) => e.preventDefault()} className="block w-full h-full" />
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-800/90 px-5 py-2.5 rounded-full text-xs font-medium text-slate-200 border border-slate-700 shadow-2xl pointer-events-none flex items-center gap-5 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="bg-slate-700 px-1.5 py-0.5 rounded text-[10px] text-blue-400 font-bold">Space + Drag / Arrows</span>
          <span>이미지 이동</span>
        </div>
        <div className="w-px h-3 bg-slate-600"></div>
        <div className="flex items-center gap-2">
          <span className="bg-slate-700 px-1.5 py-0.5 rounded text-[10px] text-blue-400 font-bold">Drag Selection</span>
          <span>영역 선택</span>
        </div>
      </div>
    </div>
  );
};

export default EditorCanvas;
