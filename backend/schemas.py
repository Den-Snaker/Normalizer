from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID
from models import EquipmentCategory


class Characteristic(BaseModel):
    name: str
    value: str


class EquipmentItemCreate(BaseModel):
    category: str
    name: str
    ktru_code: Optional[str] = None
    quantity: int = 1
    characteristics: Optional[List[Characteristic]] = None


class EquipmentItemResponse(BaseModel):
    id: UUID
    category: str
    name: str
    ktru_code: Optional[str]
    quantity: int
    characteristics: Optional[List[Characteristic]]

    class Config:
        from_attributes = True


class OrderCreate(BaseModel):
    processing_id: str
    source_file: Optional[str] = None
    doc_date: Optional[str] = None
    customer_name: Optional[str] = None
    customer_inn: Optional[str] = None
    customer_address: Optional[str] = None
    other_details: Optional[str] = None
    items: List[EquipmentItemCreate]
    token_usage: Optional[str] = None


class OrderResponse(BaseModel):
    id: UUID
    processing_id: str
    source_file: Optional[str]
    doc_date: Optional[str]
    processing_date: datetime
    customer_name: Optional[str]
    customer_inn: Optional[str]
    customer_address: Optional[str]
    other_details: Optional[str]
    token_usage: Optional[str]
    total_quantity: int
    items: List[EquipmentItemResponse]

    class Config:
        from_attributes = True


class DictionaryFieldCreate(BaseModel):
    category: str
    field_name: str
    is_active: bool = True
    unit: Optional[str] = None
    possible_values: Optional[str] = None


class DictionaryFieldResponse(BaseModel):
    id: UUID
    category: str
    field_name: str
    is_active: bool
    unit: Optional[str]
    possible_values: Optional[str]

    class Config:
        from_attributes = True


class CategoryMetadataCreate(BaseModel):
    category: str
    ktru_index: Optional[str] = None


class CategoryMetadataResponse(BaseModel):
    id: UUID
    category: str
    ktru_index: Optional[str]

    class Config:
        from_attributes = True


class ExtractRequest(BaseModel):
    content: str
    model: str = "gemini-2.0-flash"


class ExtractResponse(BaseModel):
    items: List[EquipmentItemCreate]
    metadata: Dict[str, Any]
    token_usage: str


class EnrichRequest(BaseModel):
    item: EquipmentItemCreate
    model: str = "gemini-2.0-flash"


class EnrichResponse(BaseModel):
    ktru_code: str
    token_usage: str


class DuplicateCheckRequest(BaseModel):
    category: str
    fields: List[str]


class DuplicateGroup(BaseModel):
    suggested_name: str
    duplicates: List[str]


class DuplicateCheckResponse(BaseModel):
    groups: List[DuplicateGroup]
    token_usage: str


class KtruLookupResponse(BaseModel):
    text: str
    token_usage: str
    sources: List[Dict[str, str]]


class ConnectionStatus(BaseModel):
    ok: bool
    message: str


class ScannedCodeCreate(BaseModel):
    group_code: str
    item_id: str
    item_name: Optional[str] = None
    status: str = "found"
    characteristics: Optional[dict] = None


class OllamaRequest(BaseModel):
    model: str
    prompt: str
    stream: bool = False
    options: Optional[Dict[str, Any]] = None


class OllamaResponse(BaseModel):
    response: str
    token_usage: Optional[str] = None
