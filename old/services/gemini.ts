import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { EquipmentCategory, DictionaryField, EquipmentItem, OrderMetadata, LLMConfig, Characteristic } from "../types";
import { getDbConfig, getApiUrl } from "./db";
import { addLog } from "./logger";

// Helper for generic token usage format
const formatTokenUsageString = (k: number, p: number, t: number, total: number) => {
  return `K_${k.toFixed(1)}+P_${p.toFixed(1)}+T_${t.toFixed(1)}=${total.toFixed(1)}`;
};

// Unit conversion factors (to base unit)
// canonicalName = эталонное название единицы из справочника КТРУ
const UNIT_CONVERSIONS: Record<string, { base: string; factor: number; aliases: string[]; canonicalName: string }> = {
  'Гб': { base: 'Гб', factor: 1, aliases: ['гб', 'гигабайт', 'gb', 'gigabyte', 'гигабайта', 'гигабайтов', 'гбайт'], canonicalName: 'Гигабайт' },
  'Мб': { base: 'Гб', factor: 1/1024, aliases: ['мб', 'мегабайт', 'mb', 'megabyte', 'мбайт'], canonicalName: 'Мегабайт' },
  'Кб': { base: 'Гб', factor: 1/1024/1024, aliases: ['кб', 'килобайт', 'kb', 'kilobyte', 'кбайт'], canonicalName: 'Килобайт' },
  'Тб': { base: 'Гб', factor: 1024, aliases: ['тб', 'терабайт', 'tb', 'terabyte', 'тбайт', 'тбайта'], canonicalName: 'Терабайт' },
  'ГГц': { base: 'ГГц', factor: 1, aliases: ['ггц', 'гигагерц', 'ghz', 'gigahertz'], canonicalName: 'Гигагерц' },
  'МГц': { base: 'ГГц', factor: 1/1000, aliases: ['мгц', 'мегагерц', 'mhz', 'megahertz'], canonicalName: 'Мегагерц' },
  'КГц': { base: 'ГГц', factor: 1/1000000, aliases: ['кгц', 'килогерц', 'khz', 'kilohertz'], canonicalName: 'Килогерц' },
  'Гц': { base: 'ГГц', factor: 1/1000000000, aliases: ['гц', 'герц', 'hz', 'hertz'], canonicalName: 'Герц' },
  'Вт': { base: 'Вт', factor: 1, aliases: ['вт', 'ватт', 'w', 'watt', 'ватта'], canonicalName: 'Ватт' },
  'кВт': { base: 'Вт', factor: 1000, aliases: ['квт', 'киловатт', 'kw', 'kilowatt'], canonicalName: 'киловатт' },
  'ГВт': { base: 'Вт', factor: 1000000, aliases: ['гвт', 'гигаватт', 'gw', 'gigawatt'], canonicalName: 'Гигаватт' },
  'МВт': { base: 'Вт', factor: 1000, aliases: ['мвт', 'мегаватт', 'mw', 'megawatt'], canonicalName: 'Мегаватт' },
};

const normalizeUnitName = (unit: string): string => {
  const u = unit.toLowerCase().trim();
  for (const [baseUnit, config] of Object.entries(UNIT_CONVERSIONS)) {
    if (config.aliases.includes(u) || u === baseUnit.toLowerCase()) {
      return baseUnit;
    }
  }
  return unit.trim();
};

const getUnitConfig = (unit: string): { base: string; factor: number; canonicalName: string } | null => {
  const normalized = normalizeUnitName(unit);
  for (const [baseUnit, config] of Object.entries(UNIT_CONVERSIONS)) {
    if (normalizeUnitName(baseUnit) === normalized) {
      return { base: config.base, factor: config.factor, canonicalName: config.canonicalName };
    }
    for (const alias of config.aliases) {
      if (normalizeUnitName(alias) === normalized) {
        return { base: config.base, factor: config.factor, canonicalName: config.canonicalName };
      }
    }
  }
  return null;
};

const parseValueWithUnit = (raw: string): { value: number | null; unit: string; original: string } => {
  const trimmed = (raw || '').toString().trim();
  if (!trimmed) return { value: null, unit: '', original: trimmed };

  const patterns = [
    /^([><=≥≤~≈]+)?\s*([\d]+[.,]?\d*)\s*и\s*<\s*[\d]+[.,]?\d*\s*(.*)$/i,
    /^([><=≥≤~≈]+)?\s*([\d]+[.,]?\d*)\s*–\s*[\d]+[.,]?\d*\s*(.*)$/i,
    /^([\d]+[.,]?\d*)\s*и\s*<\s*[\d]+[.,]?\d*\s*(.*)$/i,
    /^([\d]+[.,]?\d*)\s*–\s*[\d]+[.,]?\d*\s*(.*)$/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const numStr = (match[2] || match[1]).replace(',', '.');
      const num = parseFloat(numStr);
      if (!isNaN(num)) {
        const unit = (match[3] || match[2] || '').trim();
        return { value: num, unit, original: trimmed };
      }
    }
  }

  const simpleMatch = trimmed.match(/^([\d]+[.,]?\d*)\s*(.*)$/);
  if (simpleMatch) {
    const numStr = simpleMatch[1].replace(',', '.');
    const num = parseFloat(numStr);
    if (!isNaN(num)) {
      return { value: num, unit: simpleMatch[2].trim(), original: trimmed };
    }
  }

  return { value: null, unit: '', original: trimmed };
};

