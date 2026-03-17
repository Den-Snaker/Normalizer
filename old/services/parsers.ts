
import mammoth from 'mammoth';
import MsgReader from 'msgreader';
const loadXlsx = async () => {
  const mod: any = await import('xlsx');
  return mod?.default || mod;
};

// Хелпер для определения MIME-типа по расширению
// Браузеры иногда ошибаются или дают generic тип, что вызывает 400 ошибку у Gemini
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

export const parseFile = async (file: File): Promise<string | { data: string; mimeType: string }> => {
  const ext = file.name.split('.').pop()?.toLowerCase();

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
