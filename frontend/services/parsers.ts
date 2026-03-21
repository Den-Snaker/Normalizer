
import mammoth from 'mammoth';
import MsgReader from 'msgreader';
const loadXlsx = async () => {
  const mod: any = await import('xlsx');
  return mod?.default || mod;
};

const getMimeType = (fileName: string, fallbackType: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'heic': return 'image/heic';
    case 'heif': return 'image/heif';
    default: return fallbackType || 'application/octet-stream';
  }
};

const extractPdfText = async (file: File): Promise<string> => {
  console.log('[PDF] Starting text extraction for:', file.name, 'size:', file.size);
  
  try {
    const pdfjsLib = await import('pdfjs-dist');
    
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
    
    const arrayBuffer = await file.arrayBuffer();
    console.log('[PDF] ArrayBuffer size:', arrayBuffer.byteLength);
    
    const pdf = await pdfjsLib.getDocument({ 
      data: arrayBuffer,
      useWorkerFetch: false,
      isEvalSupported: false
    }).promise;
    
    console.log('[PDF] Pages:', pdf.numPages);
    
    let fullText = `[Тип файла: PDF]\n`;
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      console.log('[PDF] Page', i, 'text length:', pageText.length);
      if (pageText.trim()) {
        fullText += `--- Страница ${i} ---\n${pageText}\n`;
      }
    }
    
    console.log('[PDF] Total text length:', fullText.length);
    return fullText;
  } catch (e: any) {
    console.error('[PDF] Extraction error:', e.message, e.stack);
    throw new Error(`Ошибка извлечения текста из PDF: ${e.message}`);
  }
};

export const convertPdfToImages = async (file: File, maxPages: number = 5): Promise<{ data: string; mimeType: string }[]> => {
  console.log('[PDF->Image] Converting PDF to images:', file.name);
  
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ 
    data: arrayBuffer,
    useWorkerFetch: false,
    isEvalSupported: false
  }).promise;
  
  const images: { data: string; mimeType: string }[] = [];
  const numPages = Math.min(pdf.numPages, maxPages);
  
  console.log('[PDF->Image] Converting', numPages, 'pages');
  
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    // Уменьшаем масштаб для меньшего размера изображений
    const scale = 1.0;
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Cannot create canvas context');
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
    
    // Качество 70% для уменьшения размера
    const base64 = canvas.toDataURL('image/jpeg', 0.70).split(',')[1];
    images.push({ data: base64, mimeType: 'image/jpeg' });
    console.log('[PDF->Image] Page', i, 'converted, size:', Math.round(base64.length / 1024), 'KB');
  }
  
  console.log('[PDF->Image] Total images:', images.length, 'Total size:', Math.round(images.reduce((s, i) => s + i.data.length, 0) / 1024), 'KB');
  return images;
};

export const isVisionModel = (modelId: string, provider: string, ollamaMode?: string): boolean => {
  if (provider === 'google') return true;
  if (provider === 'openrouter') return true;
  
  // Vision-модели для Ollama Cloud/Local
  const visionKeywords = ['vl', 'vision', 'gemma3', 'gemini', 'llava', 'moondream', 'qwen3-vl'];
  const modelLower = (modelId || '').toLowerCase();
  const isVision = visionKeywords.some(vk => modelLower.includes(vk));
  
  if (provider === 'ollama' && ollamaMode === 'cloud') {
    return isVision;
  }
  if (provider === 'ollama' && ollamaMode === 'local') {
    return isVision;
  }
  return false;
};

export const parseFile = async (file: File): Promise<string | { data: string; mimeType: string }> => {
  const ext = file.name.split('.').pop()?.toLowerCase();

  // Обработка PDF - всегда извлекаем текст (Ollama Cloud не поддерживает PDF напрямую)
  if (ext === 'pdf') {
    try {
      const text = await extractPdfText(file);
      console.log('[PDF] Extracted text length:', text.length);
      if (text.length > 100) {
        return text;
      }
      console.log('[PDF] Text too short, PDF likely contains images');
    } catch (e: any) {
      console.error('[PDF] extractPdfText failed:', e.message);
    }
    // Если текст не извлёкся - всё равно НЕ отправляем PDF как бинарник в Ollama Cloud
    // Показываем ошибку
    throw new Error(
      'Не удалось извлечь текст из PDF. ' +
      'PDF содержит изображения или повреждён. ' +
      'Используйте провайдер Google Gemini или OpenRouter для обработки таких файлов.'
    );
  }

  // Обработка DOCX (Microsoft Word)
  if (ext === 'docx') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return `[Тип файла: DOCX]\n${result.value}`;
    } catch (e: any) {
      throw new Error(`Ошибка чтения DOCX: ${e.message}`);
    }
  }

  // Обработка DOC (Legacy Microsoft Word 97-2003)
  if (ext === 'doc') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const decoder = new TextDecoder('windows-1251');
      const rawText = decoder.decode(arrayBuffer);
      const cleanText = rawText.replace(/[^а-яА-ЯёЁa-zA-Z0-9\s\.,\-:;%\/№"()]/g, ' ');
      const finalString = cleanText.replace(/\s+/g, ' ').trim();
      
      if (finalString.length < 50) {
        throw new Error("Не удалось извлечь текст (файл может быть изображением внутри документа)");
      }

      return `[Тип файла: DOC (экспериментальное чтение)]\n${finalString}`;
    } catch (e: any) {
      throw new Error(`Ошибка чтения DOC: ${e.message}. Попробуйте пересохранить файл в DOCX.`);
    }
  }

  // Обработка MSG (Outlook)
  if (ext === 'msg') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const reader = new MsgReader(uint8Array);
      const fileData = reader.getFileData();
      
      let content = `[Тип файла: MSG]\n`;
      if (fileData.subject) content += `Тема: ${fileData.subject}\n`;
      if (fileData.senderName) content += `От: ${fileData.senderName}\n`;
      if (fileData.recipients && fileData.recipients.length > 0) {
        content += `Кому: ${fileData.recipients.map((r: any) => r.name || r.email).join(', ')}\n`;
      }
      content += `\n${fileData.body || ''}`;
      
      return content;
    } catch (e: any) {
      throw new Error(`Ошибка чтения MSG: ${e.message}`);
    }
  }

  // Обработка XLS/XLSX
  if (ext === 'xls' || ext === 'xlsx') {
    try {
      const XLSX = await loadXlsx();
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const lines: string[] = [];
      wb.SheetNames.forEach(sheetName => {
        const ws = wb.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        rows.forEach(row => {
          const text = row
            .map(cell => (cell === null || cell === undefined) ? '' : String(cell))
            .map(cell => cell.trim())
            .filter(Boolean)
            .join(' | ');
          if (text) lines.push(text);
        });
      });
      return `[Тип файла: XLSX]\n${lines.join('\n')}`;
    } catch (e: any) {
      throw new Error(`Ошибка чтения XLS/XLSX: ${e.message}`);
    }
  }

  // Для PDF и изображений
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64String = result.split(',')[1];
      
      // Явно определяем MIME, чтобы избежать 400 ошибки от Gemini
      const mimeType = getMimeType(file.name, file.type);
      
      resolve({ data: base64String, mimeType });
    };
    reader.onerror = error => reject(error);
  });
};