const convertValueUnit = (
  rawValue: string,
  fieldName: string,
  expectedUnit: string
): string => {
  if (!rawValue || !expectedUnit) return rawValue;

  const parsed = parseValueWithUnit(rawValue);
  if (parsed.value === null) return rawValue;

  const srcConfig = getUnitConfig(parsed.unit);
  const dstConfig = getUnitConfig(expectedUnit);

  // Если не нашли конфигурацию - пробуем конвертировать по expectedUnit напрямую
  if (!srcConfig || !dstConfig) {
    // Проверяем, совпадает ли единица с expectedUnit (с учётом алиасов)
    const normalizedUnit = parsed.unit.toLowerCase().trim();
    const normalizedExpected = expectedUnit.toLowerCase().trim();
    
    // Если единицы совпадают - возвращаем с эталонным названием
    if (normalizedUnit === normalizedExpected || 
        normalizedUnit === normalizedExpected.replace(/[йаяов]/g, '') ||
        normalizedExpected.includes(normalizedUnit) ||
        normalizedUnit.includes(normalizedExpected.replace(/[йаяов]/g, ''))) {
      // Ищем canonicalName для expectedUnit
      for (const [, config] of Object.entries(UNIT_CONVERSIONS)) {
        if (config.aliases.some(a => a.toLowerCase() === normalizedExpected) ||
            config.canonicalName.toLowerCase() === normalizedExpected) {
          return `${parsed.value} ${config.canonicalName}`;
        }
      }
      // Если не нашли - возвращаем как есть с expectedUnit
      return `${parsed.value} ${expectedUnit}`;
    }
    return rawValue;
  }

  if (srcConfig.base !== dstConfig.base) {
    // Если базовые единицы разные - просто заменяем название на эталонное
    return `${parsed.value} ${dstConfig.canonicalName}`;
  }

  if (srcConfig.factor === dstConfig.factor) {
    // Единицы совпадают - просто заменяем название
    return `${parsed.value} ${dstConfig.canonicalName}`;
  }

  // Конвертируем значение
  const convertedValue = parsed.value * (srcConfig.factor / dstConfig.factor);
  const roundedValue = Math.floor(convertedValue);

  addLog('info', `[UnitConvert] ${fieldName}: "${rawValue}" -> ${roundedValue} ${dstConfig.canonicalName} (${parsed.value} × ${srcConfig.factor} / ${dstConfig.factor})`);

  return `${roundedValue} ${dstConfig.canonicalName}`;
};

const formatGoogleTokenUsage = (response: GenerateContentResponse): string => {
  const usage = response.usageMetadata;
  if (!usage) return "K_0.0+P_0.0+T_0.0=0.0";
  const k = (usage.promptTokenCount || 0) / 1000;
  const totalOutput = usage.candidatesTokenCount || 0;
  // @ts-ignore
  const thinking = (usage.candidatesTokensDetails?.thinkingTokenCount || 0) / 1000;
  const p = (totalOutput / 1000) - thinking;
  const t = thinking;
  const total = (usage.totalTokenCount || 0) / 1000;
  return formatTokenUsageString(k, p, t, total);
};

const formatOpenRouterTokenUsage = (usage: any): string => {
  if (!usage) return "K_0.0+P_0.0+T_0.0=0.0";
  const k = (usage.prompt_tokens || 0) / 1000;
  const totalOutput = usage.completion_tokens || 0;
  const p = totalOutput / 1000;
  const total = (usage.total_tokens || 0) / 1000;
  return formatTokenUsageString(k, p, 0, total);
};

const formatOllamaTokenUsage = (data: any): string => {
  if (!data) return "K_0.0+P_0.0+T_0.0=0.0";
  const k = (data.prompt_eval_count || 0) / 1000;
  const p = (data.eval_count || 0) / 1000;
  const total = k + p;
  return formatTokenUsageString(k, p, 0, total);
};

async function withRetry<T>(fn: () => Promise<T>, onRetry?: (attempt: number) => void): Promise<T> {
  let delay = 2500;
  const maxRetries = 4;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const errorMsg = error?.message || "";
      
      if (errorMsg.includes('400') || errorMsg.includes('INVALID_ARGUMENT')) {
         throw new Error("Ошибка 400: Неверный формат файла или поврежденные данные.");
      }

      // 429 Rate Limit - извлекаем время ожидания из сообщения
      if (errorMsg.includes('429') || errorMsg.includes('QUOTA_EXCEEDED') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        // Извлекаем retryDelay из сообщения Google: "Please retry in 34s"
        const retryMatch = errorMsg.match(/retry in ([\d.]+)s|retryDelay":"(\d+)s/);
        const retrySeconds = retryMatch ? parseFloat(retryMatch[1] || retryMatch[2]) : 35;
        
        if (i < maxRetries - 1) {
          const waitMs = (retrySeconds + 5) * 1000; // +5 сек запас
          console.log(`[withRetry] Rate limit, ожидание ${waitMs/1000}с (попытка ${i+1}/${maxRetries})`);
          if (onRetry) onRetry(i + 1);
          await new Promise(resolve => setTimeout(resolve, waitMs));
          continue;
        }
        throw new Error(
          `⚠️ Превышен лимит запросов Google Gemini.\n\n` +
          `Бесплатный тариф: 250K tokens/мин, 5 запросов/мин.\n\n` +
          `Варианты решения:\n` +
          `1. Использовать платный API ключ Google\n` +
          `2. Переключиться на OpenRouter (Провайдер → OpenRouter → Gemini 3 Flash)\n` +
          `3. Обрабатывать файлы по одному с интервалом`
        );
      }

      // Internal Server Error (5xx) - retry
      const is5xxError = errorMsg.includes('500') || errorMsg.includes('Internal Server Error') || errorMsg.includes('ref:');
      const isNetworkError = errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('fetch');
      
      if ((is5xxError || isNetworkError) && i < maxRetries - 1) {
        console.log(`[withRetry] Попытка ${i + 1} не удалась, повтор через ${delay}мс:`, errorMsg.substring(0, 100));
        if (onRetry) onRetry(i + 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      throw error;
    }
  }
  return await fn();
}

// ------------------------------------------------------------------
// УНИФИЦИРОВАННЫЙ ВЫЗОВ ПРОВАЙДЕРОВ
// ------------------------------------------------------------------

interface LLMResponse {
  text: string;
  tokenUsage: string;
  sources?: { title: string; uri: string }[];
}

interface GenerateOptions {
  jsonMode?: boolean;
  systemPrompt?: string;
  temperature?: number;
  useGrounding?: boolean;
  inlineData?: { data: string; mimeType: string };
  schema?: any; // Google Schema Object
}

async function generateCompletion(
  prompt: string,
  options?: GenerateOptions
): Promise<LLMResponse> {
  const config = getDbConfig().llm;
  addLog('info', `[LLM] Запрос к ${config.provider}`, { prompt: prompt.substring(0, 200) + '...', options });

  try {
    let response: LLMResponse;
    switch (config.provider) {
      case 'google':
        response = await generateGoogle(prompt, config, options);
        break;
      case 'openrouter':
        response = await generateOpenRouter(prompt, config, options);
        break;
      case 'ollama':
        response = await generateOllama(prompt, config, options);
        break;
      default:
        throw new Error("Неизвестный AI провайдер");
    }
    addLog('info', `[LLM] Успешный ответ от ${config.provider}`, { tokenUsage: response.tokenUsage, responseText: response.text.substring(0, 200) + '...' });
    return response;
  } catch (error: any) {
    addLog('error', `[LLM] Ошибка от ${config.provider}: ${error.message}`, error);
    throw error;
  }
}

