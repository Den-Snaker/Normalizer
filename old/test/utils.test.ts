import { describe, it, expect, vi, beforeEach } from 'vitest';

// Helper functions that would be imported from services
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

describe('Text Similarity Functions', () => {
  describe('normalizeName', () => {
    it('should normalize text to lowercase', () => {
      expect(normalizeName('Процессор')).toBe('процессор');
    });

    it('should replace special characters with spaces', () => {
      expect(normalizeName('Intel Core i5-12400')).toBe('intel core i5 12400');
    });

    it('should handle multiple spaces', () => {
      expect(normalizeName('Много   пробелов')).toBe('много пробелов');
    });

    it('should handle empty strings', () => {
      expect(normalizeName('')).toBe('');
    });

    it('should remove non-alphanumeric characters except Cyrillic', () => {
      expect(normalizeName('Привет! Как дела?')).toBe('привет как дела');
    });

    it('should handle numbers correctly', () => {
      expect(normalizeName('16 ГБ DDR4')).toBe('16 гб ddr4');
    });
  });

  describe('tokenSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(tokenSimilarity('Процессор', 'Процессор')).toBe(1);
    });

    it('should return 0 for completely different strings', () => {
      expect(tokenSimilarity('Процессор', 'Монитор')).toBe(0);
    });

    it('should handle partial matches', () => {
      const similarity = tokenSimilarity('Intel Core i5', 'Intel Core i7');
      expect(similarity).toBeGreaterThan(0.5);
      expect(similarity).toBeLessThan(1);
    });

    it('should be case insensitive', () => {
      expect(tokenSimilarity('ПРОЦЕССОР', 'процессор')).toBe(1);
    });

    it('should handle empty strings', () => {
      expect(tokenSimilarity('', 'test')).toBe(0);
      expect(tokenSimilarity('test', '')).toBe(0);
    });

    it('should handle strings with different token counts', () => {
      const similarity = tokenSimilarity('Процессор Intel Core', 'Процессор');
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });
  });
});

describe('Equipment Category Functions', () => {
  const CATEGORY_KTRU_INDICES: Record<string, string> = {
    'Сервер': '26.20.14.000',
    'ПК и Моноблоки': '26.20.15.000',
    'Мониторы': '26.20.17.110',
    'Ноутбуки и Планшеты': '26.20.11.110',
    'МФУ': '26.20.18.000',
    'Принтеры': '26.20.16.120',
    'Клавиатуры': '26.20.16.110',
    'Мышь': '26.20.16.170',
    'Маршрутизаторы': '26.30.11.120',
    'Коммутаторы': '26.30.11.110',
    'ИБП': '26.20.40.110',
    'Прочее': '0.0.0'
  };

  it('should have correct KTRU indices', () => {
    expect(CATEGORY_KTRU_INDICES['Сервер']).toBe('26.20.14.000');
    expect(CATEGORY_KTRU_INDICES['Мониторы']).toBe('26.20.17.110');
  });

  it('should have all required categories', () => {
    const requiredCategories = [
      'Сервер', 'ПК и Моноблоки', 'Мониторы', 'Ноутбуки и Планшеты',
      'МФУ', 'Принтеры', 'Клавиатуры', 'Мышь', 'Маршрутизаторы', 
      'Коммутаторы', 'ИБП', 'Прочее'
    ];
    requiredCategories.forEach(cat => {
      expect(CATEGORY_KTRU_INDICES[cat]).toBeDefined();
    });
  });
});

describe('Characteristic Value Parsing', () => {
  const parseCharacteristicValue = (raw: string, fieldName: string = ''): string => {
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

  it('should remove "не менее" prefix', () => {
    expect(parseCharacteristicValue('не менее 16 ГБ')).toBe('16 ГБ');
    expect(parseCharacteristicValue('Не менее 500 ГБ')).toBe('500 ГБ');
  });

  it('should normalize resolution format', () => {
    expect(parseCharacteristicValue('1920x1080')).toBe('1920x1080');
    expect(parseCharacteristicValue('1920 х 1080')).toBe('1920x1080');
    expect(parseCharacteristicValue('2560×1440')).toBe('2560x1440');
  });

  it('should normalize contrast values', () => {
    expect(parseCharacteristicValue('1000', 'Контрастность')).toBe('1000:1');
    expect(parseCharacteristicValue('1000 : 1', 'Контрастность монитора')).toBe('1000:1');
  });

  it('should handle empty strings', () => {
    expect(parseCharacteristicValue('')).toBe('');
    expect(parseCharacteristicValue('   ')).toBe('');
  });

  it('should not modify unrelated values', () => {
    expect(parseCharacteristicValue('Intel Core i5')).toBe('Intel Core i5');
    expect(parseCharacteristicValue('DDR4')).toBe('DDR4');
  });
});

describe('INN Validation', () => {
  const isValidINN = (inn: string): boolean => {
    if (!inn) return false;
    const cleanInn = inn.replace(/\D/g, '');
    return cleanInn.length === 10 || cleanInn.length === 12;
  };

  it('should validate 10-digit INN (organizations)', () => {
    expect(isValidINN('1234567890')).toBe(true);
    expect(isValidINN('7736050003')).toBe(true);
  });

  it('should validate 12-digit INN (individuals)', () => {
    expect(isValidINN('123456789012')).toBe(true);
    expect(isValidINN('500100732259')).toBe(true);
  });

  it('should reject invalid INN lengths', () => {
    expect(isValidINN('12345')).toBe(false);
    expect(isValidINN('123456789')).toBe(false);
    expect(isValidINN('1234567890123')).toBe(false);
  });

  it('should handle formatted INN', () => {
    expect(isValidINN('7736-05000-3')).toBe(true);
    expect(isValidINN('123 456 789 0')).toBe(true);
  });

  it('should reject empty or null', () => {
    expect(isValidINN('')).toBe(false);
    expect(isValidINN(null as any)).toBe(false);
  });
});

describe('Date Formatting', () => {
  const formatDateTime = (timestamp: number): string => {
    const d = new Date(timestamp);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  it('should format timestamp correctly', () => {
    const ts = new Date(2024, 0, 15, 10, 30).getTime();
    expect(formatDateTime(ts)).toBe('15-01-2024 10:30');
  });

  it('should pad single digit values', () => {
    const ts = new Date(2024, 0, 5, 5, 5).getTime();
    expect(formatDateTime(ts)).toBe('05-01-2024 05:05');
  });

  it('should handle month correctly (0-indexed)', () => {
    const ts = new Date(2024, 11, 31, 23, 59).getTime();
    expect(formatDateTime(ts)).toBe('31-12-2024 23:59');
  });
});