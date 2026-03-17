import re
import ssl
import json
import time
import subprocess
import shutil
import os
from typing import List, Tuple

from urllib.request import Request, urlopen
from bs4 import BeautifulSoup


KTRU_URL = "https://zakupki.gov.ru/epz/ktru/ktruCard/ktru-description.html?itemId={item_id}"
KTRU_COMMON_URL = "https://zakupki.gov.ru/epz/ktru/ktruCard/commonInfo.html?itemId={item_id}"
KTRU44_API_URL = "https://zakupki44fz.ru/app/api/okpd2/getKtruItem?code={item_id}&exactCode=true&classifierInfoOnly=false"
KTRU44_LOGIN_URL = "https://zakupki44fz.ru/api/v1/Login/LoginAnonymous"


def fetch_ktru_fields(
    item_id: str,
    source: str = "zakupki.gov.ru",
    token: str | None = None,
    short_token: str | None = None
) -> List[str]:
    if source == "printforms":
        return [name for name, _ in fetch_ktru_fields_with_units_printforms(item_id)]
    if source == "zakupki44fz.ru":
        return fetch_ktru_fields_44fz(item_id, token, short_token)

    url = KTRU_URL.format(item_id=item_id)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    }
    req = Request(url, headers=headers)
    context = ssl.SSLContext(ssl.PROTOCOL_TLSv1_2)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    try:
        context.set_ciphers("DEFAULT:@SECLEVEL=1")
    except Exception:
        pass

    # Prefer curl (more reliable on Windows)
    curl_path = "C:\\Windows\\System32\\curl.exe" if os.path.exists("C:\\Windows\\System32\\curl.exe") else shutil.which("curl")
    if not curl_path:
        for fallback in ["/usr/bin/curl", "/bin/curl", "curl"]:
            if shutil.which(fallback) or os.path.exists(fallback):
                curl_path = fallback
                break
    if not curl_path:
        raise RuntimeError("curl not found in system PATH")

    def fetch_html(target_url: str) -> str:
        last_error: Exception | None = None
        html = ""
        for _ in range(3):
            try:
                result = subprocess.run(
                    [
                        curl_path,
                        "-L",
                        "-s",
                        "--ssl-no-revoke",
                        "--retry",
                        "2",
                        "--retry-delay",
                        "1",
                        "--retry-connrefused",
                        "-H",
                        f"User-Agent: {headers['User-Agent']}",
                        "-H",
                        f"Accept-Language: {headers['Accept-Language']}",
                        target_url,
                    ],
                    capture_output=True,
                    timeout=30,
                )
                if result.returncode != 0:
                    raise RuntimeError(result.stderr.strip() or "curl failed")
                raw = result.stdout or b""
                html = raw.decode("utf-8", errors="replace")
                # Fallback to cp1251 if utf-8 produces replacement chars
                if "�" in html:
                    html = raw.decode("cp1251", errors="ignore")
                if not html or not html.strip():
                    raise RuntimeError("Empty response from curl")
                break
            except Exception as e:
                last_error = e
                html = ""
                time.sleep(1)

        if not html:
            raise last_error or RuntimeError("Unknown fetch error")

        if "404 Not Found" in html or ("nginx" in html and "404" in html):
            raise RuntimeError("KTRU page not found (404)")

        return html

    exclude_phrases = [
        "наименование характеристики",
        "значение характеристики",
        "единица измерения",
        "тип значения",
        "тип характеристики",
        "код ктру",
        "*варианты",
    ]

    def expand_cells(cells):
        expanded = []
        for cell in cells:
            colspan = int(cell.get("colspan", 1) or 1)
            text = cell.get_text(" ", strip=True)
            for _ in range(colspan):
                expanded.append(text)
        return expanded

    def extract_fields_from_html(page_html: str, fields: List[str], seen: set) -> None:
        soup = BeautifulSoup(page_html, "html.parser")

        container = soup.find(id="ktruCharacteristicContent")
        if container:
            table = container.find("table")
            if table:
                name_cells = table.select("td.tableBlock__col_first, td.characteristicName")
                for cell in name_cells:
                    for tag in cell.select(".revert, .help-icon"):
                        tag.decompose()

                    value = cell.get_text(" ", strip=True)
                    if not value:
                        continue

                    lower_value = value.lower()
                    if any(p in lower_value for p in exclude_phrases):
                        continue
                    if re.search(r"^\d+$", value):
                        continue

                    if value not in seen:
                        seen.add(value)
                        fields.append(value)
                return

        tables = soup.find_all("table")
        for table in tables:
            header_rows = table.find_all("tr")
            target_index = None

            for row in header_rows:
                th_cells = row.find_all("th")
                if not th_cells:
                    continue

                headers = expand_cells(th_cells)
                lower_headers = [h.lower() for h in headers]

                if "наименование характеристики" not in " ".join(lower_headers):
                    continue
                if "значение характеристики" not in " ".join(lower_headers):
                    continue

                for idx, head in enumerate(lower_headers):
                    if "наименование характеристики" in head:
                        target_index = idx
                        break

                if target_index is not None:
                    break

            if target_index is None:
                continue

            rows = table.find_all("tr")
            for row in rows:
                td_cells = row.find_all("td")
                if not td_cells:
                    continue

                expanded = expand_cells(td_cells)
                if len(expanded) <= target_index:
                    continue

                value = expanded[target_index]
                if not value:
                    continue

                lower_value = value.lower()
                if any(p in lower_value for p in exclude_phrases):
                    continue
                if re.search(r"^\d+$", value):
                    continue

                if value not in seen:
                    seen.add(value)
                    fields.append(value)

    html = fetch_html(url)

    fields: List[str] = []
    seen = set()
    extract_fields_from_html(html, fields, seen)

    item_version_match = re.search(r'id="ktruItemVersionId"\s+value="([^"]+)"', html)
    item_version_id = item_version_match.group(1) if item_version_match else ""

    def extract_page_numbers(page_html: str) -> List[int]:
        patterns = [
            r"goToCharacteristicPage\((\d+)\)",
            r"gotoCharacteristicPage\((\d+)\)",
            r"gotocharacteristicpage\((\d+)\)",
            r"data-page=\"(\d+)\"",
            r"pageNumber=(\d+)"
        ]
        nums = set()
        for pattern in patterns:
            for value in re.findall(pattern, page_html, flags=re.IGNORECASE):
                try:
                    num = int(value)
                    if num > 1:
                        nums.add(num)
                except Exception:
                    continue
        return sorted(nums)

    def fetch_part_page(page_num: int, per_page: int) -> str:
        part_url = (
            "https://zakupki.gov.ru/epz/ktru/ktruCard/ktru-part-description.html"
            f"?itemVersionId={item_version_id}&page={page_num}&recordsPerPage={per_page}&isTemplate="
        )
        return fetch_html(part_url)

    if item_version_id:
        per_page = 1000
        part_html = fetch_part_page(1, per_page)
        if part_html:
            extract_fields_from_html(part_html, fields, seen)
            page_numbers = extract_page_numbers(part_html)
            for page_num in page_numbers:
                page_html = fetch_part_page(page_num, per_page)
                if page_html:
                    extract_fields_from_html(page_html, fields, seen)
            return fields

    page_numbers = extract_page_numbers(html)

    def fetch_page_with_params(page_num: int) -> str:
        for param in ["characteristicPage", "pageNumber", "page"]:
            try:
                page_html = fetch_html(f"{url}&{param}={page_num}")
                if page_html:
                    return page_html
            except Exception:
                continue
        return ""

    if page_numbers:
        for page_num in page_numbers:
            page_html = fetch_page_with_params(page_num)
            if not page_html:
                continue
            extract_fields_from_html(page_html, fields, seen)
    else:
        max_pages = 30
        unchanged_rounds = 0
        last_count = len(fields)
        for page_num in range(2, max_pages + 1):
            page_html = fetch_page_with_params(page_num)
            if not page_html:
                unchanged_rounds += 1
                if unchanged_rounds >= 2:
                    break
                continue
            extract_fields_from_html(page_html, fields, seen)
            if len(fields) == last_count:
                unchanged_rounds += 1
                if unchanged_rounds >= 2:
                    break
            else:
                unchanged_rounds = 0
                last_count = len(fields)

    return fields


