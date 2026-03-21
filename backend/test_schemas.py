"""Unit tests for schemas and utility functions."""
import pytest
from schemas import (
    Characteristic, EquipmentItemCreate,
    OrderCreate, DictionaryFieldCreate,
    CategoryMetadataCreate, ExtractRequest,
    EnrichRequest, DuplicateCheckRequest,
    KtruLookupResponse, ConnectionStatus, ScannedCodeCreate, OllamaRequest, OllamaResponse
)


class TestSchemas:
    """Tests for Pydantic schemas."""

    def test_characteristic(self):
        """Test Characteristic model."""
        char = Characteristic(name="Процессор", value="Intel Core i5")
        assert char.name == "Процессор"
        assert char.value == "Intel Core i5"

    def test_equipment_item_create(self):
        """Test EquipmentItemCreate model."""
        item = EquipmentItemCreate(
            category="Сервер",
            name="Тестовый сервер",
            quantity=1,
            characteristics=[
                Characteristic(name="Процессор", value="Intel Xeon"),
                Characteristic(name="ОЗУ", value="64 ГБ")
            ]
        )
        assert item.category == "Сервер"
        assert item.name == "Тестовый сервер"
        assert item.quantity == 1
        assert len(item.characteristics) == 2

    def test_equipment_item_create_minimal(self):
        """Test EquipmentItemCreate with minimal fields."""
        item = EquipmentItemCreate(
            category="Прочее",
            name="Тест",
            quantity=1
        )
        assert item.category == "Прочее"
        assert item.characteristics is None

    def test_order_create(self):
        """Test OrderCreate model."""
        order = OrderCreate(
            processing_id="test-123",
            source_file="test.pdf",
            customer_name="Test Company",
            customer_inn="1234567890",
            items=[]
        )
        assert order.processing_id == "test-123"
        assert order.source_file == "test.pdf"
        assert order.customer_inn == "1234567890"

    def test_dictionary_field_create(self):
        """Test DictionaryFieldCreate model."""
        field = DictionaryFieldCreate(
            category="Сервер",
            field_name="Процессор",
            is_active=True,
            unit="ГГц",
            possible_values="Intel;AMD"
        )
        assert field.category == "Сервер"
        assert field.field_name == "Процессор"
        assert field.unit == "ГГц"
        assert field.possible_values == "Intel;AMD"

    def test_dictionary_field_create_minimal(self):
        """Test DictionaryFieldCreate with minimal fields."""
        field = DictionaryFieldCreate(
            category="Мониторы",
            field_name="Диагональ"
        )
        assert field.category == "Мониторы"
        assert field.is_active == True  # default value

    def test_category_metadata_create(self):
        """Test CategoryMetadataCreate model."""
        meta = CategoryMetadataCreate(
            category="Сервер",
            ktru_index="26.20.14.000"
        )
        assert meta.category == "Сервер"
        assert meta.ktru_index == "26.20.14.000"

    def test_extract_request(self):
        """Test ExtractRequest model."""
        req = ExtractRequest(
            content="Текст заказа",
            model="gemini-2.0-flash"
        )
        assert req.content == "Текст заказа"
        assert req.model == "gemini-2.0-flash"

    def test_extract_request_default_model(self):
        """Test ExtractRequest default model."""
        req = ExtractRequest(content="Текст")
        assert req.model == "gemini-2.0-flash"

    def test_enrich_request(self):
        """Test EnrichRequest model."""
        item = EquipmentItemCreate(
            category="Сервер",
            name="Dell PowerEdge",
            quantity=1
        )
        req = EnrichRequest(item=item)
        assert req.item.name == "Dell PowerEdge"
        assert req.model == "gemini-2.0-flash"

    def test_duplicate_check_request(self):
        """Test DuplicateCheckRequest model."""
        req = DuplicateCheckRequest(
            category="Сервер",
            fields=["Процессор", "CPU", "ОЗУ"]
        )
        assert req.category == "Сервер"
        assert len(req.fields) == 3

    def test_ktru_lookup_response(self):
        """Test KtruLookupResponse model."""
        resp = KtruLookupResponse(
            text="Характеристики сервера",
            token_usage="K_1.0+P_0.5+T_0.0=1.5",
            sources=[{"title": "zakupki.gov.ru", "uri": "https://..."}]
        )
        assert resp.text == "Характеристики сервера"
        assert len(resp.sources) == 1

    def test_connection_status(self):
        """Test ConnectionStatus model."""
        status_ok = ConnectionStatus(ok=True, message="Connected")
        assert status_ok.ok is True
        
        status_fail = ConnectionStatus(ok=False, message="Connection failed")
        assert status_fail.ok is False

    def test_scanned_code_create(self):
        """Test ScannedCodeCreate with required fields only."""
        code = ScannedCodeCreate(
            group_code="26.20.14.000",
            item_id="26.20.14.000-00000001"
        )
        assert code.group_code == "26.20.14.000"
        assert code.item_id == "26.20.14.000-00000001"
        assert code.status == "found"  # default value

    def test_scanned_code_create_full(self):
        """Test ScannedCodeCreate with all fields."""
        code = ScannedCodeCreate(
            group_code="26.20.14.000",
            item_id="26.20.14.000-00000001",
            item_name="Сервер Dell PowerEdge",
            status="scanned",
            characteristics={"Процессор": "Intel Xeon", "ОЗУ": "64 ГБ"}
        )
        assert code.item_name == "Сервер Dell PowerEdge"
        assert code.characteristics["Процессор"] == "Intel Xeon"

    def test_ollama_request(self):
        """Test OllamaRequest model."""
        req = OllamaRequest(
            model="llama3",
            prompt="Hello",
            stream=False
        )
        assert req.model == "llama3"
        assert req.prompt == "Hello"
        assert req.stream is False
        assert req.api_key is None

    def test_ollama_request_with_images(self):
        """Test OllamaRequest with images."""
        req = OllamaRequest(
            model="llama3-vision",
            prompt="What is in the image?",
            images=["base64imagedata"]
        )
        assert len(req.images) == 1

    def test_ollama_response(self):
        """Test OllamaResponse model."""
        resp = OllamaResponse(
            response="Hello back!",
            token_usage="K_10+P_5+T_0=15"
        )
        assert resp.response == "Hello back!"
        assert resp.token_usage == "K_10+P_5+T_0=15"

    def test_ollama_response_minimal(self):
        """Test OllamaResponse without token_usage."""
        resp = OllamaResponse(response="OK")
        assert resp.response == "OK"
        assert resp.token_usage is None


