import os
import uuid
import json
import asyncio
import httpx
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, delete, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import io

from models import Base, DictionaryField, Order, EquipmentItem, CategoryMetadata, EquipmentCategory, KtruCharacteristicValue, KtruScannedCode
from schemas import (
    OrderCreate, OrderResponse, DictionaryFieldCreate, DictionaryFieldResponse,
    CategoryMetadataCreate, CategoryMetadataResponse, EquipmentItemResponse,
    ConnectionStatus, ExtractRequest, ExtractResponse, EnrichRequest, EnrichResponse,
    DuplicateCheckRequest, DuplicateCheckResponse, KtruLookupResponse, ScannedCodeCreate,
    OllamaRequest, OllamaResponse
)
from database import engine, get_session, init_db, check_connection
from services.parsers import parse_file, get_allowed_extensions
from services.ktru_parser import fetch_ktru_fields, fetch_ktru_fields_with_units, fetch_ktru_characteristic_values
from services.gemini import (
    extract_data_with_schema, enrich_item_with_ktru, suggest_dictionary_fields,
    find_duplicate_fields, fetch_raw_ktru_fields, verify_category_ktru_index,
    CATEGORIES_CONFIG, CATEGORY_KTRU_INDICES
)
from services.excel import (
    generate_template, fill_excel, generate_consolidated_report,
    parse_dictionary_from_excel, export_ktru_lookup_to_excel, generate_ktru_template_with_values
)

app = FastAPI(title="Нормализатор заказов по КТРУ API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await init_db()
    await seed_initial_data()


async def seed_initial_data():
    from database import async_session
    
    async with async_session() as session:
        existing_fields = await session.execute(select(DictionaryField).limit(1))
        existing_meta = await session.execute(select(CategoryMetadata).limit(1))

        if not existing_fields.scalar():
            for category, fields in CATEGORIES_CONFIG.items():
                for field in fields:
                    db_field = DictionaryField(
                        category=category,
                        field_name=field,
                        is_active=True
                    )
                    session.add(db_field)

        if not existing_meta.scalar():
            for category, ktru_index in CATEGORY_KTRU_INDICES.items():
                meta = CategoryMetadata(
                    category=category,
                    ktru_index=ktru_index
                )
                session.add(meta)

        await session.commit()


OLLAMA_CLOUD_API_KEY = os.getenv("OLLAMA_CLOUD_API_KEY", "")


@app.post("/ollama/generate", response_model=OllamaResponse)
async def ollama_generate(request: OllamaRequest):
    """
    Прокси для запросов к облачному Ollama API.
    API ключ берётся из переменной окружения OLLAMA_CLOUD_API_KEY.
    """
    if not OLLAMA_CLOUD_API_KEY:
        raise HTTPException(status_code=500, detail="OLLAMA_CLOUD_API_KEY не настроен на сервере")
    
    endpoint = "https://ollama.com/api"
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OLLAMA_CLOUD_API_KEY}"
    }
    
    body = {
        "model": request.model,
        "prompt": request.prompt,
        "stream": request.stream,
    }
    if request.options:
        body["options"] = request.options
    if request.images:
        body["images"] = request.images
    
    async with httpx.AsyncClient(timeout=600.0) as client:
        response = await client.post(
            f"{endpoint}/generate",
            headers=headers,
            json=body
        )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Ошибка Ollama: {response.text}"
            )
        
        data = response.json()
        
        token_usage = None
        if "prompt_eval_count" in data or "eval_count" in data:
            prompt_tokens = data.get("prompt_eval_count", 0) or 0
            completion_tokens = data.get("eval_count", 0) or 0
            total = prompt_tokens + completion_tokens
            token_usage = f"K_{prompt_tokens}+P_{completion_tokens}=T_{total}"
        
        return OllamaResponse(
            response=data.get("response", ""),
            token_usage=token_usage
        )


@app.get("/")
async def root():
    return {"status": "ok", "message": "Нормализатор заказов по КТРУ API v2.0"}


@app.get("/health", response_model=ConnectionStatus)
async def health():
    ok = await check_connection()
    return ConnectionStatus(
        ok=ok,
        message="PostgreSQL connected" if ok else "Database connection failed"
    )


