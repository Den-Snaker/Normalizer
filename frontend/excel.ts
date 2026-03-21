import type * as XLSXType from 'xlsx';
import { EquipmentItem, OrderMetadata, DictionaryField, EquipmentCategory } from '../types';

let cachedXlsx: any | null = null;
let cachedPromise: Promise<any> | null = null;

const resolveXlsx = (mod: any) => mod?.default || mod;

const getGlobalXlsx = () => {
  if (typeof window === 'undefined') return null;
  return (window as any).XLSX || null;
};

const loadXlsxScript = (src: string) => {
  return new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('No document'));
      return;
    }

    const existing = document.querySelector(`script[data-xlsx="true"][src="${src}"]`) as HTMLScriptElement | null;
    if (existing && existing.dataset.loaded === 'true') {
      resolve();
      return;
    }

    const script = existing || document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.xlsx = 'true';

    const onLoad = () => {
      script.dataset.loaded = 'true';
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Failed to load XLSX script'));
    };
    const cleanup = () => {
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };

    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);

    if (!existing) {
      document.head.appendChild(script);
    }
  });
};

export const warmXlsx = async () => {
  if (cachedXlsx) return cachedXlsx;
  if (!cachedPromise) {
    cachedPromise = (async () => {
      let xlsx = getGlobalXlsx();
      if (!xlsx?.utils) {
        try {
          const mod: any = await import('xlsx');
          xlsx = resolveXlsx(mod);
        } catch {
          xlsx = null;
        }
      }

      if (!xlsx?.utils) {
        try {
          await loadXlsxScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
        } catch {
          // ignore
        }
        xlsx = getGlobalXlsx();
      }

      if (!xlsx?.utils) {
        throw new Error('XLSX module load failed');
      }

      cachedXlsx = xlsx;
      return xlsx;
    })();
  }
  return cachedPromise;
};

const downloadWorkbook = (XLSX: any, wb: XLSXType.WorkBook, fileName: string) => {
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  return { url, fileName };
};

/**
 * Экспортирует результат поиска КТРУ из песочницы в Excel
 */
export const exportKtruLookupToExcel = async (ktruCode: string, text: string) => {
  try {
    const XLSX = await warmXlsx();
    const wb = XLSX.utils.book_new();
    
    // Превращаем текст в массив строк для строк Excel
    // Пытаемся немного структурировать: если строка содержит ":" или "-", разбиваем на колонки
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const rows = lines.map(line => {
      if (line.includes(':')) {
        const [key, ...val] = line.split(':');
        return [key.trim(), val.join(':').trim()];
      }
      if (line.trim().startsWith('- ')) {
        const content = line.trim().substring(2);
        if (content.includes('-')) {
             const [k, ...v] = content.split('-');
             return ['', k.trim(), v.join('-').trim()];
        }
        return ['', content];
      }
      return [line];
    });

    const header = [['Данные по КТРУ:', ktruCode], []];
    const ws = XLSX.utils.aoa_to_sheet([...header, ...rows]);
    
    // Настройка ширины колонок
    ws['!cols'] = [{ wch: 40 }, { wch: 60 }, { wch: 20 }];

    XLSX.utils.book_append_sheet(wb, ws, 'Данные КТРУ');
    downloadWorkbook(XLSX, wb, `КТРУ_${ktruCode}_${new Date().toISOString().split('T')[0]}.xlsx`);
  } catch (error: any) {
    console.error("Ошибка экспорта КТРУ:", error);
    throw new Error(`Ошибка XLSX: ${error.message}`);
  }
};

/**
 * Парсит Excel файл шаблона для извлечения названий полей по категориям
 */
