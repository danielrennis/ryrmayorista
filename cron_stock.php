<?php
/**
 * Cron Script Final Blindado - RyR Computación
 * Generación de JSON y Auto-Deploy a Netlify con seguridad de rutas.
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);
$t_start = microtime(true);

// 1. SEGURIDAD DE RUTA: Nos movemos a la carpeta donde vive este archivo
chdir(__DIR__);
date_default_timezone_set('America/Argentina/Buenos_Aires');

// CREDENCIALES
$user = "ryr";
$pass = "ryr10.*-";
$dbName = "pruebaryr"; 

$sucursales_config = array(
    'Central'    => 'serverres.dyndns.org',
    'Deposito'   => 'serverpe.dyndns.org',
    'Corrientes' => 'servercor.dyndns.org',
    'Formosa'    => 'serverfor.dyndns.org'
);

$netlify_token = 'nfp_d9eXhfEPnDcoKiSdbnKtyt6P2FyLbAZxe3bb';
$netlify_site_id = '9d65dbc7-828e-4848-9594-ced1bcc2bd94';

// CONFIGURACIÓN SUPABASE (Paso 1)
$supabase_url = 'https://mvbgtzofohhwhhnjqvvg.supabase.co'; 
$supabase_key = 'sb_publishable_peLMIIKIxRwtnUQrANQP-A_blz7vAth';

$catalog_master = array();

foreach ($sucursales_config as $nombre_suc => $host) {
    $connectionInfo = array(
        "Database" => $dbName, "UID" => $user, "PWD" => $pass, 
        "CharacterSet" => "UTF-8", "LoginTimeout" => 5
    );

    $conn = sqlsrv_connect($host, $connectionInfo);
    if ($conn) {
        $sql = "SELECT p.ProCodigo, p.ProCodBar, p.ProDescripcion, p.ProStockActual, 
                       p.Categoria, p.Fabricante, p.ProFecha, p.ProFechaUActualizacion,
                       ISNULL((SELECT TOP 1 pl.Importe FROM ProductoLista pl INNER JOIN ListaPrecio l ON pl.IdLista = l.IdLista WHERE pl.IdProducto = p.ProCodigo AND l.Nombre = 'Mayorista'), 0) AS PreMayorista,
                       ISNULL((SELECT TOP 1 pl.Importe FROM ProductoLista pl INNER JOIN ListaPrecio l ON pl.IdLista = l.IdLista WHERE pl.IdProducto = p.ProCodigo AND l.Nombre LIKE '%Especial Mayorista%'), 0) AS PreEspMayorista,
                       ISNULL((SELECT TOP 1 pl.Importe FROM ProductoLista pl INNER JOIN ListaPrecio l ON pl.IdLista = l.IdLista WHERE pl.IdProducto = p.ProCodigo AND l.Nombre LIKE '%Super Especial%'), 0) AS PreSupEspecial,
                       ISNULL((SELECT TOP 1 pl.Importe FROM ProductoLista pl INNER JOIN ListaPrecio l ON pl.IdLista = l.IdLista WHERE pl.IdProducto = p.ProCodigo AND l.Nombre = 'Distribuidor'), 0) AS PreDistribuidor
                FROM Productos p 
                WHERE p.ProStockActual > 0 
                  AND (p.ProBaja = 0 OR p.ProBaja IS NULL)
                  AND p.ProSAsociado <> 0";
        $query = sqlsrv_query($conn, $sql);
        if ($query) {
            while ($row = sqlsrv_fetch_array($query, SQLSRV_FETCH_ASSOC)) {
                $sku = trim($row['ProCodigo']);
                
                // Formateo de fechas
                $fechaStr = "";
                if ($row['ProFecha'] instanceof DateTime) {
                    $fechaStr = $row['ProFecha']->format('Y-m-d');
                } elseif (!empty($row['ProFecha'])) {
                    $fechaStr = substr($row['ProFecha'], 0, 10);
                }

                $fechaUpdateStr = "";
                if ($row['ProFechaUActualizacion'] instanceof DateTime) {
                    $fechaUpdateStr = $row['ProFechaUActualizacion']->format('Y-m-d H:i:s');
                } elseif (!empty($row['ProFechaUActualizacion'])) {
                    $fechaUpdateStr = substr($row['ProFechaUActualizacion'], 0, 19);
                }

                // Usamos exclusivamente ProFechaUActualizacion para el orden del catálogo
                $sortDate = $fechaUpdateStr;

                if (!isset($catalog_master[$sku])) {
                    $catalog_master[$sku] = array(
                        "id" => (string)$sku, "sku" => (string)$sku,
                        "name" => trim($row['ProDescripcion']),
                        "prices" => array(
                            "Mayorista" => (string)round($row['PreMayorista'], 0),
                            "Especial Mayorista" => (string)round($row['PreEspMayorista'], 0),
                            "Super Especial" => (string)round($row['PreSupEspecial'], 0),
                            "Distribuidor" => (string)round($row['PreDistribuidor'], 0)
                        ),
                        "stocks" => array("Deposito"=>"0", "Corrientes"=>"0", "Formosa"=>"0", "Central"=>"0"),
                        "stock" => "0",
                        "imageUrls" => array("https://www.mink.com.ar/qloud/ryr/fotos/" . $sku . "-0.jpg"),
                        "brand" => isset($row['Fabricante']) ? trim($row['Fabricante']) : "NINGUNO",
                        "category" => isset($row['Categoria']) ? trim($row['Categoria']) : "Computacion",
                        "ean" => isset($row['ProCodBar']) ? trim($row['ProCodBar']) : "SinCodigo",
                        "lastBuy" => $sortDate
                    );
                } else {
                    // Si ya existe de otra sucursal, nos quedamos con la fecha de modificación más reciente
                    if (strcmp($sortDate, $catalog_master[$sku]["lastBuy"]) > 0) {
                        $catalog_master[$sku]["lastBuy"] = $sortDate;
                    }
                }
                $unidades = (int)$row['ProStockActual'];
                $catalog_master[$sku]['stocks'][$nombre_suc] = (string)$unidades;
                $catalog_master[$sku]['stock'] = (string)((int)$catalog_master[$sku]['stock'] + $unidades);
            }
        }
        sqlsrv_close($conn);
    }
}

// Ordenar por fecha descendente
$products_array = array_values($catalog_master);
usort($products_array, function($a, $b) { 
    return strcmp($b['lastBuy'], $a['lastBuy']); 
});

// Guardar JSON
$output = array("products" => $products_array);
$json_data = json_encode($output, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
file_put_contents(__DIR__ . '/catalog.json', $json_data);
echo "JSON generado en: " . __DIR__ . PHP_EOL;

// --- SINCRONIZACIÓN CON SUPABASE (Paso 1) ---
echo "Sincronizando productos livianos con Supabase..." . PHP_EOL;
$supabase_items = array();
foreach ($products_array as $p) {
    $supabase_items[] = array(
        "sku" => $p['sku'],
        "name" => $p['name'],
        "price_mayorista" => (float)$p['prices']['Mayorista'],
        "price_especial" => (float)$p['prices']['Especial Mayorista'],
        "price_super" => (float)$p['prices']['Super Especial'],
        "price_distribuidor" => (float)$p['prices']['Distribuidor'],
        "image_url" => $p['imageUrls'][0],
        "stock" => (int)$p['stock'],
        "last_buy" => $p['lastBuy'] ? date('c', strtotime($p['lastBuy'])) : null,
        "updated_at" => date('c')
    );
}

// Subimos de a 100 para no saturar
$chunks = array_chunk($supabase_items, 100);
foreach ($chunks as $chunk) {
    $ch = curl_init($supabase_url . "/rest/v1/products");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($chunk));
    curl_setopt($ch, CURLOPT_HTTPHEADER, array(
        'apikey: ' . $supabase_key,
        'Authorization: Bearer ' . $supabase_key,
        'Content-Type: application/json',
        'Prefer: resolution=merge-duplicates' // Esto hace el UPSERT (actualiza si existe, inserta si no)
    ));
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($httpCode >= 200 && $httpCode < 300) {
        echo ".";
    } else {
        echo "E($httpCode)";
    }
}
echo PHP_EOL . "Sincronización Supabase finalizada." . PHP_EOL;

// --- SINCRONIZACIÓN CON GITHUB (Para actualizar el JSON de respaldo en la web) ---
echo "Subiendo catalog.json al repositorio..." . PHP_EOL;
shell_exec("git add public/catalog.json"); // Aseguramos que apunte a public/
shell_exec("git commit -m 'Cron: Actualización automática de stock y precios'");
$push_output = shell_exec("git push origin main 2>&1");
echo $push_output . PHP_EOL;

// --- FIN DEL PROCESO ---
echo PHP_EOL . "Proceso finalizado a las: " . date('H:i:s') . PHP_EOL;
$t_end = microtime(true);
$t_total = round($t_end - $t_start, 2);
echo "Tiempo total transcurrido: " . $t_total . " segundos." . PHP_EOL;

// PAUSA PARA QUE LA VENTANA NO SE CIERRE (CMD/Terminal)
echo PHP_EOL . "------------------------------------------------" . PHP_EOL;
echo "Presione ENTER para salir..." . PHP_EOL;
fgets(STDIN);