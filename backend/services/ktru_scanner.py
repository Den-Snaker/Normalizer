import re
import time
import random
import subprocess
import shutil
import os
from typing import Tuple, Optional, List, Callable
from urllib.request import Request, urlopen
from bs4 import BeautifulSoup
import asyncio

KTRU_COMMON_URL = "https://zakupki.gov.ru/epz/ktru/ktruCard/commonInfo.html?itemId={item_id}"


def get_curl_path() -> str:
    curl_path = "C:\\Windows\\System32\\curl.exe" if os.path.exists("C:\\Windows\\System32\\curl.exe") else shutil.which("curl")
    if not curl_path:
        for fallback in ["/usr/bin/curl", "/bin/curl", "curl"]:
            if shutil.which(fallback) or os.path.exists(fallback):
                curl_path = fallback
                break
    if not curl_path:
        raise RuntimeError("curl not found in system PATH")
    return curl_path


def fetch_html_with_curl(url: str, timeout: int = 30) -> str:
    curl_path = get_curl_path()
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    }
    
    result = subprocess.run(
        [
            curl_path,
            "-L",
            "-s",
            "--ssl-no-revoke",
            "--connect-timeout", str(timeout),
            "-H",
            f"User-Agent: {headers['User-Agent']}",
            "-H",
            f"Accept-Language: {headers['Accept-Language']}",
            url,
        ],
        capture_output=True,
        timeout=timeout + 10,
    )
    
    if result.returncode != 0:
        raise RuntimeError(f"curl failed: {result.stderr.decode('utf-8', errors='replace')[:200]}")
    
    raw = result.stdout or b""
    html = raw.decode("utf-8", errors="replace")
    if "�" in html:
        html = raw.decode("cp1251", errors="ignore")
    
    if not html or not html.strip():
        raise RuntimeError("Empty response")
    
    if "404 Not Found" in html or ("nginx" in html and "404" in html):
        raise RuntimeError("Not found")
    
    return html


def extract_ktru_item_info(html: str) -> Tuple[Optional[str], Optional[dict], Optional[str]]:
    """
    Извлекает наименование, характеристики и статус позиции КТРУ из HTML.
    Возвращает (name, characteristics_dict, ktru_status) или (None, None, None) если не найдено.
    
    ktru_status: "included" | "excluded" | None
    """
    soup = BeautifulSoup(html, "html.parser")
    
    # Ищем статус КТРУ (Включено/Исключено)
    ktru_status = None
    page_text = soup.get_text("\n", strip=True).lower()
    
    # Статус обычно указан как "Статус: Включено в КТРУ" или "Статус: Исключено из КТРУ"
    if "включено в ктру" in page_text or "включено в реестр" in page_text:
        ktru_status = "included"
    elif "исключено из ктру" in page_text or "исключено из реестр" in page_text:
        ktru_status = "excluded"
    
    # Более точный поиск статуса по элементам
    if not ktru_status:
        for elem in soup.find_all(["span", "div", "p", "td"]):
            text = elem.get_text(" ", strip=True).lower()
            if "статус" in text:
                # Проверяем родительский элемент или следующий соседний
                parent_text = elem.parent.get_text(" ", strip=True).lower() if elem.parent else ""
                sibling_text = ""
                if elem.next_sibling:
                    sibling_text = elem.next_sibling.get_text(" ", strip=True).lower() if hasattr(elem.next_sibling, 'get_text') else str(elem.next_sibling).lower()
                
                combined = text + " " + parent_text + " " + sibling_text
                if "включено" in combined:
                    ktru_status = "included"
                    break
                elif "исключено" in combined:
                    ktru_status = "excluded"
                    break
    
    # Поиск по классам статуса
    if not ktru_status:
        status_div = soup.find(["div", "span"], class_=re.compile(r"status|state", re.IGNORECASE))
        if status_div:
            status_text = status_div.get_text(" ", strip=True).lower()
            if "включено" in status_text:
                ktru_status = "included"
            elif "исключено" in status_text:
                ktru_status = "excluded"
    
    # Ищем наименование позиции
    name = None
    
    # Вариант 1: поиск в заголовке страницы
    h1 = soup.find("h1")
    if h1:
        h1_text = h1.get_text(" ", strip=True)
        if h1_text and len(h1_text) < 500:
            name = h1_text
    
    # Вариант 2: поиск по классу
    if not name:
        title_div = soup.find("div", class_=re.compile(r"card.*title|title.*card", re.IGNORECASE))
        if title_div:
            name = title_div.get_text(" ", strip=True)
    
    # Вариант 3: поиск в блоке с id="card
    if not name:
        card = soup.find("div", id=re.compile(r"card", re.IGNORECASE))
        if card:
            first_p = card.find("p")
            if first_p:
                name = first_p.get_text(" ", strip=True)
    
    # Вариант 4: по полю "Наименование" в таблице
    if not name:
        for table in soup.find_all("table"):
            for row in table.find_all("tr"):
                cells = row.find_all(["td", "th"])
                if len(cells) >= 2:
                    label = cells[0].get_text(" ", strip=True).lower()
                    if "наименование" in label and "позиции" in label:
                        name = cells[1].get_text(" ", strip=True)
                        break
            if name:
                break
    
    # Вариант 5: берем первый заметный текстовый блок
    if not name:
        # Ищем текст рядом с "Наименование позиции"
        text = soup.get_text("\n", strip=True)
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        for i, line in enumerate(lines):
            if "наименование" in line.lower() and i + 1 < len(lines):
                # Следующая строка может быть названием
                candidate = lines[i + 1]
                if len(candidate) < 500 and len(candidate) > 3:
                    name = candidate
                    break
    
    # Вариант 6: парсинг commonInfo страницы - ищем текст после itemId
    if not name:
        # Проверяем наличие itemId в URL и извлекаем название из контента
        content_div = soup.find("div", class_=re.compile(r"content|main|card", re.IGNORECASE))
        if content_div:
            paragraphs = content_div.find_all(["p", "div", "span"], recursive=True)
            for p in paragraphs:
                text = p.get_text(" ", strip=True)
                # Ищем строки типа "Системный блок" или "Персональный компьютер"
                if text and len(text) < 200 and len(text) > 3:
                    # Пропускаем технические строки
                    if not any(skip in text.lower() for skip in ["код ктру", "окпд", "дата", "версия", "статус"]):
                        name = text
                        break
    
    # Извлекаем характеристики
    characteristics = {}
    
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        for row in rows:
            cells = row.find_all(["td", "th"])
            if len(cells) >= 2:
                char_name = cells[0].get_text(" ", strip=True)
                char_value = cells[1].get_text(" ", strip=True)
                char_unit = cells[2].get_text(" ", strip=True) if len(cells) > 2 else ""
                
                # Фильтруем технические заголовки
                lower_name = char_name.lower()
                if any(skip in lower_name for skip in ["наименование характеристики", "значение", "единица измерения"]):
                    continue
                
                if char_name and char_value and len(char_name) > 2:
                    key = char_name.lower().strip()
                    characteristics[key] = {
                        "name": char_name,
                        "value": char_value,
                        "unit": char_unit
                    }
    
    return name, characteristics if characteristics else None, ktru_status


