# Тесты Normalizer

## Структура тестов

### Frontend тесты (`frontend/test/`)

#### `gemini.test.ts` - 20 тестов
Тесты для функций конвертации единиц измерения:
- `normalizeUnitName` - нормализация названий единиц
- `getUnitConfig` - получение конфигурации единицы
- `parseValueWithUnit` - парсинг значений с единицами
- `convertValueUnit` - конвертация значений между единицами
- Проверка `UNIT_CONVERSIONS` словаря

#### `utils.test.ts` - 27 тестов
Тесты для вспомогательных функций:
- `normalizeName` - нормализация текста
- `tokenSimilarity` - расчёт схожести токенов
- `parseCharacteristicValue` - парсинг значений характеристик
- Валидация ИНН
- Форматирование даты/времени

### Backend тесты (`backend/test_schemas.py`) - 29 тестов

#### TestSchemas (19 тестов)
- `test_characteristic` - модель характеристики
- `test_equipment_item_create` - создание элемента оборудования
- `test_equipment_item_create_minimal` - минимальный элемент
- `test_order_create` - создание заказа
- `test_dictionary_field_create` - поле справочника
- `test_category_metadata_create` - метаданные категории
- `test_extract_request` - запрос на извлечение
- `test_extract_request_default_model` - модель по умолчанию
- `test_enrich_request` - запрос на обогащение
- `test_duplicate_check_request` - проверка дубликатов
- `test_ktru_lookup_response` - ответ КТРУ lookup
- `test_connection_status` - статус соединения
- `test_scanned_code_create` - сканированный код
- `test_scanned_code_create_full` - полный сканированный код
- `test_ollama_request` - запрос к Ollama
- `test_ollama_request_with_images` - запрос с изображениями
- `test_ollama_response` - ответ от Ollama
- `test_ollama_response_minimal` - минимальный ответ

#### TestINNValidation (3 теста)
- Валидация 10-значного ИНН (организации)
- Валидация 12-значного ИНН (ИП)
- Отклонение неверной длины ИНН

#### TestTokenUsage (2 теста)
- Формат строки использования токенов
- Парсинг строки токенов

#### TestKTRUCodeValidation (3 теста)
- Валидация формата кода КТРУ
- Извлечение кода группы
- Извлечение номера позиции

#### TestDateTimeFormatting (2 теста)
- Форматирование даты/времени
- Форматирование с заполнением нулями

## Запуск тестов

### Frontend
```bash
cd frontend
npm run test          # Запуск всех тестов
npm run test:watch    # Запуск в режиме watch
npm run test:coverage # Запуск с покрытием кода
```

### Backend
```bash
cd backend
python -m pytest test_schemas.py -v
```

## Покрытие функциональности

| Модуль | Покрытие |
|--------|----------|
| Схемы (schemas) | 100% |
| Конвертация единиц | 100% |
| Валидация ИНН | 100% |
| Валидация КТРУ | 100% |
| Форматирование даты | 100% |
| Схожесть токенов | 100% |

## Добавление новых тестов

1. **Frontend тесты**: создайте файл `frontend/test/*.test.ts`
2. **Backend тесты**: создайте файл `backend/test_*.py`

Тесты должны быть:
- Независимыми (не зависеть от порядка выполнения)
- Быстрыми (без реальных API вызовов)
- Понятными (ясные названия тестов)