// Rate limiter для Google Gemini Free Tier (для платного аккаунта можно отключить)
let lastGeminiRequestTime = 0;
const GEMINI_MIN_INTERVAL_MS = process.env.GEMINI_FREE_TIER ? 2000 : 500; // 500ms для платного

async function generateGoogle(prompt: string, config: LLMConfig, options?: GenerateOptions): Promise<LLMResponse> {
  const apiKey = config.googleApiKey || process.env.API_KEY || '';
  if (!apiKey) throw new Error("API key is missing. Please provide a valid API key in settings or .env.local");
  
  // Rate limiting (минимум для платного аккаунта)
  const timeSinceLastRequest = Date.now() - lastGeminiRequestTime;
  if (timeSinceLastRequest < GEMINI_MIN_INTERVAL_MS) {
    const waitTime = GEMINI_MIN_INTERVAL_MS - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastGeminiRequestTime = Date.now();
  
  const ai = new GoogleGenAI({ apiKey });
  const modelName = config.googleModel || 'gemini-3.1-pro-preview';

  const parts: any[] = [];
  
  // Google Gemini поддерживает несколько файлов (PDF, изображения) в одном запросе
  if (options?.inlineData) {
    const files = Array.isArray(options.inlineData) ? options.inlineData : [options.inlineData];
    for (const file of files) {
      if (file && file.data && file.mimeType) {
        parts.push({ 
          inlineData: { 
            mimeType: file.mimeType, 
            data: file.data 
          } 
        });
      }
    }
    console.log(`[Google] Sending ${parts.length} file(s) with prompt`);
  }
  parts.push({ text: prompt });

  const aiConfig: any = {
    temperature: options?.temperature ?? 0.7,
    maxOutputTokens: 262144, // Максимальный лимит для больших документов
  };

  if (options?.systemPrompt) {
    aiConfig.systemInstruction = options.systemPrompt;
  }

  if (options?.jsonMode) {
    aiConfig.responseMimeType = "application/json";
    if (options.schema) {
      aiConfig.responseSchema = options.schema;
    }
  }

  if (options?.useGrounding) {
    aiConfig.tools = [{ googleSearch: {} }];
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents: { parts },
    config: aiConfig
  });

  const sources: { title: string, uri: string }[] = [];
  if (options?.useGrounding) {
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web && chunk.web.uri) {
          sources.push({ title: chunk.web.title || chunk.web.uri, uri: chunk.web.uri });
        }
      });
    }
  }

  return {
    text: response.text || "",
    tokenUsage: formatGoogleTokenUsage(response),
    sources: Array.from(new Map(sources.map(s => [s.uri, s])).values())
  };
}

async function generateOpenRouter(prompt: string, config: LLMConfig, options?: GenerateOptions): Promise<LLMResponse> {
  const apiKey = config.openrouterApiKey || process.env.OPENROUTER_API_KEY || '';
  if (!apiKey) throw new Error("API key is missing. Please provide a valid OpenRouter API key in settings or .env.local");

  const modelName = config.openrouterModel || 'qwen/qwen3-235b-a22b-thinking-2507:free';
  
  const messages: any[] = [];
  if (options?.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }

  if (options?.inlineData) {
    // Поддержка массива изображений
    const images = Array.isArray(options.inlineData) ? options.inlineData : [options.inlineData];
    
    const content: any[] = [{ type: "text", text: prompt }];
    
    for (const img of images) {
      if (img && img.data && img.mimeType) {
        content.push({
          type: "image_url",
          image_url: { url: `data:${img.mimeType};base64,${img.data}` }
        });
      }
    }
    
    messages.push({ role: 'user', content: content });
    
    console.log(`[OpenRouter] Sending ${images.length} image(s) with prompt`);
  } else {
    messages.push({ role: 'user', content: prompt });
  }

  const body: any = {
    model: modelName,
    messages: messages,
    temperature: options?.temperature ?? 0.7
  };

  if (options?.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin, // Required by OpenRouter
      'X-Title': 'KTRU Normalizer'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter Error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  
  return {
    text: text,
    tokenUsage: formatOpenRouterTokenUsage(data.usage)
  };
}

async function generateOllama(prompt: string, config: LLMConfig, options?: GenerateOptions): Promise<LLMResponse> {
  const isCloud = config.ollamaMode === 'cloud';
  
  let endpoint: string;
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };
  
  if (isCloud) {
    // Для облачного Ollama используем backend прокси (API ключ хранится на сервере)
    endpoint = getApiUrl();
  } else {
    // Для локального Ollama - прямой запрос
    endpoint = config.ollamaEndpoint || 'http://localhost:11434';
    if (endpoint.endsWith('/')) endpoint = endpoint.slice(0, -1);
  }
  
  const modelName = isCloud ? config.ollamaCloudModel : config.ollamaLocalModel;
  const fullPrompt = options?.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt;

  const body: any = {
    model: modelName,
    prompt: fullPrompt,
    stream: false,
    options: {
      temperature: options?.temperature ?? 0.7
    }
  };

  if (options?.jsonMode) {
    body.format = 'json';
  }

  // Изображения отправляем во все модели - если модель не поддерживает, вернёт ошибку
  if (options?.inlineData) {
    body.images = Array.isArray(options.inlineData) 
      ? options.inlineData.map(img => img.data)
      : [options.inlineData.data];
  }

  const response = await fetch(`${endpoint}/ollama/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ошибка от ollama: ${errText || response.status}`);
  }

  const data = await response.json();
  
  return {
    text: data.response || "",
    tokenUsage: data.token_usage || formatOllamaTokenUsage(data)
  };
}