def fetch_ktru_fields_with_units(
    item_id: str,
    source: str = "zakupki.gov.ru",
    token: str | None = None,
    short_token: str | None = None
) -> List[Tuple[str, str]]:
    if source == "printforms":
        return fetch_ktru_fields_with_units_printforms(item_id)
    if source == "zakupki44fz.ru":
        fields = fetch_ktru_fields_44fz(item_id, token, short_token)
        return [(name, "") for name in fields]

    url = KTRU_URL.format(item_id=item_id)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    }

    curl_path = "C:\\Windows\\System32\\curl.exe" if os.path.exists("C:\\Windows\\System32\\curl.exe") else shutil.which("curl")
    if not curl_path:
        for fallback in ["/usr/bin/curl", "/bin/curl", "curl"]:
            if shutil.which(fallback) or os.path.exists(fallback):
                curl_path = fallback
                break
    if not curl_path:
        raise RuntimeError("curl not found in system PATH")

    def fetch_html(target_url: str) -> str:
        result = subprocess.run(
            [
                curl_path,
                "-L",
                "-s",
                "--ssl-no-revoke",
                "-H",
                f"User-Agent: {headers['User-Agent']}",
                "-H",
                f"Accept-Language: {headers['Accept-Language']}",
                target_url,
            ],
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "curl failed")
        raw = result.stdout or b""
        html = raw.decode("utf-8", errors="replace")
        if "�" in html:
            html = raw.decode("cp1251", errors="ignore")
        if not html or not html.strip():
            raise RuntimeError("Empty response from curl")
        if "404 Not Found" in html or ("nginx" in html and "404" in html):
            raise RuntimeError("KTRU page not found (404)")
        return html

    html = fetch_html(url)
    item_version_match = re.search(r'id="ktruItemVersionId"\s+value="([^"]+)"', html)
    item_version_id = item_version_match.group(1) if item_version_match else ""

    pairs: List[Tuple[str, str]] = []
    seen = set()

    def add_pair(name: str, unit: str):
        key = name.lower()
        if key in seen:
            return
        seen.add(key)
        pairs.append((name, unit))

    def extract_from_html(page_html: str):
        for name, unit in extract_fields_with_units_from_html(page_html):
            add_pair(name, unit)

    if item_version_id:
        per_page = 1000
        part_url = (
            "https://zakupki.gov.ru/epz/ktru/ktruCard/ktru-part-description.html"
            f"?itemVersionId={item_version_id}&page=1&recordsPerPage={per_page}&isTemplate="
        )
        part_html = fetch_html(part_url)
        extract_from_html(part_html)
        page_numbers = set(int(x) for x in re.findall(r"goToCharacteristicPage\((\d+)\)", part_html))
        for page in sorted(n for n in page_numbers if n > 1):
            page_html = fetch_html(
                "https://zakupki.gov.ru/epz/ktru/ktruCard/ktru-part-description.html"
                f"?itemVersionId={item_version_id}&page={page}&recordsPerPage={per_page}&isTemplate="
            )
            extract_from_html(page_html)
        return pairs

    extract_from_html(html)
    return pairs


