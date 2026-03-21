import Dexie, { type Table } from 'dexie';
import { EquipmentCategory, DictionaryField, OrderMetadata, EquipmentItem } from '../types';
import { CATEGORIES_CONFIG, CATEGORY_KTRU_INDICES } from '../constants.tsx';
import { initializeApp, getApps, deleteApp, FirebaseApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  getDocs, 
  addDoc, 
  query, 
  where, 
  doc, 
  setDoc,
  Firestore,
  QueryDocumentSnapshot
} from 'firebase/firestore/lite';

const DB_CONFIG_KEY = 'ktru_db_config_enc';

let sessionPassword = '';

// Тип хранилища: Классический API (Postgres) или Serverless (Firebase)
export type StorageType = 'postgres_api' | 'firebase';

export interface DBConfig {
  type: StorageType;
  // Postgres fields
  host: string;
  dbName: string;
  port: string;
  user: string;
  useProxy: boolean;
  
  // Firebase fields
  firebaseApiKey: string;
  firebaseAuthDomain: string;
  firebaseProjectId: string;
  firebaseStorageBucket: string;
  firebaseMessagingSenderId: string;
  firebaseAppId: string;

  // Common
  password: string; // Used for Postgres pass or encryption key
  model: string;
  ktruSource: 'zakupki.gov.ru' | 'zakupki44fz.ru';
  ktru44Token: string;
  ktru44ShortToken: string;

  // LLM Config
  llm: {
    provider: 'google' | 'openrouter' | 'ollama';
    googleApiKey: string;
    googleModel: string;
    openrouterApiKey: string;
    openrouterModel: string;
    ollamaMode: 'local' | 'cloud';
    ollamaLocalModel: string;
    ollamaLocalModels: string[];
    ollamaCloudModel: string;
    ollamaCloudApiKey: string;
    ollamaEndpoint: string;
  };
}

const DEFAULT_CONFIG: DBConfig = {
  type: 'postgres_api',
  host: 'localhost',
  port: '8000',
  dbName: 'ktru_db',
  user: 'postgres',
  password: '',
  useProxy: false,
  firebaseApiKey: "",
  firebaseAuthDomain: "",
  firebaseProjectId: "",
  firebaseStorageBucket: "",
  firebaseMessagingSenderId: "",
  firebaseAppId: "",
  model: 'gemini-3.1-pro-preview',
  ktruSource: 'zakupki.gov.ru',
  ktru44Token: '',
  ktru44ShortToken: '',
  llm: {
    provider: 'google',
    googleApiKey: '',
    googleModel: 'gemini-3.1-pro-preview',
    openrouterApiKey: '',
    openrouterModel: 'qwen/qwen3-235b-a22b-thinking-2507:free',
    ollamaMode: 'local',
    ollamaLocalModel: 'llama3.1',
    ollamaLocalModels: ['llama3.1'],
    ollamaCloudModel: 'glm-5',
    ollamaCloudApiKey: '',
    ollamaEndpoint: 'http://localhost:11434'
  }
};

// --- Firestore Data Converters ---
const dictionaryConverter = {
  toFirestore: (data: DictionaryField) => data,
  fromFirestore: (snap: QueryDocumentSnapshot) => snap.data() as DictionaryField
};

interface OrderDocument {
  metadata: OrderMetadata;
  items: EquipmentItem[];
  createdAt: number;
}

const orderConverter = {
  toFirestore: (data: OrderDocument) => data,
  fromFirestore: (snap: QueryDocumentSnapshot) => snap.data() as OrderDocument
};

// --- Firebase Init Helpers ---
let firebaseDb: Firestore | null = null;