export const fetchLocalOllamaModels = async (endpoint: string): Promise<string[]> => {
  try {
    let ep = endpoint || 'http://localhost:11434';
    if (ep.endsWith('/')) ep = ep.slice(0, -1);
    const response = await fetch(`${ep}/api/tags`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.models?.map((m: any) => m.name) || [];
  } catch (e) {
    console.error("Failed to fetch ollama models", e);
    return [];
  }
}

// ------------------------------------------------------------------
// ФУНКЦИИ БИЗНЕС-ЛОГИКИ
// ------------------------------------------------------------------

export const fetchRawKtruFields = async (ktruCode: string): Promise<{ 
  fields: string[], 
  tokenUsage: string,
  sources: { title: string, uri: string }[] 
}> => {
  return withRetry(async () => {
    const config = getDbConfig().llm;
    let prompt = `Найди актуальные характеристики КТРУ для кода: "${ktruCode}". 
Твоя задача — извлечь только технические характеристики оборудования.
Ориентируйся на таблицу "Характеристики товара, работы, услуги".
Возьми все значения из столбца "Наименование характеристики". 
Игнорируй вспомогательные и мета-поля, такие как "Код КТРУ", "*Варианты", "Единица измерения", "Тип значения", "Тип характеристики".
Верни результат строго в формате JSON-объекта с ключом "fields", содержащим массив строк. 
Пример: {"fields": ["Процессор", "Оперативная память", "Объем накопителя"]}`;

    if (config.provider === 'google') {
      prompt = `Перейди по ссылке и найди актуальные характеристики КТРУ для кода: "${ktruCode}":
https://zakupki.gov.ru/epz/ktru/ktruCard/ktru-description.html?itemId=${ktruCode}

Твоя задача — извлечь только технические характеристики оборудования.
Найди таблицу "Характеристики товара, работы, услуги".
Извлеки абсолютно все значения из столбца "Наименование характеристики" (их может быть более 100-150 штук, извлеки все!).
Категорически игнорируй вспомогательные, описательные и мета-поля таблиц, такие как "Код КТРУ", "*Варианты", "Единица измерения", "Тип значения", "Тип характеристики", "Наименование характеристики", "Значение характеристики".
Не объединяй характеристики! Выведи их ровно так, как они указаны на сайте.
Если характеристики отсутствуют, верни пустой массив.
Верни результат строго в формате JSON-объекта с ключом "fields", содержащим массив строк. 
Пример: {"fields": ["Процессор", "Оперативная память", "Объем накопителя"]}`;
    }

    const res = await generateCompletion(prompt, { 
      useGrounding: config.provider === 'google',
      jsonMode: true,
      schema: { 
        type: Type.OBJECT, 
        properties: { 
          fields: { type: Type.ARRAY, items: { type: Type.STRING } } 
        } 
      }
    });

    let fields: string[] = [];
    try {
      if (!res.text) {
        throw new Error("Модель вернула пустой ответ");
      }
      
      let cleanJson = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // Исправление типичной ошибки ИИ (пустое значение свойства fields)
      cleanJson = cleanJson.replace(/"fields"\s*:\s*}/g, '"fields": []}');
      cleanJson = cleanJson.replace(/"fields"\s*:\s*$/g, '"fields": []}');

      const parsed = JSON.parse(cleanJson);
      
      // Обработка случаев, если ИИ вернул просто массив или завернул в объект
      if (Array.isArray(parsed)) {
        fields = parsed;
      } else if (parsed && Array.isArray(parsed.fields)) {
        fields = parsed.fields;
      } else if (parsed && typeof parsed === 'object') {
        // Запасной вариант: берем первый массив, который найдем внутри объекта
        const firstArray = Object.values(parsed).find(v => Array.isArray(v));
        if (firstArray) fields = firstArray as string[];
      }
      
      if (fields.length === 0) {
         console.warn(`[KTRU Fetch] Пустой массив характеристик. Исходный ответ:`, res.text);
      } else {
         console.log(`[KTRU Fetch] Успешно извлечено ${fields.length} полей. Образец:`, fields.slice(0,3));
      }
    } catch (e) {
      console.error("[KTRU Fetch Error] Failed to parse KTRU fields.", e, "\nRaw response:", res.text);
      throw new Error(`Ошибка парсинга ответа от ИИ: ${e instanceof Error ? e.message : 'Неизвестная ошибка'}`);
    }

    return {
      fields: fields,
      tokenUsage: res.tokenUsage,
      sources: res.sources || []
    };
  });
};

export const verifyCategoryKtruIndex = async (category: EquipmentCategory): Promise<{ index: string, tokenUsage: string }> => {
  return withRetry(async () => {
    const res = await generateCompletion(
      `Найди актуальный укрупненный индекс КТРУ (ОКПД2) для группы оборудования "${category}". 
В справочнике КТРУ ищи позицию со словом "Укрупненное". 
Извлеки только цифровой код (индекс группы). 
Например, если код 26.20.14.000-00000001, результатом должно быть 26.20.14.
Верни только цифровую часть до последнего нуля или тире. 
Ответ верни в формате JSON: {"ktruIndex": "26.20.14"}`,
      { 
        jsonMode: true,
        schema: {
          type: Type.OBJECT,
          properties: {
            ktruIndex: { type: Type.STRING, description: "Цифровой индекс группы, например 26.20.14" }
          }
        }
      }
    );
    let data: any = { ktruIndex: "" };
    try { data = JSON.parse(res.text); } catch (e) { /* ignore */ }
    return { index: data.ktruIndex || "", tokenUsage: res.tokenUsage };
  });
};

export const suggestDictionaryFields = async (
  category: EquipmentCategory,
  onRetry?: (msg: string) => void
): Promise<{ fields: string[], tokenUsage: string }> => {
  return withRetry(async () => {
    const res = await generateCompletion(
      `Составь список из 15 характеристик для "${category}" по КТРУ (только названия полей). 
Ответ верни строго в виде JSON массива строк, например: ["Процессор", "ОЗУ"]`,
      { 
        jsonMode: true,
        schema: { type: Type.ARRAY, items: { type: Type.STRING } }
      }
    );
    let fields: string[] = [];
    try { fields = JSON.parse(res.text); } catch (e) { /* ignore */ }
    return { fields: Array.isArray(fields) ? fields : [], tokenUsage: res.tokenUsage };
  }, (attempt) => onRetry?.(`Лимит превышен. Попытка восстановиться #${attempt}...`));
};

export const checkSemanticSimilarity = async (newName: string, existingNames: string[]) => {
  if (existingNames.length === 0) return { isDuplicate: false, tokenUsage: "K_0.0+P_0.0=0.0" };
  return withRetry(async () => {
    const res = await generateCompletion(
      `Является ли "${newName}" синонимом одного из: ${JSON.stringify(existingNames)}? 
Ответь JSON объектом {"isDuplicate": boolean, "existingName": "string_if_true"}`,
      {
        jsonMode: true,
        schema: {
          type: Type.OBJECT,
          properties: {
            isDuplicate: { type: Type.BOOLEAN },
            existingName: { type: Type.STRING }
          }
        }
      }
    );
    let data = { isDuplicate: false, existingName: "" };
    try { data = { ...data, ...JSON.parse(res.text) }; } catch (e) { /* ignore */ }
    return { ...data, tokenUsage: res.tokenUsage };
  });
};