def fetch_ktru_fields_printforms(item_id: str) -> List[str]:
    return [name for name, _ in fetch_ktru_fields_with_units_printforms(item_id)]


def fetch_ktru_fields_with_units_printforms(item_id: str) -> List[Tuple[str, str]]:
    url = KTRU_COMMON_URL.format(item_id=item_id)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    }

    curl_path = "C:\\Windows\\System32\\curl.exe" if os.path.exists("C:\\Windows\\System32\\curl.exe") else shutil.which("curl")
    if not curl_path:
        raise RuntimeError("curl not found in system PATH")

    def fetch_html(target_url: str) -> str:
        result = subprocess.run(
            [
                curl_path,
                "-L",
                "-s",
                "--ssl-no-revoke",
                "-H",
                f"User-Agent: {headers['User-Agent']}",
                "-H",
                f"Accept-Language: {headers['Accept-Language']}",
                target_url,
            ],
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "curl failed")
        raw = result.stdout or b""
        html = raw.decode("utf-8", errors="replace")
        if "�" in html:
            html = raw.decode("cp1251", errors="ignore")
        if not html or not html.strip():
            raise RuntimeError("Empty response from curl")
        if "404 Not Found" in html or ("nginx" in html and "404" in html):
            raise RuntimeError("KTRU page not found (404)")
        return html

    common_html = fetch_html(url)
    match = re.search(r"/epz/ktru/position/printForm\.html\?dsUid=([A-Za-z0-9]+)", common_html)
    if not match:
        raise RuntimeError("Print form link not found")

    ds_uid = match.group(1)
    print_url = f"https://zakupki.gov.ru/epz/ktru/position/printForm.html?dsUid={ds_uid}&source=defaultKtruPF"
    html = fetch_html(print_url)

    exclude_phrases = [
        "наименование характеристики",
        "значение характеристики",
        "единица измерения",
        "тип значения",
        "тип характеристики",
        "код ктру",
        "*варианты",
    ]

    pairs = extract_fields_with_units_from_html(html)
    if pairs:
        return pairs

    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text("\n", strip=True)
    fields = extract_fields_from_print_text(text, exclude_phrases)
    return [(name, "") for name in fields]


