import os
import json
import re
from difflib import SequenceMatcher
import asyncio
from typing import List, Dict, Any, Optional
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

CATEGORIES_CONFIG = {
    "Сервер": [],
    "ПК": [],
    "Мониторы": [],
    "Моноблоки": [],
    "Ноутбуки": [],
    "Планшеты": [],
    "МФУ": [],
    "Принтеры": [],
    "Клавиатура": [],
    "Мышь": [],
    "Маршрутизатор": [],
    "Коммутатор": [],
    "ИБП": [],
    "Прочее": []
}

CATEGORY_KTRU_INDICES = {
    "Сервер": "26.20.14.000",
    "ПК": "26.20.15.000",
    "Мониторы": "26.20.17.110",
    "Моноблоки": "26.20.15.000",
    "Ноутбуки": "26.20.11.110",
    "Планшеты": "26.20.11.110",
    "МФУ": "26.20.18.000",
    "Принтеры": "26.20.16.120",
    "Клавиатура": "26.20.16.110",
    "Мышь": "26.20.16.170",
    "Маршрутизатор": "26.30.11.120",
    "Коммутатор": "26.30.11.110",
    "ИБП": "26.20.40.110",
    "Прочее": "0.0.0"
}


def get_client():
    return genai.Client(api_key=GEMINI_API_KEY)


async def extract_data_with_schema(content: str, dictionary: List[Dict], model: str = "gemini-2.0-flash") -> Dict[str, Any]:
    categories_list = list(CATEGORIES_CONFIG.keys())
    dict_by_category = {}
    for d in dictionary:
        cat = d.get("category")
        field = d.get("field_name")
        if cat and field:
            if cat not in dict_by_category:
                dict_by_category[cat] = []
            dict_by_category[cat].append(field)
    
    schema_description = "Доступные категории оборудования:\n"
    for cat in categories_list:
        fields = dict_by_category.get(cat, CATEGORIES_CONFIG.get(cat, []))
        schema_description += f"- {cat}: {', '.join(fields)}\n"

    prompt = f"""Проанализируй документ закупки и извлеки данные о товарах.

{schema_description}

    Правила:
    1. Определи категорию каждого товара из списка выше
    2. Используй ТОЛЬКО характеристики из справочника КТРУ для выбранной категории
    3. Если точного соответствия нет — выбери НАИБОЛЕЕ подходящий логически признак из справочника
    4. В ответе указывай только признаки со значениями, которые реально найдены в документе
    5. Если рядом со значением есть единица измерения (Гб, Мб, Кб, Тб, Герц, МГц, MHz, GHz, Вт, Ватт, kW и т.д.) — включай ее в значение
    6. Если значение содержит фразу "не менее" — опусти эту фразу
    7. Разрешение формата 1920x1080 сохраняй в таком же виде
    8. Контрастность указывай в формате [число]:1 (например "1000:1")
    9. Определи данные заказчика: полное название организации (Заказчик/Покупатель) и ИНН (10 или 12 цифр). 
       Ищи ИНН в шапке документа, подписях или реквизитах.

Формат ответа (JSON):
{{
  "items": [
    {{
      "category": "категория из списка",
      "name": "наименование товара",
      "quantity": количество,
      "characteristics": [
        {{"name": "название характеристики", "value": "значение"}}
      ]
    }}
  ],
  "metadata": {{
    "customer_name": "полное название организации",
    "customer_inn": "ИНН (только цифры)",
    "customer_address": "адрес",
    "doc_date": "дата документа"
  }}
}}

Текст документа:
{content}
"""

    client = get_client()
    response = await asyncio.to_thread(
        client.models.generate_content,
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1
        )
    )
    
    token_usage = f"K_{response.usage_metadata.prompt_token_count or 0}+P_{response.usage_metadata.candidates_token_count or 0}=T_{response.usage_metadata.total_token_count or 0}"
    
    def normalize_value(value: Optional[str], field_name: str = "") -> Optional[str]:
        if not value:
            return value
        val_str = str(value).strip()
        normalized = re.sub(r"^\s*не\s+менее\s+", "", val_str, flags=re.IGNORECASE)
        
        # Resolution 1920x1080
        match = re.search(r"(\d{3,5})\s*[xх×]\s*(\d{3,5})", normalized, flags=re.IGNORECASE)
        if match:
            return f"{match.group(1)}x{match.group(2)}"
            
        # Contrast [number]:1
        if "контрастность" in field_name.lower():
            contrast_match = re.search(r"(\d{2,10})\s*(?::\s*1)?$", normalized)
            if contrast_match:
                return f"{contrast_match.group(1)}:1"
                
        return normalized

    def normalize_name(name: str) -> str:
        value = re.sub(r"[^a-zA-Zа-яА-Я0-9]+", " ", (name or "").lower()).strip()
        return re.sub(r"\s+", " ", value)

    def best_match(name: str, candidates: List[str]) -> str:
        if not candidates:
            return name
        target = normalize_name(name)
        best = candidates[0]
        best_score = 0.0
        for candidate in candidates:
            cand_norm = normalize_name(candidate)
            if cand_norm == target:
                return candidate
            if target and (target in cand_norm or cand_norm in target):
                score = 0.9
            else:
                score = SequenceMatcher(a=target, b=cand_norm).ratio()
            if score > best_score:
                best_score = score
                best = candidate
        return best

    def map_characteristics(item: Dict[str, Any]) -> None:
        category = item.get("category")
        candidates = dict_by_category.get(category, [])
        if not candidates:
            return
        mapped: Dict[str, Dict[str, Any]] = {}
        for char in item.get("characteristics") or []:
            if not isinstance(char, dict):
                continue
            raw_name = char.get("name") or ""
            match_name = best_match(raw_name, candidates)
            value = normalize_value(char.get("value"), match_name)
            if match_name not in mapped:
                mapped[match_name] = {"name": match_name, "value": value}
            else:
                current = mapped[match_name].get("value")
                if not current or (value and len(str(value)) > len(str(current))):
                    mapped[match_name]["value"] = value
        item["characteristics"] = list(mapped.values())

    try:
        result = json.loads(response.text)
        items = result.get("items", []) or []
        for item in items:
            chars = item.get("characteristics") or []
            if isinstance(chars, list):
                for char in chars:
                    if isinstance(char, dict):
                        char["value"] = normalize_value(char.get("value"), char.get("name", ""))
        return {"items": items, "metadata": result.get("metadata", {}), "token_usage": token_usage}

    except Exception:
        return {"items": [], "metadata": {}, "token_usage": token_usage}