@app.get("/ktru/fields")
async def get_ktru_fields(
    itemId: str,
    source: str = Query("zakupki.gov.ru"),
    token: Optional[str] = None,
    authorization: Optional[str] = Header(default=None),
    x_short_auth_token: Optional[str] = Header(default=None)
):
    if not itemId:
        raise HTTPException(status_code=400, detail="itemId is required")

    try:
        header_token = None
        if authorization and authorization.lower().startswith("bearer "):
            header_token = authorization.split(" ", 1)[1].strip()
        fields = await asyncio.to_thread(
            fetch_ktru_fields,
            itemId,
            source,
            token or header_token,
            x_short_auth_token
        )
        return {"itemId": itemId, "count": len(fields), "fields": fields}
    except Exception as e:
        print(f"KTRU parsing error: {e}")
        raise HTTPException(status_code=500, detail=f"KTRU parsing error: {str(e)}")


@app.get("/ktru/fields/details")
async def get_ktru_field_details(
    itemId: str,
    source: str = Query("zakupki.gov.ru"),
    token: Optional[str] = None,
    authorization: Optional[str] = Header(default=None),
    x_short_auth_token: Optional[str] = Header(default=None)
):
    if not itemId:
        raise HTTPException(status_code=400, detail="itemId is required")

    try:
        header_token = None
        if authorization and authorization.lower().startswith("bearer "):
            header_token = authorization.split(" ", 1)[1].strip()
        pairs = await asyncio.to_thread(
            fetch_ktru_fields_with_units,
            itemId,
            source,
            token or header_token,
            x_short_auth_token
        )
        # Get values for each field
        values_data = await asyncio.to_thread(
            fetch_ktru_characteristic_values,
            itemId,
            source
        )
        values_map = {name.lower(): vals for name, unit, vals in values_data}
        
        details = []
        for name, unit in pairs:
            vals = values_map.get(name.lower(), "")
            details.append({"name": name, "unit": unit, "values": vals})
        
        return {"itemId": itemId, "count": len(details), "fields": details}
    except Exception as e:
        print(f"KTRU details parsing error: {e}")
        raise HTTPException(status_code=500, detail=f"KTRU parsing error: {str(e)}")


@app.get("/ktru/characteristic-values")
async def get_ktru_characteristic_values(
    itemId: str,
    source: str = Query("zakupki.gov.ru"),
    save: bool = Query(False),
    session: AsyncSession = Depends(get_session)
):
    try:
        values = await asyncio.to_thread(
            fetch_ktru_characteristic_values,
            itemId,
            source
        )
        
        if save and values:
            for name, unit, possible_vals in values:
                existing = await session.execute(
                    select(KtruCharacteristicValue).where(
                        and_(
                            KtruCharacteristicValue.ktru_code == itemId,
                            KtruCharacteristicValue.characteristic_name == name
                        )
                    )
                )
                if existing.scalar():
                    continue
                db_val = KtruCharacteristicValue(
                    ktru_code=itemId,
                    characteristic_name=name,
                    unit=unit,
                    possible_values=possible_vals
                )
                session.add(db_val)
            await session.commit()
        
        return {
            "itemId": itemId,
            "count": len(values),
            "characteristics": [
                {"name": n, "unit": u, "possible_values": v}
                for n, u, v in values
            ]
        }
    except Exception as e:
        print(f"KTRU characteristic values error: {e}")
        raise HTTPException(status_code=500, detail=f"KTRU values error: {str(e)}")


@app.get("/dictionary", response_model=List[DictionaryFieldResponse])
async def get_dictionary(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(DictionaryField))
    return result.scalars().all()


@app.post("/dictionary", response_model=DictionaryFieldResponse)
async def add_dictionary_field(field: DictionaryFieldCreate, session: AsyncSession = Depends(get_session)):
    db_field = DictionaryField(**field.model_dump())
    session.add(db_field)
    await session.commit()
    await session.refresh(db_field)
    return db_field