def extract_fields_from_print_text(text: str, exclude_phrases: List[str]) -> List[str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return []

    try:
        start_idx = lines.index("Характеристики товара, работы, услуги")
    except ValueError:
        return []

    def is_valid_name_local(value: str) -> bool:
        if not value:
            return False
        lower_value = value.lower().strip()
        if any(p == lower_value for p in exclude_phrases):
            return False
        if re.search(r"^[\d\s.,]+$", value):
            return False
        if re.search(r"^[<>≤≥=\s\d.,]+$", value):
            return False
        if lower_value in {"да", "нет", "опционально", "не требуется", "отсутствует", "требуется"}:
            return False
        if not re.search(r"[а-яА-Я]", value):
            return False
        if len(value) < 5:
            return False
        # Исключаем технические значения
        if re.search(r"GDDR\d|DDR\d|PCIe|SATA|SAS|USB|VGA|HDMI|DisplayPort|AES|ADAT|BD-RW", value, re.IGNORECASE) and len(value) < 20:
            return False
        return True

    type_markers = [
        "изменяемая заказчиком",
        "неизменяемая заказчиком"
    ]

    fields: List[str] = []
    seen = set()
    buffer: List[str] = []

    for line in lines[start_idx + 1:]:
        lower = line.lower()
        
        if any(marker in lower for marker in type_markers):
            name = " ".join(buffer).strip()
            buffer = []
            if is_valid_name_local(name):
                key = name.lower()
                if key not in seen:
                    seen.add(key)
                    fields.append(name)
            continue

        # Если строка похожа на значение или единицу, сбрасываем буфер
        if re.search(r"^[<>≥≤=]?\s*\d", line) or (len(line) < 5 and not re.search(r"[а-яА-Я]", line)):
            buffer = []
            continue
            
        if re.search(r"GDDR\d|DDR\d|PCIe|SATA|SAS|USB|VGA|HDMI|DisplayPort|AES|ADAT|BD-RW", line, re.IGNORECASE) and len(line) < 20:
            buffer = []
            continue

        buffer.append(line)

    return fields


def fetch_ktru_fields_44fz(
    item_id: str,
    token: str | None = None,
    short_token: str | None = None
) -> List[str]:
    if not token and not short_token:
        raise RuntimeError("KTRU44 requires Bearer token or shortAuthToken")

    if not token and short_token:
        token = login_ktru44_with_short_token(short_token)

    url = KTRU44_API_URL.format(item_id=item_id)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        "Authorization": f"Bearer {token}",
    }

    curl_path = "C:\\Windows\\System32\\curl.exe" if os.path.exists("C:\\Windows\\System32\\curl.exe") else shutil.which("curl")
    if not curl_path:
        raise RuntimeError("curl not found in system PATH")

    result = subprocess.run(
        [
            curl_path,
            "-L",
            "-s",
            "--ssl-no-revoke",
            "-H",
            f"User-Agent: {headers['User-Agent']}",
            "-H",
            f"Accept-Language: {headers['Accept-Language']}",
            "-H",
            f"Authorization: {headers['Authorization']}",
            url,
        ],
        capture_output=True,
        timeout=30,
    )

    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "curl failed")

    raw = result.stdout or b""
    body = raw.decode("utf-8", errors="replace")
    if not body or not body.strip():
        raise RuntimeError("Empty response from zakupki44fz")

    if "Unauthorized" in body or "401" in body:
        raise RuntimeError("KTRU44 unauthorized")

    try:
        payload = json.loads(body)
    except Exception:
        raise RuntimeError("KTRU44 response is not valid JSON")

    fields: List[str] = []
    seen = set()

    def add_field(name: str | None):
        if not name:
            return
        value = str(name).strip()
        if not value:
            return
        if value not in seen:
            seen.add(value)
            fields.append(value)

    def walk(node, parent_key: str = ""):
        if isinstance(node, dict):
            for key, value in node.items():
                if isinstance(value, list) and re.search(r"character", key, re.IGNORECASE):
                    for item in value:
                        if isinstance(item, dict):
                            add_field(item.get("name") or item.get("characteristicName") or item.get("title"))
                            walk(item, key)
                        elif isinstance(item, str):
                            add_field(item)
                else:
                    walk(value, key)
        elif isinstance(node, list):
            for item in node:
                walk(item, parent_key)

    walk(payload)
    return fields


