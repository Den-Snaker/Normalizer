import React, { useState, useEffect, useRef } from 'react';
import { Icons, CATEGORY_KTRU_INDICES, CATEGORY_KTRU_SHORT, LLM_MODELS } from './constants.tsx';
import { 
  EquipmentItem, Task, OrderMetadata, DictionaryField, 
  EquipmentCategory, FieldChange 
} from './types.ts';
import { 
  extractDataWithSchema, enrichItemWithKtru, suggestDictionaryFields, 
  checkSemanticSimilarity, verifyCategoryKtruIndex,
  fetchRawKtruFields, fetchLocalOllamaModels
} from './services/gemini.ts';
import { fetchKtruFieldsFromBackend, fetchKtruFieldDetailsFromBackend } from './services/ktru.ts';
import { fillExcel, generateTemplate, generateConsolidatedReport, parseDictionaryFromExcel, exportKtruLookupToExcel, warmXlsx } from './services/excel.ts';
import { 
  db, syncWithPostgres, fetchOrdersFromPostgres,
  getDbConfig, saveDbConfig, exportConfigToFile, importConfigFromText, type DBConfig,
  clearRemoteDatabase, fetchDictionaryFromPostgres, type CategoryMetadata,
  saveDictionaryToPostgres,
  checkConnection, getApiUrl
} from './services/db.ts';
import { parseFile, convertPdfToImages, isVisionModel } from './services/parsers.ts';
import { subscribeLogs, LogEntry, clearLogs, addLog } from './services/logger.ts';

const parseTokenString = (str: string) => {
  const parts = str.match(/K_([\d\.]+)\+P_([\d\.]+)\+T_([\d\.]+)=([\d\.]+)/);
  if (!parts) return { k: 0, p: 0, t: 0, total: 0 };
  return {
    k: parseFloat(parts[1]),
    p: parseFloat(parts[2]),
    t: parseFloat(parts[3]),
    total: parseFloat(parts[4])
  };
};