@app.post("/dictionary/bulk")
async def add_dictionary_fields_bulk(fields: List[DictionaryFieldCreate], session: AsyncSession = Depends(get_session)):
    print(f"[dictionary/bulk] Received {len(fields)} fields")
    sample = [f for f in fields if f.unit or f.possible_values][:3]
    for s in sample:
        print(f"  {s.field_name[:50]}: unit={s.unit}, possible_values={(s.possible_values or '')[:30]}")
    
    for field in fields:
        existing = await session.execute(
            select(DictionaryField).where(
                and_(
                    DictionaryField.category == field.category,
                    DictionaryField.field_name == field.field_name
                )
            )
        )
        existing_field = existing.scalar()
        if existing_field:
            # Update existing field with new values
            if field.unit is not None:
                existing_field.unit = field.unit
            if field.possible_values is not None:
                existing_field.possible_values = field.possible_values
            existing_field.is_active = field.is_active
        else:
            db_field = DictionaryField(**field.model_dump())
            session.add(db_field)
    await session.commit()
    print(f"[dictionary/bulk] Saved {len(fields)} fields")
    return {"status": "ok", "count": len(fields)}


@app.delete("/dictionary/{field_id}")
async def delete_dictionary_field(field_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(DictionaryField).where(DictionaryField.id == field_id))
    field = result.scalar()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    await session.delete(field)
    await session.commit()
    return {"status": "deleted"}


@app.post("/dictionary/import")
async def import_dictionary_from_excel(file: UploadFile = File(...), session: AsyncSession = Depends(get_session)):
    content = await file.read()
    fields_map = parse_dictionary_from_excel(content)
    
    count = 0
    for category, fields in fields_map.items():
        for field in fields:
            existing = await session.execute(
                select(DictionaryField).where(
                    and_(
                        DictionaryField.category == category,
                        DictionaryField.field_name == field
                    )
                )
            )
            if not existing.scalar():
                db_field = DictionaryField(category=category, field_name=field, is_active=True)
                session.add(db_field)
                count += 1
    
    await session.commit()
    return {"status": "ok", "imported": count}


@app.get("/dictionary/template")
async def download_dictionary_template(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(DictionaryField))
    dictionary = [{"category": f.category, "field_name": f.field_name} for f in result.scalars().all()]
    content = generate_template(dictionary)
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=dictionary_template.xlsx"}
    )


@app.get("/categories")
async def get_categories():
    return {"categories": list(EquipmentCategory), "config": CATEGORIES_CONFIG, "ktru_indices": CATEGORY_KTRU_INDICES}


@app.get("/category-metadata", response_model=List[CategoryMetadataResponse])
async def get_category_metadata(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(CategoryMetadata))
    return result.scalars().all()


@app.put("/category-metadata/{category}")
async def update_category_metadata(category: str, ktru_index: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(CategoryMetadata).where(CategoryMetadata.category == category))
    meta = result.scalar()
    if meta:
        meta.ktru_index = ktru_index
    else:
        meta = CategoryMetadata(category=category, ktru_index=ktru_index)
        session.add(meta)
    await session.commit()
    return {"status": "ok"}


@app.get("/orders", response_model=List[OrderResponse])
async def get_orders(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = Query(100, le=1000),
    session: AsyncSession = Depends(get_session)
):
    query = select(Order).options(selectinload(Order.items)).order_by(Order.processing_date.desc()).limit(limit)
    
    if start_date:
        start_dt = datetime.fromisoformat(start_date)
        query = query.where(Order.processing_date >= start_dt)
    if end_date:
        end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
        query = query.where(Order.processing_date <= end_dt)
    
    result = await session.execute(query)
    return result.scalars().all()


@app.post("/orders", response_model=OrderResponse)
async def create_order(order: OrderCreate, session: AsyncSession = Depends(get_session)):
    db_order = Order(
        processing_id=order.processing_id,
        source_file=order.source_file,
        doc_date=order.doc_date,
        customer_name=order.customer_name,
        customer_inn=order.customer_inn,
        customer_address=order.customer_address,
        other_details=order.other_details,
        token_usage=order.token_usage,
        total_quantity=sum(item.quantity for item in order.items)
    )
    session.add(db_order)
    await session.flush()
    
    for item in order.items:
        db_item = EquipmentItem(
            order_id=db_order.id,
            category=item.category,
            name=item.name,
            ktru_code=item.ktru_code,
            quantity=item.quantity,
            characteristics=[c.model_dump() for c in item.characteristics] if item.characteristics else None
        )
        session.add(db_item)
    
    await session.commit()
    result = await session.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == db_order.id)
    )
    return result.scalar()


