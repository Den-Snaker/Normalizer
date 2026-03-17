import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { EquipmentCategory, DictionaryField, EquipmentItem, OrderMetadata, LLMConfig } from "../types";
import { getDbConfig } from "./db";
import { addLog } from "./logger";

// Helper for generic token usage format
const formatTokenUsageString = (k: number, p: number, t: number, total: number) => {
  return `K_${k.toFixed(1)}+P_${p.toFixed(1)}+T_${t.toFixed(1)}=${total.toFixed(1)}`;
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

      // Если 503 или 429
      if (errorMsg.includes('503') || errorMsg.includes('429') || errorMsg.includes('QUOTA_EXCEEDED') || errorMsg.includes('UNAVAILABLE')) {
        throw new Error(
          `⚠️ Выбранная AI модель временно недоступна (перегружена или лимит запросов).\n\n` +
          `Пожалуйста, перейдите в Настройки и выберите другого провайдера или модель.`
        );
      }

      const isNetworkError = errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('fetch');
      
      if (isNetworkError && i < maxRetries - 1) {
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

async function generateGoogle(prompt: string, config: LLMConfig, options?: GenerateOptions): Promise<LLMResponse> {
  const apiKey = config.googleApiKey || process.env.API_KEY || '';
  if (!apiKey) throw new Error("API key is missing. Please provide a valid API key in settings or .env.local");
  
  const ai = new GoogleGenAI({ apiKey });
  const modelName = config.googleModel || 'gemini-3.1-pro-preview';

  const parts: any[] = [];
  if (options?.inlineData) {
    parts.push({ inlineData: options.inlineData });
  }
  parts.push({ text: prompt });

  const aiConfig: any = {
    temperature: options?.temperature ?? 0.7,
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
    messages.push({
      role: 'user',
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${options.inlineData.mimeType};base64,${options.inlineData.data}` } }
      ]
    });
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

  if (options?.jsonMode) {
    body.response_format = { type: "json_object" };
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
  let endpoint = config.ollamaEndpoint || 'http://localhost:11434';
  if (endpoint.endsWith('/')) endpoint = endpoint.slice(0, -1);
  const modelName = config.ollamaMode === 'local' ? config.ollamaLocalModel : config.ollamaCloudModel;

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

  if (options?.inlineData && config.ollamaMode === 'local') {
    body.images = [options.inlineData.data];
  }

  const response = await fetch(`${endpoint}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama Error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  
  return {
    text: data.response || "",
    tokenUsage: formatOllamaTokenUsage(data)
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

const normalizeCharacteristicValue = (raw: string): string => {
  const trimmed = (raw || '').toString().trim();
  if (!trimmed) return trimmed;

  let value = trimmed.replace(/^не\s+менее\s+/i, '').trim();
  const resMatch = value.match(/(\d{3,5})\s*[xх×]\s*(\d{3,5})/i);
  if (resMatch) {
    value = `${resMatch[1]}x${resMatch[2]}`;
  }

  return value;
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
  dictByCat: Record<string, string[]>
): EquipmentItem[] => {
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
      const normalizedValue = normalizeCharacteristicValue(char.value);
      const target = normalizeName(rawName);
      const exactName = normalizedDict.get(target);

      if (exactName) {
        if (!mapped[exactName]) {
          mapped[exactName] = {
            name: exactName,
            value: normalizedValue
          };
        } else if (normalizedValue && normalizedValue.length > mapped[exactName].value.length) {
          mapped[exactName].value = normalizedValue;
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
        if (!mapped[matchedName]) {
          mapped[matchedName] = {
            name: matchedName,
            value: normalizedValue,
            originalName: rawName
          };
        } else if (normalizedValue && normalizedValue.length > mapped[matchedName].value.length) {
          mapped[matchedName].value = normalizedValue;
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
  input: string | { data: string; mimeType: string },
  dictionary: DictionaryField[],
  modelName?: string, // legacy parameter, no longer used directly as we rely on config
  onRetry?: (msg: string) => void
): Promise<{ items: EquipmentItem[], metadata: OrderMetadata, tokenUsage: string }> => {
  const dictByCat = dictionary.reduce((acc, curr) => {
    if (!acc[curr.category]) acc[curr.category] = [];
    acc[curr.category].push(curr.fieldName);
    return acc;
  }, {} as Record<string, string[]>);

  const prompt = `Ты — эксперт по закупкам ИТ-оборудования в РФ. Извлеки данные из следующего документа:
${typeof input === 'string' ? `Текст заказа: ${input}` : `[См. вложенное изображение/файл]`}

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

    const options: GenerateOptions = {
      jsonMode: true,
      schema,
      systemPrompt: `Ты — эксперт по закупкам ИТ-оборудования в РФ. Извлеки данные.
Правила:
1) Определи категорию каждого товара из списка
2) Используй ТОЛЬКО характеристики из справочника КТРУ для выбранной категории
3) Если точного соответствия нет — выбери НАИБОЛЕЕ подходящий логически признак из справочника
4) Указывай только признаки со значениями, найденные в документе
5) Если рядом со значением есть единица измерения (Гб, Мб, Кб, Тб, Герц, МГц, MHz, GHz, Вт, Ватт, kW и т.д.) — включай ее в значение
6) Если значение содержит "не менее" — опусти эту фразу
7) Разрешение формата 1920x1080 сохраняй в таком же виде
Отвечай строго в формате JSON, соответствующем заданной схеме. Не добавляй markdown \`\`\`json.`
    };

    if (typeof input !== 'string') {
      options.inlineData = input;
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
      if (jsonText) parsed = JSON.parse(jsonText);
    } catch (e) {
      console.error("Parse error", e);
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
          const rawChars = item.characteristics || item['Характеристики'] || item['Параметры'] || item['Технические характеристики'] || {};
          if (Array.isArray(rawChars)) {
            characteristics = rawChars.map((c: any) => ({
              name: c?.name || c?.['Наименование'] || '',
              value: c?.value || c?.['Значение'] || ''
            })).filter(c => c.name);
          } else if (rawChars && typeof rawChars === 'object') {
            characteristics = Object.entries(rawChars).map(([k, v]) => ({ name: k, value: String(v ?? '') })).filter(c => c.name);
          }

          if (characteristics.length === 0) {
            characteristics = Object.entries(item)
              .filter(([k]) => !['name','category','quantity','items','metadata','Наименование','Название','Категория','Количество','Кол-во','Наименование объекта закупки'].includes(k))
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

    return {
      items: mapCharacteristicsToDictionary(parsed.items || [], dictByCat),
      metadata: {
        ...parsed.metadata,
        processingId: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        tokenUsage: res.tokenUsage
      },
      tokenUsage: res.tokenUsage
    };
  }, (attempt) => onRetry?.(`Ожидание очереди (429)... Попытка ${attempt}`));
};

export const enrichItemWithKtru = async (item: EquipmentItem) => {
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
