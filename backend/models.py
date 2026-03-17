from enum import Enum
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, Integer, Boolean, DateTime, ForeignKey, JSON, Index, Column
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid


class Base(DeclarativeBase):
    pass


class EquipmentCategory(str, Enum):
    SERVER = "Сервер"
    PC = "ПК"
    MONITORS = "Мониторы"
    MONOBLOCKS = "Моноблоки"
    LAPTOPS = "Ноутбуки"
    TABLETS = "Планшеты"
    MFP = "МФУ"
    PRINTERS = "Принтеры"
    KEYBOARD = "Клавиатура"
    MOUSE = "Мышь"
    ROUTER = "Маршрутизатор"
    SWITCH = "Коммутатор"
    UPS = "ИБП"
    OTHER = "Прочее"


class DictionaryField(Base):
    __tablename__ = "dictionary_fields"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category = Column(String(100), nullable=False, index=True)
    field_name = Column(String(255), nullable=False)
    unit = Column(String(120), nullable=True)
    possible_values = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('ix_dictionary_category_field', 'category', 'field_name', unique=True),
    )


class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    processing_id = Column(String(100), unique=True, nullable=False, index=True)
    source_file = Column(String(500), nullable=True)
    doc_date = Column(String(50), nullable=True)
    processing_date = Column(DateTime, default=datetime.utcnow, index=True)
    customer_name = Column(String(500), nullable=True)
    customer_inn = Column(String(20), nullable=True)
    customer_address = Column(Text, nullable=True)
    other_details = Column(Text, nullable=True)
    token_usage = Column(String(100), nullable=True)
    total_quantity = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    items = relationship("EquipmentItem", back_populates="order", cascade="all, delete-orphan")


class EquipmentItem(Base):
    __tablename__ = "equipment_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    category = Column(String(100), nullable=False, index=True)
    name = Column(Text, nullable=False)
    ktru_code = Column(String(100), nullable=True)
    quantity = Column(Integer, default=1)
    characteristics = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    order = relationship("Order", back_populates="items")


class CategoryMetadata(Base):
    __tablename__ = "category_metadata"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category = Column(String(100), unique=True, nullable=False, index=True)
    ktru_index = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class KtruCharacteristicValue(Base):
    __tablename__ = "ktru_characteristic_values"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ktru_code = Column(String(100), nullable=False, index=True)
    characteristic_name = Column(String(500), nullable=False, index=True)
    possible_values = Column(Text, nullable=True)
    unit = Column(String(120), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('ix_ktru_char_values_code_name', 'ktru_code', 'characteristic_name', unique=True),
    )


class KtruScannedCode(Base):
    __tablename__ = "ktru_scanned_codes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_code = Column(String(50), nullable=False, index=True)
    item_id = Column(String(100), nullable=False, unique=True, index=True)
    item_name = Column(Text, nullable=True)
    source = Column(String(50), default="zakupki.gov.ru")
    status = Column(String(20), default="found")
    characteristics = Column(JSON, nullable=True)
    scanned_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('ix_ktru_scanned_group', 'group_code', 'scanned_at'),
    )
