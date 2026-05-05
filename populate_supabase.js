import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const supabaseUrl = 'https://mvbgtzofohhwhhnjqvvg.supabase.co'
const supabaseAnonKey = 'sb_publishable_peLMIIKIxRwtnUQrANQP-A_blz7vAth'
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function run() {
  console.log('🚀 Iniciando migración final (incluyendo nombres)...')
  const rawData = fs.readFileSync('./public/catalog.json', 'utf8')
  const json = JSON.parse(rawData)
  const products = json.products || []

  const CHUNK_SIZE = 100
  for (let i = 0; i < products.length; i += CHUNK_SIZE) {
    const chunk = products.slice(i, i + CHUNK_SIZE)
    const toInsert = chunk.map(p => ({
      sku: p.sku,
      name: p.name || p.sku, // AGREGADO: Nombre del producto
      price_mayorista: parseFloat(p.prices?.Mayorista || 0),
      price_especial: parseFloat(p.prices?.['Especial Mayorista'] || 0),
      price_super: parseFloat(p.prices?.['Super Especial'] || 0),
      price_distribuidor: parseFloat(p.prices?.Distribuidor || 0),
      image_url: (p.imageUrls && p.imageUrls[0]) || null,
      stock: parseInt(p.stock || 0),
      updated_at: new Date().toISOString()
    }))

    await supabase.from('products').upsert(toInsert, { onConflict: 'sku' })
    console.log(`✅ Bloque ${i} procesado.`)
  }
  console.log('✨ Migración final completada.')
}
run()
