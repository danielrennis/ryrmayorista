# 📦 Documentación: Sistema de Carrito Mayorista (Resiliente)

Este documento resume la estabilización y arquitectura final del sistema de pedidos mayoristas, implementado en Mayo de 2026.

## 🏗️ Arquitectura: "JSON-First Hybrid"
El sistema está diseñado para ser ultra-rápido y a prueba de fallos:
1.  **Carga Inicial**: Usa `catalog.json` para mostrar productos al instante.
2.  **Sincronización Supabase**: En segundo plano, se conecta a Supabase para obtener precios reales, stock y permitir pedidos.
3.  **Fail-Safe**: Si Supabase se cae, la web sigue funcionando como un catálogo estático.

## 🗄️ Esquema de Base de Datos (Supabase)

### Tabla `products`
*   `sku` (PK): Código único.
*   `name`: Nombre del producto.
*   `stock`: Cantidad disponible.
*   `price_mayorista`, `price_especial`, `price_super`, `price_distribuidor`.
*   `last_buy`: Fecha de última compra (Usa este para el ordenamiento).
*   `image_url`: Link a la foto.

### Tabla `profiles`
*   `id`: Vinculado a Auth.
*   `full_name`: Nombre del cliente.
*   `is_active`: (Boolean) Gatekeeper de acceso.
*   `is_admin`: (Boolean) Acceso a la consola.
*   `verification_code`: Código que Emanuel asigna al cliente.

### Tabla `orders`
*   `id`: UUID del pedido.
*   `user_id`: FK a `profiles`.
*   `items`: JSON con los productos pedidos.
*   `total`: Monto total.
*   `status`: 'pendiente' o 'vendido'.

## 🔐 Flujo de Seguridad (Búnker)
1.  **Registro**: El cliente se registra. El sistema crea su perfil automáticamente pero `is_active` es `false`.
2.  **Bloqueo**: El cliente no ve precios ni puede comprar hasta que ponga el código.
3.  **Activación**: 
    - Emanuel (Admin) ve al cliente en su consola.
    - Le asigna un código (ej: `RYR55`).
    - El cliente pone `RYR55` en su pantalla y se activa permanentemente.

## ⚙️ Mantenimiento: El CRON (`cron_stock.php`)
El script en la PC local hace todo el trabajo pesado:
1.  Lee el SQL Server local.
2.  Genera el `catalog.json`.
3.  Hace `UPSERT` en Supabase (actualiza todo sin duplicar).
4.  Hace `git push` del JSON para respaldo en la web.
*   **Nota**: Ya no intenta subir a Netlify, evitando corromper la build de Vite.

## 🛠️ Comandos de Emergencia (SQL)

### Confirmar todos los usuarios trabados:
```sql
UPDATE auth.users SET email_confirmed_at = now() WHERE email_confirmed_at IS NULL;
```

### Resetear perfiles y vincular Admin:
```sql
UPDATE public.profiles SET is_admin = true, is_active = true 
WHERE id IN (SELECT id FROM auth.users WHERE email = 'danielrennis@yahoo.com.ar');
```

---
*Documentación generada por Antigravity - Mayo 2026*