export const parseDictionaryFromExcel = async (file: File): Promise<Record<EquipmentCategory, { fieldName: string; unit?: string; values?: string }[]>> => {
  const XLSX = await warmXlsx();
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const result: Record<string, { fieldName: string; unit?: string; values?: string }[]> = {};

  // Список системных полей, которые не нужно добавлять в словарь характеристик
  const systemHeaders = [
    'Количество (ед.)', 
    'Количество', 
    'ИНН заказчика', 
    'Название заказчика', 
    'Код КТРУ', 
    'Параметр \\ Устройство',
    'Ед. изм.',
    'Ед. изм',
    'Единица измерения',
    'Значения',
    'Значение',
    'Дата заказа',
    'Дата обработки',
    'Устройство 1',
    'Устройство'
  ];

  wb.SheetNames.forEach(sheetName => {
    // Проверяем, соответствует ли имя листа категории
    const category = Object.values(EquipmentCategory).find(c => c.substring(0, 31) === sheetName);
    if (category) {
      const ws = wb.Sheets[sheetName];
      const json: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      
      const fields: { fieldName: string; unit?: string; values?: string }[] = [];
      // Начинаем со 2-й строки (индекс 1), пропуская заголовки.
      for (let i = 1; i < json.length; i++) {
        const row = json[i];
        if (row && row[0] && typeof row[0] === 'string') {
          const fieldName = row[0].trim();
          // Фильтруем пустые строки и системные поля
          if (fieldName && !systemHeaders.includes(fieldName)) {
            const unit = row[1] && typeof row[1] === 'string' ? row[1].trim() : undefined;
            const values = row[2] && typeof row[2] === 'string' ? row[2].trim() : undefined;
            fields.push({ 
              fieldName, 
              unit: unit && unit !== '—' ? unit : undefined,
              values: values && values !== '—' ? values : undefined
            });
          }
        }
      }
      result[category] = fields;
    }
  });

  return result as Record<EquipmentCategory, { fieldName: string; unit?: string; values?: string }[]>;
};

/**
 * Хелпер для разделения значения на Число и Единицу измерения.
 */
const parseValueAndUnit = (fieldName: string, raw: string): { value: string | number, unit: string } => {
  if (!raw || raw === '—') return { value: '—', unit: '' };

  const fieldLower = (fieldName || '').toLowerCase();
  if (fieldLower.includes('ктру') || fieldLower.includes('код')) {
    return { value: raw, unit: '' };
  }

  let cleaned = raw.replace(/^[><=≥≤~≈]+\s*/, '').trim();
  cleaned = cleaned.replace(/^не\s+менее\s+/i, '').trim();

  const rangeMatch = cleaned.match(/^([\d]+[.,]?\d*)\s*и\s*<\s*[\d]+[.,]?\d*\s*([^\d].*)?$/i);
  if (rangeMatch) {
    const valueStr = rangeMatch[1].replace('.', ',');
    const unitStr = (rangeMatch[2] || '').trim();
    return { value: valueStr, unit: unitStr };
  }

  const ratioMatch = cleaned.match(/^(\d{1,2})\s*:\s*(\d{1,2})$/);
  if (ratioMatch) {
    return { value: `${ratioMatch[1]}:${ratioMatch[2]}`, unit: '' };
  }

  const resolutionMatch = cleaned.match(/(\d{3,5})\s*[xх×]\s*(\d{3,5})/i);
  if (resolutionMatch) {
    return { value: `${resolutionMatch[1]}x${resolutionMatch[2]}`, unit: '' };
  }

  const unitPatterns = [
    'шт\\.?',
    'штук',
    'гб',
    'мб',
    'кб',
    'тб',
    'герц',
    'гц',
    'мгц',
    'кгц',
    'mhz',
    'ghz',
    'khz',
    'hz',
    'ватт',
    'вт',
    'watt',
    'kw',
    'кв',
    'квт',
    'w'
  ];

  const unitRegex = new RegExp(`^([\\d]+[.,]?\\d*)\\s*(${unitPatterns.join('|')})\\b`, 'i');
  const unitMatch = cleaned.match(unitRegex);
  if (unitMatch) {
    const numberStr = unitMatch[1].replace(',', '.');
    const num = parseFloat(numberStr);
    if (!isNaN(num)) {
      return { value: num, unit: unitMatch[2] };
    }
  }

  const match = cleaned.match(/^([\d]+[.,]?\d*)\s*(.*)$/);
  if (match) {
    const numberStr = match[1].replace(',', '.');
    const unitStr = match[2].trim();
    const num = parseFloat(numberStr);
    if (!isNaN(num)) {
      return { value: num, unit: unitStr };
    }
  }

  return { value: cleaned, unit: '' };
};

/**
 * Форматирует timestamp в строку "DD-MM-YYYY HH:MM"
 */