const initFirebase = (config?: DBConfig): Firestore | null => {
  const cfg = config || getDbConfig();
  
  if (cfg.type !== 'firebase' || !cfg.firebaseApiKey || !cfg.firebaseProjectId) {
    return null;
  }

  // Если база уже инициализирована с теми же ключами, возвращаем её
  // Но только если config не был явно передан (т.е. не проверяем новые credentials)
  if (!config && firebaseDb) return firebaseDb;

  try {
    const firebaseConfig = {
      apiKey: cfg.firebaseApiKey,
      authDomain: cfg.firebaseAuthDomain,
      projectId: cfg.firebaseProjectId,
      storageBucket: cfg.firebaseStorageBucket,
      messagingSenderId: cfg.firebaseMessagingSenderId,
      appId: cfg.firebaseAppId
    };

    let app: FirebaseApp;
    const existingApps = getApps();
    
    if (existingApps.length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = existingApps[0];
    }

    // Инициализация Firestore Lite. 
    // Ошибка 'Service not available' возникала из-за конфликта версий в importmap.
    const dbInstance = getFirestore(app);
    if (!dbInstance) {
      throw new Error("Не удалось создать экземпляр Firestore.");
    }
    
    firebaseDb = dbInstance;
    console.log("Firebase успешно инициализирован для проекта:", cfg.firebaseProjectId);
    return firebaseDb;
  } catch (e: any) {
    console.error("Ошибка инициализации Firebase:", e.message);
    firebaseDb = null;
    return null;
  }
};

// --- Config Management ---

const encryptConfig = (config: Omit<DBConfig, 'password'>): string => {
  try {
    const json = JSON.stringify(config);
    return btoa(encodeURIComponent(json)); 
  } catch (e) {
    console.error("Encryption failed", e);
    return "";
  }
};

const decryptConfig = (encrypted: string): DBConfig => {
  try {
    const json = decodeURIComponent(atob(encrypted));
    const parsed = JSON.parse(json);
    return { ...DEFAULT_CONFIG, ...parsed, password: '' };
  } catch (e) {
    console.warn("Decryption failed, using default config");
    return DEFAULT_CONFIG;
  }
};

/**
 * Вызывается кнопкой "Сохранить настройки" в App.tsx
 */
export const saveDbConfig = async (config: DBConfig) => {
  sessionPassword = config.password;
  const configToStore = { ...config, password: '' };
  const encrypted = encryptConfig(configToStore);
  localStorage.setItem(DB_CONFIG_KEY, encrypted);
  
  // СБРОС: Уничтожаем старый инстанс базы
  firebaseDb = null;
  
  // Принудительная очистка всех Firebase приложений перед новой инициализацией
  const apps = getApps();
  for (const app of apps) {
    try {
      await deleteApp(app);
      console.log("Старое приложение Firebase удалено для перенастройки.");
    } catch (err) {
      console.warn("Не удалось удалить приложение:", err);
    }
  }
  
  if (config.type === 'firebase') {
    // Сразу пробуем инициализировать заново с новыми ключами
    initFirebase(); 
  }
};

export const getDbConfig = (): DBConfig => {
  const stored = localStorage.getItem(DB_CONFIG_KEY);
  const config = stored ? decryptConfig(stored) : DEFAULT_CONFIG;
  return { ...DEFAULT_CONFIG, ...config, password: sessionPassword };
};

export const setSessionPassword = (password: string) => {
  sessionPassword = password;
};

export const importConfigFromText = (encrypted: string): DBConfig => {
  try {
    const json = decodeURIComponent(atob(encrypted));
    const config = JSON.parse(json);
    return { ...DEFAULT_CONFIG, ...config, password: '' } as DBConfig;
  } catch (e) {
    console.error(e);
    throw new Error("Не удалось прочитать файл настроек.");
  }
};

