import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Подключение к PostgreSQL
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Проверка подключения
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Получить все поля словаря
app.get('/api/dictionary', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT category, "fieldName", "isActive" FROM dictionary ORDER BY category, "fieldName"'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching dictionary:', err);
    res.status(500).json({ error: err.message });
  }
});

// Получить заказы за период
app.get('/api/orders', async (req, res) => {
  const { start, end } = req.query;
  
  try {
    let query = `
      SELECT 
        o.id,
        o.processing_id as "processingId",
        o.doc_date as "docDate",
        o.processing_date as "timestamp",
        o.customer_name as "customerName",
        o.customer_inn as "customerInn",
        o.customer_address as "customerAddress",
        o.total_quantity as "totalQuantity",
        o.metadata,
        json_agg(
          json_build_object(
            'name', i.name,
            'ktruCode', i.ktru_code,
            'quantity', i.quantity,
            'category', i.category,
            'characteristics', i.characteristics
          )
        ) as items
      FROM orders o
      LEFT JOIN order_items i ON o.id = i.order_id
    `;
    
    const params = [];
    if (start && end) {
      query += ` WHERE o.processing_date >= $1 AND o.processing_date <= $2`;
      params.push(parseInt(start), parseInt(end));
    }
    
    query += ` GROUP BY o.id ORDER BY o.processing_date DESC`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ error: err.message });
  }
});

// Создать/обновить заказ
app.post('/api/orders', async (req, res) => {
  const { 
    processing_id, doc_date, processing_date, 
    customer_name, customer_inn, customer_address,
    items, total_quantity, metadata 
  } = req.body;
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Вставляем заказ
    const orderResult = await client.query(
      `INSERT INTO orders (processing_id, doc_date, processing_date, customer_name, customer_inn, customer_address, total_quantity, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (processing_id) DO UPDATE SET
         doc_date = EXCLUDED.doc_date,
         processing_date = EXCLUDED.processing_date,
         customer_name = EXCLUDED.customer_name,
         customer_inn = EXCLUDED.customer_inn,
         customer_address = EXCLUDED.customer_address,
         total_quantity = EXCLUDED.total_quantity,
         metadata = EXCLUDED.metadata
       RETURNING id`,
      [processing_id, doc_date, processing_date, customer_name, customer_inn, customer_address, total_quantity, JSON.stringify(metadata)]
    );
    
    const orderId = orderResult.rows[0].id;
    
    // Удаляем старые items
    await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);
    
    // Вставляем новые items
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, name, ktru_code, quantity, category, characteristics)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, item.name, item.ktruCode, item.quantity, item.category, JSON.stringify(item.characteristics || [])]
      );
    }
    
    await client.query('COMMIT');
    res.json({ success: true, orderId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error saving order:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Удалить все заказы
app.delete('/api/orders', async (req, res) => {
  try {
    await pool.query('DELETE FROM order_items');
    await pool.query('DELETE FROM orders');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Инициализация БД (создание таблиц)
app.post('/api/init', async (req, res) => {
  try {
    // Создаем базу данных ktru если не существует
    const dbCheck = await pool.query(
      "SELECT 1 FROM pg_database WHERE datname = 'ktru_db'"
    );
    
    if (dbCheck.rows.length === 0) {
      await pool.query('CREATE DATABASE ktru_db');
      console.log('Database ktru_db created');
    }
    
    // Подключаемся к новой базе
    const appPool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'ktru_db',
      user: 'postgres',
      password: 'postgres',
    });
    
    // Создаем таблицы
    await appPool.query(`
      CREATE TABLE IF NOT EXISTS dictionary (
        category VARCHAR(100) NOT NULL,
        "fieldName" VARCHAR(255) NOT NULL,
        "isActive" BOOLEAN DEFAULT true,
        PRIMARY KEY (category, "fieldName")
      );
      
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        processing_id VARCHAR(100) UNIQUE NOT NULL,
        doc_date VARCHAR(50),
        processing_date BIGINT NOT NULL,
        customer_name TEXT,
        customer_inn VARCHAR(20),
        customer_address TEXT,
        total_quantity INTEGER,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        ktru_code VARCHAR(50),
        quantity INTEGER,
        category VARCHAR(100),
        characteristics JSONB
      );
      
      CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(processing_date);
      CREATE INDEX IF NOT EXISTS idx_orders_inn ON orders(customer_inn);
    `);
    
    await appPool.end();
    
    res.json({ success: true, message: 'Database initialized' });
  } catch (err) {
    console.error('Init error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