const formatProcessingDate = (timestamp: number): string => {
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Формирует консолидированный отчет по нескольким заказам
 */
export const generateConsolidatedReport = async (
  orders: { metadata: OrderMetadata; items: EquipmentItem[] }[],
  dictionary: DictionaryField[]
) => {
  try {
    const XLSX = await warmXlsx();
    const wb = XLSX.utils.book_new();

    // 1. СВОДНАЯ ТАБЛИЦА (Матрица: Товары х Даты)
    const dateGroups = new Map<string, typeof orders>();
    const allItemNames = new Set<string>();

    orders.forEach(order => {
      let dateKey = order.metadata.docDate;
      if (!dateKey) {
        dateKey = new Date(order.metadata.timestamp).toLocaleDateString('ru-RU');
      }
      if (!dateGroups.has(dateKey)) {
        dateGroups.set(dateKey, []);
      }
      dateGroups.get(dateKey)!.push(order);
      order.items.forEach(item => allItemNames.add(item.name));
    });

    const sortedDates = Array.from(dateGroups.keys()).sort((a, b) => {
      const parseDate = (d: string) => {
        if (d.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
            const parts = d.split('.');
            return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
        }
        const parsed = Date.parse(d);
        return isNaN(parsed) ? 0 : parsed;
      };
      return parseDate(a) - parseDate(b);
    });

    const sortedItemNames = Array.from(allItemNames).sort((a, b) => a.localeCompare(b));
    const summaryRows: any[][] = [];
    
    summaryRows.push(['Наименование', ...sortedDates]);

    sortedItemNames.forEach(itemName => {
      const row: any[] = [itemName];
      sortedDates.forEach(date => {
        const ordersOnDate = dateGroups.get(date) || [];
        const totalQty = ordersOnDate.reduce((sum, order) => {
          const itemsInOrder = order.items.filter(i => i.name === itemName);
          const qtyInOrder = itemsInOrder.reduce((qSum, item) => qSum + item.quantity, 0);
          return sum + qtyInOrder;
        }, 0);
        row.push(totalQty > 0 ? totalQty : '—');
      });
      summaryRows.push(row);
    });

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
    summaryWs['!cols'] = [{ wch: 50 }, ...sortedDates.map(() => ({ wch: 15 }))];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Сводная');

    // 2. ДЕТАЛИЗАЦИЯ ПО КАТЕГОРИЯМ
    const categories = Object.values(EquipmentCategory);
    categories.forEach(cat => {
      const allItemsInCat: { item: EquipmentItem; metadata: OrderMetadata }[] = [];
      orders.forEach(o => {
        o.items.filter(i => i.category === cat).forEach(item => {
          allItemsInCat.push({ item, metadata: o.metadata });
        });
      });

      if (allItemsInCat.length === 0) return;

      const dictFields = dictionary
        .filter(f => f.category === cat && f.isActive)
        .map(f => f.fieldName);

      const foundFields = new Set<string>();
      const extraFields = new Set<string>();
      allItemsInCat.forEach(entry => {
        entry.item.characteristics.forEach(char => {
          const isKnown = dictFields.some(df => df.toLowerCase() === char.name.toLowerCase());
          if (isKnown) foundFields.add(char.name);
          else extraFields.add(char.name);
        });
      });

      const orderedKnownFields = dictFields.filter(df =>
        Array.from(foundFields).some(f => f.toLowerCase() === df.toLowerCase())
      );
      const allFields = [...orderedKnownFields, ...Array.from(extraFields)];
      const rows: any[][] = [];
      
      const headers = ['Параметр \\ Устройство', 'Ед. изм.', ...allItemsInCat.map(e => {
        const d = e.metadata.docDate || new Date(e.metadata.timestamp).toLocaleDateString('ru-RU');
        return `${e.item.name} (${d})`;
      })];

      rows.push(headers);
      
      rows.push(['Код КТРУ', '', ...allItemsInCat.map(e => e.item.ktruCode)]);
      rows.push(['ИНН заказчика', '', ...allItemsInCat.map(e => e.metadata.customerInn || '—')]);
      rows.push(['Название заказчика', '', ...allItemsInCat.map(e => e.metadata.customerName || '—')]);
      // Добавляем строки с датами
      rows.push(['Дата заказа', '', ...allItemsInCat.map(e => e.metadata.docDate || new Date(e.metadata.timestamp).toLocaleDateString('ru-RU'))]);
      rows.push(['Дата обработки', '', ...allItemsInCat.map(e => formatProcessingDate(e.metadata.timestamp))]);
      
      rows.push(['Количество (ед.)', '', ...allItemsInCat.map(e => e.item.quantity)]);

      allFields.forEach(field => {
        const rawValues = allItemsInCat.map(entry => {
          const char = entry.item.characteristics.find(c => c.name.toLowerCase() === field.toLowerCase());
          return char ? char.value : '';
        });

        const parsedValues = rawValues.map(v => parseValueAndUnit(field, v));
        const commonUnit = parsedValues.find(p => p.unit !== '')?.unit || '';
        const row = [field, commonUnit, ...parsedValues.map(p => p.value)];
        rows.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 40 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws, cat.substring(0, 31));
    });

    return downloadWorkbook(XLSX, wb, `Консолидированный_отчет_${new Date().toISOString().split('T')[0]}.xlsx`);
  } catch (error: any) {
    console.error("Ошибка генерации сводного отчета:", error);
    throw new Error(`Ошибка XLSX: ${error.message}`);
  }
};

export const generateTemplate = async (
  dictionary: DictionaryField[],
  unitsByCategory?: Record<string, Record<string, string>>
) => {
  try {
    const XLSX = await warmXlsx();
    const normalizeKey = (value: string) => {
      const map: Record<string, string> = {
        A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У',
        a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у'
      };
      const normalized = value
        .replace(/\([^)]*\)/g, ' ')
        .split('')
        .map(ch => map[ch] || ch)
        .join('')
        .toLowerCase();

      return normalized
        .replace(/[^a-z0-9а-я]+/gi, ' ')
        .trim()
        .replace(/\s+/g, ' ');
    };
    const wb = XLSX.utils.book_new();
    const summaryRows: any[][] = [
      ['ИНФОРМАЦИЯ О ЗАКАЗЕ'],
      ['Заказчик', ''],
      ['ИНН', ''],
      ['Адрес', ''],
      ['Дата заказа', ''],
      ['Дата обработки', ''],
      ['ID обработки', ''],
      ['Прочее', ''],
      [],
      ['СПИСОК ТОВАРОВ'],
      ['Наименование', 'КТРУ', 'Кол-во']
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Сводная');

    Object.values(EquipmentCategory).forEach(cat => {
      const fields = dictionary.filter(f => f.category === cat && f.isActive).map(f => f.fieldName);
      if (fields.length > 0 || cat === EquipmentCategory.OTHER) {
        const displayFields = fields.length > 0 ? fields : ['Описание'];
        const rows: any[][] = [
          ['Параметр \\ Устройство', 'Ед. изм.', 'Устройство 1'],
          ['Код КТРУ', '', ''],
          ['ИНН заказчика', '', ''],
          ['Название заказчика', '', ''],
          ['Дата заказа', '', ''],
          ['Дата обработки', '', ''],
          ['Количество (ед.)', '', ''],
          ...displayFields.map(field => {
            const unit = unitsByCategory?.[cat]?.[normalizeKey(field)] || '';
            return [field, unit, ''];
          })
        ];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 40 }, { wch: 15 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, ws, cat.substring(0, 31));
      }
    });
    return downloadWorkbook(XLSX, wb, 'Шаблон_СЗП_КТРУ.xlsx');
  } catch (e: any) { throw e; }
};

export const fillExcel = async (
  items: EquipmentItem[], 
  metadata: OrderMetadata, 
  dictionary: DictionaryField[],
  templateFile?: File
) => {
  try {
    const XLSX = await warmXlsx();
    let wb: XLSXType.WorkBook;
    if (templateFile) {
      const data = await templateFile.arrayBuffer();
      wb = XLSX.read(data);
    } else {
      wb = XLSX.utils.book_new();
    }

    const summarySheetName = 'Сводная';
    const orderDate = metadata.docDate || new Date(metadata.timestamp).toLocaleDateString('ru-RU');
    const processingDate = formatProcessingDate(metadata.timestamp);

    const summaryRows: any[][] = [
      ['ИНФОРМАЦИЯ О ЗАКАЗЕ'],
      ['Заказчик', metadata.customerName || 'Не указано'],
      ['ИНН', metadata.customerInn || 'Не указано'],
      ['Адрес', metadata.customerAddress || 'Не указано'],
      ['Дата заказа', orderDate],
      ['Дата обработки', processingDate],
      ['ID обработки', metadata.processingId],
      ['AI Токены', metadata.tokenUsage || '—'], 
      ['Прочее', metadata.otherDetails || '—'],
      [],
      ['СПИСОК ТОВАРОВ'],
      ['Наименование', 'КТРУ', 'Кол-во']
    ];
    summaryRows.push(...items.map(i => [i.name, i.ktruCode, i.quantity]));
    const sws = XLSX.utils.aoa_to_sheet(summaryRows);
    
    // Установка ширины колонок для сводной
    sws['!cols'] = [{ wch: 25 }, { wch: 50 }];

    if (wb.SheetNames.includes(summarySheetName)) wb.Sheets[summarySheetName] = sws;
    else XLSX.utils.book_append_sheet(wb, sws, summarySheetName);

    const categoriesInOrder = Array.from(new Set(items.map(i => i.category)));
    categoriesInOrder.forEach(cat => {
      const catItems = items.filter(i => i.category === cat);
      const dictFields = dictionary.filter(f => f.category === cat && f.isActive).map(f => f.fieldName);
      const foundFields = new Set<string>();
      const extraFieldMap = new Map<string, string>();
      catItems.forEach(item => item.characteristics.forEach(char => {
        const isKnown = dictFields.some(df => df.toLowerCase() === char.name.toLowerCase());
        if (isKnown && !(char as any).isExtra) {
          foundFields.add(char.name);
        } else if ((char as any).isExtra || (char as any).originalName) {
          const original = ((char as any).originalName || char.name) as string;
          const key = original.toLowerCase();
          if (!extraFieldMap.has(key)) extraFieldMap.set(key, original);
        }
      }));
      const orderedKnownFields = dictFields.filter(df =>
        Array.from(foundFields).some(f => f.toLowerCase() === df.toLowerCase())
      );
      const extraFields = Array.from(extraFieldMap.values());
      const allFields = [...orderedKnownFields, ...extraFields];
      
      const rows: any[][] = [
        ['Параметр \\ Устройство', 'Ед. изм.', ...catItems.map(i => i.name)],
        ['Код КТРУ', '', ...catItems.map(i => i.ktruCode)],
        ['ИНН заказчика', '', ...catItems.map(() => metadata.customerInn || '—')],
        ['Название заказчика', '', ...catItems.map(() => metadata.customerName || '—')],
        ['Дата заказа', '', ...catItems.map(() => orderDate)],
        ['Дата обработки', '', ...catItems.map(() => processingDate)],
        ['Количество (ед.)', '', ...catItems.map(i => i.quantity)]
      ];

      orderedKnownFields.forEach(field => {
        const rawValues = catItems.map(item => {
          const char = item.characteristics.find(c => c.name.toLowerCase() === field.toLowerCase());
          return char ? char.value : '';
        });
        
        const parsedValues = rawValues.map(v => parseValueAndUnit(field, v));
        const commonUnit = parsedValues.find(p => p.unit !== '')?.unit || '';
        const row = [field, commonUnit, ...parsedValues.map(p => p.value)];
        rows.push(row);
      });

      if (extraFields.length > 0) {
        rows.push(['Дополнительно', '', ...catItems.map(() => '')]);
        extraFields.forEach(field => {
          const rawValues = catItems.map(item => {
            const char = item.characteristics.find(c => (
              (c as any).originalName?.toLowerCase() === field.toLowerCase()
              || ((c as any).isExtra && c.name.toLowerCase() === field.toLowerCase())
            ));
            return char ? char.value : '';
          });

          const parsedValues = rawValues.map(v => parseValueAndUnit(field, v));
          const commonUnit = parsedValues.find(p => p.unit !== '')?.unit || '';
          const row = [field, commonUnit, ...parsedValues.map(p => p.value)];
          rows.push(row);
        });
      }
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 40 }, { wch: 10 }];
      
      const sheetName = cat.substring(0, 31);
      if (wb.SheetNames.includes(sheetName)) wb.Sheets[sheetName] = ws;
      else XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    return downloadWorkbook(XLSX, wb, `Заказ_${metadata.customerInn || 'ИНН_не_указан'}_${metadata.processingId}.xlsx`);
  } catch (error: any) { throw error; }
};
