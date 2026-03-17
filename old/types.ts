
export enum EquipmentCategory {
  SERVER = 'Сервер',
  PC = 'ПК',
  MONITORS = 'Мониторы',
  MONOBLOCKS = 'Моноблоки',
  LAPTOPS = 'Ноутбуки',
  TABLETS = 'Планшеты',
  MFP = 'МФУ',
  PRINTERS = 'Принтеры',
  KEYBOARD = 'Клавиатура',
  MOUSE = 'Мышь',
  ROUTER = 'Маршрутизатор',
  SWITCH = 'Коммутатор',
  UPS = 'ИБП',
  OTHER = 'Прочее'
}

export interface Characteristic {
  name: string;
  value: string;
  originalName?: string;
  isExtra?: boolean;
}

export interface EquipmentItem {
  id?: string;
  category: EquipmentCategory;
  name: string;
  ktruCode: string;
  characteristics: Characteristic[];
  quantity: number;
}

export interface OrderMetadata {
  customerName: string;
  customerInn: string;
  customerAddress?: string;
  otherDetails?: string;
  docDate?: string;
  processingId: string;
  sourceFile?: string;
  timestamp: number;
  tokenUsage?: string; // K_x+R_x+P_x+T_x=Sum
}

export interface DictionaryField {
  category: EquipmentCategory;
  fieldName: string;
  isActive: boolean;
  unit?: string;
  values?: string[];
}

export interface FieldChange {
  id: string;
  category: EquipmentCategory;
  oldName?: string;
  newName: string;
  type: 'add' | 'rename';
}

export type LLMProvider = 'google' | 'openrouter' | 'ollama';
export type OllamaMode = 'local' | 'cloud';

export interface LLMConfig {
  provider: LLMProvider;
  googleApiKey: string;
  googleModel: string;
  openrouterApiKey: string;
  openrouterModel: string;
  ollamaMode: OllamaMode;
  ollamaLocalModel: string;
  ollamaLocalModels: string[];
  ollamaCloudModel: string;
  ollamaEndpoint: string;
}

export interface Task {
  id: string;
  fileName: string;
  file: File;
  status: 'queued' | 'processing' | 'enriching' | 'completed' | 'error';
  progress: number;
  error?: string;
  xlsxUrl?: string;
  xlsxFileName?: string;
}
