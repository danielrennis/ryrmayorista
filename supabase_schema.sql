-- 1. Table for products (optional if you want to keep catalog.json, but better for updates)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  prices JSONB,
  stock INTEGER DEFAULT 0,
  image_urls TEXT[],
  last_buy TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON products FOR SELECT USING (true);

-- 2. Table for orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  total NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, confirmed, shipped
  client_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own orders" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own orders" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. Table for order items
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT, -- Can be SKU or product.id
  quantity INTEGER NOT NULL,
  price_at_time NUMERIC NOT NULL
);

-- Enable RLS for order items
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own order items" ON order_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_id AND orders.user_id = auth.uid()
  )
);
CREATE POLICY "Users can create their own order items" ON order_items FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_id AND orders.user_id = auth.uid()
  )
);
