
import React, { useState, useEffect, useCallback } from 'react';
import { Rect, SlideData, TextOverlay, OCRResult, VerticalAlign, HorizontalAlign } from '../types';
import { analyzeTextInImage } from '../services/geminiService';
import { 
  Loader2, 
  Type as TypeIcon, 
  Info, 
  CheckCircle2, 
  Sliders, 
  Palette, 
  Bold, 
  Sparkles,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  MoveHorizontal
} from 'lucide-react';

interface SidebarProps {
  activeSlide: SlideData | undefined;
  selection: Rect | null;
  selectedOverlayId: string | null;
  onApplyOverlay: (overlay: TextOverlay) => void;
  onUpdateOverlays: (overlays: TextOverlay[]) => void;
}

const FONTS = [
  { name: 'Inter', value: 'Inter' },
  { name: 'Arial', value: 'Arial' },
  { name: 'Roboto', value: 'Roboto' },
  { name: 'Times New Roman', value: 'serif' },
  { name: 'Courier New', value: 'monospace' },
];

const Sidebar: React.FC<SidebarProps> = ({ 
  activeSlide, 
  selection, 
  selectedOverlayId,
  onApplyOverlay,
  onUpdateOverlays
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  
  const [replacementText, setReplacementText] = useState('');
  const [fontSize, setFontSize] = useState(16);
  const [fontWeight, setFontWeight] = useState('normal');
  const [fontColor, setFontColor] = useState('#000000');
  const [fontFamily, setFontFamily] = useState('Inter');
  const [vAlign, setVAlign] = useState<VerticalAlign>('top');
  const [hAlign, setHAlign] = useState<HorizontalAlign>('left');
  const [letterSpacing, setLetterSpacing] = useState(0);

  // 배경 관련 상태
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [isTransparent, setIsTransparent] = useState(false);

  const selectedOverlay = activeSlide?.overlays.find(o => o.id === selectedOverlayId);

  useEffect(() => {
    if (!selection && !selectedOverlayId) {
      setOcrResult(null);
      setReplacementText('');
      setBackgroundColor('#ffffff');
      setIsTransparent(false);
    }
  }, [selection, selectedOverlayId]);

  useEffect(() => {
    if (selectedOverlay) {
      setReplacementText(selectedOverlay.newText);
      setFontSize(selectedOverlay.fontSize);
      setFontWeight(selectedOverlay.fontWeight);
      setFontColor(selectedOverlay.fontColor);
      setFontFamily(selectedOverlay.fontFamily);
      setVAlign(selectedOverlay.vAlign || 'top');
      setHAlign(selectedOverlay.hAlign || 'left');
      setLetterSpacing(selectedOverlay.letterSpacing || 0);
      
      const bg = selectedOverlay.backgroundColor;
      if (bg === 'rgba(0,0,0,0)' || bg === 'transparent') {
        setIsTransparent(true);
        setBackgroundColor('#ffffff');
      } else {
        setIsTransparent(false);
        setBackgroundColor(bg || '#ffffff');
      }
    }
  }, [selectedOverlayId]);

  // 로컬 캔버스에서 주변 배경색 추출 (Mode 알고리즘 사용)
  const detectBackgroundColor = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number): string => {
    try {
      const data = ctx.getImageData(0, 0, width, height).data;
      const colorCounts: { [key: string]: { count: number, r: number, g: number, b: number } } = {};
      
      const addPixel = (x: number, y: number) => {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];
        const a = data[i+3];

        // 투명하거나 반투명한 픽셀 무시 (검정색으로 오인 방지)
        if (a < 50) return;

        // 색상 양자화 (Quantization) - 노이즈 제거 및 유사 색상 그룹화
        const bucket = 10; // 버킷 크기 줄임 (더 정밀하게)
        const key = `${Math.round(r / bucket)},${Math.round(g / bucket)},${Math.round(b / bucket)}`;

        if (!colorCounts[key]) {
          colorCounts[key] = { count: 0, r: 0, g: 0, b: 0 };
        }
        colorCounts[key].count++;
        colorCounts[key].r += r;
        colorCounts[key].g += g;
        colorCounts[key].b += b;
      };

      // 테두리 픽셀 샘플링 (깊이 5px - padding 영역을 커버)
      const depth = 5; 

      // 상하 테두리
      for (let x = 0; x < width; x++) {
        for (let y = 0; y < Math.min(depth, height); y++) addPixel(x, y);
        for (let y = Math.max(0, height - depth); y < height; y++) addPixel(x, y);
      }
      
      // 좌우 테두리
      for (let y = depth; y < height - depth; y++) {
        for (let x = 0; x < Math.min(depth, width); x++) addPixel(x, y);
        for (let x = Math.max(0, width - depth); x < width; x++) addPixel(x, y);
      }

      let maxCount = 0;
      let dominantColor = null;

      for (const key in colorCounts) {
        if (colorCounts[key].count > maxCount) {
          maxCount = colorCounts[key].count;
          dominantColor = {
            r: Math.round(colorCounts[key].r / maxCount),
            g: Math.round(colorCounts[key].g / maxCount),
            b: Math.round(colorCounts[key].b / maxCount)
          };
        }
      }

      // 유효한 색상이 없으면(모두 투명) 흰색 반환
      if (!dominantColor) return '#ffffff';

      const toHex = (c: number) => {
        const hex = c.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      };

      return `#${toHex(dominantColor.r)}${toHex(dominantColor.g)}${toHex(dominantColor.b)}`;
    } catch (e) {
      console.error("Color detection failed", e);
      return '#ffffff';
    }
  }, []);

  // 공통 이미지 크롭 및 캔버스 생성 함수 (Padding 옵션 추가)
  const getCroppedCanvas = async (usePadding = false) => {
    if (!selection || !activeSlide) return null;

    const padding = usePadding ? 10 : 0;
    
    // 이미지 범위 내로 좌표 제한 (Math.floor/ceil로 정수 좌표 보장)
    const startX = Math.max(0, Math.floor(selection.x - padding));
    const startY = Math.max(0, Math.floor(selection.y - padding));
    const endX = Math.min(activeSlide.width, Math.ceil(selection.x + selection.width + padding));
    const endY = Math.min(activeSlide.height, Math.ceil(selection.y + selection.height + padding));
    
    const width = endX - startX;
    const height = endY - startY;

    if (width <= 0 || height <= 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const img = new Image();
    img.src = activeSlide.dataUrl;
    await new Promise(resolve => img.onload = resolve);

    ctx.drawImage(img, startX, startY, width, height, 0, 0, width, height);
    return { canvas, ctx, width, height };
  };

  // 선택 영역이 변경될 때마다 배경색 자동 감지
  useEffect(() => {
    if (selection && activeSlide && !selectedOverlayId) {
      const detect = async () => {
        try {
          // 배경색 감지 시에는 Padding을 사용하여 주변부를 샘플링
          const result = await getCroppedCanvas(true);
          if (!result) return;
          
          const detectedBg = detectBackgroundColor(result.ctx, result.width, result.height);
          setBackgroundColor(detectedBg);
          setIsTransparent(false); 
        } catch (e) {
          console.error(e);
        }
      };
      detect();
    }
  }, [selection, activeSlide, selectedOverlayId, detectBackgroundColor]);

  const handleAnalyze = async () => {
    if (!selection || !activeSlide) return;
    setIsAnalyzing(true);
    try {
      // 1. 배경색 재확인 (Padding 포함)
      const bgResult = await getCroppedCanvas(true);
      if (bgResult) {
        const detectedBg = detectBackgroundColor(bgResult.ctx, bgResult.width, bgResult.height);
        setBackgroundColor(detectedBg);
        setIsTransparent(false);
      }

      // 2. OCR 분석용 (Padding 없이 정확한 텍스트 영역)
      const ocrResultCanvas = await getCroppedCanvas(false);
      if (!ocrResultCanvas) return;

      const cropDataUrl = ocrResultCanvas.canvas.toDataURL('image/png');
      const result = await analyzeTextInImage(cropDataUrl);
      
      setOcrResult(result);
      setReplacementText(result.text);
      setFontSize(result.fontSize);
      setFontWeight(result.fontWeight);
      setFontColor(result.fontColor);
      setFontFamily(result.fontFamily);
      
      setVAlign('middle');
      setHAlign('center');
      setLetterSpacing(0);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateSelectedOverlay = (updates: Partial<TextOverlay>) => {
    if (!selectedOverlayId || !activeSlide) return;
    const newOverlays = activeSlide.overlays.map(ov => 
      ov.id === selectedOverlayId ? { ...ov, ...updates } : ov
    );
    onUpdateOverlays(newOverlays);
  };

  const handleApply = () => {
    if (!selection) return;
    onApplyOverlay({
      id: Math.random().toString(36).substr(2, 9),
      rect: { ...selection },
      originalText: ocrResult?.text || '',
      newText: replacementText,
      fontSize,
      fontWeight,
      fontColor,
      fontFamily,
      backgroundColor: isTransparent ? 'rgba(0,0,0,0)' : backgroundColor,
      vAlign,
      hAlign,
      letterSpacing
    });
  };

  const isEditing = !!selectedOverlayId;

  return (
    <div className="w-80 h-full bg-[#1e293b] border-l border-slate-700 flex flex-col p-6 overflow-y-auto">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <TypeIcon size={16} className="text-blue-400" />
          {isEditing ? '텍스트 수정' : '텍스트 교체'}
        </h2>
      </div>

      {!selection && !isEditing ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400">
          <div className="w-16 h-16 rounded-xl bg-slate-800 flex items-center justify-center mb-4 border border-slate-700">
            <Info size={32} className="opacity-50" />
          </div>
          <p className="text-sm">텍스트 교체 영역을 선택하거나<br/>교체된 텍스트를 클릭하세요</p>
        </div>
      ) : (
        <div className="space-y-6">
          {!isEditing && (
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">AI 텍스트 분석</h3>
              {isAnalyzing ? (
                <div className="flex items-center gap-3 py-4 text-blue-400">
                  <Loader2 className="animate-spin" size={18} />
                  <span className="text-sm">분석 중...</span>
                </div>
              ) : ocrResult ? (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-900 rounded text-sm text-slate-300 italic border border-slate-800">"{ocrResult.text}"</div>
                </div>
              ) : (
                <button 
                  onClick={handleAnalyze} 
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
                >
                  <Sparkles size={14} className="text-blue-400" /> AI 분석 (OCR) 실행
                </button>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">내용</label>
              <textarea 
                value={replacementText} 
                onChange={(e) => {
                  setReplacementText(e.target.value);
                  if (isEditing) updateSelectedOverlay({ newText: e.target.value });
                }} 
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm h-24 resize-none focus:outline-none focus:border-blue-500 text-slate-200" 
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">수평 정렬</label>
                <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
                  <button onClick={() => { setHAlign('left'); if (isEditing) updateSelectedOverlay({ hAlign: 'left' }); }} className={`flex-1 p-1.5 rounded flex justify-center ${hAlign === 'left' ? 'bg-slate-700 text-blue-400' : 'text-slate-500'}`}><AlignLeft size={16} /></button>
                  <button onClick={() => { setHAlign('center'); if (isEditing) updateSelectedOverlay({ hAlign: 'center' }); }} className={`flex-1 p-1.5 rounded flex justify-center ${hAlign === 'center' ? 'bg-slate-700 text-blue-400' : 'text-slate-500'}`}><AlignCenter size={16} /></button>
                  <button onClick={() => { setHAlign('right'); if (isEditing) updateSelectedOverlay({ hAlign: 'right' }); }} className={`flex-1 p-1.5 rounded flex justify-center ${hAlign === 'right' ? 'bg-slate-700 text-blue-400' : 'text-slate-500'}`}><AlignRight size={16} /></button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">수직 정렬</label>
                <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
                  <button onClick={() => { setVAlign('top'); if (isEditing) updateSelectedOverlay({ vAlign: 'top' }); }} className={`flex-1 p-1.5 rounded flex justify-center ${vAlign === 'top' ? 'bg-slate-700 text-blue-400' : 'text-slate-500'}`} title="위쪽"><AlignVerticalJustifyStart size={16} /></button>
                  <button onClick={() => { setVAlign('middle'); if (isEditing) updateSelectedOverlay({ vAlign: 'middle' }); }} className={`flex-1 p-1.5 rounded flex justify-center ${vAlign === 'middle' ? 'bg-slate-700 text-blue-400' : 'text-slate-500'}`} title="가운데"><AlignVerticalJustifyCenter size={16} /></button>
                  <button onClick={() => { setVAlign('bottom'); if (isEditing) updateSelectedOverlay({ vAlign: 'bottom' }); }} className={`flex-1 p-1.5 rounded flex justify-center ${vAlign === 'bottom' ? 'bg-slate-700 text-blue-400' : 'text-slate-500'}`} title="아래쪽"><AlignVerticalJustifyEnd size={16} /></button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">글꼴</label>
              <select 
                value={fontFamily}
                onChange={(e) => {
                  setFontFamily(e.target.value);
                  if (isEditing) updateSelectedOverlay({ fontFamily: e.target.value });
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              >
                {FONTS.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">크기</label>
                <input 
                  type="number" 
                  value={fontSize} 
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setFontSize(val);
                    if (isEditing) updateSelectedOverlay({ fontSize: val });
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" 
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">글자 색상</label>
                <div className="flex gap-2 items-center bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
                  <input 
                    type="color" 
                    value={fontColor} 
                    onChange={(e) => {
                      setFontColor(e.target.value);
                      if (isEditing) updateSelectedOverlay({ fontColor: e.target.value });
                    }}
                    className="w-8 h-8 bg-transparent cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-slate-400 uppercase">{fontColor}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
               <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">배경 색상 (Background)</label>
               <div className="flex items-center justify-between bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
                 <div className="flex items-center gap-3">
                   <div className="relative flex items-center">
                     <input 
                       type="color" 
                       value={backgroundColor}
                       disabled={isTransparent}
                       onChange={(e) => {
                         setBackgroundColor(e.target.value);
                         if (isEditing) updateSelectedOverlay({ backgroundColor: e.target.value });
                       }}
                       className={`w-6 h-6 bg-transparent border-none p-0 cursor-pointer ${isTransparent ? 'opacity-20 cursor-not-allowed' : ''}`}
                     />
                     {isTransparent && <div className="absolute inset-0 bg-slate-900/50 pointer-events-none" />}
                   </div>
                   <span className={`text-xs font-mono uppercase ${isTransparent ? 'text-slate-600' : 'text-slate-300'}`}>
                     {backgroundColor}
                   </span>
                 </div>
                 
                 <label className="flex items-center gap-2 cursor-pointer group select-none">
                   <input 
                     type="checkbox" 
                     checked={isTransparent}
                     onChange={(e) => {
                       const checked = e.target.checked;
                       setIsTransparent(checked);
                       if (isEditing) {
                         updateSelectedOverlay({ backgroundColor: checked ? 'rgba(0,0,0,0)' : backgroundColor });
                       }
                     }}
                     className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-0 focus:ring-offset-0 transition-colors group-hover:border-slate-500"
                   />
                   <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">투명</span>
                 </label>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">두께</label>
                <div className="flex p-1 bg-slate-900 rounded-lg border border-slate-800">
                  <button 
                    onClick={() => { setFontWeight('normal'); if (isEditing) updateSelectedOverlay({ fontWeight: 'normal' }); }}
                    className={`flex-1 py-1.5 text-xs rounded transition-all ${fontWeight === 'normal' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}
                  >
                    Normal
                  </button>
                  <button 
                    onClick={() => { setFontWeight('bold'); if (isEditing) updateSelectedOverlay({ fontWeight: 'bold' }); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${fontWeight === 'bold' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}
                  >
                    Bold
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">자간 (Spacing)</label>
                <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-2">
                  <MoveHorizontal size={14} className="text-slate-500 mr-2" />
                  <input 
                    type="number" 
                    step="0.1"
                    value={letterSpacing} 
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setLetterSpacing(val);
                      if (isEditing) updateSelectedOverlay({ letterSpacing: val });
                    }}
                    className="w-full bg-transparent py-2 text-sm focus:outline-none" 
                  />
                </div>
              </div>
            </div>

            {!isEditing && (
              <button 
                onClick={handleApply} 
                disabled={!selection} 
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 mt-2 shadow-lg active:scale-95 transition-all"
              >
                <CheckCircle2 size={18} /> 텍스트 적용
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