async def enrich_item_with_ktru(item: Dict, model: str = "gemini-2.0-flash") -> Dict[str, str]:
    prompt = f"""Определи код КТРУ (Каталог товаров, работ, услуг) для товара.

Товар: {item.get('name', '')}
Категория: {item.get('category', '')}
Характеристики: {json.dumps(item.get('characteristics', []), ensure_ascii=False)}

Верни JSON:
{{"ktru_code": "код КТРУ или null"}}

Код должен быть в формате XX.XX.XX.XXX-XXXXXXXXX или XX.XX.XX.XXX
"""

    client = get_client()
    response = await asyncio.to_thread(
        client.models.generate_content,
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1
        )
    )
    
    token_usage = f"K_{response.usage_metadata.prompt_token_count or 0}+P_{response.usage_metadata.candidates_token_count or 0}=T_{response.usage_metadata.total_token_count or 0}"
    
    try:
        result = json.loads(response.text)
        return {"ktru_code": result.get("ktru_code", ""), "token_usage": token_usage}
    except:
        return {"ktru_code": "", "token_usage": token_usage}


async def suggest_dictionary_fields(category: str, model: str = "gemini-2.0-flash") -> Dict[str, Any]:
    ktru_index = CATEGORY_KTRU_INDICES.get(category, "")
    
    prompt = f"""Предложи характеристики для категории оборудования.

Категория: {category}
Базовый индекс КТРУ: {ktru_index}

Верни JSON:
{{"fields": ["характеристика1", "характеристика2", ...]}}

Верни только существенные технические характеристики (не более 15).
"""

    client = get_client()
    response = await asyncio.to_thread(
        client.models.generate_content,
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.2
        )
    )
    
    token_usage = f"K_{response.usage_metadata.prompt_token_count or 0}+P_{response.usage_metadata.candidates_token_count or 0}=T_{response.usage_metadata.total_token_count or 0}"
    
    try:
        result = json.loads(response.text)
        return {"fields": result.get("fields", []), "token_usage": token_usage}
    except:
        return {"fields": [], "token_usage": token_usage}


