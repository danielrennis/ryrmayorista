-- Paso 1: Tabla de Productos Liviana
-- Solo guardamos SKU, Precios y el link a la imagen externa para no sobrecargar Supabase.
CREATE TABLE products (
  sku TEXT PRIMARY KEY,
  price_mayorista NUMERIC DEFAULT 0,
  price_especial NUMERIC DEFAULT 0,
  price_super NUMERIC DEFAULT 0,
  price_distribuidor NUMERIC DEFAULT 0,
  image_url TEXT, -- Link a tu web externa
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Paso 2: Perfiles de Usuario para el registro
-- Incluye validación por parte del vendedor Emanuel.
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  full_name TEXT NOT NULL,
  dni_cuit TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  is_active BOOLEAN DEFAULT FALSE, -- Emanuel debe activarlo localmente primero
  verification_code TEXT, -- El código que Emanuel le da al cliente
  assigned_tier TEXT DEFAULT 'Mayorista', -- Lista de precios asignada
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS (Seguridad)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Read Products" ON products FOR SELECT USING (true);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Tabla de Pedidos (Historial)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  total NUMERIC NOT NULL,
  status TEXT DEFAULT 'pendiente',
  items JSONB, -- Guardamos el detalle del carrito aquí
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see their own orders" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create orders" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);
