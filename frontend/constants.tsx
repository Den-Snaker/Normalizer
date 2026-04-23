
import React from 'react';

export const CATEGORY_KTRU_SHORT: Record<string, string> = {
  'Сервер': '26.20.14.000',
  'ПК': '26.20.15.000',
  'Мониторы': '26.20.17.110',
  'Моноблоки': '26.20.15.000',
  'Ноутбуки': '26.20.11.110',
  'Планшеты': '26.20.11.110',
  'МФУ': '26.20.18.000',
  'Принтеры': '26.20.16.120',
  'Клавиатура': '26.20.16.110',
  'Мышь': '26.20.16.170',
  'Маршрутизатор': '26.30.11.120',
  'Коммутатор': '26.30.11.110',
  'ИБП': '26.20.40.110',
  'Прочее': '0.0.0'
};

export const CATEGORY_KTRU_INDICES: Record<string, string> = {
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

export const CATEGORIES_CONFIG: Record<string, string[]> = {
  'Сервер': [],
  'ПК': [],
  'Мониторы': [],
  'Моноблоки': [],
  'Ноутбуки': [],
  'Планшеты': [],
  'МФУ': [],
  'Принтеры': [],
  'Клавиатура': [],
  'Мышь': [],
  'Маршрутизатор': [],
  'Коммутатор': [],
  'ИБП': [],
  'Прочее': []
};

export const LLM_MODELS = {
  google: [
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', context: '1M', newest: true },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', context: '1M', newest: true },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', context: '1M' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', context: '1M' },
  ],
  
  openrouter: [
    // Qwen FREE models
    { id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder 480B', free: true },
    { id: 'qwen/qwen3-next-80b-a3b-instruct:free', name: 'Qwen3 Next 80B', free: true },
    
    // Google FREE models
    { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B (Vision+Video)', free: true, newest: true },
    { id: 'google/gemma-4-26b-a4b-it:free', name: 'Gemma 4 26B (Vision+Video)', free: true, newest: true },
    { id: 'google/gemini-2.5-flash:free', name: 'Gemini 2.5 Flash (Vision)', free: true },
    { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B (Vision)', free: true },
    
    // Other FREE models
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B', free: true, newest: true },
    { id: 'nvidia/nemotron-nano-12b-v2-vl:free', name: 'Nemotron Nano 12B VL (Vision)', free: true, newest: true },
    { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B', free: true },
    { id: 'openai/gpt-oss-20b:free', name: 'GPT-OSS 20B', free: true },
    { id: 'deepseek/deepseek-r1-0528:free', name: 'DeepSeek R1', free: true },
    { id: 'minimax/minimax-m2.5:free', name: 'MiniMax M2.5', free: true },
    { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air', free: true },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', free: true },
    { id: 'baidu/qianfan-ocr-fast:free', name: 'Qianfan OCR (Vision)', free: true },
    { id: 'arcee-ai/trinity-mini:free', name: 'Trinity Mini', free: true },
    
    // Paid models - Qwen
    { id: 'qwen/qwen3.6-plus', name: 'Qwen3.6 Plus (1M Vision)', free: false, newest: true },
    { id: 'qwen/qwen3-max', name: 'Qwen3 Max', free: false },
    { id: 'qwen/qwen3-max-thinking', name: 'Qwen3 Max Thinking', free: false },
    { id: 'qwen/qwen3-vl-235b-a22b-instruct', name: 'Qwen3 VL 235B (Vision)', free: false },
    { id: 'qwen/qwen3.5-plus-02-15', name: 'Qwen3.5 Plus 1M (Vision)', free: false },
    { id: 'qwen/qwen3.5-flash-02-23', name: 'Qwen3.5 Flash 1M (Vision)', free: false },
    { id: 'qwen/qwen3-coder-plus', name: 'Qwen3 Coder Plus (1M)', free: false, newest: true },
    
    // Paid models - Google
    { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview (Vision)', free: false },
    { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash Preview (Vision)', free: false },
    { id: 'google/gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite (Vision+Audio)', free: false, newest: true },
    
    // Paid models - OpenAI
    { id: 'openai/gpt-5.4', name: 'GPT-5.4 (1M Vision)', free: false, newest: true },
    { id: 'openai/gpt-5.4-mini', name: 'GPT-5.4 Mini (Vision)', free: false, newest: true },
    { id: 'openai/gpt-5', name: 'GPT-5 (400K Vision)', free: false },
    
    // Paid models - Anthropic
    { id: 'anthropic/claude-opus-4.7', name: 'Claude Opus 4.7 (1M Vision)', free: false, newest: true },
    { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6 (1M Vision)', free: false, newest: true },
    
    // Paid models - Others
    { id: 'z-ai/glm-5.1', name: 'GLM 5.1 (Thinking)', free: false, newest: true },
    { id: 'x-ai/grok-4', name: 'Grok 4 (Vision+Thinking)', free: false, newest: true },
    { id: 'x-ai/grok-4-fast', name: 'Grok 4 Fast (2M Vision)', free: false, newest: true },
    { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2 (Thinking)', free: false, newest: true },
    { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick (1M Vision)', free: false, newest: true },
    { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6 (Vision+Thinking)', free: false, newest: true },
  ],
  
  ollama_cloud: [
    // GLM models
    { id: 'glm-5.1', name: 'GLM 5.1 (Thinking+Tools)', cloud: true, newest: true },
    { id: 'glm-5', name: 'GLM-5 (744B)', cloud: true },
    { id: 'glm-4.7', name: 'GLM 4.7 (Thinking)', cloud: true },
    { id: 'glm-4.7-flash', name: 'GLM 4.7 Flash', cloud: true },
    { id: 'glm-4.6', name: 'GLM 4.6', cloud: true },
    
    // Qwen models
    { id: 'qwen3.6', name: 'Qwen 3.6 (Vision+Thinking)', cloud: true, vision: true, newest: true },
    { id: 'qwen3.5:cloud', name: 'Qwen 3.5 Cloud', cloud: true, vision: true },
    { id: 'qwen3.5:397b-cloud', name: 'Qwen 3.5 (397B) Cloud', cloud: true, vision: true },
    { id: 'qwen3-coder-next', name: 'Qwen3 Coder Next', cloud: true },
    { id: 'qwen3-next:80b', name: 'Qwen3 Next (80B)', cloud: true },
    
    // Qwen VL models
    { id: 'qwen3-vl:235b-cloud', name: 'Qwen 3 VL (235B) Cloud', cloud: true, vision: true },
    { id: 'qwen3-vl:235b-instruct-cloud', name: 'Qwen 3 VL Instruct Cloud', cloud: true, vision: true },
    
    // Gemma 4
    { id: 'gemma4', name: 'Gemma 4 (Vision+Video+Thinking)', cloud: true, vision: true, newest: true },
    
    // Kimi
    { id: 'kimi-k2.6', name: 'Kimi K2.6 (Vision+Thinking)', cloud: true, vision: true, newest: true },
    { id: 'kimi-k2.5', name: 'Kimi K2.5', cloud: true, vision: true },
    
    // Devstral
    { id: 'devstral-2:123b', name: 'Devstral 2 (123B)', cloud: true },
    { id: 'devstral-small-2:24b', name: 'Devstral Small 2 (24B)', cloud: true },
    
    // MiniMax
    { id: 'minimax-m2.7', name: 'MiniMax M2.7', cloud: true },
    { id: 'minimax-m2.5', name: 'MiniMax M2.5', cloud: true },
    
    // Nemotron
    { id: 'nemotron-3-super', name: 'Nemotron 3 Super (120B)', cloud: true },
    { id: 'nemotron-cascade-2:30b', name: 'Nemotron Cascade 2 (30B)', cloud: true, newest: true },
    { id: 'nemotron-3-nano:30b', name: 'Nemotron 3 Nano (30B)', cloud: true },
    { id: 'nemotron-3-nano:4b', name: 'Nemotron 3 Nano (4B)', cloud: true },
    
    // Ministral
    { id: 'ministral-3:14b', name: 'Ministral 3 (14B)', cloud: true },
    { id: 'ministral-3:8b', name: 'Ministral 3 (8B)', cloud: true },
    { id: 'ministral-3:3b', name: 'Ministral 3 (3B)', cloud: true },
    
    // Other cloud models
    { id: 'rnj-1:8b', name: 'Rnj-1 (8B)', cloud: true },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', cloud: true, vision: true },
    { id: 'deepseek-v3.2', name: 'DeepSeek V3.2', cloud: true },
    { id: 'lfm2:24b', name: 'LFM2 (24B)', cloud: true },
    { id: 'glm-ocr', name: 'GLM-OCR (Vision)', cloud: true, vision: true, newest: true },
    { id: 'medgemma:27b', name: 'MedGemma (27B Vision)', cloud: true, vision: true },
  ],
  
  ollama_local_popular: [
    { id: 'llama3.1', name: 'Llama 3.1' },
    { id: 'llama3.3', name: 'Llama 3.3' },
    { id: 'llama4', name: 'Llama 4 (Vision+Video)', vision: true, newest: true },
    { id: 'deepseek-r1', name: 'DeepSeek R1' },
    { id: 'gpt-oss', name: 'GPT-OSS' },
    { id: 'qwen3', name: 'Qwen 3' },
    { id: 'qwen3.6', name: 'Qwen 3.6 (Vision+Thinking)', vision: true, newest: true },
    { id: 'qwen3-vl', name: 'Qwen 3 VL (Vision)', vision: true },
    { id: 'qwen3-coder', name: 'Qwen3 Coder' },
    { id: 'gemma4', name: 'Gemma 4 (Vision+Thinking)', vision: true, newest: true },
    { id: 'gemma3', name: 'Gemma 3' },
    { id: 'phi4', name: 'Phi-4' },
    { id: 'mistral', name: 'Mistral' },
    { id: 'codellama', name: 'Code Llama' },
  ],
};

export const LLM_MODEL_OPTIONS = [
  ...LLM_MODELS.google,
  ...LLM_MODELS.openrouter,
  ...LLM_MODELS.ollama_cloud,
  ...LLM_MODELS.ollama_local_popular,
];

export const Icons = {
  Upload: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  ),
  Download: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  ),
  Settings: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.52-.878 3.313.915 2.435 2.435a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.878 1.52-.915 3.313-2.435 2.435a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.52.878-3.313-.915-2.435-2.435a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.878-1.52.915-3.313 2.435-2.435.996.575 2.237.042 2.573-1.066z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
};
