import { getApiUrl } from './db';
import { addLog } from './logger';

export const fetchKtruFieldsFromBackend = async (
  itemId: string,
  source: 'zakupki.gov.ru' | 'zakupki44fz.ru' | 'printforms' = 'zakupki.gov.ru',
  token?: string,
  shortToken?: string
): Promise<string[]> => {
  if (!itemId) return [];
  const apiUrl = getApiUrl();
  const params = new URLSearchParams({ itemId, source });
  const url = `${apiUrl}/ktru/fields?${params.toString()}`;

  addLog('info', '[KTRU] Запрос характеристик с сайта', { url, itemId, source });

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (shortToken) headers['X-Short-Auth-Token'] = shortToken;

  const response = await fetch(url, {
    headers: Object.keys(headers).length ? headers : undefined
  });
  if (!response.ok) {
    const text = await response.text();
    addLog('error', '[KTRU] Ошибка ответа бэкенда', { status: response.status, text });
    throw new Error(`KTRU backend error: ${response.status}`);
}

export const fetchKtruFieldDetailsFromBackend = async (
  itemId: string,
  source: 'zakupki.gov.ru' | 'zakupki44fz.ru' | 'printforms' = 'zakupki.gov.ru',
  token?: string,
  shortToken?: string
): Promise<{ name: string; unit: string }[]> => {
  if (!itemId) return [];
  const apiUrl = getApiUrl();
  const params = new URLSearchParams({ itemId, source });
  const url = `${apiUrl}/ktru/fields/details?${params.toString()}`;

  addLog('info', '[KTRU] Запрос характеристик с единицами', { url, itemId, source });

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (shortToken) headers['X-Short-Auth-Token'] = shortToken;

  const response = await fetch(url, {
    headers: Object.keys(headers).length ? headers : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`KTRU backend error: ${response.status}. ${text}`);
  }

  const data = await response.json();
  return data.fields || [];
};

  const data = await response.json();
  const fields = Array.isArray(data?.fields) ? data.fields : [];

  addLog('info', '[KTRU] Получены характеристики', { count: fields.length, sample: fields.slice(0, 3) });
  return fields;
};