const normalizeCharacteristicValue = (raw: string, fieldName: string = ''): string => {
  const trimmed = (raw || '').toString().trim();
  if (!trimmed) return trimmed;

  let value = trimmed.replace(/^не\s+менее\s+/i, '').trim();
  
  const resMatch = value.match(/(\d{3,5})\s*[xх×]\s*(\d{3,5})/i);
  if (resMatch) {
    value = `${resMatch[1]}x${resMatch[2]}`;
  }

  const fieldLower = fieldName.toLowerCase();
  if (fieldLower.includes('контрастность')) {
    const contrastMatch = value.match(/^(\d{2,10})\s*(:\s*1)?$/);
    if (contrastMatch) {
      value = `${contrastMatch[1]}:1`;
    }
  }

  return value;
};

const normalizeExtractedItems = (items: EquipmentItem[]): EquipmentItem[] => {
  return (items || []).map(item => ({
    ...item,
    characteristics: (item.characteristics || []).map(char => ({
      ...char,
      value: normalizeCharacteristicValue(char.value, char.name)
    }))
  }));
};


const normalizeName = (value: string) =>
  (value || '').toLowerCase().replace(/[^a-z0-9а-я]+/gi, ' ').trim().replace(/\s+/g, ' ');

const tokenSimilarity = (a: string, b: string) => {
  const aTokens = new Set(normalizeName(a).split(' ').filter(Boolean));
  const bTokens = new Set(normalizeName(b).split(' ').filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let common = 0;
  aTokens.forEach(token => { if (bTokens.has(token)) common += 1; });
  return common / Math.max(aTokens.size, bTokens.size);
};

const mapCharacteristicsToDictionary = (
  items: EquipmentItem[],
  dictionary: DictionaryField[]
): EquipmentItem[] => {
  const dictByCat = dictionary.reduce((acc, curr) => {
    if (!acc[curr.category]) acc[curr.category] = [];
    acc[curr.category].push(curr.fieldName);
    return acc;
  }, {} as Record<string, string[]>);

  const unitsByCatField = dictionary.reduce((acc, curr) => {
    const key = `${curr.category}__${curr.fieldName}`;
    if (curr.unit) acc[key] = curr.unit;
    return acc;
  }, {} as Record<string, string>);

  return (items || []).map(item => {
    const candidates = dictByCat[item.category] || [];
    const normalizedDict = new Map(
      candidates.map(field => [normalizeName(field), field])
    );
    const normalizedCandidates = candidates.map(field => ({
      field,
      normalized: normalizeName(field)
    }));
    const mapped: Record<string, Characteristic> = {};

    (item.characteristics || []).forEach(char => {
      const rawName = char.name || '';
      const normalizedValue = normalizeCharacteristicValue(char.value, rawName);
      const target = normalizeName(rawName);
      const exactName = normalizedDict.get(target);

      if (exactName) {
        const dictKey = `${item.category}__${exactName}`;
        const expectedUnit = unitsByCatField[dictKey] || '';
        const convertedValue = expectedUnit 
          ? convertValueUnit(normalizedValue, exactName, expectedUnit)
          : normalizedValue;

        if (!mapped[exactName]) {
          mapped[exactName] = {
            name: exactName,
            value: convertedValue
          };
        } else if (convertedValue && convertedValue.length > mapped[exactName].value.length) {
          mapped[exactName].value = convertedValue;
        }
        return;
      }

      const candidateTargets = [
        target,
        normalizeName(rawName.split(/[,:;]/)[0] || '')
      ].filter(Boolean);

      let bestCandidate: { field: string; score: number } | null = null;
      candidateTargets.forEach(candidateTarget => {
        normalizedCandidates.forEach(candidate => {
          if (!candidate.normalized) return;
          let score = tokenSimilarity(candidateTarget, candidate.normalized);
          if (candidate.normalized.includes(candidateTarget) || candidateTarget.includes(candidate.normalized)) {
            score = Math.max(score, 0.85);
          }
          if (!bestCandidate || score > bestCandidate.score) {
            bestCandidate = { field: candidate.field, score };
          }
        });
      });

      if (bestCandidate && bestCandidate.score >= 0.65) {
        const matchedName = bestCandidate.field;
        const dictKey = `${item.category}__${matchedName}`;
        const expectedUnit = unitsByCatField[dictKey] || '';
        const convertedValue = expectedUnit 
          ? convertValueUnit(normalizedValue, matchedName, expectedUnit)
          : normalizedValue;

        if (!mapped[matchedName]) {
          mapped[matchedName] = {
            name: matchedName,
            value: convertedValue,
            originalName: rawName
          };
        } else if (convertedValue && convertedValue.length > mapped[matchedName].value.length) {
          mapped[matchedName].value = convertedValue;
        }
        return;
      }

      const extraKey = `__extra__${rawName}`;
      if (!mapped[extraKey]) {
        mapped[extraKey] = {
          name: rawName,
          value: normalizedValue,
          originalName: rawName,
          isExtra: true
        };
      } else if (normalizedValue && normalizedValue.length > mapped[extraKey].value.length) {
        mapped[extraKey].value = normalizedValue;
      }
    });

    return { ...item, characteristics: Object.values(mapped) };
  });
};

export const extractDataWithSchema = async (
  input: string | { data: string; mimeType: string } | { data: string; mimeType: string }[],
  dictionary: DictionaryField[],
  modelName?: string,
  onRetry?: (msg: string) => void
): Promise<{ items: EquipmentItem[], metadata: OrderMetadata, tokenUsage: string }> => {
  const config = getDbConfig().llm;
  const isOllamaCloud = config.provider === 'ollama' && config.ollamaMode === 'cloud';
  
  const inputImages = Array.isArray(input) ? input : (typeof input !== 'string' ? [input] : null);
  
  // Создаём справочник с единицами измерения
  const dictByCatWithUnits: Record<string, { name: string; unit?: string }[]> = {};
  const dictByCat = dictionary.reduce((acc, curr) => {
    if (!acc[curr.category]) acc[curr.category] = [];
    acc[curr.category].push(curr.fieldName);
    
    // Добавляем в расширенный справочник с единицами
    if (!dictByCatWithUnits[curr.category]) dictByCatWithUnits[curr.category] = [];
    dictByCatWithUnits[curr.category].push({ 
      name: curr.fieldName, 
      unit: curr.unit 
    });
    return acc;
  }, {} as Record<string, string[]>);

  const inputDesc = typeof input === 'string' 
    ? `Текст заказа: ${input}` 
    : inputImages && inputImages.length > 1 
      ? `[${inputImages.length} изображений страниц документа]`
      : `[См. вложенное изображение/файл]`;

  const prompt = `Ты — эксперт по закупкам ИТ-оборудования в РФ. Извлеки данные из следующего документа:
${inputDesc}

Используй словарь: ${JSON.stringify(dictByCat)}`;

  return withRetry(async () => {
    const schema = {
      type: Type.OBJECT,
      properties: {
        metadata: {
          type: Type.OBJECT,
          properties: {
            customerName: { type: Type.STRING },
            customerInn: { type: Type.STRING },
            customerAddress: { type: Type.STRING },
            otherDetails: { type: Type.STRING },
            docDate: { type: Type.STRING }
          }
        },
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              name: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
              characteristics: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    value: { type: Type.STRING }
                  }
                }
              }
            },
            required: ["category", "name", "quantity", "characteristics"]
          }
        }
      }
    };

    // Ограничиваем размер справочника для prompt (максимум 50 характеристик на категорию)
    const limitedDictByCat: Record<string, string[]> = {};
    const limitedDictWithUnits: Record<string, { name: string; unit?: string }[]> = {};
    
    for (const [cat, fields] of Object.entries(dictByCat)) {
      limitedDictByCat[cat] = (fields as string[]).slice(0, 50);
      limitedDictWithUnits[cat] = dictByCatWithUnits[cat].slice(0, 50);
    }
    
    const dictJson = JSON.stringify(limitedDictByCat);
    const dictWithUnitsJson = JSON.stringify(limitedDictWithUnits, null, 2);
    const dictSizeKB = Math.round(dictJson.length / 1024);
    console.log(`[extractDataWithSchema] Справочник: ${Object.keys(limitedDictByCat).length} категорий, ~${dictSizeKB}KB`);
    
    const options: GenerateOptions = {
      jsonMode: true,
      schema,
      systemPrompt: `Ты — эксперт по закупкам ИТ-оборудования в РФ. Извлеки данные из документа.

ПРАВИЛА ДЛЯ ИНН:
- Ищи ИНН ТОЛЬКО в самом документе (шапка, реквизиты, подписи)
- ИНН = ровно 10 цифр (организация) или 12 цифр (ИП)
- Если ИНН не найден — ставь пустую строку ""
- НЕ ВЫДУМЫВАЙ ИНН!

ПРАВИЛА ДЛЯ ХАРАКТЕРИСТИК:
1. Сопоставляй названия из документа с названиями из справочника КТРУ
2. Если похожее название есть в справочнике — используй его точное название
3. Если точного соответствия нет — выбери наиболее подходящее по смыслу
4. Если совсем нет подходящего — используй точное название из документа

ПРАВИЛА ДЛЯ ЕДИНИЦ ИЗМЕРЕНИЯ:
1. Распознай единицу измерения в документе (ГБ, ТБ, МГц, ГГц, Вт, кВт и т.д.)
2. Сравни с единицей измерения из справочника КТРУ для этой характеристики
3. ЕСЛИ единицы СОВПАДАЮТ (например, "ГБ" в документе и "Гигабайт" в справочнике):
   - Подставь единицу ИЗ СПРАВОЧНИКА КТРУ
   - Значение оставь БЕЗ ИЗМЕНЕНИЙ
   Пример: документ "500 ГБ", справочник "Гигабайт" → результат "500 Гигабайт"
4. ЕСЛИ единицы ОТЛИЧАЮТСЯ (например, "ТБ" в документе и "Гигабайт" в справочнике):
   - Подставь единицу ИЗ СПРАВОЧНИКА КТРУ
   - Конвертируй значение: 1 ТБ = 1024 ГБ, 1 ГГц = 1000 МГц, 1 кВт = 1000 Вт
   - Округляй ВВЕРХ до целого числа
   Пример: документ "1,2 ТБ", справочник "Гигабайт" → результат "1229 Гигабайт"
5. ЕСЛИ в справочнике НЕТ единицы измерения:
   - Используй единицу измерения из документа
   Пример: документ "3,5 ГГц", справочник "" (пусто) → результат "3,5 ГГц"

ПРИМЕРЫ КОНВЕРТАЦИИ:
- "1,2 ТБ" в документе, "Гигабайт" в справочнике → "1229 Гигабайт" (1,2 × 1024 = 1228,8 → округлить вверх, погрешность < 1%)
- "500 ГБ" в документе, "Терабайт" в справочнике → "0,5 Терабайт" (500 / 1024 = 0,49 → сохраняем дробь, округление дало бы 100% погрешность)
- "3,3 ГГц" в документе, "Гигагерц" в справочнике → "3,3 Гигагерц" (единицы совпадают, НЕ конвертировать!)
- "3300 МГц" в документе, "Гигагерц" в справочнике → "3,3 Гигагерц" (3300 / 1000 = 3,3 → сохраняем дробь)
- "2,5 кВт" в документе, "Ватт" в справочнике → "2560 Ватт" (2,5 × 1024 = 2560 → округляем вверх)
- "1000 Вт" в документе, "киловатт" в справочнике → "1 Киловатт" (1000 / 1000 = 1)

ПРАВИЛО ОКРУГЛЕНИЯ:
- От БОЛЬШЕГО к МЕНЬШЕМУ (ТБ→ГБ, ГГц→МГц, кВт→Вт) — ОКРУГЛЯЙ ВВЕРХ до целого (погрешность < 1%)
- От МЕНЬШЕГО к БОЛЬШЕМУ (ГБ→ТБ, МГц→ГГц, Вт→кВт) — СОХРАНЯЙ ДРОБЬ (округление даёт большую погрешность)

ПРОВЕРКА ЗДРАВОГО СМЫСЛА:
- Частота процессора: 0.1 - 20 ГГц (НЕ 3300 ГГц!)
- Объём памяти: 1 - 10000 ГБ (НЕ 10000000 ГБ!)
- Мощность: 10 - 10000 Вт

СПРАВОЧНИК КТРУ С ЕДИНИЦАМИ ИЗМЕРЕНИЯ (${Object.keys(limitedDictWithUnits).length} категорий):
${dictWithUnitsJson}

ПРАВИЛА ДЛЯ КАТЕГОРИЙ:
- Выбери одну категорию: ${Object.keys(limitedDictByCat).join(', ')}

Формат ответа (строгий JSON):
{
  "metadata": {
    "customerName": "название из документа",
    "customerInn": "10 или 12 цифр или пусто",
    "customerAddress": "адрес",
    "otherDetails": "",
    "docDate": "дата"
  },
  "items": [
    {
      "category": "категория из справочника",
      "name": "наименование товара",
      "quantity": 1,
      "characteristics": [
        {"name": "название из справочника КТРУ", "value": "значение с единицей измерения ИЗ СПРАВОЧНИКА"}
      ]
    }
  ]
}`
    };

    if (inputImages && inputImages.length > 0) {
      options.inlineData = inputImages.length === 1 ? inputImages[0] : inputImages;
    } else if (typeof input === 'string') {
      // текстовый ввод
    }

    const res = await generateCompletion(prompt, options);

    const extractJson = (text: string) => {
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const startIdx = cleaned.search(/[\[{]/);
      if (startIdx === -1) return null;
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = startIdx; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\') {
          escape = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;
        if (ch === '{' || ch === '[') depth += 1;
        if (ch === '}' || ch === ']') {
          depth -= 1;
          if (depth === 0) {
            return cleaned.slice(startIdx, i + 1);
          }
        }
      }
      return cleaned.slice(startIdx);
    };

    let parsed: any = { items: [], metadata: {} };
    try {
      const jsonText = extractJson(res.text);
      if (jsonText) {
        parsed = JSON.parse(jsonText);
      }
    } catch (e: any) {
      console.error("[extractDataWithSchema] JSON parse error:", e.message);
      const text = res.text;
      console.warn("[extractDataWithSchema] Response length:", text.length, "chars");
      
      // Попытка восстановить обрезанный JSON
      try {
        const startIdx = text.search(/[\[{]/);
        if (startIdx !== -1) {
          let partial = text.slice(startIdx);
          
          // Находим последнюю завершённую характеристику
          const lastCompleteChar = partial.lastIndexOf(', "value": "');
          if (lastCompleteChar > 0) {
            // Ищем конец этой строки
            let endPos = partial.indexOf('"', lastCompleteChar + 12);
            if (endPos > 0) {
              // Ищем конец объекта характеристики
              let braceCount = 0;
              let pos = endPos;
              for (; pos < partial.length && pos < lastCompleteChar + 2000; pos++) {
                if (partial[pos] === '{' || partial[pos] === '[') braceCount++;
                if (partial[pos] === '}' || partial[pos] === ']') {
                  braceCount--;
                  if (braceCount <= 0) break;
                }
              }
              
              // Обрезаем до последнего полного элемента
              partial = partial.slice(0, pos + 1);
              
              // Закрываем незакрытые скобки
              const openBraces = (partial.match(/{/g) || []).length;
              const closeBraces = (partial.match(/}/g) || []).length;
              const openBrackets = (partial.match(/\[/g) || []).length;
              const closeBrackets = (partial.match(/\]/g) || []).length;
              
              for (let i = closeBrackets; i < openBrackets; i++) partial += ']';
              for (let i = closeBraces; i < openBraces; i++) partial += '}';
              
              console.log("[extractDataWithSchema] Attempting recovery, fixed JSON length:", partial.length);
              parsed = JSON.parse(partial);
            }
          }
        }
      } catch (recoverErr) {
        console.error("[extractDataWithSchema] Recovery failed:", recoverErr);
      }
    }

    if (Array.isArray(parsed)) {
      parsed = { items: parsed, metadata: {} };
    }

    if (parsed && !Array.isArray(parsed.items)) {
      const firstArray = Object.values(parsed).find(value => Array.isArray(value));
      if (firstArray) parsed.items = firstArray as any[];
    }

    if (parsed && Array.isArray(parsed.items)) {
      parsed.items = parsed.items.map((item: any) => {
        if (item && typeof item === 'object') {
          const name = item.name
            || item['Наименование']
            || item['Название']
            || item['Наименование товара']
            || item['Наименование продукции']
            || item['Наименование объекта закупки']
            || item['Наименование предмета закупки']
            || '';
          const category = item.category || item['Категория'] || EquipmentCategory.OTHER;
          const quantity = Number(item.quantity || item['Количество'] || item['Кол-во'] || 1);

          let characteristics: { name: string; value: string }[] = [];
          const rawChars = item.characteristics
            || item['Характеристики']
            || item['Параметры']
            || item['Технические характеристики']
            || item['Технические характеристики, данные']
            || {};

          if (Array.isArray(rawChars)) {
            characteristics = rawChars.map((c: any) => ({
              name: c?.name || c?.['Наименование'] || c?.['Параметр'] || c?.['Запрашиваемые данные'] || '',
              value: c?.value || c?.['Значение'] || c?.['Технические характеристики, данные'] || ''
            })).filter(c => c.name);
          } else if (rawChars && typeof rawChars === 'object') {
            characteristics = Object.entries(rawChars)
              .map(([k, v]) => ({ name: k, value: String(v ?? '') }))
              .filter(c => c.name);
          }

          if (characteristics.length === 0) {
            const entry = Object.entries(item).find(([k]) => /характеристик/i.test(k));
            if (entry) {
              const [, value] = entry;
              if (Array.isArray(value)) {
                characteristics = value.map((c: any) => ({
                  name: c?.name || c?.['Наименование'] || c?.['Параметр'] || c?.['Запрашиваемые данные'] || '',
                  value: c?.value || c?.['Значение'] || ''
                })).filter(c => c.name);
              } else if (value && typeof value === 'object') {
                characteristics = Object.entries(value)
                  .map(([k, v]) => ({ name: k, value: String(v ?? '') }))
                  .filter(c => c.name);
              }
            }
          }

          if (characteristics.length === 0) {
            characteristics = Object.entries(item)
              .filter(([k]) => !['name','category','quantity','items','metadata','Наименование','Название','Категория','Количество','Кол-во','Наименование объекта закупки','Наименование товара','Наименование продукции','Наименование предмета закупки'].includes(k))
              .map(([k, v]) => ({ name: k, value: String(v ?? '') }))
              .filter(c => c.name && c.value !== '');
          }

          return {
            category,
            name: name || category || 'Товар',
            quantity: isNaN(quantity) ? 1 : quantity,
            characteristics
          };
        }
        return item;
      });
    }

    parsed.items = (parsed.items || []).filter((item: any) => item?.name);

    const normalizedMetadata = {
      customerName: parsed.metadata?.customerName || parsed.metadata?.customer_name || '',
      customerInn: parsed.metadata?.customerInn || parsed.metadata?.customer_inn || '',
      customerAddress: parsed.metadata?.customerAddress || parsed.metadata?.customer_address || '',
      otherDetails: parsed.metadata?.otherDetails || parsed.metadata?.other_details || '',
      docDate: parsed.metadata?.docDate || parsed.metadata?.doc_date || ''
    };

    return {
      items: mapCharacteristicsToDictionary(parsed.items || [], dictionary),
      metadata: {
        ...normalizedMetadata,
        processingId: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        tokenUsage: res.tokenUsage
      },
      tokenUsage: res.tokenUsage
    };
  }, (attempt) => onRetry?.(`Ожидание очереди (429)... Попытка ${attempt}`));
};

