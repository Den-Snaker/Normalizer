import { describe, it, expect } from 'vitest';

// Unit conversions are defined in gemini.ts but not exported
// We test the logic here by re-implementing the pure functions

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

  // Range patterns
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

  if (!srcConfig || !dstConfig) {
    // Check if units match (with aliases)
    const normalizedUnit = parsed.unit.toLowerCase().trim();
    const normalizedExpected = expectedUnit.toLowerCase().trim();
    
    if (normalizedUnit === normalizedExpected || 
        normalizedUnit === normalizedExpected.replace(/[йаяов]/g, '') ||
        normalizedExpected.includes(normalizedUnit)) {
      for (const [, config] of Object.entries(UNIT_CONVERSIONS)) {
        if (config.aliases.some(a => a.toLowerCase() === normalizedExpected) ||
            config.canonicalName.toLowerCase() === normalizedExpected) {
          return `${parsed.value} ${config.canonicalName}`;
        }
      }
      return `${parsed.value} ${expectedUnit}`;
    }
    return rawValue;
  }

  if (srcConfig.base !== dstConfig.base) {
    return `${parsed.value} ${dstConfig.canonicalName}`;
  }

  if (srcConfig.factor === dstConfig.factor) {
    return `${parsed.value} ${dstConfig.canonicalName}`;
  }

  const convertedValue = parsed.value * (srcConfig.factor / dstConfig.factor);
  const roundedValue = Math.floor(convertedValue);

  return `${roundedValue} ${dstConfig.canonicalName}`;
};

describe('Unit Conversions', () => {
  describe('normalizeUnitName', () => {
    it('should normalize common unit aliases', () => {
      expect(normalizeUnitName('гб')).toBe('Гб');
      expect(normalizeUnitName('Гигабайт')).toBe('Гб');
      expect(normalizeUnitName('GB')).toBe('Гб');
      expect(normalizeUnitName('гигабайта')).toBe('Гб');
    });

    it('should handle case insensitivity', () => {
      expect(normalizeUnitName('МГЦ')).toBe('МГц');
      expect(normalizeUnitName('мгц')).toBe('МГц');
      expect(normalizeUnitName('Мгц')).toBe('МГц');
    });

    it('should return original unit for unknown units', () => {
      expect(normalizeUnitName('шт')).toBe('шт');
      expect(normalizeUnitName('кг')).toBe('кг');
    });

    it('should handle empty strings', () => {
      expect(normalizeUnitName('')).toBe('');
      expect(normalizeUnitName('   ')).toBe('');
    });
  });

  describe('getUnitConfig', () => {
    it('should return config for known units', () => {
      const config = getUnitConfig('ГБ');
      expect(config).not.toBeNull();
      expect(config?.base).toBe('Гб');
      expect(config?.factor).toBe(1);
      expect(config?.canonicalName).toBe('Гигабайт');
    });

    it('should return config for aliases', () => {
      const config = getUnitConfig('мб');
      expect(config).not.toBeNull();
      expect(config?.base).toBe('Гб');
      expect(config?.factor).toBe(1/1024);
    });

    it('should return null for unknown units', () => {
      expect(getUnitConfig('unknown')).toBeNull();
    });
  });

  describe('parseValueWithUnit', () => {
    it('should parse simple numeric values', () => {
      expect(parseValueWithUnit('500 ГБ')).toEqual({
        value: 500,
        unit: 'ГБ',
        original: '500 ГБ'
      });
    });

    it('should parse values with decimal', () => {
      expect(parseValueWithUnit('1,5 ТБ')).toEqual({
        value: 1.5,
        unit: 'ТБ',
        original: '1,5 ТБ'
      });
    });

    it('should parse ranges', () => {
      const result = parseValueWithUnit('16 – 32 ГБ');
      expect(result.value).toBe(16);
      expect(result.unit).toBe('ГБ');
    });

    it('should handle empty strings', () => {
      expect(parseValueWithUnit('')).toEqual({
        value: null,
        unit: '',
        original: ''
      });
    });

    it('should handle invalid values', () => {
      expect(parseValueWithUnit('текст')).toEqual({
        value: null,
        unit: '',
        original: 'текст'
      });
    });
  });

  describe('convertValueUnit', () => {
    it('should convert MB to GB', () => {
      const result = convertValueUnit('1024 МБ', 'Test', 'Гигабайт');
      expect(result).toBe('1 Гигабайт');
    });

    it('should convert TB to GB', () => {
      const result = convertValueUnit('1 ТБ', 'Test', 'Гигабайт');
      expect(result).toBe('1024 Гигабайт');
    });

    it('should convert MHz to GHz', () => {
      const result = convertValueUnit('3300 МГц', 'Test', 'Гигагерц');
      expect(result).toBe('3 Гигагерц');
    });

    it('should keep same unit when already canonical', () => {
      const result = convertValueUnit('500 ГБ', 'Test', 'Гигабайт');
      expect(result).toBe('500 Гигабайт');
    });

    it('should return original if conversion not possible', () => {
      const result = convertValueUnit('abc', 'Test', 'Гигабайт');
      expect(result).toBe('abc');
    });

    it('should handle invalid input gracefully', () => {
      expect(convertValueUnit('', 'Test', 'Гигабайт')).toBe('');
      expect(convertValueUnit(null as any, 'Test', 'Гигабайт')).toBe(null);
    });
  });

  describe('UNIT_CONVERSIONS', () => {
    it('should have all required units', () => {
      expect(UNIT_CONVERSIONS['Гб']).toBeDefined();
      expect(UNIT_CONVERSIONS['Мб']).toBeDefined();
      expect(UNIT_CONVERSIONS['Тб']).toBeDefined();
      expect(UNIT_CONVERSIONS['ГГц']).toBeDefined();
      expect(UNIT_CONVERSIONS['МГц']).toBeDefined();
      expect(UNIT_CONVERSIONS['Вт']).toBeDefined();
      expect(UNIT_CONVERSIONS['кВт']).toBeDefined();
    });

    it('should have correct conversion factors', () => {
      expect(UNIT_CONVERSIONS['Тб'].factor).toBe(1024);
      expect(UNIT_CONVERSIONS['Мб'].factor).toBe(1/1024);
      expect(UNIT_CONVERSIONS['МГц'].factor).toBe(1/1000);
    });
  });
});