def login_ktru44_with_short_token(short_token: str) -> str:
    curl_path = "C:\\Windows\\System32\\curl.exe" if os.path.exists("C:\\Windows\\System32\\curl.exe") else shutil.which("curl")
    if not curl_path:
        raise RuntimeError("curl not found in system PATH")

    payload = {
        "email": None,
        "inn": None,
        "kpp": None,
        "spz": None,
        "firstName": None,
        "lastName": None,
        "eeoData": {
            "zakupkiFzGuid": short_token
        }
    }

    result = subprocess.run(
        [
            curl_path,
            "-L",
            "-s",
            "--ssl-no-revoke",
            "-H",
            "Content-Type: application/json",
            "-H",
            "Accept: application/json",
            "-H",
            f"Cookie: zakupki44fz_userId={short_token}",
            "-X",
            "POST",
            "--data",
            json.dumps(payload),
            KTRU44_LOGIN_URL,
        ],
        capture_output=True,
        timeout=30,
    )

    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "KTRU44 login failed")

    raw = result.stdout or b""
    body = raw.decode("utf-8", errors="replace")
    if not body or not body.strip():
        raise RuntimeError("Empty response from KTRU44 login")

    try:
        payload = json.loads(body)
    except Exception:
        raise RuntimeError("KTRU44 login response is not valid JSON")

    jwt_token = payload.get("jwtToken") or payload.get("jwt") or payload.get("token")
    if not jwt_token:
        raise RuntimeError("KTRU44 login did not return jwtToken")

    return jwt_token