export const exportConfigToFile = (config: DBConfig) => {
  const configToExport = { ...config, password: '' };
  const encrypted = encryptConfig(configToExport);
  const blob = new Blob([encrypted], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `db_config_${config.type}.conf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// --- Network / API Helpers ---

export const buildApiUrl = (config: DBConfig) => {
  const isBrowser = typeof window !== 'undefined';
  const browserHost = isBrowser ? window.location.hostname : '';
  const isLocalHost = ['localhost', '127.0.0.1'].includes(config.host);
  const isBrowserLocal = ['localhost', '127.0.0.1'].includes(browserHost);

  // Автоопределение хоста и порта для production
  const resolvedHost = !config.host
    ? browserHost
    : (isLocalHost && !isBrowserLocal ? browserHost : config.host);
  const resolvedPort = config.port || '8000';

  const baseUrl = `http://${resolvedHost}:${resolvedPort}`;
  if (config.useProxy) {
    return `https://corsproxy.io/?${encodeURIComponent(baseUrl)}`;
  }
  return baseUrl;
};

export const getApiUrl = () => {
  const config = getDbConfig();
  return buildApiUrl(config);
};

const handleNetworkError = (e: any, url: string) => {
   const isHttps = window.location.protocol === 'https:';
   const targetPort = url.split(':')[2]?.split('/')[0];
   const isLikelyDbPort = ['5432', '6432', '16372', '3306', '27017'].includes(targetPort);

   if (e.message === 'Failed to fetch' || e.name === 'TypeError') {
     if (isLikelyDbPort) {
        return new Error(
          `🛑 ОШИБКА РЕЖИМА:\n` +
          `Вы пытаетесь подключиться к порту базы данных (${targetPort}) напрямую.\n` +
          `Для работы без бэкенда переключите режим на "Google Firebase" в настройках.`
        );
     }
     if (isHttps && !url.includes('https') && !url.includes('corsproxy')) {
       return new Error(`🛑 БЛОКИРОВКА БРАУЗЕРА (Mixed Content):\nСайт на HTTPS не может обращаться к HTTP API.`);
     }
     return new Error(`🛑 ОШИБКА СОЕДИНЕНИЯ:\nСервер API по адресу ${url} недоступен.`);
   }
   return e;
};

// --- Local Database (Dexie) ---

export interface CategoryMetadata {
  category: EquipmentCategory;
  ktruIndex: string;
}

export class AppDatabase extends Dexie {
  dictionary!: Table<DictionaryField>;
  orders!: Table<{ metadata: OrderMetadata; items: EquipmentItem[] }>;
  categoryMetadata!: Table<CategoryMetadata>;

  constructor() {
    super('KtruProcurementSystem');
    (this as any).version(6).stores({
      dictionary: '[category+fieldName], category, unit, values',
      orders: 'metadata.processingId, metadata.timestamp, metadata.customerInn',
      categoryMetadata: 'category'
    });

    (this as any).on('populate', () => {
      const initialFields: DictionaryField[] = [];
      Object.entries(CATEGORIES_CONFIG).forEach(([category, fields]) => {
        fields.forEach(field => {
          initialFields.push({ category: category as EquipmentCategory, fieldName: field, isActive: true });
        });
      });
      this.dictionary.bulkAdd(initialFields);
      const initialMetadata: CategoryMetadata[] = Object.entries(CATEGORY_KTRU_INDICES).map(([cat, index]) => ({
        category: cat as EquipmentCategory,
        ktruIndex: index
      }));
      this.categoryMetadata.bulkAdd(initialMetadata);
    });
  }
}

export const db = new AppDatabase();

// --- Unified Remote Data Access ---

export const fetchDictionaryFromPostgres = async (): Promise<DictionaryField[]> => {
  const config = getDbConfig();

  if (config.type === 'firebase') {
    const currentDb = firebaseDb || initFirebase();
    if (!currentDb) throw new Error("Firebase не инициализирован. Проверьте настройки.");
    
    const dictRef = collection(currentDb, "dictionary").withConverter(dictionaryConverter);
    const querySnapshot = await getDocs(dictRef);
    
    return querySnapshot.docs.map(doc => doc.data());
  }

   const apiUrl = getApiUrl();
   try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${apiUrl}/dictionary`, { signal: controller.signal });
      clearTimeout(id);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const data = await response.json();
      if (!Array.isArray(data)) return [];
      return data.map((item: any) => ({
        category: item.category,
        fieldName: item.fieldName || item.field_name || item.field || '',
        isActive: item.isActive ?? item.is_active ?? true,
        unit: item.unit || null,
        values: item.possible_values || item.possibleValues || null
      })).filter((d: DictionaryField) => d.category && d.fieldName);
   } catch (e: any) {
     throw handleNetworkError(e, apiUrl);
   }
};

export const fetchOrdersFromPostgres = async (startDate: number, endDate: number): Promise<{ metadata: OrderMetadata; items: EquipmentItem[] }[]> => {
  const config = getDbConfig();

  if (config.type === 'firebase') {
    const currentDb = firebaseDb || initFirebase();
    if (!currentDb) return []; 

    const ordersRef = collection(currentDb, "orders").withConverter(orderConverter);
    const q = query(
      ordersRef, 
      where("metadata.timestamp", ">=", startDate),
      where("metadata.timestamp", "<=", endDate)
    );
    
    try {
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          metadata: data.metadata,
          items: data.items
        };
      });
    } catch (e) {
      console.error("Ошибка получения заказов из Firebase:", e);
      return [];
    }
  }

  const apiUrl = getApiUrl();
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10000);
    const startDateStr = new Date(startDate).toISOString().split('T')[0];
    const endDateStr = new Date(endDate).toISOString().split('T')[0];
    const response = await fetch(`${apiUrl}/orders?start_date=${startDateStr}&end_date=${endDateStr}&limit=1000`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(id);
    if (!response.ok) throw new Error(`Ошибка сервера: ${response.statusText}`);
    const data = await response.json();
    return data.map((row: any) => ({
      metadata: {
        processingId: row.processing_id,
        sourceFile: row.source_file,
        timestamp: row.processing_date ? new Date(row.processing_date).getTime() : Date.now(),
        customerName: row.customer_name,
        customerInn: row.customer_inn,
        customerAddress: row.customer_address,
        docDate: row.doc_date,
        tokenUsage: row.token_usage,
        otherDetails: row.other_details
      },
      items: (row.items || []).map((item: any) => ({
        ...item,
        ktruCode: item.ktruCode || item.ktru_code || ''
      }))
    }));
  } catch (e: any) {
    console.warn("Не удалось получить данные с удаленного сервера:", e.message);
    return []; 
  }
};

export const syncWithPostgres = async (data: any) => {
  const config = getDbConfig();

  if (config.type === 'firebase') {
    const currentDb = firebaseDb || initFirebase();
    if (!currentDb) {
       console.error("Firebase не готов к синхронизации.");
       return false;
    }

    try {
      if (data.action === 'schema_update') {
        const allDict = await (new AppDatabase()).dictionary.toArray();
        const dictRef = collection(currentDb, "dictionary").withConverter(dictionaryConverter);
        
        const promises = allDict.map(item => {
            const docId = `${item.category}_${item.fieldName}`.replace(/[^a-zA-Z0-9]/g, '_');
            return setDoc(doc(dictRef, docId), item);
        });
        
        await Promise.all(promises);
        return true;
      }

      if (data.metadata && data.items) {
        const orderData: OrderDocument = {
          metadata: data.metadata,
          items: data.items,
          createdAt: Date.now()
        };
        
        const ordersRef = collection(currentDb, "orders").withConverter(orderConverter);
        await addDoc(ordersRef, orderData);
        return true;
      }
      return false;
    } catch (e) {
      console.error("Ошибка синхронизации Firebase:", e);
      return false;
    }
  }

  const apiUrl = getApiUrl();
  try {
    if (data.action === 'schema_update') return;

    if (data.metadata && data.items) {
      const payload = {
        processing_id: data.metadata.processingId,
        source_file: data.metadata.sourceFile,
        doc_date: data.metadata.docDate,
        customer_name: data.metadata.customerName,
        customer_inn: data.metadata.customerInn,
        customer_address: data.metadata.customerAddress,
        other_details: data.metadata.otherDetails,
        token_usage: data.metadata.tokenUsage,
        items: data.items.map((item: EquipmentItem) => ({
          category: item.category,
          name: item.name,
          ktru_code: item.ktruCode,
          quantity: item.quantity,
          characteristics: item.characteristics
        })),
        total_quantity: data.items.reduce((sum: number, i: EquipmentItem) => sum + i.quantity, 0)
      };
      const response = await fetch(`${apiUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        console.error(`Ошибка записи в БД: ${response.status} ${response.statusText}`);
        return false;
      }
      return true;
    }
    return false;
  } catch (error: any) {
    const enrichedError = handleNetworkError(error, apiUrl);
    console.error("Ошибка синхронизации с PostgreSQL:", enrichedError.message);
    return false; 
  }
};

