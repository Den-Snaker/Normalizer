import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://ktru_user:ktru_password@localhost:5432/ktru_db")

engine = create_async_engine(DATABASE_URL, echo=False, pool_size=10, max_overflow=20)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session


async def init_db():
    from models import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS other_details TEXT"))
        await conn.execute(text("ALTER TABLE dictionary_fields ADD COLUMN IF NOT EXISTS unit VARCHAR(120)"))
        await conn.execute(text("ALTER TABLE dictionary_fields ADD COLUMN IF NOT EXISTS possible_values TEXT"))
        await conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_file VARCHAR(500)"))
        try:
            await conn.execute(text("CREATE TABLE IF NOT EXISTS ktru_scanned_codes (id UUID PRIMARY KEY, group_code VARCHAR(50) NOT NULL, item_id VARCHAR(100) NOT NULL UNIQUE, item_name TEXT, source VARCHAR(50) DEFAULT 'zakupki.gov.ru', status VARCHAR(20) DEFAULT 'found', characteristics JSONB, scanned_at TIMESTAMP DEFAULT NOW())"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ktru_scanned_group ON ktru_scanned_codes(group_code, scanned_at)"))
        except Exception:
            pass
        await conn.run_sync(lambda sync_conn: None)


async def check_connection() -> bool:
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        print(f"Database connection error: {e}")
        return False
