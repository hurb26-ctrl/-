
import React, { useState, useEffect } from 'react';
import { SlideData, Rect, TextOverlay } from './types';
import { convertPdfToImages, downloadAsPdf } from './services/pdfService';
import EditorCanvas from './components/EditorCanvas';
import Sidebar from './components/Sidebar';
import { 
  FileUp, 
  Download, 
  FileText, 
  ChevronLeft, 
  ChevronRight, 
  Trash2, 
  History,
  Image as ImageIcon
} from 'lucide-react';

const App: React.FC = () => {
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    try {
      if (file.type === 'application/pdf') {
        const converted = await convertPdfToImages(file);
        setSlides(converted);
      } else if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            setSlides([{
              index: 0,
              dataUrl: ev.target?.result as string,
              width: img.width,
              height: img.height,
              overlays: []
            }]);
          };
          img.src = ev.target?.result as string;
        };
        reader.readAsDataURL(file);
      }
      setActiveSlideIdx(0);
      setSelectedOverlayId(null);
    } catch (err) {
      console.error(err);
      alert('파일 변환 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyOverlay = (overlay: TextOverlay) => {
    setSlides(prev => prev.map((s, idx) => idx === activeSlideIdx ? { ...s, overlays: [...s.overlays, overlay] } : s));
    setSelection(null);
    setSelectedOverlayId(overlay.id);
  };

  const handleUpdateOverlays = (overlays: TextOverlay[]) => {
    setSlides(prev => prev.map((s, idx) => idx === activeSlideIdx ? { ...s, overlays } : s));
  };

  const handleUndo = () => {
    setSlides(prev => prev.map((s, idx) => {
      if (idx === activeSlideIdx && s.overlays.length > 0) {
        const newOverlays = [...s.overlays];
        newOverlays.pop();
        return { ...s, overlays: newOverlays };
      }
      return s;
    }));
    setSelectedOverlayId(null);
  };

  const handleDownloadImages = () => {
    slides.forEach((slide, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = slide.width;
      canvas.height = slide.height;
      const ctx = canvas.getContext('2d')!;
      const img = new Image();
      img.src = slide.dataUrl;
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        
        slide.overlays.forEach(ov => {
          ctx.fillStyle = ov.backgroundColor;
          ctx.fillRect(ov.rect.x, ov.rect.y, ov.rect.width, ov.rect.height);
          
          ctx.fillStyle = ov.fontColor;
          ctx.font = `${ov.fontWeight} ${ov.fontSize}px ${ov.fontFamily}, sans-serif`;
          
          if (ctx.letterSpacing !== undefined) {
            ctx.letterSpacing = `${ov.letterSpacing || 0}px`;
          }

          const lines = ov.newText.split('\n');
          const lineHeight = ov.fontSize * 1.2;
          const totalTextHeight = lines.length * lineHeight;

          ctx.textAlign = (ov.hAlign || 'left') as CanvasTextAlign;
          ctx.textBaseline = 'top';

          let tx = ov.rect.x;
          if (ov.hAlign === 'center') tx = ov.rect.x + ov.rect.width / 2;
          else if (ov.hAlign === 'right') tx = ov.rect.x + ov.rect.width;

          let ty = ov.rect.y;
          if (ov.vAlign === 'middle') ty = ov.rect.y + (ov.rect.height - totalTextHeight) / 2;
          else if (ov.vAlign === 'bottom') ty = ov.rect.y + ov.rect.height - totalTextHeight;

          lines.forEach((line, index) => {
            ctx.fillText(line, tx, ty + index * lineHeight);
          });
          
          if (ctx.letterSpacing !== undefined) {
            ctx.letterSpacing = '0px';
          }
        });

        setTimeout(() => {
          const link = document.createElement('a');
          link.href = canvas.toDataURL('image/png');
          link.download = `edited_slide_${i + 1}.png`;
          link.click();
        }, 100);
      };
    });
  };

  const handleDownloadPdf = () => {
    if (slides.length === 0) return;
    downloadAsPdf(slides, 'edited_slides.pdf');
  };

  return (
    <div className="flex flex-col h-screen bg-[#0f172a] text-slate-100 font-sans">
      <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-[#1e293b] shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded-lg"><FileText size={20} /></div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Slide Editor</h1>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">AI Power</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg cursor-pointer transition-colors text-sm font-medium border border-slate-600">
            <FileUp size={18} /><span>파일 업로드</span>
            <input type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileUpload} />
          </label>
          <div className="w-px h-6 bg-slate-700 mx-2"></div>
          <button onClick={handleDownloadImages} disabled={slides.length === 0} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-lg text-sm border border-slate-700 transition-all">
            <Download size={18} /><span>이미지 저장</span>
          </button>
          <button onClick={handleDownloadPdf} disabled={slides.length === 0} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold shadow-lg border border-blue-500/50">
            <FileText size={18} /><span>PDF 다운로드</span>
          </button>
        </div>
      </header>
      <main className="flex flex-1 overflow-hidden">
        <aside className="w-20 border-r border-slate-800 bg-[#1e293b] flex flex-col items-center py-6 gap-6 shrink-0">
          <button onClick={handleUndo} className="p-3 rounded-xl hover:bg-slate-700 text-slate-400" title="실행 취소"><History size={24} /></button>
          <button onClick={() => { setSlides(prev => prev.map((s, idx) => idx === activeSlideIdx ? {...s, overlays: []} : s)); setSelectedOverlayId(null); }} className="p-3 rounded-xl hover:bg-red-900/20 hover:text-red-400 text-slate-400" title="전체 삭제"><Trash2 size={24} /></button>
        </aside>
        <div className="flex-1 flex flex-col bg-slate-950 relative">
          {isProcessing ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-400 font-medium">변환 중...</p>
            </div>
          ) : slides.length > 0 ? (
            <>
              <EditorCanvas 
                slide={slides[activeSlideIdx]} 
                selectedOverlayId={selectedOverlayId}
                onSelectionChange={(rect) => { setSelection(rect); if (rect) setSelectedOverlayId(null); }} 
                onOverlaySelect={setSelectedOverlayId}
                onUpdateOverlays={handleUpdateOverlays} 
              />
              <div className="h-12 bg-[#1e293b] border-t border-slate-800 flex items-center justify-center gap-8 shrink-0">
                <button disabled={activeSlideIdx === 0} onClick={() => setActiveSlideIdx(prev => prev - 1)} className="p-1 hover:bg-slate-700 rounded-full disabled:opacity-20"><ChevronLeft /></button>
                <span className="text-sm font-black text-white">{activeSlideIdx + 1} / {slides.length}</span>
                <button disabled={activeSlideIdx === slides.length - 1} onClick={() => setActiveSlideIdx(prev => prev + 1)} className="p-1 hover:bg-slate-700 rounded-full disabled:opacity-20"><ChevronRight /></button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center">
              <div className="w-40 h-40 mb-10 bg-slate-900 rounded-[2.5rem] flex items-center justify-center border-2 border-dashed border-slate-800"><ImageIcon size={64} className="opacity-10" /></div>
              <h3 className="text-2xl font-black text-slate-200 mb-3 tracking-tight">AI 슬라이터 에디터</h3>
              <p className="text-slate-500 max-w-xs mx-auto text-sm leading-relaxed mb-10">PDF 또는 이미지를 업로드하여 지능형 텍스트 교체를 시작하세요.</p>
              <label className="px-10 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black cursor-pointer shadow-2xl">
                파일 선택
                <input type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          )}
        </div>
        <Sidebar 
          activeSlide={slides[activeSlideIdx]} 
          selection={selection} 
          selectedOverlayId={selectedOverlayId}
          onApplyOverlay={handleApplyOverlay} 
          onUpdateOverlays={handleUpdateOverlays}
        />
      </main>
    </div>
  );
};

export default App;