export const clearRemoteDatabase = async () => {
  const config = getDbConfig();
  if (config.type === 'firebase') {
     throw new Error("Массовая очистка Firestore с клиента запрещена. Используйте консоль Firebase.");
  }

  const apiUrl = getApiUrl();
  try {
     await fetch(`${apiUrl}/database/clear`, { method: 'DELETE' });
     return true;
  } catch (e) {
    throw handleNetworkError(e, apiUrl);
  }
};

export const saveDictionaryToPostgres = async (dictionary: DictionaryField[]) => {
  const config = getDbConfig();
  if (config.type === 'firebase') {
    throw new Error('Сохранение справочника поддерживается только для Postgres (REST).');
  }

  const apiUrl = getApiUrl();
  try {
    const payload = dictionary.map(d => ({
      category: d.category,
      field_name: d.fieldName,
      is_active: d.isActive,
      unit: d.unit || null,
      possible_values: d.values || null
    }));

    const response = await fetch(`${apiUrl}/dictionary/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ошибка сохранения в БД: ${response.status} ${text}`);
    }

    return true;
  } catch (e: any) {
    const enrichedError = handleNetworkError(e, apiUrl);
    throw new Error(enrichedError.message);
  }
};

/**
 * Вызывается кнопкой "Проверить соединение" в App.tsx
 */