export const enrichItemWithKtru = async (item: EquipmentItem) => {
  const CATEGORY_KTRU_INDICES: Record<string, string> = {
    'Сервер': '26.20.14.000-00000001',
    'ПК': '26.20.15.000-00000001',
    'Мониторы': '26.20.17.110-00000001',
    'Моноблоки': '26.20.15.000-00000032',
    'Ноутбуки': '26.20.11.110-00000001',
    'Планшеты': '26.20.11.110-00000160',
    'МФУ': '26.20.18.000-00000001',
    'Принтеры': '26.20.16.120-00000001',
    'Клавиатура': '26.20.16.110-00000001',
    'Мышь': '26.20.16.170-00000001',
    'Маршрутизатор': '26.30.11.120-00000001',
    'Коммутатор': '26.30.11.110-00000001',
    'ИБП': '26.20.40.110-00000001',
    'Прочее': '0.0.0'
  };

  const CATEGORY_KTRU_PREFIX: Record<string, string> = {
    'Сервер': '26.20.14',
    'ПК': '26.20.15',
    'Мониторы': '26.20.17',
    'Моноблоки': '26.20.15',
    'Ноутбуки': '26.20.11',
    'Планшеты': '26.20.11',
    'МФУ': '26.20.18',
    'Принтеры': '26.20.16',
    'Клавиатура': '26.20.16',
    'Мышь': '26.20.16',
    'Маршрутизатор': '26.30.11',
    'Коммутатор': '26.30.11',
    'ИБП': '26.20.40',
    'Прочее': ''
  };

  const defaultKtru = CATEGORY_KTRU_INDICES[item.category];
  const ktruPrefix = CATEGORY_KTRU_PREFIX[item.category];

  const nameLower = (item.name || '').toLowerCase();
  const isMonoblock = nameLower.includes('моноблок') || 
                      nameLower.includes('моноблочн') ||
                      nameLower.includes('all-in-one') ||
                      nameLower.includes('aio ') ||
                      /\b aio\b/i.test(item.name);
  
  if (item.category === 'Моноблоки' || (item.category === 'ПК' && isMonoblock)) {
    const monoblockKtru = CATEGORY_KTRU_INDICES['Моноблоки'];
    addLog('info', `[KTRU] Моноблок определён`, { name: item.name, category: item.category, code: monoblockKtru });
    return { ktruCode: monoblockKtru, tokenUsage: "K_0.0+P_0.0+T_0.0=0.0" };
  }

  if (!ktruPrefix || item.category === 'Прочее') {
    return withRetry(async () => {
      const res = await generateCompletion(
        `Найди актуальный код КТРУ для устройства: ${item.name}. В ответе только код в JSON {"ktruCode":"xxx"}.`,
        {
          jsonMode: true,
          schema: {
            type: Type.OBJECT,
            properties: { ktruCode: { type: Type.STRING } }
          }
        }
      );
      let data = { ktruCode: "" };
      try { data = JSON.parse(res.text); } catch (e) { /* ignore */ }
      return { ktruCode: data.ktruCode || "", tokenUsage: res.tokenUsage };
    });
  }

  return withRetry(async () => {
    const res = await generateCompletion(
      `Найди точный код КТРУ для устройства: "${item.name}"
Категория: "${item.category}"
КТРУ этой категории должны начинаться с: "${ktruPrefix}"
Справочник КТРУ: https://zakupki.gov.ru/epz/ktru/ktruCard/ktru-description.html

Найди на сайте каталога КТРУ точный код, который начинается с ${ktruPrefix}.
Если устройство "${item.name}" — это ${item.category}, то код должен быть из группы ${ktruPrefix}.xxx.

Важно: моноблоки (моноблочные ПК) имеют код 26.20.15.000-00000032, а обычные настольные ПК — 26.20.15.000-00000001.

Верни JSON с точным кодом: {"ktruCode":"xxx"}`,
      {
        jsonMode: true,
        schema: {
          type: Type.OBJECT,
          properties: { ktruCode: { type: Type.STRING } }
        },
        useGrounding: getDbConfig().llm.provider === 'google'
      }
    );
    let data = { ktruCode: "" };
    try { 
      data = JSON.parse(res.text); 
    } catch (e) { /* ignore */ }
    
    let code = data.ktruCode || "";
    
    if (code && ktruPrefix) {
      const codePrefix = code.split('.')[0] + '.' + code.split('.')[1] + '.' + code.split('.')[2];
      if (codePrefix !== ktruPrefix) {
        console.warn(`[KTRU] Код ${code} не соответствует категории ${item.category}, ожидается префикс ${ktruPrefix}. Использую дефолт.`);
        code = defaultKtru || code;
      }
    }
    
    if (!code && defaultKtru) {
      code = defaultKtru;
    }
    
    addLog('info', `[KTRU] Код найден`, { name: item.name, category: item.category, code, defaultCode: defaultKtru });
    return { ktruCode: code, tokenUsage: res.tokenUsage };
  });
};

export const findDuplicateFields = async (category: EquipmentCategory, fields: string[]) => {
  return withRetry(async () => {
    const res = await generateCompletion(
      `Проанализируй список признаков для "${category}" и найди смысловые дубликаты (синонимы).
Список: ${JSON.stringify(fields)}
Ответь в JSON: {"groups":[{"suggestedName": "string", "duplicates": ["string"]}]}`,
      {
        jsonMode: true,
        schema: {
          type: Type.OBJECT,
          properties: {
            groups: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  suggestedName: { type: Type.STRING },
                  duplicates: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
              }
            }
          }
        }
      }
    );
    const cleanJson = res.text.replace(/```json/g, '').replace(/```/g, '').trim();
    let data = { groups: [] };
    try { data = JSON.parse(cleanJson); } catch (e) { /* ignore */ }
    return { data, tokenUsage: res.tokenUsage };
  });
};