const formatDateTime = (timestamp: number) => {
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'upload' | 'history' | 'dictionary' | 'settings' | 'logs'>('upload');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dictionary, setDictionary] = useState<DictionaryField[]>([]);
  const [categoryMeta, setCategoryMeta] = useState<CategoryMetadata[]>([]);
  const [template, setTemplate] = useState<File | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [appLogs, setAppLogs] = useState<LogEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  const [dbConfig, setDbConfig] = useState<DBConfig>(getDbConfig());
  const [isSettingsSaved, setIsSettingsSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [dateRange, setDateRange] = useState({ 
    start: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0], 
    end: new Date().toISOString().split('T')[0] 
  });
  const [isExporting, setIsExporting] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isDictionaryLoading, setIsDictionaryLoading] = useState(false);
  const [dictProgress, setDictProgress] = useState<string>('');
  const [progressDetails, setProgressDetails] = useState<Record<string, string>>({});
  const [isSavingDictionary, setIsSavingDictionary] = useState(false);
  const [lastDbLoadCount, setLastDbLoadCount] = useState<number | null>(null);
  
  const [lastTokenUsage, setLastTokenUsage] = useState<string>("K_0.0+P_0.0+T_0.0=0.0");
  const [lastOperationName, setLastOperationName] = useState<string>("Готов к работе");
  const [hasQuotaError, setHasQuotaError] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isAIMonitorOpen, setIsAIMonitorOpen] = useState(false);

  // Connection Check State
  const [connectionStatus, setConnectionStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);

  // LLM Check State
  const [llmStatus, setLlmStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isCheckingLlm, setIsCheckingLlm] = useState(false);

  // API Key sources: 'env' (from .env.local) or 'custom' (user-provided via dbConfig)
  // Note: Ollama Cloud key is NOT exposed from env for security reasons
  const envKeys = {
    google: import.meta.env.VITE_GEMINI_API_KEY as string | undefined,
    openrouter: import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined,
    ollama: undefined, // Never expose Ollama Cloud key from env - user must enter it
  };

  const maskKey = (key: string | undefined): string => {
    if (!key || key.length < 4) return '';
    return `...${key.slice(-4)}`;
  };

  const handleCheckLlm = async () => {
    setIsCheckingLlm(true);
    setLlmStatus(null);
    const TIMEOUT_MS = 15000;
    
    const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) => 
          setTimeout(() => reject(new Error(`Превышено время ожидания (${ms/1000}с)`)), ms)
        )
      ]);
    };
    
    try {
      const config = dbConfig.llm;
      const testPrompt = 'Ответь одним словом: ОК';
      
      if (config.provider === 'google') {
        const apiKey = config.googleApiKey || import.meta.env.VITE_GEMINI_API_KEY || '';
        if (!apiKey) throw new Error('API ключ Google Gemini не указан. Введите ключ в настройках.');
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey });
        await withTimeout(
          ai.models.generateContent({
            model: config.googleModel,
            contents: testPrompt,
          }),
          TIMEOUT_MS
        );
        setLlmStatus({ ok: true, msg: `✓ Модель ${config.googleModel} доступна` });
      } else if (config.provider === 'openrouter') {
        const apiKey = config.openrouterApiKey || import.meta.env.VITE_OPENROUTER_API_KEY || '';
        if (!apiKey) throw new Error('API ключ OpenRouter не указан. Введите ключ в настройках.');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: config.openrouterModel,
              messages: [{ role: 'user', content: testPrompt }],
              max_tokens: 10,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || `Ошибка ${response.status}`);
          }
          setLlmStatus({ ok: true, msg: `✓ Модель ${config.openrouterModel} доступна` });
        } catch (e: any) {
          clearTimeout(timeoutId);
          if (e.name === 'AbortError') throw new Error(`Превышено время ожидания (${TIMEOUT_MS/1000}с)`);
          throw e;
        }
      } else if (config.provider === 'ollama') {
        const isCloud = config.ollamaMode === 'cloud';
        const endpoint = isCloud ? getApiUrl() : config.ollamaEndpoint;
        const model = isCloud ? config.ollamaCloudModel : config.ollamaLocalModel;
        
        if (!model) throw new Error('Модель Ollama не выбрана. Выберите модель в настройках.');
        
        const body: Record<string, any> = {
          model,
          prompt: testPrompt,
          stream: false,
        };
        
        if (isCloud) {
          if (!config.ollamaCloudApiKey) {
            throw new Error('API ключ Ollama Cloud не указан. Введите ключ в настройках.');
          }
          body.api_key = config.ollamaCloudApiKey;
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const response = await fetch(`${endpoint}/ollama/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (!response.ok) {
            const err = await response.text();
            throw new Error(err || `Ошибка ${response.status}`);
          }
          setLlmStatus({ ok: true, msg: `✓ Модель ${model} доступна` });
        } catch (e: any) {
          clearTimeout(timeoutId);
          if (e.name === 'AbortError') throw new Error(`Превышено время ожидания (${TIMEOUT_MS/1000}с)`);
          throw e;
        }
      }
    } catch (e: any) {
      setLlmStatus({ ok: false, msg: `✗ ${e.message || 'Ошибка соединения'}` });
    } finally {
      setIsCheckingLlm(false);
    }
  };

  // KTRU Lookup State
  const [ktruLookupCode, setKtruLookupCode] = useState('');
  const [ktruLookupResult, setKtruLookupResult] = useState('');
  const [ktruSources, setKtruSources] = useState<{title: string, uri: string}[]>([]);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [processingRange, setProcessingRange] = useState({ start: '', end: '' });

  // KTRU Scanner State
  const [scanGroupCode, setScanGroupCode] = useState('26.20.15.000');
  const [scanGroupCodeCustom, setScanGroupCodeCustom] = useState('');
  const [useCustomGroupCode, setUseCustomGroupCode] = useState(false);
  const [scanStart, setScanStart] = useState(1);
  const [scanEnd, setScanEnd] = useState(99);
  const [scanRequestsPerSecond, setScanRequestsPerSecond] = useState(0.5);
  const [scanPauseSeconds, setScanPauseSeconds] = useState(2.0);
  const [scanResults, setScanResults] = useState<{item_id: string; name: string; status: string}[]>([]);
  const [scanProgress, setScanProgress] = useState<{current: number; total: number; status: string} | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedCodesCount, setScannedCodesCount] = useState<number | null>(null);

  const templateInputRef = useRef<HTMLInputElement>(null);
  const dictImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        warmXlsx().catch(() => null);
        const dict = await db.dictionary.toArray();
        setDictionary(dict);
        const meta = await db.categoryMetadata.toArray();
        setCategoryMeta(meta);
        setDbConfig(getDbConfig());
      } catch (err) {
        console.error("Ошибка при инициализации данных:", err);
      }
    };
    loadData();
    
    return subscribeLogs(setAppLogs);
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
    if (activeTab === 'dictionary') {
      loadScannedCodes();
    }
  }, [activeTab]);

  const loadHistory = async () => {
    setIsHistoryLoading(true);
    try {
      const start = new Date('2020-01-01').getTime();
      const end = new Date().getTime();
      const remoteOrders = await fetchOrdersFromPostgres(start, end);
      
      if (remoteOrders.length > 0) {
        setHistory(remoteOrders.sort((a, b) => b.metadata.timestamp - a.metadata.timestamp));
      } else {
        const localOrders = await db.orders.orderBy('metadata.timestamp').reverse().toArray();
        setHistory(localOrders);
      }
    } catch (e) {
      const localOrders = await db.orders.orderBy('metadata.timestamp').reverse().toArray();
      setHistory(localOrders);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const loadScannedCodes = async () => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/ktru/scanned-codes?limit=1000`);
      if (response.ok) {
        const data = await response.json();
        setScannedCodesCount(data.count);
      }
    } catch (e) {
      console.error('Error loading scanned codes:', e);
    }
  };

  const handleStartScan = async () => {
    if (isScanning) return;
    if (scanStart > scanEnd) {
      alert('Начальный номер должен быть меньше или равен конечному');
      return;
    }

    setIsScanning(true);
    setScanResults([]);
    const totalItems = scanEnd - scanStart + 1;
    const estimatedTime = Math.ceil(totalItems * (scanPauseSeconds + 0.5) / 60);
    setScanProgress({ current: 0, total: totalItems, status: `Ожидайте ~${estimatedTime} мин. Проверка ${totalItems} кодов...` });

    try {
      const apiUrl = getApiUrl();
      
      // Создаём AbortController для timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 минут максимум
      
      const groupCode = useCustomGroupCode ? scanGroupCodeCustom : scanGroupCode;
      
      if (!groupCode || groupCode.trim() === '') {
        setScanProgress({ current: 0, total: 0, status: 'Введите код группы КТРУ' });
        setIsScanning(false);
        return;
      }
      
      const response = await fetch(
        `${apiUrl}/ktru/scan?group_code=${encodeURIComponent(groupCode)}&start=${scanStart}&end=${scanEnd}&requests_per_second=${scanRequestsPerSecond}&pause_seconds=${scanPauseSeconds}&save=false`,
        { signal: controller.signal }
      );
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ошибка: ${response.status}`);
      }

      const data = await response.json();
      setScanResults(data.results || []);
      setScanProgress({ current: data.total_checked, total: data.total_checked, status: `Готово. Найдено: ${data.found_count}` });
      addLog('info', `[Scanner] Сканирование завершено`, { group: groupCode, found: data.found_count, errors: data.errors_count });
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setScanProgress({ current: 0, total: 0, status: 'Превышено время ожидания (10 мин)' });
        addLog('error', `[Scanner] Превышен timeout сканирования`, e);
      } else {
        setScanProgress({ current: 0, total: 0, status: `Ошибка: ${e.message}` });
        addLog('error', `[Scanner] Ошибка сканирования: ${e.message}`, e);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleSaveScannedCodes = async () => {
    if (scanResults.length === 0) {
      alert('Нет результатов для сохранения');
      return;
    }

    const groupCode = useCustomGroupCode ? scanGroupCodeCustom : scanGroupCode;

    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/ktru/scanned-codes/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scanResults.map(r => ({
          group_code: groupCode,
          item_id: r.item_id,
          item_name: r.name,
          status: r.status
        })))
      });

      if (!response.ok) {
        throw new Error(`Ошибка: ${response.status}`);
      }

      const data = await response.json();
      setScannedCodesCount(prev => (prev || 0) + data.saved);
      alert(`Сохранено ${data.saved} записей`);
      addLog('info', `[Scanner] Сохранено ${data.saved} кодов в БД`, { group: scanGroupCode });
    } catch (e: any) {
      alert(`Ошибка сохранения: ${e.message}`);
      addLog('error', `[Scanner] Ошибка сохранения: ${e.message}`, e);
    }
  };

  const handleClearScannedCodes = async () => {
    if (!confirm('Удалить все сканированные коды из базы данных?')) return;

    try {
      const apiUrl = getApiUrl();
      await fetch(`${apiUrl}/ktru/scanned-codes`, { method: 'DELETE' });
      setScannedCodesCount(0);
      alert('Сканированные коды удалены');
    } catch (e: any) {
      alert(`Ошибка: ${e.message}`);
    }
  };

  const handleExportScannedCodesToExcel = async () => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/ktru/scanned-codes/export`);
      
      if (!response.ok) {
        throw new Error(`Ошибка: ${response.status}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ktru_scanned_codes_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      addLog('info', `[Scanner] Экспортировано в XLSX`, { count: scanResults.length });
    } catch (e: any) {
      alert(`Ошибка экспорта: ${e.message}`);
      addLog('error', `[Scanner] Ошибка экспорта: ${e.message}`, e);
    }
  };

  const updateTokenStats = (operation: string, usage: string, isError = false) => {
    setLastOperationName(operation);
    setLastTokenUsage(usage);
    setHasQuotaError(isError);
    if (!isError) setIsRetrying(false);
  };

  const handleRetryNotification = (msg: string) => {
    setLastOperationName(msg);
    setIsRetrying(true);
  };

  const handleFiles = (files: File[]) => {
    const newTasks: Task[] = files.map(f => ({ id: Math.random().toString(), fileName: f.name, file: f, status: 'queued' as const, progress: 0 }));
    setTasks(prev => [...prev, ...newTasks]);
    newTasks.forEach(t => processFile(t));
  };

  const handleDragEvents = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    handleDragEvents(e);
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleLoadFromDb = async () => {
    setIsDictionaryLoading(true);
    setDictProgress('Загрузка из базы данных...');
    try {
      const remoteFields = await fetchDictionaryFromPostgres();
      console.log('[handleLoadFromDb] remoteFields count:', remoteFields.length);
      console.log('[handleLoadFromDb] sample:', remoteFields.slice(0, 3).map(f => ({ fieldName: f.fieldName, unit: f.unit, values: f.values?.substring(0, 30) })));
      if (remoteFields.length > 0) {
        await db.dictionary.clear();
        await db.dictionary.bulkAdd(remoteFields);
        const loaded = await db.dictionary.toArray();
        console.log('[handleLoadFromDb] loaded from IndexedDB:', loaded.length);
        console.log('[handleLoadFromDb] sample from IndexedDB:', loaded.slice(0, 3).map(f => ({ fieldName: f.fieldName, unit: f.unit, values: f.values?.substring(0, 30) })));
        setDictionary(loaded);
        setLastDbLoadCount(remoteFields.length);
        alert(`Загружено ${remoteFields.length} записей.`);
      } else {
        setLastDbLoadCount(0);
        alert("База данных пуста или недоступна.");
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsDictionaryLoading(false);
    }
  };

  const handleLoadFromTemplate = async (file: File) => {
    setIsDictionaryLoading(true);
    setDictProgress('Парсинг шаблона XLSX...');
    try {
      const fieldsMap = await parseDictionaryFromExcel(file);
      const newFields: DictionaryField[] = [];
      Object.entries(fieldsMap).forEach(([cat, fields]) => {
        fields.forEach(f => {
          newFields.push({ 
            category: cat as EquipmentCategory, 
            fieldName: typeof f === 'string' ? f : f.fieldName, 
            isActive: true,
            unit: typeof f === 'object' && f.unit ? f.unit : '',
            values: typeof f === 'object' && f.values ? f.values : ''
          });
        });
      });
      if (newFields.length > 0) {
        await db.dictionary.clear();
        await db.dictionary.bulkAdd(newFields);
        setDictionary(newFields);
        alert(`Импортировано ${newFields.length} характеристик.`);
      }
    } catch (e: any) {
      alert(`Ошибка: ${e.message}`);
    } finally {
      setIsDictionaryLoading(false);
    }
  };


  const handleDictionaryUpdate = async (categories: EquipmentCategory[]) => {
    setIsDictionaryLoading(true);
    setDictProgress('Начало загрузки из КТРУ...');
    updateTokenStats('Загрузка справочника', 'K_0.0+P_0.0+T_0.0=0.0');
    try {
      for (const cat of categories) {
        if (cat === 'Прочее') continue;
        
        const ktruCode = CATEGORY_KTRU_INDICES[cat];
        if (!ktruCode || ktruCode === '0.0.0') {
          setDictProgress(`Пропуск ${cat} (нет кода КТРУ)`);
          continue;
        }

        setDictProgress(`Загрузка ${ktruCode} для ${cat}...`);
        
        const fieldDetails = await fetchKtruFieldDetailsFromBackend(
          ktruCode,
          dbConfig.ktruSource,
          dbConfig.ktru44Token,
          dbConfig.ktru44ShortToken
        );
        updateTokenStats(`КТРУ: ${cat}`, 'K_0.0+P_0.0+T_0.0=0.0');
        if (!fieldDetails.length) {
          addLog('warn', '[KTRU] Пустой ответ, пропуск обновления', { category: cat, ktruCode, source: dbConfig.ktruSource });
          setDictProgress(`Пропуск ${cat}: КТРУ вернул пустой список`);
          continue;
        }
        
        const excludePhrases = [
          '*варианты', 'единица измерения', 'тип значения', 
          'тип характеристики', 'наименование характеристики', 
          'значение характеристики', 'код ктру', 'источник'
        ];

        const fieldNames = fieldDetails.map(d => d.name).filter(f => {
          if (!f || f.length < 2 || f.length > 150) return false;
          const lower = f.toLowerCase();
          if (excludePhrases.some(phrase => lower.includes(phrase))) return false;
          if (lower.includes('наименование') && lower.includes('ктру')) return false;
          if (f.match(/^https?:\/\//)) return false;
          if (f.match(/^\d+$/)) return false; // Исключаем чисто цифры
          if (!/[а-яА-Я]/.test(f)) return false;
          return true;
        }).map(f => {
           // Очистка от лишних символов (маркеры списков, двоеточия)
           return f.replace(/^[-•●▪▫]\s*/, '').replace(/^\d+[.)]\s*/, '').replace(/:\s*$/, '').trim();
        });
        
        const uniqueFields = [...new Set(fieldNames.filter(f => f.length > 2))];
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
          return normalized.replace(/[^a-z0-9а-я]+/gi, ' ').trim().replace(/\s+/g, ' ');
        };
        const unitMap = new Map(fieldDetails.map(d => [normalizeKey(d.name), d.unit || '']));
        const valuesMap = new Map(fieldDetails.map(d => [normalizeKey(d.name), d.values || '']));
        
        await db.dictionary.where('category').equals(cat).delete();
        
        for (const fieldName of uniqueFields) {
          await db.dictionary.put({ 
            category: cat, 
            fieldName, 
            isActive: true, 
            unit: unitMap.get(normalizeKey(fieldName)) || '',
            values: valuesMap.get(normalizeKey(fieldName)) || ''
          });
        }
        
        await db.categoryMetadata.put({ category: cat, ktruIndex: ktruCode });
        setDictProgress(`Сохранено ${uniqueFields.length} полей для ${cat}`);
      }
      const loaded = await db.dictionary.toArray();
      setDictionary(loaded);
      const sample = loaded.find(d => d.values && d.values.length > 0);
      addLog('info', '[KTRU] Загружен справочник', { 
        total: loaded.length, 
        withValues: loaded.filter(d => d.values).length,
        sampleField: sample?.fieldName,
        sampleValues: sample?.values?.substring(0, 50)
      });
      const meta = await db.categoryMetadata.toArray();
      setCategoryMeta(meta);
      setDictProgress('Загрузка завершена!');
      updateTokenStats('Готово', 'K_0.0+P_0.0+T_0.0=0.0');
    } catch (e: any) { 
      setDictProgress(`Ошибка: ${e.message}`);
      addLog('error', `Ошибка при обновлении справочника: ${e.message}`, e);
      alert(`Ошибка при загрузке: ${e.message}`); 
    } finally { setIsDictionaryLoading(false); }
  };

  const handleDictionaryUpdatePrintForms = async (categories: EquipmentCategory[]) => {
    setIsDictionaryLoading(true);
    setDictProgress('Начало загрузки из печатных форм...');
    updateTokenStats('Загрузка печатных форм', 'K_0.0+P_0.0+T_0.0=0.0');
    try {
      for (const cat of categories) {
        if (cat === 'Прочее') continue;

        const ktruCode = CATEGORY_KTRU_INDICES[cat];
        if (!ktruCode || ktruCode === '0.0.0') {
          setDictProgress(`Пропуск ${cat} (нет кода КТРУ)`);
          continue;
        }

        setDictProgress(`Печатная форма ${ktruCode} для ${cat}...`);

        const fieldDetails = await fetchKtruFieldDetailsFromBackend(
          ktruCode,
          'printforms',
          dbConfig.ktru44Token,
          dbConfig.ktru44ShortToken
        );
        updateTokenStats(`Печатная форма: ${cat}`, 'K_0.0+P_0.0+T_0.0=0.0');
        if (!fieldDetails.length) {
          addLog('warn', '[KTRU] Пустой ответ (печатная форма), пропуск обновления', { category: cat, ktruCode });
          setDictProgress(`Пропуск ${cat}: печатная форма пустая`);
          continue;
        }

        const excludePhrases = [
          '*варианты', 'единица измерения', 'тип значения',
          'тип характеристики', 'наименование характеристики',
          'значение характеристики', 'код ктру', 'источник'
        ];

        const fieldNames = fieldDetails.map(d => d.name).filter(f => {
          if (!f || f.length < 2 || f.length > 150) return false;
          const lower = f.toLowerCase();
          if (excludePhrases.some(phrase => lower.includes(phrase))) return false;
          if (lower.includes('наименование') && lower.includes('ктру')) return false;
          if (f.match(/^https?:\/\//)) return false;
          if (f.match(/^\d+$/)) return false;
          if (!/[а-яА-Я]/.test(f)) return false;
          return true;
        }).map(f => f.replace(/^[-•●▪▫]\s*/, '').replace(/^\d+[.)]\s*/, '').replace(/:\s*$/, '').trim());

        const uniqueFields = [...new Set(fieldNames.filter(f => f.length > 2))];
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
          return normalized.replace(/[^a-z0-9а-я]+/gi, ' ').trim().replace(/\s+/g, ' ');
        };
        const unitMap = new Map(fieldDetails.map(d => [normalizeKey(d.name), d.unit || '']));
        const valuesMap = new Map(fieldDetails.map(d => [normalizeKey(d.name), d.values || '']));

        await db.dictionary.where('category').equals(cat).delete();

      for (const fieldName of uniqueFields) {
        await db.dictionary.put({ 
          category: cat, 
          fieldName, 
          isActive: true, 
          unit: unitMap.get(normalizeKey(fieldName)) || '',
          values: valuesMap.get(normalizeKey(fieldName)) || ''
        });
      }

        await db.categoryMetadata.put({ category: cat, ktruIndex: ktruCode });
        setDictProgress(`Сохранено ${uniqueFields.length} полей для ${cat}`);
      }
      const loaded = await db.dictionary.toArray();
      setDictionary(loaded);
      const sample = loaded.find(d => d.values && d.values.length > 0);
      addLog('info', '[PrintForms] Загружен справочник', { 
        total: loaded.length, 
        withValues: loaded.filter(d => d.values).length,
        sampleField: sample?.fieldName,
        sampleValues: sample?.values?.substring(0, 50)
      });
      const meta = await db.categoryMetadata.toArray();
      setCategoryMeta(meta);
      setDictProgress('Загрузка завершена!');
      updateTokenStats('Готово', 'K_0.0+P_0.0+T_0.0=0.0');
    } catch (e: any) {
      setDictProgress(`Ошибка: ${e.message}`);
      addLog('error', `Ошибка при обновлении справочника: ${e.message}`, e);
      alert(`Ошибка при загрузке: ${e.message}`);
    } finally { setIsDictionaryLoading(false); }
  };

  const handleKtruLookup = async () => {
    if (!ktruLookupCode.trim()) return;
    setIsLookupLoading(true);
    setKtruLookupResult('');
    setKtruSources([]);
    try {
      const fields = await fetchKtruFieldsFromBackend(
        ktruLookupCode,
        dbConfig.ktruSource,
        dbConfig.ktru44Token,
        dbConfig.ktru44ShortToken
      );
      updateTokenStats('Запрос КТРУ', 'K_0.0+P_0.0+T_0.0=0.0');
      setKtruLookupResult(fields.length ? fields.join('\n') : 'Ничего не найдено');
      setKtruSources([]);
    } catch (e: any) {
      addLog('error', `Ошибка в песочнице КТРУ: ${e.message}`, e);
      setKtruLookupResult(`Ошибка: ${e.message}`);
    } finally {
      setIsLookupLoading(false);
    }
  };

  const processFile = async (task: Task) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'processing', progress: 5 } : t));
    try {
      const curDict = await db.dictionary.toArray();
      
      let content: string | { data: string; mimeType: string } | { data: string; mimeType: string }[];
      
      const ext = task.file.name.split('.').pop()?.toLowerCase();
      const isPdf = ext === 'pdf';
      
      const config = dbConfig.llm;
      const isGoogle = config.provider === 'google';
      
      // Для Google - отправляем файл как есть (PDF, изображения)
      // Для других провайдеров - извлекаем текст / конвертируем в изображения
      if (isGoogle) {
        // Google Gemini поддерживает файлы напрямую
        const fileData = await new Promise<{ data: string; mimeType: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(task.file);
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            const mimeTypes: Record<string, string> = {
              'pdf': 'application/pdf',
              'png': 'image/png',
              'jpg': 'image/jpeg',
              'jpeg': 'image/jpeg',
              'webp': 'image/webp',
              'gif': 'image/gif',
              'heic': 'image/heic',
              'heif': 'image/heif',
            };
            const mimeType = mimeTypes[ext || ''] || task.file.type || 'application/octet-stream';
            resolve({ data: base64, mimeType });
          };
          reader.onerror = reject;
        });
        
        // Для DOCX/XLSX/MSG - всё равно парсим в текст
        if (['docx', 'doc', 'xlsx', 'xls', 'msg'].includes(ext || '')) {
          content = await parseFile(task.file);
        } else {
          content = fileData;
        }
      } else {
        // Для OpenRouter и Ollama - существующая логика
        if (isPdf) {
          try {
            const text = await parseFile(task.file) as string;
            if (text && text.length > 100) {
              content = text;
            } else {
              console.log('[processFile] PDF text too short, converting to images');
              content = await convertPdfToImages(task.file, 5);
            }
          } catch (pdfErr: any) {
            console.log('[processFile] PDF error, converting to images:', pdfErr.message);
            content = await convertPdfToImages(task.file, 5);
          }
        } else {
          content = await parseFile(task.file);
        }
      }
      
      const { items, metadata, tokenUsage: exU } = await extractDataWithSchema(content, curDict, dbConfig.model, handleRetryNotification);
      updateTokenStats('Анализ', exU);
      if (!items.length) {
        addLog('warn', `Пустое распознавание: ${task.fileName}`, { file: task.fileName });
      }
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, progress: 40, status: 'enriching' } : t));
      const enriched: EquipmentItem[] = [];
      for (let i = 0; i < items.length; i++) {
        const { ktruCode, tokenUsage: enU } = await enrichItemWithKtru(items[i]);
        updateTokenStats(`КТРУ: ${items[i].name}`, enU);
        enriched.push({ ...items[i], ktruCode });
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, progress: 40 + (i/items.length)*55 } : t));
      }
      const finalMeta = { ...metadata, sourceFile: task.fileName };
      const sanitizedItems = enriched.map(item => ({
        ...item,
        characteristics: (item.characteristics || []).filter(c => !(c as any).isExtra)
      }));

      await db.orders.add({ metadata: finalMeta, items: sanitizedItems });
      syncWithPostgres({ metadata: finalMeta, items: sanitizedItems });
      const exportResult = await fillExcel(enriched, finalMeta, curDict, template || undefined);
      setTasks(prev => prev.map(t => t.id === task.id ? {
        ...t,
        status: 'completed',
        progress: 100,
        xlsxUrl: exportResult?.url,
        xlsxFileName: exportResult?.fileName
      } : t));
    } catch (e: any) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'error', error: e.message, progress: 100 } : t));
    }
  };

  const getDisplayIndex = (cat: EquipmentCategory) => {
    return CATEGORY_KTRU_SHORT[cat] || '—';
  };

  const handleCheckConnection = async () => {
    setIsCheckingConnection(true);
    setConnectionStatus(null);
    try {
      const result = await checkConnection(dbConfig);
      setConnectionStatus({ ok: result.ok, msg: result.message });
    } catch (e) {
      setConnectionStatus({ ok: false, msg: "Ошибка" });
    } finally {
      setIsCheckingConnection(false);
    }
  };

  const formatProcessingDate = (timestamp?: number) => {
    if (!timestamp) return '—';
    return new Date(timestamp).toLocaleString('ru-RU');
  };

  const parseDocDate = (value?: string) => {
    if (!value) return null;
    const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (match) {
      return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime();
    }
    const parsed = Date.parse(value);
    return isNaN(parsed) ? null : parsed;
  };

  const filteredHistory = history.filter(h => {
    const orderTs = parseDocDate(h.metadata.docDate) ?? h.metadata.timestamp ?? 0;
    const processingTs = h.metadata.timestamp ?? 0;

    const orderStart = dateRange.start ? new Date(dateRange.start).getTime() : 0;
    const orderEnd = dateRange.end ? new Date(`${dateRange.end}T23:59:59`).getTime() : Number.MAX_SAFE_INTEGER;
    const processingStart = processingRange.start ? new Date(processingRange.start).getTime() : 0;
    const processingEnd = processingRange.end ? new Date(`${processingRange.end}T23:59:59`).getTime() : Number.MAX_SAFE_INTEGER;

    return orderTs >= orderStart && orderTs <= orderEnd && processingTs >= processingStart && processingTs <= processingEnd;
  });

  const handleSaveDictionaryToDb = async () => {
    if (isSavingDictionary) return;
    setIsSavingDictionary(true);
    try {
      console.log('[handleSaveDictionaryToDb] dictionary sample:', dictionary.slice(0, 3).map(d => ({ fieldName: d.fieldName, unit: d.unit, values: d.values?.substring(0, 30) })));
      const dictWithValues = dictionary.map(d => ({
        category: d.category,
        field_name: d.fieldName,
        is_active: d.isActive,
        unit: d.unit || null,
        possible_values: d.values || null
      }));
      console.log('[handleSaveDictionaryToDb] dictWithValues sample:', dictWithValues.slice(0, 3));
      addLog('info', 'Сохранение справочника в PostgreSQL', { 
        count: dictWithValues.length, 
        sampleUnit: dictWithValues.find(d => d.unit)?.unit,
        sampleValues: dictWithValues.find(d => d.possible_values)?.possible_values?.substring(0, 50)
      });
      await saveDictionaryToPostgres(dictionary);
      addLog('info', 'Справочник сохранен в PostgreSQL', { count: dictionary.length });
      alert('Справочник сохранен в базе данных.');
    } catch (e: any) {
      addLog('error', `Ошибка сохранения справочника: ${e.message}`, e);
      alert(`Ошибка сохранения: ${e.message}`);
    } finally {
      setIsSavingDictionary(false);
    }
  };

  const handleClearDatabase = async () => {
    const confirmed = window.confirm(
      'Вы уверены, что хотите полностью очистить базу данных?\n\n' +
      'Будут удалены все записи, история и справочник.'
    );
    if (!confirmed) return;

    try {
      await clearRemoteDatabase();
      await db.dictionary.clear();
      await db.orders.clear();
      await db.categoryMetadata.clear();
      setDictionary([]);
      setHistory([]);
      setCategoryMeta([]);
      setLastDbLoadCount(null);
      addLog('warn', 'База данных полностью очищена');
      alert('База данных очищена.');
    } catch (e: any) {
      addLog('error', `Ошибка очистки базы данных: ${e.message}`, e);
      alert(`Ошибка очистки: ${e.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center space-x-8">
          <div className="flex items-center space-x-3">
            <h1 className="font-black text-xl text-indigo-600 tracking-tighter">Нормализатор заказов по КТРУ</h1>
          </div>
          <nav className="flex space-x-1 bg-slate-100 p-1 rounded-xl text-sm font-bold">
            {['upload', 'dictionary', 'history', 'settings', 'logs'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-4 py-1.5 rounded-lg transition-all ${activeTab === tab ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>
                {tab === 'upload' ? 'Обработка' : tab === 'dictionary' ? 'Справочник' : tab === 'history' ? 'История' : tab === 'settings' ? 'Настройки' : 'Логи'}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center text-[10px] font-bold text-slate-400 space-x-4">
           <div className="flex items-center space-x-1">
             <div className={`w-2 h-2 rounded-full ${isRetrying ? 'bg-amber-500 animate-bounce' : hasQuotaError ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></div>
             <span>{isRetrying ? 'Retrying' : 'Online'}</span>
           </div>
        </div>
      </header>
      
      <div 
        className={`fixed bottom-6 right-6 z-50 transition-all duration-300 ${isAIMonitorOpen ? 'max-w-xs w-full' : 'w-auto'}`}
      >
        {isAIMonitorOpen ? (
          <div className="p-4 rounded-2xl shadow-2xl backdrop-blur-md border bg-slate-900/90 border-slate-700">
            <div className="flex items-center justify-between mb-2 text-slate-400 text-[10px] uppercase font-black">
              <span>AI Monitor</span>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isDictionaryLoading ? 'bg-amber-500 animate-pulse' : isRetrying ? 'bg-amber-500 animate-bounce' : hasQuotaError ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                <button 
                  onClick={() => setIsAIMonitorOpen(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="space-y-1">
               <div className="text-xs font-bold text-indigo-300 truncate">
                 {isDictionaryLoading && dictProgress ? dictProgress : lastOperationName}
               </div>
               <div className="font-mono text-[11px] bg-slate-800/50 border border-slate-700/50 text-slate-300 p-1.5 rounded-lg">
                 {lastTokenUsage}
               </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAIMonitorOpen(true)}
            className="p-3 rounded-full shadow-xl backdrop-blur-md border bg-slate-900/90 border-slate-700 hover:bg-slate-800 transition-all group"
            title="AI Monitor"
          >
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isDictionaryLoading ? 'bg-amber-500 animate-pulse' : isRetrying ? 'bg-amber-500 animate-bounce' : hasQuotaError ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></div>
              {(isDictionaryLoading || isRetrying || lastOperationName !== 'Готов к работе') && (
                <span className="text-[10px] font-bold text-indigo-300 max-w-[100px] truncate opacity-0 group-hover:opacity-100 transition-opacity">
                  {isDictionaryLoading && dictProgress ? dictProgress : lastOperationName}
                </span>
              )}
            </div>
          </button>
        )}
      </div>

      <main className="flex-grow p-6 max-w-7xl mx-auto w-full">
        {activeTab === 'upload' && (
            <div className="grid grid-cols-3 gap-6">
                <div className="bg-white p-8 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center text-center space-y-4 shadow-sm">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center"><Icons.Upload /></div>
                  <div><h3 className="font-bold">Загрузка</h3><p className="text-xs text-slate-400">PDF, DOCX, MSG</p></div>
                  <input type="file" multiple className="hidden" id="file-up" onChange={(e) => handleFiles(Array.from(e.target.files || []))} />
                  <label htmlFor="file-up" className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-sm font-bold cursor-pointer">Выбрать</label>
                </div>
                <div 
                  onDragOver={handleDragEvents}
                  onDragEnter={(e) => { handleDragEvents(e); setIsDragging(true); }}
                  onDrop={handleDrop}
                  className={`bg-white rounded-3xl border-2 border-dashed p-8 flex flex-col items-center justify-center text-center shadow-sm transition-all ${isDragging ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-200'}`}
                >
                  <div className="text-4xl mb-3 grayscale opacity-30">📦</div>
                  <p className="text-slate-400 font-bold text-sm">Перетащите файлы</p>
                </div>
                <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                  <div className="p-3 bg-slate-50 border-b text-[10px] font-black uppercase text-slate-400">Очередь</div>
                  <div className="divide-y flex-grow overflow-auto">
                    {tasks.length === 0 && <div className="p-4 text-center text-xs text-slate-300">Пусто</div>}
                    {tasks.map(t => (
                      <div key={t.id} className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs truncate font-medium flex-grow">{t.fileName}</span>
                          <div className="flex items-center gap-3">
                            {t.status === 'completed' && t.xlsxUrl && (
                              <a
                                href={t.xlsxUrl}
                                download={t.xlsxFileName || undefined}
                                className="text-[9px] bg-emerald-50 text-emerald-600 px-2 py-1 rounded-lg font-black border border-emerald-100 hover:bg-emerald-100"
                              >
                                Скачать XLSX
                              </a>
                            )}
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full ${t.status === 'error' ? 'bg-red-500' : 'bg-indigo-600'}`} style={{ width: `${t.progress}%` }} />
                            </div>
                          </div>
                        </div>
                        {t.status === 'error' && t.error && (
                          <div className="mt-2 text-[11px] text-red-600 bg-red-50 p-2 rounded border border-red-100">
                            {t.error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
            </div>
        )}
        
        {activeTab === 'dictionary' && (
           <div className="space-y-8 animate-in fade-in duration-500">
             <div className="flex flex-col space-y-4">
              <h2 className="text-2xl font-black">Справочник характеристик</h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Экспорт</span>
                  <button
                    onClick={async () => {
                      try {
                        if (dictionary.length === 0) {
                          alert('Справочник пуст. Сначала загрузите данные из КТРУ или из базы.');
                          return;
                        }
                        const unitsByCategory: Record<string, Record<string, string>> = {};
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
                          return normalized.replace(/[^a-z0-9а-я]+/gi, ' ').trim().replace(/\s+/g, ' ');
                        };
                        dictionary.forEach(d => {
                          if (d.category === 'Прочее' || !d.isActive) return;
                          if (!unitsByCategory[d.category]) unitsByCategory[d.category] = {};
                          unitsByCategory[d.category][d.fieldName] = d.unit || '';
                          const nk = normalizeKey(d.fieldName);
                          unitsByCategory[d.category][nk] = d.unit || '';
                        });
                        addLog('info', '[XLSX] Шаблон из справочника', { totalFields: dictionary.length, categories: Object.keys(unitsByCategory).length });
                        await generateTemplate(dictionary, unitsByCategory);
                      } catch (e: any) {
                        addLog('error', `Ошибка XLSX: ${e.message}`, e);
                        alert(`Ошибка XLSX: ${e.message}`);
                      }
                    }}
                    className="w-full flex items-center justify-center space-x-2 bg-emerald-50 text-emerald-600 p-2.5 rounded-xl font-bold text-xs border border-emerald-100 hover:bg-emerald-100 transition-all"
                  >
                    <Icons.Download />
                    <span>Скачать шаблон XLSX</span>
                  </button>
                  <button onClick={handleSaveDictionaryToDb} disabled={isSavingDictionary} className={`w-full flex items-center justify-center space-x-2 bg-indigo-50 text-indigo-600 p-2.5 rounded-xl font-bold text-xs border border-indigo-100 hover:bg-indigo-100 transition-all ${isSavingDictionary ? 'opacity-60 cursor-not-allowed' : ''}`}>
                    <span>{isSavingDictionary ? 'Сохранение...' : 'Сохранить данные в базу'}</span>
                  </button>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Импорт</span>
                  <div className="flex flex-col space-y-2">
                    <button onClick={handleLoadFromDb} className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-xs hover:bg-slate-100">Загрузить из базы данных</button>
                    {lastDbLoadCount !== null && (
                      <div className="text-[10px] font-black uppercase text-slate-400">
                        Загружено из БД: {lastDbLoadCount}
                      </div>
                    )}
                    <input type="file" accept=".xlsx" className="hidden" ref={dictImportRef} onChange={(e) => e.target.files?.[0] && handleLoadFromTemplate(e.target.files[0])} />
                    <button onClick={() => dictImportRef.current?.click()} className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl font-bold text-xs hover:bg-slate-100">Загрузить из файла</button>
                  </div>
                </div>
                <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100 shadow-sm space-y-4">
                  <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Автоматизация</span>
                  <div className="flex flex-col space-y-2">
                    <label className="text-[10px] font-black uppercase text-indigo-400 ml-1">Источник КТРУ</label>
                    <select
                      value={dbConfig.ktruSource || 'zakupki.gov.ru'}
                      onChange={e => setDbConfig({ ...dbConfig, ktruSource: e.target.value as any })}
                      className="w-full bg-white border p-2 rounded-xl text-xs font-bold"
                    >
                      <option value="zakupki.gov.ru">zakupki.gov.ru</option>
                      <option value="zakupki44fz.ru">zakupki44fz.ru</option>
                    </select>
                    {dbConfig.ktruSource === 'zakupki44fz.ru' && (
                      <div className="flex flex-col space-y-2">
                        <input
                          value={dbConfig.ktru44ShortToken || ''}
                          onChange={e => setDbConfig({ ...dbConfig, ktru44ShortToken: e.target.value })}
                          placeholder="shortAuthToken (zakupki44fz.ru)"
                          className="w-full bg-white border p-2 rounded-xl text-xs font-mono"
                        />
                        <input
                          value={dbConfig.ktru44Token || ''}
                          onChange={e => setDbConfig({ ...dbConfig, ktru44Token: e.target.value })}
                          placeholder="JWT токен (опционально)"
                          className="w-full bg-white border p-2 rounded-xl text-xs font-mono"
                        />
                      </div>
                    )}
                    <button 
                      onClick={() => handleDictionaryUpdate(Object.values(EquipmentCategory))} 
                      disabled={isDictionaryLoading}
                      className={`w-full bg-indigo-600 text-white p-2.5 rounded-xl font-black text-xs uppercase shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                    >
                      {isDictionaryLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Загрузка...</span>
                        </>
                      ) : 'Обновить все из КТРУ'}
                    </button>
                    <button
                      onClick={() => handleDictionaryUpdatePrintForms(Object.values(EquipmentCategory))}
                      disabled={isDictionaryLoading}
                      className={`w-full bg-white text-indigo-700 p-2.5 rounded-xl font-black text-xs uppercase shadow-sm border border-indigo-200 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      Загрузить данные из печатных форм
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="space-y-6">
                {Object.values(EquipmentCategory).map((cat) => (
                  <div key={cat} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex flex-col">
                        <h4 className="font-bold text-indigo-600">{cat} - {getDisplayIndex(cat)}</h4>
                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">КТРУ (полный): {CATEGORY_KTRU_INDICES[cat] || '—'}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Признаки: {dictionary.filter(d => d.category === cat).length}</p>
                      </div>
                      <div className="flex flex-col items-end space-y-1">
                        <button onClick={() => handleDictionaryUpdate([cat])} className="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg font-black border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all">⚡ КТРУ</button>
                        <button onClick={() => handleDictionaryUpdatePrintForms([cat])} className="text-[9px] bg-slate-50 text-slate-600 px-2 py-1 rounded-lg font-black border border-slate-200 hover:bg-slate-200 transition-all">🖨️ КТРУ</button>
                      </div>
                    </div>
                    <div className="overflow-hidden">
                      <div className="max-h-64 overflow-auto border border-slate-100 rounded-2xl">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 text-[10px] font-black text-slate-400 sticky top-0">
                            <tr>
                              <th className="px-3 py-2">Наименование характеристики</th>
                              <th className="px-3 py-2 w-20">Ед. изм</th>
                              <th className="px-3 py-2">Значения</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {dictionary.filter(d => d.category === cat).map((d, i) => (
                              <tr key={i} className="text-[10px]">
                                <td className="px-3 py-2 text-slate-600">{d.fieldName}</td>
                                <td className="px-3 py-2 text-slate-500">{d.unit || ''}</td>
                                <td className="px-3 py-2 text-slate-500 text-[9px] max-w-xs truncate" title={d.values || ''}>{d.values || ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* НОВЫЙ БЛОК: ПРОВЕРКА ДАННЫХ ИЗ КТРУ */}
              <div className="mt-12 bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xl ring-8 ring-indigo-50/50">
                <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">🔍</span>
                    <div>
                      <h3 className="font-black text-lg">Проверка данных из КТРУ (Песочница)</h3>
                      <p className="text-xs text-slate-400">Загрузка структуры характеристик с актуализацией через поиск</p>
                    </div>
                  </div>
                </div>
                <div className="p-8 space-y-6">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-grow space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Введите индекс или код КТРУ</label>
                      <input 
                        type="text" 
                        value={ktruLookupCode} 
                        onChange={(e) => setKtruLookupCode(e.target.value)}
                        placeholder="Например: 26.20.14.000-00000001"
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3.5 font-bold focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300 shadow-inner"
                      />
                    </div>
                    <div className="flex items-end">
                      <button 
                        onClick={handleKtruLookup}
                        disabled={isLookupLoading}
                        className={`h-[54px] px-8 rounded-2xl font-black text-sm uppercase transition-all flex items-center justify-center space-x-2 shadow-lg shadow-indigo-100 ${isLookupLoading ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-[1.02] active:scale-95'}`}
                      >
                        {isLookupLoading ? (
                          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <><span>⚡</span><span>Найти актуальные данные</span></>
                        )}
                      </button>
                    </div>
                  </div>

                  {ktruLookupResult && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                      <div className="flex items-center justify-end space-x-2 px-2">
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(ktruLookupResult);
                            alert("Скопировано в буфер обмена");
                          }}
                          className="text-[10px] bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-xl font-black hover:bg-indigo-600 hover:text-white transition-all border border-indigo-100 flex items-center space-x-2"
                        >
                          <span>📋</span>
                          <span>Копировать</span>
                        </button>
                        <button 
                          onClick={() => exportKtruLookupToExcel(ktruLookupCode, ktruLookupResult)}
                          className="text-[10px] bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-xl font-black hover:bg-emerald-600 hover:text-white transition-all border border-emerald-100 flex items-center space-x-2"
                        >
                          <Icons.Download />
                          <span>Выгрузить в XLSX</span>
                        </button>
                      </div>
                      
                      <div className="bg-slate-50 border-2 border-slate-100 rounded-3xl p-6 min-h-[300px] max-h-[600px] overflow-auto shadow-inner">
                        <pre className="text-sm font-bold text-slate-700 whitespace-pre-wrap leading-relaxed font-sans">
                          {ktruLookupResult}
                        </pre>
                      </div>

                      {ktruSources.length > 0 && (
                        <div className="px-2 space-y-2">
                          <span className="text-[10px] font-black uppercase text-slate-400">Использованные источники:</span>
                          <div className="flex flex-wrap gap-2">
                            {ktruSources.map((source, idx) => (
                              <a 
                                key={idx} 
                                href={source.uri} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-[10px] bg-white border border-slate-200 px-3 py-1.5 rounded-lg font-bold text-indigo-600 hover:bg-indigo-50 transition-all flex items-center space-x-1"
                              >
                                <span>🔗</span>
                                <span className="max-w-[200px] truncate">{source.title}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!ktruLookupResult && !isLookupLoading && (
                    <div className="py-12 flex flex-col items-center text-center space-y-4 opacity-30 grayscale">
                      <div className="text-6xl">🌍</div>
                      <p className="text-sm font-bold text-slate-400">
                        Введите код выше. Поиск будет произведен на официальных сайтах <br/> 
                        zakupki.gov.ru, zakupki44fz.ru и bicotender.ru в реальном времени.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* СКАНИРОВАНИЕ КОДОВ КТРУ */}
              <div className="mt-12 bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xl">
                <div className="p-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">📡</span>
                    <div>
                      <h3 className="font-black text-lg">Сканирование кодов КТРУ</h3>
                      <p className="text-xs text-purple-100">Поиск всех позиций в группе КТРУ</p>
                    </div>
                  </div>
                  {scannedCodesCount !== null && (
                    <div className="text-xs text-purple-100">
                      В базе: {scannedCodesCount} кодов
                    </div>
                  )}
                </div>
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400">Группа КТРУ</label>
                      <div className="flex gap-2 mb-2">
                        <button
                          onClick={() => setUseCustomGroupCode(false)}
                          className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold transition-all ${!useCustomGroupCode ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          Из списка
                        </button>
                        <button
                          onClick={() => setUseCustomGroupCode(true)}
                          className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold transition-all ${useCustomGroupCode ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          Вручную
                        </button>
                      </div>
                      {!useCustomGroupCode ? (
                        <select 
                          value={scanGroupCode} 
                          onChange={e => setScanGroupCode(e.target.value)}
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold focus:border-indigo-500 outline-none transition-all"
                        >
                          <option value="26.20.14.000">26.20.14.000 — Сервер</option>
                          <option value="26.20.15.000">26.20.15.000 — ПК и Моноблоки</option>
                          <option value="26.20.17.110">26.20.17.110 — Мониторы</option>
                          <option value="26.20.11.110">26.20.11.110 — Ноутбуки/Планшеты</option>
                          <option value="26.20.18.000">26.20.18.000 — МФУ</option>
                          <option value="26.20.16.120">26.20.16.120 — Принтеры</option>
                          <option value="26.20.16.110">26.20.16.110 — Клавиатуры</option>
                          <option value="26.20.16.170">26.20.16.170 — Мышь</option>
                          <option value="26.30.11.120">26.30.11.120 — Маршрутизаторы</option>
                          <option value="26.30.11.110">26.30.11.110 — Коммутаторы</option>
                          <option value="26.20.40.110">26.20.40.110 — ИБП</option>
                        </select>
                      ) : (
                        <input 
                          type="text" 
                          value={scanGroupCodeCustom} 
                          onChange={e => setScanGroupCodeCustom(e.target.value)}
                          placeholder="XX.XX.XX.XXX"
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold focus:border-indigo-500 outline-none transition-all font-mono"
                        />
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400">От номера</label>
                      <input 
                        type="number" 
                        value={scanStart} 
                        onChange={e => setScanStart(Math.max(1, parseInt(e.target.value) || 1))}
                        min={1}
                        max={99999}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400">До номера</label>
                      <input 
                        type="number" 
                        value={scanEnd} 
                        onChange={e => setScanEnd(Math.max(1, parseInt(e.target.value) || 1))}
                        min={1}
                        max={99999}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400">Запросов в секунду (0.1-10)</label>
                      <input 
                        type="number" 
                        value={scanRequestsPerSecond} 
                        onChange={e => setScanRequestsPerSecond(Math.max(0.1, Math.min(10, parseFloat(e.target.value) || 0.5)))}
                        step={0.1}
                        min={0.1}
                        max={10}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400">Пауза между запросами, сек (0.1-60)</label>
                      <input 
                        type="number" 
                        value={scanPauseSeconds} 
                        onChange={e => setScanPauseSeconds(Math.max(0.1, Math.min(60, parseFloat(e.target.value) || 2)))}
                        step={0.1}
                        min={0.1}
                        max={60}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={handleStartScan}
                      disabled={isScanning}
                      className={`flex-1 py-3 rounded-xl font-bold text-sm uppercase transition-all flex items-center justify-center gap-2 ${
                        isScanning 
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg'
                      }`}
                    >
                      {isScanning ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Сканирование...</span>
                        </>
                      ) : (
                        <span>📡 Запустить сканирование</span>
                      )}
                    </button>
                    <button 
                      onClick={handleSaveScannedCodes}
                      disabled={scanResults.length === 0 || isScanning}
                      className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                        scanResults.length === 0 || isScanning
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      💾 Сохранить в БД
                    </button>
                    <button 
                      onClick={handleExportScannedCodesToExcel}
                      disabled={scanResults.length === 0 || isScanning}
                      className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                        scanResults.length === 0 || isScanning
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      📊 Сохранить в XLS
                    </button>
                    <button 
                      onClick={handleClearScannedCodes}
                      className="px-4 py-3 rounded-xl font-bold text-sm bg-white border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
                    >
                      🗑️ Очистить
                    </button>
                  </div>
                  {scanProgress && (
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-500">Прогресс</span>
                        <span className="text-xs font-bold text-indigo-600">
                          {scanProgress.current} / {scanProgress.total}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-600 transition-all duration-300"
                          style={{ width: `${Math.round((scanProgress.current / Math.max(scanProgress.total, 1)) * 100)}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">{scanProgress.status}</p>
                    </div>
                  )}
                  {scanResults.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <div className="p-3 bg-slate-50 border-b flex items-center justify-between">
                        <span className="text-xs font-black uppercase text-slate-400">
                          Найдено: {scanResults.length} позиций
                        </span>
                        <button 
                          onClick={async () => {
                            const csv = scanResults.map(r => `${r.item_id}\t${r.name}\t${r.ktru_status || ''}`).join('\n');
                            navigator.clipboard.writeText(csv);
                            alert('Скопировано в буфер обмена');
                          }}
                          className="text-[10px] bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-100 transition-all"
                        >
                          📋 Копировать
                        </button>
                      </div>
                      <div className="max-h-[400px] overflow-auto">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 text-[10px] font-black text-slate-400 sticky top-0">
                            <tr>
                              <th className="px-4 py-2">Код КТРУ</th>
                              <th className="px-4 py-2">Наименование</th>
                              <th className="px-4 py-2 w-24">КТРУ статус</th>
                              <th className="px-4 py-2 w-16">Найден</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {scanResults.map((r, i) => (
                              <tr key={i} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-2 text-xs font-mono">{r.item_id}</td>
                                <td className="px-4 py-2 text-xs font-medium">{r.name}</td>
                                <td className="px-4 py-2">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    r.ktru_status === 'included' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                    r.ktru_status === 'excluded' ? 'bg-red-50 text-red-700 border border-red-200' :
                                    'bg-slate-100 text-slate-500'
                                  }`}>
                                    {r.ktru_status === 'included' ? '✓ Включено' : 
                                     r.ktru_status === 'excluded' ? '✗ Исключено' : 
                                     '—'}
                                  </span>
                                </td>
                                <td className="px-4 py-2">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    r.status === 'found' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                                  }`}>
                                    {r.status === 'found' ? '✓' : '✗'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {!isScanning && scanResults.length === 0 && (
                    <div className="py-8 text-center text-slate-400">
                      <p className="text-sm">Укажите диапазон номеров и нажмите "Запустить сканирование"</p>
                      <p className="text-xs mt-2">Результаты появятся в таблице выше</p>
                    </div>
                  )}
                </div>
              </div>

             </div>
            </div>
         )}

        {activeTab === 'history' && (
          <div className="space-y-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                  <div className="space-y-1">
                    <h2 className="text-xl font-black">Сводный отчет</h2>
                    <p className="text-xs text-slate-400">Экспорт данных за период</p>
                  </div>
                  <button onClick={async () => {
                    setIsExporting(true);
                    try {
                      const orders = filteredHistory;
                      if (orders.length) generateConsolidatedReport(orders, await db.dictionary.toArray());
                    } finally { setIsExporting(false); }
                  }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors">Экспорт</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-black uppercase text-slate-500 tracking-wide">Дата заказа</span>
                      <span className="text-[10px] text-slate-400 font-medium">с — по</span>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                      <span className="text-slate-300">—</span>
                      <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                    </div>
                    <div className="flex gap-1">
                      {[
                        { label: 'Год', fn: () => { const today = new Date(); const start = new Date(today.getFullYear(), 0, 1); setDateRange({ start: start.toISOString().split('T')[0], end: today.toISOString().split('T')[0] }); }},
                        { label: 'Месяц', fn: () => { const today = new Date(); const start = new Date(today.getFullYear(), today.getMonth(), 1); setDateRange({ start: start.toISOString().split('T')[0], end: today.toISOString().split('T')[0] }); }},
                        { label: 'Неделя', fn: () => { const today = new Date(); const start = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000); setDateRange({ start: start.toISOString().split('T')[0], end: today.toISOString().split('T')[0] }); }},
                      ].map(btn => (
                        <button key={btn.label} onClick={btn.fn} className="flex-1 px-2 py-1.5 text-[10px] font-bold bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-lg text-slate-600 hover:text-indigo-600 transition-all">{btn.label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-black uppercase text-slate-500 tracking-wide">Дата обработки</span>
                      <span className="text-[10px] text-slate-400 font-medium">с — по</span>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <input type="date" value={processingRange.start} onChange={e => setProcessingRange({ ...processingRange, start: e.target.value })} className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                      <span className="text-slate-300">—</span>
                      <input type="date" value={processingRange.end} onChange={e => setProcessingRange({ ...processingRange, end: e.target.value })} className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                    </div>
                    <div className="flex gap-1">
                      {[
                        { label: 'Год', fn: () => { const today = new Date(); const start = new Date(today.getFullYear(), 0, 1); setProcessingRange({ start: start.toISOString().split('T')[0], end: today.toISOString().split('T')[0] }); }},
                        { label: 'Месяц', fn: () => { const today = new Date(); const start = new Date(today.getFullYear(), today.getMonth(), 1); setProcessingRange({ start: start.toISOString().split('T')[0], end: today.toISOString().split('T')[0] }); }},
                        { label: 'Неделя', fn: () => { const today = new Date(); const start = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000); setProcessingRange({ start: start.toISOString().split('T')[0], end: today.toISOString().split('T')[0] }); }},
                      ].map(btn => (
                        <button key={btn.label} onClick={btn.fn} className="flex-1 px-2 py-1.5 text-[10px] font-bold bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-lg text-slate-600 hover:text-indigo-600 transition-all">{btn.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
             <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-4 bg-slate-50/50 border-b flex items-center justify-between">
                  <span className="text-[10px] uppercase font-black text-slate-400 tracking-widest">История</span>
                  <span className="text-[10px] font-bold text-slate-500">{filteredHistory.length} записей</span>
                </div>
                <div className="overflow-x-auto">
                   <table className="w-full text-left">
                      <thead className="bg-slate-50 text-[10px] font-black text-slate-400 border-b">
                        <tr>
                          <th className="px-6 py-4">Дата заказа</th>
                          <th className="px-6 py-4">Дата обработки</th>
                          <th className="px-6 py-4">Заказчик</th>
                          <th className="px-4 py-4">ИНН</th>
                          <th className="px-6 py-4">Товары</th>
                          <th className="px-6 py-4 text-center">Кол-во</th>
                          <th className="px-6 py-4 text-right">ID</th>
                          <th className="px-6 py-4 text-right">Файл</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                       {filteredHistory.map((h, i) => (
                         <tr key={i} className="hover:bg-slate-50 transition-colors">
                           <td className="px-6 py-4 text-xs font-medium text-slate-600">{h.metadata.docDate || '—'}</td>
                           <td className="px-6 py-4 text-xs font-medium text-slate-600">{formatProcessingDate(h.metadata.timestamp)}</td>
                           <td className="px-6 py-4 font-bold text-xs text-slate-700">{h.metadata.customerName || '—'}</td>
                           <td className="px-4 py-4 text-xs text-slate-600 font-mono">{h.metadata.customerInn || '—'}</td>
                           <td className="px-6 py-4 text-[10px] text-slate-500 max-w-xs truncate">{h.items.map((it: any) => it.name).join(', ')}</td>
                           <td className="px-6 py-4 text-center font-bold text-xs text-slate-700">{h.items.reduce((a: any, b: any) => a + b.quantity, 0)}</td>
                           <td className="px-6 py-4 text-right text-[10px] font-mono text-slate-400">{h.metadata.processingId}</td>
                           <td className="px-6 py-4 text-right text-[10px] text-slate-500 max-w-[150px] truncate" title={h.metadata.sourceFile}>{h.metadata.sourceFile || '—'}</td>
                         </tr>
                       ))}
                     </tbody>
                  </table>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <h2 className="text-xl font-black">⚙️ Настройки AI Провайдера</h2>
              
              <div className="p-1 bg-slate-100 rounded-xl flex">
                <button onClick={() => setDbConfig({...dbConfig, llm: {...dbConfig.llm, provider: 'google'}})} className={`flex-1 py-2 rounded-lg text-xs font-bold ${dbConfig.llm.provider === 'google' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Google Gemini</button>
                <button onClick={() => setDbConfig({...dbConfig, llm: {...dbConfig.llm, provider: 'openrouter'}})} className={`flex-1 py-2 rounded-lg text-xs font-bold ${dbConfig.llm.provider === 'openrouter' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>OpenRouter</button>
                <button onClick={() => setDbConfig({...dbConfig, llm: {...dbConfig.llm, provider: 'ollama'}})} className={`flex-1 py-2 rounded-lg text-xs font-bold ${dbConfig.llm.provider === 'ollama' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}>Ollama</button>
              </div>

              <div className="space-y-4 pt-4 border-t">
                {dbConfig.llm.provider === 'google' && (() => {
                  const hasEnvKey = !!envKeys.google;
                  const useCustomKey = !!dbConfig.llm.googleApiKey;
                  return (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black uppercase text-slate-400">API Key Google Gemini</label>
                        {hasEnvKey && !useCustomKey && (
                          <span className="text-[10px] text-emerald-600 font-bold">✓ Найден в конфигурации: {maskKey(envKeys.google)}</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {hasEnvKey && (
                          <label className="flex items-center gap-1 text-xs">
                            <input 
                              type="radio" 
                              checked={!useCustomKey} 
                              onChange={() => setDbConfig({...dbConfig, llm: {...dbConfig.llm, googleApiKey: ''}})}
                              className="w-3 h-3"
                            />
                            <span>Из .env</span>
                          </label>
                        )}
                        <label className="flex items-center gap-1 text-xs">
                          <input 
                            type="radio" 
                            checked={useCustomKey} 
                            onChange={() => setDbConfig({...dbConfig, llm: {...dbConfig.llm, googleApiKey: dbConfig.llm.googleApiKey || ' '}})}
                            className="w-3 h-3"
                          />
                          <span>API ключ</span>
                        </label>
                      </div>
                      {useCustomKey && (
                        <input 
                          type="password" 
                          value={dbConfig.llm.googleApiKey || ''} 
                          onChange={e => setDbConfig({...dbConfig, llm: {...dbConfig.llm, googleApiKey: e.target.value}})} 
                          placeholder="AIza..." 
                          className="w-full p-2 bg-white border rounded-lg text-sm font-mono" 
                        />
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400">Модель</label>
                      <select value={dbConfig.llm.googleModel} onChange={e => setDbConfig({...dbConfig, llm: {...dbConfig.llm, googleModel: e.target.value}})} className="w-full bg-white border p-2 rounded-lg text-sm font-bold outline-none">
                        {LLM_MODELS.google.map(m => (
                          <option key={m.id} value={m.id}>{m.name} ({m.context})</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={async () => { await saveDbConfig(dbConfig); setIsSettingsSaved(true); setTimeout(() => setIsSettingsSaved(false), 2000); }} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-xs font-bold transition-colors">{isSettingsSaved ? '✓ Сохранено' : 'Сохранить'}</button>
                      <button onClick={handleCheckLlm} disabled={isCheckingLlm} className="flex-1 bg-white border border-slate-200 text-slate-700 py-2 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50">{isCheckingLlm ? 'Проверка...' : 'Проверить'}</button>
                    </div>
                     {llmStatus && dbConfig.llm.provider === 'google' && (
                       <div className={`p-3 rounded-lg text-xs font-medium border ${llmStatus.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>{llmStatus.msg}</div>
                     )}
                   </div>
                   );
                 })()}

                 {dbConfig.llm.provider === 'openrouter' && (() => {
                  const hasEnvKey = !!envKeys.openrouter;
                  const useCustomKey = !!dbConfig.llm.openrouterApiKey;
                  return (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black uppercase text-slate-400">API Key OpenRouter</label>
                        {hasEnvKey && !useCustomKey && (
                          <span className="text-[10px] text-emerald-600 font-bold">✓ Найден в конфигурации: {maskKey(envKeys.openrouter)}</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {hasEnvKey && (
                          <label className="flex items-center gap-1 text-xs">
                            <input 
                              type="radio" 
                              checked={!useCustomKey} 
                              onChange={() => setDbConfig({...dbConfig, llm: {...dbConfig.llm, openrouterApiKey: ''}})}
                              className="w-3 h-3"
                            />
                            <span>Из .env</span>
                          </label>
                        )}
                        <label className="flex items-center gap-1 text-xs">
                          <input 
                            type="radio" 
                            checked={useCustomKey} 
                            onChange={() => setDbConfig({...dbConfig, llm: {...dbConfig.llm, openrouterApiKey: dbConfig.llm.openrouterApiKey || ' '}})}
                            className="w-3 h-3"
                          />
                          <span>API ключ</span>
                        </label>
                      </div>
                      {useCustomKey && (
                        <input 
                          type="password" 
                          value={dbConfig.llm.openrouterApiKey || ''} 
                          onChange={e => setDbConfig({...dbConfig, llm: {...dbConfig.llm, openrouterApiKey: e.target.value}})} 
                          placeholder="sk-or-..." 
                          className="w-full p-2 bg-white border rounded-lg text-sm font-mono" 
                        />
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400">Модель</label>
                      <select value={dbConfig.llm.openrouterModel} onChange={e => setDbConfig({...dbConfig, llm: {...dbConfig.llm, openrouterModel: e.target.value}})} className="w-full bg-white border p-2 rounded-lg text-sm font-bold outline-none">
                        {LLM_MODELS.openrouter.map(m => (
                          <option key={m.id} value={m.id}>{m.free ? '⚡ ' : ''}{m.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={async () => { await saveDbConfig(dbConfig); setIsSettingsSaved(true); setTimeout(() => setIsSettingsSaved(false), 2000); }} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-xs font-bold transition-colors">{isSettingsSaved ? '✓ Сохранено' : 'Сохранить'}</button>
                      <button onClick={handleCheckLlm} disabled={isCheckingLlm} className="flex-1 bg-white border border-slate-200 text-slate-700 py-2 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50">{isCheckingLlm ? 'Проверка...' : 'Проверить'}</button>
                    </div>
                    {llmStatus && dbConfig.llm.provider === 'openrouter' && (
                      <div className={`p-3 rounded-lg text-xs font-medium border ${llmStatus.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>{llmStatus.msg}</div>
                    )}
                  </div>
                  );
                })()}

                {dbConfig.llm.provider === 'ollama' && (
                  <div className="space-y-4">
                    <div className="flex space-x-4">
                      <label className="flex items-center space-x-2 text-sm font-bold">
                        <input type="radio" checked={dbConfig.llm.ollamaMode === 'local'} onChange={() => setDbConfig({...dbConfig, llm: {...dbConfig.llm, ollamaMode: 'local'}})} />
                        <span>Локальный сервер</span>
                      </label>
                      <label className="flex items-center space-x-2 text-sm font-bold">
                        <input type="radio" checked={dbConfig.llm.ollamaMode === 'cloud'} onChange={() => setDbConfig({...dbConfig, llm: {...dbConfig.llm, ollamaMode: 'cloud'}})} />
                        <span>Ollama Cloud</span>
                      </label>
                    </div>

                    {dbConfig.llm.ollamaMode === 'local' ? (
                      <>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-400">Endpoint</label>
                          <input value={dbConfig.llm.ollamaEndpoint} onChange={e => setDbConfig({...dbConfig, llm: {...dbConfig.llm, ollamaEndpoint: e.target.value}})} placeholder="http://localhost:11434" className="w-full p-2 bg-slate-50 border rounded-lg text-sm" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black uppercase text-slate-400">Модель</label>
                            <button onClick={async () => {
                              const models = await fetchLocalOllamaModels(dbConfig.llm.ollamaEndpoint);
                              if (models.length > 0) {
                                setDbConfig({...dbConfig, llm: {...dbConfig.llm, ollamaLocalModels: models, ollamaLocalModel: models[0]}});
                                alert(`Найдено моделей: ${models.length}`);
                              } else {
                                alert("Не удалось получить список моделей. Проверьте Endpoint.");
                              }
                            }} className="text-[10px] text-indigo-600 font-bold hover:underline">🔄 Обновить список</button>
                          </div>
                          <select value={dbConfig.llm.ollamaLocalModel} onChange={e => setDbConfig({...dbConfig, llm: {...dbConfig.llm, ollamaLocalModel: e.target.value}})} className="w-full bg-white border p-2 rounded-lg text-sm font-bold outline-none">
                            {dbConfig.llm.ollamaLocalModels?.map(m => (
                              <option key={m} value={m}>{m}</option>
                            )) || <option value="">Нет моделей</option>}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={async () => { await saveDbConfig(dbConfig); setIsSettingsSaved(true); setTimeout(() => setIsSettingsSaved(false), 2000); }} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-xs font-bold transition-colors">{isSettingsSaved ? '✓ Сохранено' : 'Сохранить'}</button>
                          <button onClick={handleCheckLlm} disabled={isCheckingLlm} className="flex-1 bg-white border border-slate-200 text-slate-700 py-2 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50">{isCheckingLlm ? 'Проверка...' : 'Проверить'}</button>
                        </div>
                      </>
                    ) : (() => {
                      // Ollama Cloud - always requires user to enter API key (no env fallback for security)
                      return (
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400">API Key Ollama Cloud</label>
                            <input 
                              type="password" 
                              value={dbConfig.llm.ollamaCloudApiKey || ''} 
                              onChange={e => setDbConfig({...dbConfig, llm: {...dbConfig.llm, ollamaCloudApiKey: e.target.value}})} 
                              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.a_xxxxxxxxxxxxxxxxxxxx" 
                              className="w-full p-2 bg-white border rounded-lg text-sm font-mono" 
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400">Облачная модель</label>
                            <select value={dbConfig.llm.ollamaCloudModel} onChange={e => setDbConfig({...dbConfig, llm: {...dbConfig.llm, ollamaCloudModel: e.target.value}})} className="w-full bg-white border p-2 rounded-lg text-sm font-bold outline-none">
                              {LLM_MODELS.ollama_cloud.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={async () => { await saveDbConfig(dbConfig); setIsSettingsSaved(true); setTimeout(() => setIsSettingsSaved(false), 2000); }} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-xs font-bold transition-colors">{isSettingsSaved ? '✓ Сохранено' : 'Сохранить'}</button>
                            <button onClick={handleCheckLlm} disabled={isCheckingLlm} className="flex-1 bg-white border border-slate-200 text-slate-700 py-2 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50">{isCheckingLlm ? 'Проверка...' : 'Проверить'}</button>
                          </div>
                          {llmStatus && dbConfig.llm.provider === 'ollama' && dbConfig.llm.ollamaMode === 'cloud' && (
                            <div className={`p-3 rounded-lg text-xs font-medium border ${llmStatus.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>{llmStatus.msg}</div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <h2 className="text-xl font-black">⚙️ Настройки Хранилища</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">IP / Host</label>
                    <input value={dbConfig.host} onChange={e => setDbConfig({...dbConfig, host: e.target.value})} placeholder="79.174.88.161" className="w-full p-2 bg-slate-50 border rounded-lg text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Порт</label>
                    <input value={dbConfig.port} onChange={e => setDbConfig({...dbConfig, port: e.target.value})} placeholder="16372" className="w-full p-2 bg-slate-50 border rounded-lg text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Имя БД</label>
                    <input value={dbConfig.dbName} onChange={e => setDbConfig({...dbConfig, dbName: e.target.value})} placeholder="ktru_1" className="w-full p-2 bg-slate-50 border rounded-lg text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Пользователь</label>
                    <input value={dbConfig.user} onChange={e => setDbConfig({...dbConfig, user: e.target.value})} placeholder="ktru_dev" className="w-full p-2 bg-slate-50 border rounded-lg text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Пароль</label>
                    <input type="password" value={dbConfig.password} onChange={e => setDbConfig({...dbConfig, password: e.target.value})} placeholder="******" className="w-full p-2 bg-slate-50 border rounded-lg text-sm" />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <input type="checkbox" id="useProxy" checked={dbConfig.useProxy} onChange={e => setDbConfig({...dbConfig, useProxy: e.target.checked})} className="w-4 h-4" />
                  <label htmlFor="useProxy" className="text-xs font-bold text-slate-500">Использовать прокси (CORS)</label>
                </div>
                <div className="flex space-x-3">
                  <button onClick={async () => { await saveDbConfig(dbConfig); setIsSettingsSaved(true); setTimeout(() => setIsSettingsSaved(false), 2000); }} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg">{isSettingsSaved ? '✅ Сохранено' : 'Сохранить'}</button>
                  <button onClick={handleCheckConnection} className="flex-1 bg-white border border-slate-200 text-slate-700 py-3 rounded-xl font-bold">Проверить</button>
                </div>
                {connectionStatus && (
                   <div className={`p-4 rounded-xl text-xs font-bold border ${connectionStatus.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{connectionStatus.msg}</div>
                )}
              </div>
            </div>
            <div className="bg-red-50 p-8 rounded-3xl border border-red-100 space-y-4">
              <h3 className="text-red-600 font-black">Сброс</h3>
              <button onClick={handleClearDatabase} className="w-full bg-white border border-red-200 text-red-500 py-3 rounded-xl font-bold hover:bg-red-500 hover:text-white transition-all">Очистить базу данных</button>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="space-y-1">
                <h2 className="text-xl font-black">Логи системы</h2>
                <p className="text-xs text-slate-400">История операций и ошибок AI и приложения</p>
              </div>
              <button onClick={clearLogs} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-bold transition-colors">
                Очистить логи
              </button>
            </div>
            
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] font-black text-slate-400 border-b">
                    <tr>
                      <th className="px-6 py-4">Время</th>
                      <th className="px-6 py-4">Тип</th>
                      <th className="px-6 py-4">Сообщение</th>
                      <th className="px-6 py-4">Детали</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {appLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-6 py-4 text-[10px] text-slate-500 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${
                            log.level === 'error' ? 'bg-red-50 text-red-600 border border-red-100' : 
                            log.level === 'warn' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 
                            'bg-blue-50 text-blue-600 border border-blue-100'
                          }`}>
                            {log.level}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-slate-700 max-w-sm">
                          {log.message}
                        </td>
                        <td className="px-6 py-4 text-[10px] text-slate-500 font-mono max-w-md break-all">
                          {log.details ? (
                            <details className="cursor-pointer">
                              <summary className="text-indigo-500 font-bold hover:underline">Развернуть</summary>
                              <pre className="mt-2 p-2 bg-slate-100 rounded-lg overflow-x-auto max-h-40">
                                {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details)}
                              </pre>
                            </details>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                    {appLogs.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-400 font-bold">
                          Логов пока нет
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