async def find_duplicate_fields(category: str, fields: List[str], model: str = "gemini-2.0-flash") -> Dict[str, Any]:
    prompt = f"""Найди дублирующиеся характеристики в списке.

Категория: {category}
Список полей: {json.dumps(fields, ensure_ascii=False)}

Верни JSON:
{{
  "groups": [
    {{
      "suggested_name": "рекомендуемое название",
      "duplicates": ["поле1", "поле2", ...]
    }}
  ]
}}

Группируй только очевидные дубликаты (синонимы, разные написания одного понятия).
"""

    client = get_client()
    response = await asyncio.to_thread(
        client.models.generate_content,
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1
        )
    )
    
    token_usage = f"K_{response.usage_metadata.prompt_token_count or 0}+P_{response.usage_metadata.candidates_token_count or 0}=T_{response.usage_metadata.total_token_count or 0}"
    
    try:
        result = json.loads(response.text)
        return {"groups": result.get("groups", []), "token_usage": token_usage}
    except:
        return {"groups": [], "token_usage": token_usage}


async def fetch_raw_ktru_fields(ktru_code: str, model: str = "gemini-2.0-flash") -> Dict[str, Any]:
    prompt = f"""Найди информацию о коде КТРУ: {ktru_code}

Верни JSON:
{{
  "text": "описание структуры характеристик КТРУ",
  "sources": [
    {{"title": "название источника", "uri": "ссылка"}}
  ]
}}

Используй актуальные данные из открытых источников.
"""

    client = get_client()
    response = await asyncio.to_thread(
        client.models.generate_content,
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.2
        )
    )
    
    token_usage = f"K_{response.usage_metadata.prompt_token_count or 0}+P_{response.usage_metadata.candidates_token_count or 0}=T_{response.usage_metadata.total_token_count or 0}"
    
    text = response.text or ""
    sources = []
    
    if hasattr(response, 'candidates') and response.candidates:
        candidate = response.candidates[0]
        if hasattr(candidate, 'grounding_metadata') and candidate.grounding_metadata:
            gm = candidate.grounding_metadata
            if hasattr(gm, 'grounding_chunks') and gm.grounding_chunks:
                for chunk in gm.grounding_chunks:
                    if hasattr(chunk, 'web') and chunk.web:
                        sources.append({
                            "title": getattr(chunk.web, 'title', ''),
                            "uri": getattr(chunk.web, 'uri', '')
                        })
    
    return {"text": text, "token_usage": token_usage, "sources": sources}


async def verify_category_ktru_index(category: str, model: str = "gemini-2.0-flash") -> Dict[str, Any]:
    prompt = f"""Определи актуальный код КТРУ для категории: {category}

Верни JSON:
{{"index": "код КТРУ"}}

Код должен быть в формате XX.XX.XX.XXX
"""

    client = get_client()
    response = await asyncio.to_thread(
        client.models.generate_content,
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1
        )
    )
    
    token_usage = f"K_{response.usage_metadata.prompt_token_count or 0}+P_{response.usage_metadata.candidates_token_count or 0}=T_{response.usage_metadata.total_token_count or 0}"
    
    try:
        result = json.loads(response.text)
        return {"index": result.get("index", CATEGORY_KTRU_INDICES.get(category, "")), "token_usage": token_usage}
    except:
        return {"index": CATEGORY_KTRU_INDICES.get(category, ""), "token_usage": token_usage}