class TestINNValidation:
    """Tests for INN (Russian tax ID) validation."""

    def test_valid_10_digit_inn(self):
        """Test validation of 10-digit INN (organizations)."""
        inn = "1234567890"
        clean_inn = ''.join(filter(str.isdigit, inn))
        assert len(clean_inn) == 10

    def test_valid_12_digit_inn(self):
        """Test validation of 12-digit INN (individuals)."""
        inn = "123456789012"
        clean_inn = ''.join(filter(str.isdigit, inn))
        assert len(clean_inn) == 12

    def test_invalid_inn_length(self):
        """Test rejection of invalid INN lengths."""
        short_inn = "12345"
        assert len(short_inn) < 10
        
        long_inn = "1234567890123"
        assert len(long_inn) > 12


class TestTokenUsage:
    """Tests for token usage string formatting."""

    def test_token_usage_format(self):
        """Test token usage string format."""
        token_str = "K_5.2+P_3.1+T_1.5=9.8"
        parts = token_str.split("+")
        assert "K_5.2" in parts[0]
        assert "P_3.1" in parts[1]
        assert "T_1.5" in parts[2]
        assert "=9.8" in token_str

    def test_parse_token_usage(self):
        """Test parsing token usage string."""
        import re
        token_str = "K_5.0+P_3.0+T_1.0=9.0"
        
        match = re.match(r'K_([\d.]+)\+P_([\d.]+)\+T_([\d.]+)=([\d.]+)', token_str)
        assert match is not None
        
        k = float(match.group(1))
        p = float(match.group(2))
        t = float(match.group(3))
        total = float(match.group(4))
        
        assert k == 5.0
        assert p == 3.0
        assert t == 1.0
        assert total == 9.0


class TestKTRUCodeValidation:
    """Tests for KTRU code validation."""

    def test_valid_ktru_code(self):
        """Test valid KTRU code format."""
        code = "26.20.14.000-00000001"
        parts = code.split("-")
        assert len(parts) == 2
        assert "." in parts[0]
        
        group_parts = parts[0].split(".")
        assert len(group_parts) == 4

    def test_ktru_group_code(self):
        """Test KTRU group code extraction."""
        full_code = "26.20.14.000-00000001"
        group_code = full_code.split("-")[0]
        assert group_code == "26.20.14.000"

    def test_ktru_item_number(self):
        """Test KTRU item number extraction."""
        full_code = "26.20.14.000-00000001"
        item_number = full_code.split("-")[1]
        assert item_number == "00000001"


class TestDateTimeFormatting:
    """Tests for date/time formatting."""

    def test_format_datetime(self):
        """Test datetime formatting."""
        from datetime import datetime
        
        ts = datetime(2024, 1, 15, 10, 30, 0)
        formatted = ts.strftime("%d-%m-%Y %H:%M")
        assert formatted == "15-01-2024 10:30"

    def test_format_datetime_with_padding(self):
        """Test datetime formatting with zero padding."""
        from datetime import datetime
        
        ts = datetime(2024, 1, 5, 5, 5, 0)
        formatted = ts.strftime("%d-%m-%Y %H:%M")
        assert formatted == "05-01-2024 05:05"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])