export const checkConnection = async (config?: DBConfig): Promise<{ ok: boolean; message: string }> => {
  const cfg = config || getDbConfig();

  if (cfg.type === 'firebase') {
    // Принудительно пробуем инициализировать или берем кэшированный инстанс
    const currentDb = firebaseDb || initFirebase(cfg);
    if (!currentDb) {
      return { ok: false, message: "Не удалось инициализировать Firebase SDK. Проверьте API Key и Project ID." };
    }
    try {
      // Простой тестовый запрос для проверки связи
      const dictRef = collection(currentDb, "dictionary");
      const q = query(dictRef, where("isActive", "==", true));
      await getDocs(q); 
      return { ok: true, message: `Успех! Соединение с Firestore (${cfg.firebaseProjectId}) установлено.` };
    } catch (e: any) {
      console.error("Ошибка проверки связи:", e);
      if (e.code === 'permission-denied') {
        return { ok: false, message: "Доступ запрещен. Проверьте 'Rules' в Firebase Console." };
      }
      return { ok: false, message: `Ошибка связи [${e.code || 'unknown'}]: ${e.message}` };
    }
  }

  const apiUrl = buildApiUrl(cfg);
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(`${apiUrl}/dictionary`, { method: 'GET', signal: controller.signal });
    clearTimeout(id);

    if (response.ok) {
      return { ok: true, message: "API доступно (Postgres)" };
    } else {
      return { ok: false, message: `Сервер ответил ошибкой: ${response.status}` };
    }
  } catch (e: any) {
    const errorMsg = e.message || '';
    const targetPort = cfg.port;
    const isLikelyDbPort = ['5432', '6432', '16372', '3306', '27017'].includes(targetPort);
    
    if (errorMsg === 'Failed to fetch' || errorMsg.includes('fetch')) {
      if (isLikelyDbPort) {
        return { 
          ok: false, 
          message: `Не удалось подключиться к ${cfg.host}:${cfg.port}.\n\nДля подключения к PostgreSQL нужен REST API бэкенд на этом хосте.\n\nВозможные причины:\n• Бэкенд не запущен\n• Неверный IP/порт\n• Брандмауэр блокирует соединение` 
        };
      }
      return { 
        ok: false, 
        message: `Сервер недоступен: ${cfg.host}:${cfg.port}\n\nПроверьте IP адрес и порт.` 
      };
    }
    return { ok: false, message: errorMsg };
  }
};