@app.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(order_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    )
    order = result.scalar()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@app.delete("/orders")
async def clear_orders(session: AsyncSession = Depends(get_session)):
    await session.execute(delete(EquipmentItem))
    await session.execute(delete(Order))
    await session.commit()
    return {"status": "cleared"}


@app.delete("/database/clear")
async def clear_database(session: AsyncSession = Depends(get_session)):
    await session.execute(delete(EquipmentItem))
    await session.execute(delete(Order))
    await session.execute(delete(DictionaryField))
    await session.execute(delete(CategoryMetadata))
    await session.commit()
    return {"status": "cleared"}


@app.post("/process-file")
async def process_file_upload(file: UploadFile = File(...), session: AsyncSession = Depends(get_session)):
    try:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in get_allowed_extensions():
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
        
        content = await file.read()
        text = await parse_file(content, file.filename)
        
        dict_result = await session.execute(select(DictionaryField))
        dictionary = [{"category": f.category, "field_name": f.field_name} for f in dict_result.scalars().all()]
        
        extracted = await extract_data_with_schema(text, dictionary)
        
        items = extracted.get("items", [])
        metadata = extracted.get("metadata", {})
        
        enriched_items = []
        for item in items:
            try:
                enrich_result = await enrich_item_with_ktru(item)
                item["ktru_code"] = enrich_result.get("ktru_code", "")
            except Exception as e:
                print(f"Enrich error: {e}")
                item["ktru_code"] = ""
            enriched_items.append(item)
        
        processing_id = str(uuid.uuid4())[:8]
        
        total_qty = sum(item.get("quantity", 1) for item in enriched_items)
        
        db_order = Order(
            processing_id=processing_id,
            source_file=file.filename,
            doc_date=metadata.get("doc_date") or metadata.get("docDate"),
            customer_name=metadata.get("customer_name") or metadata.get("customerName"),
            customer_inn=metadata.get("customer_inn") or metadata.get("customerInn"),
            customer_address=metadata.get("customer_address") or metadata.get("customerAddress"),
            other_details=metadata.get("other_details") or metadata.get("otherDetails") or metadata.get("other"),
            token_usage=extracted.get("token_usage", ""),
            total_quantity=total_qty
        )
        session.add(db_order)
        await session.flush()
        
        for item in enriched_items:
            db_item = EquipmentItem(
                order_id=db_order.id,
                category=item.get("category", "Прочее"),
                name=item.get("name", ""),
                ktru_code=item.get("ktru_code"),
                quantity=item.get("quantity", 1),
                characteristics=item.get("characteristics")
            )
            session.add(db_item)
        
        await session.commit()
        
        return {
            "order_id": str(db_order.id),
            "processing_id": processing_id,
            "source_file": file.filename,
            "items_count": len(enriched_items),
            "token_usage": extracted.get("token_usage", "")
        }
    except Exception as e:
        print(f"Process file error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/orders/{order_id}/export")
async def export_order(order_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    )
    order = result.scalar()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    dict_result = await session.execute(select(DictionaryField))
    dictionary = [{"category": f.category, "field_name": f.field_name} for f in dict_result.scalars().all()]
    
    items = []
    for item in order.items:
        items.append({
            "category": item.category,
            "name": item.name,
            "ktru_code": item.ktru_code,
            "quantity": item.quantity,
            "characteristics": item.characteristics or []
        })
    
    metadata = {
        "processing_id": order.processing_id,
        "source_file": order.source_file,
        "doc_date": order.doc_date,
        "customer_name": order.customer_name,
        "customer_inn": order.customer_inn
    }
    
    content = fill_excel(items, metadata, dictionary)
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=order_{order.processing_id}.xlsx"}
    )


