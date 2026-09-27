
import { SlideData } from '../types';

declare const pdfjsLib: any;
declare const jspdf: any;

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export const convertPdfToImages = async (file: File): Promise<SlideData[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const slides: SlideData[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;
    
    slides.push({
      index: i - 1,
      dataUrl: canvas.toDataURL('image/png'),
      width: viewport.width,
      height: viewport.height,
      overlays: []
    });
  }

  return slides;
};

export const downloadAsPdf = (slides: SlideData[], filename: string) => {
  const { jsPDF } = jspdf;
  const doc = new jsPDF({
    orientation: slides[0].width > slides[0].height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [slides[0].width, slides[0].height]
  });

  const processSlide = async (slide: SlideData, idx: number) => {
    if (idx > 0) doc.addPage([slide.width, slide.height]);
    
    const canvas = document.createElement('canvas');
    canvas.width = slide.width;
    canvas.height = slide.height;
    const ctx = canvas.getContext('2d')!;
    
    const img = new Image();
    img.src = slide.dataUrl;
    await new Promise(resolve => img.onload = resolve);
    
    ctx.drawImage(img, 0, 0);

    slide.overlays.forEach(overlay => {
      ctx.fillStyle = overlay.backgroundColor;
      ctx.fillRect(overlay.rect.x, overlay.rect.y, overlay.rect.width, overlay.rect.height);
      
      ctx.fillStyle = overlay.fontColor;
      ctx.font = `${overlay.fontWeight} ${overlay.fontSize}px ${overlay.fontFamily}, sans-serif`;
      
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
      
      if (ctx.letterSpacing !== undefined) {
        ctx.letterSpacing = '0px';
      }
    });
    
    const finalDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    doc.addImage(finalDataUrl, 'JPEG', 0, 0, slide.width, slide.height);
  };

  const saveAll = async () => {
    for (let i = 0; i < slides.length; i++) {
      await processSlide(slides[i], i);
    }
    doc.save(filename);
  };

  saveAll();
};