def extract_fields_with_units_from_html(page_html: str) -> List[Tuple[str, str]]:
    exclude_phrases = [
        "наименование характеристики",
        "значение характеристики",
        "единица измерения",
        "тип значения",
        "тип характеристики",
        "код ктру",
        "*варианты",
    ]

    def is_valid_name(value: str) -> bool:
        if not value:
            return False
        lower_value = value.lower().strip()
        # Full match with headers
        if any(p == lower_value for p in exclude_phrases):
            return False
        # Noise filtering
        if re.search(r"^[\d\s.,]+$", value):
            return False
        if re.search(r"^[<>≤≥=\s\d.,]+$", value):
            return False
        if lower_value in {"да", "нет", "опционально", "не требуется", "отсутствует", "требуется"}:
            return False
        # Must contain Cyrillic
        if not re.search(r"[а-яА-Я]", value):
            return False
        if len(value) < 5:
            return False
        # Technical values and memory types
        if re.search(r"GDDR\d|DDR\d|PCIe|SATA|SAS|USB|VGA|HDMI|DisplayPort|AES|ADAT|BD-RW|RS-232|RS-485", value, re.IGNORECASE) and len(value) < 25:
            return False
        # Values often starting with prepositions
        if lower_value.startswith(("на ", "в ", "от ", "до ", "для ")) and len(value) < 30:
            return False
        # Typical transmission media values
        if ("витая пара" in lower_value or "оптическ" in lower_value) and len(value) < 25:
            return False
        # Known server types / values
        if lower_value in {"лезвие", "отдельностоящий", "стоечный", "напольный", "внутренний", "твинаксиал", "композитный"}:
            return False
        return True

    soup = BeautifulSoup(page_html, "html.parser")
    pairs: List[Tuple[str, str]] = []
    seen = set()

    tables = soup.find_all("table")
    for table in tables:
        rows = table.find_all("tr")
        if not rows:
            continue

        name_index = -1
        unit_index = -1
        header_row_index = -1

        # 1. Find Header
        for i, row in enumerate(rows):
            th_cells = row.find_all(["th", "td"])
            header_texts = [c.get_text(" ", strip=True).lower() for c in th_cells]
            
            f_name = -1
            f_unit = -1
            for idx, text in enumerate(header_texts):
                if "наименование характеристики" in text and "значение" not in text:
                    f_name = idx
                if "единица измерения" in text:
                    f_unit = idx
            
            if f_name != -1:
                name_index = f_name
                unit_index = f_unit
                header_row_index = i
                break
        
        if name_index == -1:
            continue

        # 2. Parse with rowspan/colspan tracking
        active_rowspans = {} # col_idx -> (remaining_rows, value)

        for i in range(header_row_index + 1, len(rows)):
            tr = rows[i]
            cells = tr.find_all(["td", "th"])
            
            current_row_data = {} # col_idx -> (text, is_from_rowspan)
            
            # Fill from active rowspans
            for col_idx in list(active_rowspans.keys()):
                rem, val = active_rowspans[col_idx]
                current_row_data[col_idx] = (val, True)
                if rem <= 1:
                    del active_rowspans[col_idx]
                else:
                    active_rowspans[col_idx] = (rem - 1, val)
            
            # Fill from current tr cells
            cell_cursor = 0
            for cell in cells:
                while cell_cursor in current_row_data:
                    cell_cursor += 1
                
                text = cell.get_text(" ", strip=True)
                rs = int(cell.get("rowspan", 1))
                cs = int(cell.get("colspan", 1))
                
                for c_off in range(cs):
                    col_idx = cell_cursor + c_off
                    current_row_data[col_idx] = (text, False)
                    if rs > 1:
                        active_rowspans[col_idx] = (rs - 1, text)
                
                cell_cursor += cs

            # 3. Extract Name/Unit
            name_info = current_row_data.get(name_index)
            if name_info:
                name_text, is_rowspan = name_info
                # TAKE ONLY IF IT'S A NEW CELL (not a continuation of a rowspan)
                if not is_rowspan and is_valid_name(name_text):
                    unit_text = ""
                    if unit_index != -1:
                        u_info = current_row_data.get(unit_index)
                        if u_info:
                            unit_text = u_info[0]
                    
                    key = name_text.lower()
                    if key not in seen:
                        seen.add(key)
                        pairs.append((name_text, unit_text))

    return pairs