@app.get("/orders/export/report")
async def export_consolidated_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    session: AsyncSession = Depends(get_session)
):
    query = select(Order).options(selectinload(Order.items)).order_by(Order.processing_date.desc())
    
    if start_date:
        start_dt = datetime.fromisoformat(start_date)
        query = query.where(Order.processing_date >= start_dt)
    if end_date:
        end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
        query = query.where(Order.processing_date <= end_dt)
    
    result = await session.execute(query)
    orders = result.scalars().all()
    
    dict_result = await session.execute(select(DictionaryField))
    dictionary = [{"category": f.category, "field_name": f.field_name} for f in dict_result.scalars().all()]
    
    orders_data = []
    for order in orders:
        items = []
        for item in order.items:
            items.append({
                "category": item.category,
                "name": item.name,
                "ktru_code": item.ktru_code,
                "quantity": item.quantity,
                "characteristics": item.characteristics or []
            })
        orders_data.append({
            "metadata": {
                "processing_id": order.processing_id,
                "source_file": order.source_file,
                "doc_date": order.doc_date,
                "customer_name": order.customer_name,
                "customer_inn": order.customer_inn,
                "timestamp": int(order.processing_date.timestamp() * 1000)
            },
            "items": items
        })
    
    content = generate_consolidated_report(orders_data, dictionary)
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=consolidated_report.xlsx"}
    )


@app.post("/ai/extract", response_model=ExtractResponse)
async def ai_extract(request: ExtractRequest, session: AsyncSession = Depends(get_session)):
    dict_result = await session.execute(select(DictionaryField))
    dictionary = [{"category": f.category, "field_name": f.field_name} for f in dict_result.scalars().all()]
    
    result = await extract_data_with_schema(request.content, dictionary, request.model)
    
    items = []
    for item in result.get("items", []):
        items.append({
            "category": item.get("category", "Прочее"),
            "name": item.get("name", ""),
            "ktru_code": None,
            "quantity": item.get("quantity", 1),
            "characteristics": item.get("characteristics", [])
        })
    
    return ExtractResponse(
        items=items,
        metadata=result.get("metadata", {}),
        token_usage=result.get("token_usage", "")
    )


@app.post("/ai/enrich", response_model=EnrichResponse)
async def ai_enrich(request: EnrichRequest):
    result = await enrich_item_with_ktru(request.item.model_dump(), request.model)
    return EnrichResponse(ktru_code=result.get("ktru_code", ""), token_usage=result.get("token_usage", ""))


@app.post("/ai/suggest-fields")
async def ai_suggest_fields(category: str, model: str = "gemini-2.0-flash", session: AsyncSession = Depends(get_session)):
    result = await suggest_dictionary_fields(category, model)
    return {"fields": result.get("fields", []), "token_usage": result.get("token_usage", "")}


@app.post("/ai/find-duplicates", response_model=DuplicateCheckResponse)
async def ai_find_duplicates(request: DuplicateCheckRequest, model: str = "gemini-2.0-flash"):
    result = await find_duplicate_fields(request.category, request.fields, model)
    return DuplicateCheckResponse(
        groups=[{"suggested_name": g.get("suggested_name", ""), "duplicates": g.get("duplicates", [])} for g in result.get("groups", [])],
        token_usage=result.get("token_usage", "")
    )


@app.get("/ai/ktru-lookup")
async def ai_ktru_lookup(ktru_code: str, model: str = "gemini-2.0-flash"):
    result = await fetch_raw_ktru_fields(ktru_code, model)
    return KtruLookupResponse(
        text=result.get("text", ""),
        token_usage=result.get("token_usage", ""),
        sources=result.get("sources", [])
    )


@app.get("/ai/ktru-lookup/export")
async def export_ktru_lookup(ktru_code: str, model: str = "gemini-2.0-flash"):
    result = await fetch_raw_ktru_fields(ktru_code, model)
    content = export_ktru_lookup_to_excel(ktru_code, result.get("text", ""))
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=ktru_{ktru_code}.xlsx"}
    )


@app.get("/ktru/template-with-values")
async def get_ktru_template_with_values(
    itemId: str,
    source: str = Query("zakupki.gov.ru"),
    session: AsyncSession = Depends(get_session)
):
    """Export KTRU characteristics with possible values as Excel template."""
    try:
        values = await asyncio.to_thread(
            fetch_ktru_characteristic_values,
            itemId,
            source
        )
        
        characteristics = [
            {"name": n, "unit": u, "possible_values": v}
            for n, u, v in values
        ]
        
        content = generate_ktru_template_with_values(itemId, characteristics)
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=ktru_template_{itemId}.xlsx"}
        )
    except Exception as e:
        print(f"KTRU template error: {e}")
        raise HTTPException(status_code=500, detail=f"KTRU template error: {str(e)}")