def check_ktru_item(item_id: str) -> Tuple[str, str, Optional[dict], Optional[str]]:
    """
    Проверяет существование позиции КТРУ и извлекает информацию.
    Возвращает (status, name, characteristics, ktru_status):
    - status: 'found' | 'not_found' | 'error'
    - name: наименование позиции или ''
    - characteristics: словарь характеристик или None
    - ktru_status: 'included' | 'excluded' | None
    """
    url = KTRU_COMMON_URL.format(item_id=item_id)
    
    try:
        html = fetch_html_with_curl(url)
        name, characteristics, ktru_status = extract_ktru_item_info(html)
        
        if name:
            return "found", name, characteristics, ktru_status
        else:
            # Если HTML получен, но название не извлечено - всё равно считаем найденным
            # (позиция существует, просто не смогли распарсить название)
            return "found", f"Позиция {item_id}", characteristics, ktru_status
    
    except RuntimeError as e:
        error_msg = str(e).lower()
        if "not found" in error_msg or "404" in error_msg:
            return "not_found", "", None, None
        return "error", str(e)[:100], None, None
    
    except Exception as e:
        return "error", str(e)[:100], None, None


def scan_ktru_range(
    group_code: str,
    start: int,
    end: int,
    requests_per_second: float = 0.5,
    pause_seconds: float = 2.0,
    on_progress: Optional[Callable[[int, int, str], None]] = None,
    on_found: Optional[Callable[[str, str, dict], None]] = None
) -> List[dict]:
    """
    Сканирует диапазон кодов КТРУ.
    
    Args:
        group_code: Код группы, например "26.20.15.000"
        start: Начальный номер (например, 1)
        end: Конечный номер (например, 99)
        requests_per_second: Макс. запросов в секунду (0.1 - 10)
        pause_seconds: Пауза между запросами в секундах
        on_progress: Callback прогресса (current, total, status)
        on_found: Callback для найденных позиций (item_id, name, characteristics)
    
    Returns:
        Список найденных позиций [{'item_id': ..., 'name': ..., 'characteristics': ..., 'ktru_status': ...}]
    """
    results = []
    total = end - start + 1
    
    for i, num in enumerate(range(start, end + 1)):
        # Формируем код: 26.20.15.000-00000024
        item_id = f"{group_code}-{num:08d}"
        
        # Проверяем существование
        status, name, characteristics, ktru_status = check_ktru_item(item_id)
        
        # Callback прогресса
        if on_progress:
            status_text = f"{status}" + (f" ({ktru_status})" if ktru_status else "")
            on_progress(i + 1, total, f"Проверка {item_id}: {status_text}")
        
        # Если найдено
        if status == "found":
            result = {
                "item_id": item_id,
                "name": name,
                "characteristics": characteristics or {},
                "status": status,
                "ktru_status": ktru_status
            }
            results.append(result)
            result = {
                "item_id": item_id,
                "name": name,
                "characteristics": characteristics or {},
                "status": status
            }
            results.append(result)
            
            # Callback для найденных
            if on_found:
                on_found(item_id, name, characteristics or {})
        
        # Пауза между запросами с рандомизацией
        if i < total - 1:  # Не паузируем после последнего
            random_delay = random.uniform(0.01, 0.99)
            actual_pause = pause_seconds + random_delay
            
            # Ограничиваем по requests_per_second
            min_pause = 1.0 / requests_per_second if requests_per_second > 0 else 1.0
            actual_pause = max(actual_pause, min_pause)
            
            time.sleep(actual_pause)
    
    return results


async def scan_ktru_range_async(
    group_code: str,
    start: int,
    end: int,
    requests_per_second: float = 0.5,
    pause_seconds: float = 2.0,
    on_progress: Optional[Callable] = None,
    on_found: Optional[Callable] = None
) -> List[dict]:
    """
    Асинхронная версия сканирования.
    """
    def run_sync():
        return scan_ktru_range(
            group_code, start, end,
            requests_per_second, pause_seconds,
            on_progress, on_found
        )
    
    return await asyncio.to_thread(run_sync)