def extract_possible_values_from_html(page_html: str) -> List[Tuple[str, str, str]]:
    """
    Extract characteristic names, units, and possible values from KTRU HTML.
    Returns: List of (name, unit, possible_values_str) where possible_values_str is comma-separated.
    """
    exclude_phrases = [
        "наименование характеристики",
        "значение характеристики",
        "единица измерения",
        "тип значения",
        "тип характеристики",
        "код ктру",
        "*варианты",
    ]

    def clean_text(text: str) -> str:
        """Remove extra whitespace, newlines, and normalize text."""
        if not text:
            return ""
        # Replace newlines and multiple spaces with single space
        text = re.sub(r'[\r\n\t]+', ' ', text)
        text = re.sub(r'\s+', ' ', text)
        return text.strip()

    def clean_value(text: str) -> str:
        """Clean value specifically - remove extra whitespace between operator and number."""
        if not text:
            return ""
        # First apply standard cleaning
        text = clean_text(text)
        # Remove spaces between operators and numbers: "≥ 1" -> "≥1", "≥     1" -> "≥1"
        text = re.sub(r'([≥≤<>])\s+', r'\1', text)
        text = re.sub(r'\s+([≥≤<>])', r'\1', text)
        return text.strip()

    def is_valid_name(value: str) -> bool:
        if not value:
            return False
        lower_value = value.lower().strip()
        if any(p == lower_value for p in exclude_phrases):
            return False
        if re.search(r"^[\d\s.,]+$", value):
            return False
        if re.search(r"^[<>≤≥=\s\d.,]+$", value):
            return False
        if lower_value in {"да", "нет", "опционально", "не требуется", "отсутствует", "требуется"}:
            return False
        if not re.search(r"[а-яА-Я]", value):
            return False
        if len(value) < 5:
            return False
        return True

    soup = BeautifulSoup(page_html, "html.parser")
    result: List[Tuple[str, str, str]] = []
    seen = set()

    tables = soup.find_all("table")
    for table in tables:
        rows = table.find_all("tr")
        if not rows:
            continue

        name_index = -1
        unit_index = -1
        value_index = -1
        header_row_index = -1

        for i, row in enumerate(rows):
            th_cells = row.find_all(["th", "td"])
            header_texts = [c.get_text(" ", strip=True).lower() for c in th_cells]
            
            f_name = -1
            f_unit = -1
            f_value = -1
            for idx, text in enumerate(header_texts):
                if "наименование характеристики" in text and "значение" not in text:
                    f_name = idx
                if "единица измерения" in text:
                    f_unit = idx
                if "значение характеристики" in text or "значение" in text:
                    f_value = idx
            
            if f_name != -1:
                name_index = f_name
                unit_index = f_unit
                value_index = f_value if f_value != -1 else f_name + 1
                header_row_index = i
                break
        
        if name_index == -1:
            continue

        active_rowspans = {}
        current_name = None
        current_values = []

        for i in range(header_row_index + 1, len(rows)):
            tr = rows[i]
            cells = tr.find_all(["td", "th"])
            
            current_row_data = {}
            
            for col_idx in list(active_rowspans.keys()):
                rem, val = active_rowspans[col_idx]
                current_row_data[col_idx] = (clean_text(val), True)
                if rem <= 1:
                    del active_rowspans[col_idx]
                else:
                    active_rowspans[col_idx] = (rem - 1, val)
            
            cell_cursor = 0
            for cell in cells:
                while cell_cursor in current_row_data:
                    cell_cursor += 1
                
                text = clean_text(cell.get_text(" ", strip=True))
                rs = int(cell.get("rowspan", 1))
                cs = int(cell.get("colspan", 1))
                
                for c_off in range(cs):
                    col_idx = cell_cursor + c_off
                    current_row_data[col_idx] = (text, False)
                    if rs > 1:
                        active_rowspans[col_idx] = (rs - 1, text)
                
                cell_cursor += cs

            name_info = current_row_data.get(name_index)
            if name_info:
                name_text, is_rowspan = name_info
                name_text = clean_text(name_text)
                
                if not is_rowspan and is_valid_name(name_text):
                    if current_name and current_values:
                        key = current_name.lower()
                        if key not in seen:
                            seen.add(key)
                            unit_text = ""
                            if unit_index != -1:
                                u_info = current_row_data.get(unit_index)
                                if u_info:
                                    unit_text = clean_text(u_info[0])
                            # Clean each value and join with comma
                            cleaned_values = [clean_value(v) for v in current_values if clean_value(v)]
                            result.append((current_name, unit_text, ", ".join(cleaned_values)))
                    
                    current_name = name_text
                    current_values = []
                    if unit_index != -1:
                        u_info = current_row_data.get(unit_index)
                        if u_info:
                            pass
                
                value_info = current_row_data.get(value_index)
                if value_info and current_name:
                    value_text = clean_text(value_info[0])
                    if value_text and value_text not in exclude_phrases:
                        current_values.append(value_text)

        if current_name and current_values:
            key = current_name.lower()
            if key not in seen:
                seen.add(key)
                unit_text = ""
                if unit_index != -1:
                    u_info = current_row_data.get(unit_index)
                    if u_info:
                        unit_text = clean_text(u_info[0])
                cleaned_values = [clean_value(v) for v in current_values if clean_value(v)]
                result.append((current_name, unit_text, ", ".join(cleaned_values)))

    return result