@app.post("/ai/verify-ktru-index")
async def ai_verify_ktru_index(category: str, model: str = "gemini-2.0-flash"):
    result = await verify_category_ktru_index(category, model)
    return {"index": result.get("index", ""), "token_usage": result.get("token_usage", "")}


from services.ktru_scanner import scan_ktru_range_async, check_ktru_item

@app.get("/ktru/scan")
async def scan_ktru_codes(
    group_code: str,
    start: int = Query(1, ge=1, le=99999),
    end: int = Query(99, ge=1, le=99999),
    requests_per_second: float = Query(0.5, ge=0.1, le=10),
    pause_seconds: float = Query(2.0, ge=0.1, le=60),
    save: bool = Query(False),
    session: AsyncSession = Depends(get_session)
):
    """
    Сканирует диапазон кодов КТРУ и возвращает результаты.
    
    Args:
        group_code: Код группы КТРУ (например, 26.20.15.000)
        start: Начальный номер (по умолчанию 1)
        end: Конечный номер (по умолчанию 99)
        requests_per_second: Макс. запросов в секунду (0.1-10)
        pause_seconds: Пауза между запросами (0.1-60 сек)
        save: Сохранить результаты в БД
    """
    if start > end:
        raise HTTPException(status_code=400, detail="start должен быть меньше или равен end")
    
    results = []
    errors = []
    total_checked = end - start + 1
    
    async def scan_with_progress():
        nonlocal results, errors
        current = 0
        
        for num in range(start, end + 1):
            current = num - start + 1
            item_id = f"{group_code}-{num:08d}"
            
            try:
                status, name, characteristics, ktru_status = await asyncio.to_thread(
                    check_ktru_item, item_id
                )
                
                if status == "found":
                    result_item = {
                        "item_id": item_id,
                        "name": name,
                        "characteristics": characteristics,
                        "status": status,
                        "ktru_status": ktru_status
                    }
                    results.append(result_item)
                    
                    if save:
                        existing = await session.execute(
                            select(KtruScannedCode).where(KtruScannedCode.item_id == item_id)
                        )
                        existing_code = existing.scalar()
                        if existing_code:
                            existing_code.item_name = name
                            existing_code.characteristics = characteristics
                            existing_code.status = status
                            existing_code.scanned_at = datetime.utcnow()
                        else:
                            db_code = KtruScannedCode(
                                group_code=group_code,
                                item_id=item_id,
                                item_name=name,
                                characteristics=characteristics,
                                status=status
                            )
                            session.add(db_code)
                elif status == "error":
                    errors.append({"item_id": item_id, "error": name})
                    
            except Exception as e:
                errors.append({"item_id": item_id, "error": str(e)[:100]})
            
            # Прогресс
            progress = int((current / total_checked) * 100)
            
            # Пауза с рандомизацией
            if current < total_checked:
                import random
                random_delay = random.uniform(0.01, 0.99)
                actual_pause = max(pause_seconds + random_delay, 1.0 / requests_per_second)
                await asyncio.sleep(actual_pause)
        
        if save:
            await session.commit()
    
    await scan_with_progress()
    
    return {
        "group_code": group_code,
        "range": {"start": start, "end": end},
        "total_checked": total_checked,
        "found_count": len(results),
        "errors_count": len(errors),
        "results": results,
        "errors": errors[:10]  # Первые 10 ошибок
    }


@app.get("/ktru/scanned-codes")
async def get_scanned_codes(
    group_code: Optional[str] = None,
    limit: int = Query(100, le=1000),
    session: AsyncSession = Depends(get_session)
):
    """
    Получает список сканированных кодов КТРУ.
    
    Args:
        group_code: Фильтр по группе (опционально)
        limit: Макс. количество записей
    """
    query = select(KtruScannedCode).order_by(KtruScannedCode.scanned_at.desc())
    
    if group_code:
        query = query.where(KtruScannedCode.group_code == group_code)
    
    query = query.limit(limit)
    result = await session.execute(query)
    codes = result.scalars().all()
    
    return {
        "count": len(codes),
        "codes": [
            {
                "item_id": c.item_id,
                "group_code": c.group_code,
                "item_name": c.item_name,
                "status": c.status,
                "scanned_at": c.scanned_at.isoformat() if c.scanned_at else None,
                "characteristics": c.characteristics
            }
            for c in codes
        ]
    }


@app.post("/ktru/scanned-codes/bulk")
async def save_scanned_codes_bulk(
    codes: List[ScannedCodeCreate],
    session: AsyncSession = Depends(get_session)
):
    """
    Сохраняет список сканированных кодов КТРУ в базу данных.
    """
    saved = 0
    for code in codes:
        existing = await session.execute(
            select(KtruScannedCode).where(KtruScannedCode.item_id == code.item_id)
        )
        existing_code = existing.scalar()
        if existing_code:
            existing_code.item_name = code.item_name
            existing_code.characteristics = code.characteristics
            existing_code.status = code.status
            existing_code.scanned_at = datetime.utcnow()
        else:
            db_code = KtruScannedCode(
                group_code=code.group_code,
                item_id=code.item_id,
                item_name=code.item_name,
                characteristics=code.characteristics,
                status=code.status
            )
            session.add(db_code)
        saved += 1
    
    await session.commit()
    return {"status": "ok", "saved": saved}


@app.delete("/ktru/scanned-codes")
async def clear_scanned_codes(
    group_code: Optional[str] = None,
    session: AsyncSession = Depends(get_session)
):
    """
    Удаляет сканированные коды.
    
    Args:
        group_code: Удалить только для этой группы (опционально, иначе удаляются все)
    """
    if group_code:
        await session.execute(
            delete(KtruScannedCode).where(KtruScannedCode.group_code == group_code)
        )
    else:
        await session.execute(delete(KtruScannedCode))
    
    await session.commit()
    return {"status": "deleted", "group_code": group_code}


@app.get("/ktru/scanner/groups")
async def get_scanner_groups():
    """
    Возвращает список групп КТРУ для сканирования.
    """
    return {
        "groups": [
            {"code": "26.20.14.000", "name": "Сервер"},
            {"code": "26.20.15.000", "name": "ПК и Моноблоки"},
            {"code": "26.20.17.110", "name": "Мониторы"},
            {"code": "26.20.11.110", "name": "Ноутбуки и Планшеты"},
            {"code": "26.20.18.000", "name": "МФУ"},
            {"code": "26.20.16.120", "name": "Принтеры"},
            {"code": "26.20.16.110", "name": "Клавиатуры"},
            {"code": "26.20.16.170", "name": "Мышь"},
            {"code": "26.30.11.120", "name": "Маршрутизаторы"},
            {"code": "26.30.11.110", "name": "Коммутаторы"},
            {"code": "26.20.40.110", "name": "ИБП"},
        ]
    }


@app.get("/ktru/scanned-codes/export")
async def export_scanned_codes_to_excel(
    group_code: Optional[str] = None,
    session: AsyncSession = Depends(get_session)
):
    """
    Экспортирует сканированные коды КТРУ в Excel файл.
    """
    from services.excel import export_scanned_codes_xlsx
    
    query = select(KtruScannedCode).order_by(KtruScannedCode.group_code, KtruScannedCode.item_id)
    
    if group_code:
        query = query.where(KtruScannedCode.group_code == group_code)
    
    result = await session.execute(query)
    codes = result.scalars().all()
    
    codes_data = [
        {
            "item_id": c.item_id,
            "group_code": c.group_code,
            "item_name": c.item_name,
            "status": c.status,
            "ktru_status": getattr(c, 'ktru_status', None),
            "scanned_at": c.scanned_at.isoformat() if c.scanned_at else None,
            "characteristics": c.characteristics
        }
        for c in codes
    ]
    
    content = export_scanned_codes_xlsx(codes_data)
    
    filename = f"ktru_scanned_codes_{group_code or 'all'}.xlsx"
    
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