def fetch_ktru_characteristic_values(
    item_id: str,
    source: str = "zakupki.gov.ru"
) -> List[Tuple[str, str, str]]:
    """
    Fetch characteristic names, units, and possible values for a KTRU item.
    Returns: List of (name, unit, possible_values_str)
    """
    if source == "printforms":
        url = f"https://zakupki.gov.ru/epz/ktru/position/printForm.html?dsUid={item_id}&source=defaultKtruPF"
    else:
        url = KTRU_URL.format(item_id=item_id)
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    }

    curl_path = "C:\\Windows\\System32\\curl.exe" if os.path.exists("C:\\Windows\\System32\\curl.exe") else shutil.which("curl")
    if not curl_path:
        for fallback in ["/usr/bin/curl", "/bin/curl", "curl"]:
            if shutil.which(fallback) or os.path.exists(fallback):
                curl_path = fallback
                break
    if not curl_path:
        raise RuntimeError("curl not found in system PATH")

    def fetch_html(target_url: str) -> str:
        result = subprocess.run(
            [
                curl_path,
                "-L",
                "-s",
                "--ssl-no-revoke",
                "-H",
                f"User-Agent: {headers['User-Agent']}",
                "-H",
                f"Accept-Language: {headers['Accept-Language']}",
                target_url,
            ],
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "curl failed")
        raw = result.stdout or b""
        html = raw.decode("utf-8", errors="replace")
        if "�" in html:
            html = raw.decode("cp1251", errors="ignore")
        if not html or not html.strip():
            raise RuntimeError("Empty response from curl")
        return html

    html = fetch_html(url)
    
    item_version_match = re.search(r'id="ktruItemVersionId"\s+value="([^"]+)"', html)
    item_version_id = item_version_match.group(1) if item_version_match else ""

    result: List[Tuple[str, str, str]] = []
    seen = set()

    def extract_from_html(page_html: str):
        for name, unit, values in extract_possible_values_from_html(page_html):
            key = name.lower()
            if key not in seen:
                seen.add(key)
                # Clean values: remove newlines and extra spaces
                clean_vals = re.sub(r'[\r\n\t]+', ' ', values) if values else ""
                clean_vals = re.sub(r'\s+', ' ', clean_vals).strip()
                result.append((name, unit, clean_vals))

    extract_from_html(html)

    if item_version_id:
        per_page = 1000
        part_url = (
            "https://zakupki.gov.ru/epz/ktru/ktruCard/ktru-part-description.html"
            f"?itemVersionId={item_version_id}&page=1&recordsPerPage={per_page}&isTemplate="
        )
        part_html = fetch_html(part_url)
        extract_from_html(part_html)
        
        page_numbers = set(int(x) for x in re.findall(r"goToCharacteristicPage\((\d+)\)", part_html))
        for page in sorted(n for n in page_numbers if n > 1):
            page_html = fetch_html(
                "https://zakupki.gov.ru/epz/ktru/ktruCard/ktru-part-description.html"
                f"?itemVersionId={item_version_id}&page={page}&recordsPerPage={per_page}&isTemplate="
            )
            extract_from_html(page_html)

    return result
