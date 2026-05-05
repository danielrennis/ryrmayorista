import { login, signUp, signOut, getSession } from './auth'
import { createIcons, LayoutGrid, Clock, User, Search, ShoppingCart, LogOut, CheckCircle, ShieldCheck } from 'lucide'
import { supabase } from './supabase'

// --- STATE ---
const state = {
  products: [],
  catalogCache: {}, // Cache para guardar nombres/precios de productos fuera de la página actual
  cart: JSON.parse(localStorage.getItem('ryr_cart_v2') || '{}'),
  user: null,
  profile: null,
  tier: 'Mayorista',
  query: '',
  loading: true,
  page: 0,
  pageSize: 50,
  hasMore: true,
  isFallback: true
}

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0
})

const $ = (id) => document.getElementById(id)
let els = {}

function getEls() {
  return {
    grid: $('main-grid'),
    search: $('txt-search'),
    cartDrawer: $('cart-drawer'),
    authModal: $('auth-modal'),
    historyDrawer: $('history-drawer'),
    cartItems: $('cart-items'),
    cartTotal: $('cart-total'),
    cartCount: $('cart-count'),
    tierSelect: $('sel-tier'),
    userEmail: $('user-email-display'),
    loggedUi: $('auth-logged'),
    unloggedUi: $('auth-unlogged'),
    adminBtn: $('btn-admin'),
    adminDrawer: $('admin-drawer'),
    adminContent: $('admin-content')
  }
}

// --- INITIALIZATION ---
async function init() {
  els = getEls()
  try { createIcons({ icons: { LayoutGrid, Clock, User, Search, ShoppingCart, LogOut, CheckCircle, ShieldCheck } }) } catch (e) {}

  await fetchJsonFallback()
  state.loading = false
  render()
  renderCart()
  setupEvents()

  supabase.auth.onAuthStateChange(async (event, session) => {
    state.user = session?.user || null
    if (state.user) await fetchProfile(state.user.id)
    updateAuthUi()
    render()
    renderCart()
  })

  setTimeout(async () => {
    const ok = await fetchProducts()
    if (ok) { state.isFallback = false; render(); }
  }, 1000)
}

async function fetchProducts(append = false) {
  try {
    const from = state.page * state.pageSize
    const to = from + state.pageSize - 1
    const { data, error } = await supabase.from('products').select('*').order('last_buy', { ascending: false, nullsFirst: false }).range(from, to)
    if (error) throw error
    
    const mapped = (data || []).map(p => {
      const item = {
        sku: p.sku, name: p.name || p.sku, 
        prices: { 'Mayorista': p.price_mayorista || 0, 'Especial Mayorista': p.price_especial || 0, 'Súper Especial': p.price_super || 0, 'Distribuidor': p.price_distribuidor || 0 },
        img: p.image_url || '/logo.png'
      }
      state.catalogCache[p.sku] = item // Alimentamos la cache
      return item
    })

    if (append) state.products = [...state.products, ...mapped]
    else state.products = mapped
    state.hasMore = mapped.length === state.pageSize
    return true
  } catch (e) { return false }
}

async function fetchJsonFallback() {
  try {
    const res = await fetch('/catalog.json')
    const json = await res.json()
    let raw = json.products || json
    raw.sort((a, b) => (new Date(b.lastBuy || 0) - new Date(a.lastBuy || 0)))
    state.products = raw.map(p => {
      const item = { sku: p.sku, name: p.name || p.sku, prices: p.prices, img: (p.imageUrls && p.imageUrls[0]) || '/logo.png' }
      state.catalogCache[p.sku] = item
      return item
    })
    state.hasMore = false
    state.isFallback = true
  } catch (e) {}
}

async function fetchProfile(uid) {
  const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
  if (data) {
    state.profile = data
    if (data.assigned_tier) state.tier = data.assigned_tier
  }
}

function updateAuthUi() {
  if (!els.loggedUi) return
  if (state.user) {
    els.unloggedUi.classList.add('hidden'); els.loggedUi.classList.remove('hidden')
    els.userEmail.textContent = state.user.email
    if (state.profile?.is_admin) els.adminBtn.classList.remove('hidden')
  } else {
    els.unloggedUi.classList.remove('hidden'); els.loggedUi.classList.add('hidden'); els.adminBtn.classList.add('hidden')
  }
}

function render() {
  if (!els.grid) return
  const q = state.query.toLowerCase()
  const filtered = state.products.filter(p => (p.sku + p.name).toLowerCase().includes(q))
  els.grid.innerHTML = filtered.map(p => {
    const price = p.prices[state.tier] || p.prices['Mayorista'] || 0
    const qty = state.cart[p.sku] || 0
    const isDist = (p.prices['Distribuidor'] || 0) > 0
    return `
      <div class="card ${isDist ? 'is-dist' : ''}">
        ${isDist ? '<div class="dist-label">DISTRIBUIDOR</div>' : ''}
        <div class="img"><img src="${p.img || '/logo.png'}" onerror="this.src='/logo.png'"></div>
        <div class="body">
          <div class="name">${p.name}</div>
          ${state.user ? `<div class="price">${ARS.format(price)}</div>` : `<div class="price" onclick="$('auth-modal').classList.add('show')" style="cursor:pointer; font-size:12px; color:var(--muted);">Ver precios</div>`}
          
          ${isDist && state.user ? `<div style="font-size:11px; color:var(--accent); font-weight:700; margin-top:4px; opacity:0.8;">Lista Distribuidor: ${ARS.format(p.prices['Distribuidor'])}</div>` : ''}

          <div class="controls">
            ${state.user ? `
              <div class="qty-box"><button class="qty-btn" onclick="window.modQty('${p.sku}', -1)">-</button><span class="qty-val">${qty}</span><button class="qty-btn" onclick="window.modQty('${p.sku}', 1)">+</button></div>
              <button class="btn-add" onclick="window.modQty('${p.sku}', 1)">SUMAR</button>
            ` : `<button class="btn-add" onclick="$('auth-modal').classList.add('show')">INGRESAR</button>`}
          </div>
        </div>
      </div>
    `
  }).join('')

  if (state.hasMore && !state.isFallback && state.query.length === 0) {
    els.grid.innerHTML += `<div style="grid-column:1/-1; text-align:center; padding:20px;"><button id="btn-load-more" class="tile" style="margin:0 auto; cursor:pointer; font-weight:800; padding:0 40px;">VER MÁS</button></div>`
    setTimeout(() => { if($('btn-load-more')) $('btn-load-more').onclick = window.loadMore }, 10)
  }
}

async function renderCart() {
  if (!els.cartItems) return
  let total = 0, count = 0
  const skus = Object.keys(state.cart)
  
  // Buscar SKUs faltantes en la base de datos para el carrito
  const missing = skus.filter(s => !state.catalogCache[s])
  if (missing.length > 0 && !state.isFallback) {
    const { data } = await supabase.from('products').select('*').in('sku', missing)
    if (data) data.forEach(p => {
      state.catalogCache[p.sku] = { sku: p.sku, name: p.name || p.sku, img: p.image_url, prices: { 'Mayorista': p.price_mayorista || 0, 'Especial Mayorista': p.price_especial || 0, 'Súper Especial': p.price_super || 0, 'Distribuidor': p.price_distribuidor || 0 } }
    })
  }

  const html = Object.entries(state.cart).map(([sku, qty]) => {
    const p = state.catalogCache[sku]
    if (!p) return ''
    const pr = p.prices[state.tier] || p.prices['Mayorista'] || 0
    total += pr * qty; count += qty
    return `<div style="display:flex; gap:10px; padding:10px; border-bottom:1px solid var(--line); font-size:12px;">
      <img src="${p.img || '/logo.png'}" style="width:40px; height:40px; object-fit:contain; background:white;">
      <div style="flex:1;"><b>${p.name}</b><br><span style="color:var(--accent); font-weight:800;">${qty} x ${ARS.format(pr)}</span></div>
      <button onclick="window.modQty('${sku}', -999)" style="background:none; border:none; cursor:pointer; font-size:18px;">&times;</button>
    </div>`
  }).join('')
  
  els.cartItems.innerHTML = html || '<p style="text-align:center; padding:40px;">Vacío</p>'
  els.cartTotal.textContent = ARS.format(total)
  els.cartCount.textContent = count
  localStorage.setItem('ryr_cart_v2', JSON.stringify(state.cart))
}

function setupEvents() {
  els.search.oninput = async (e) => {
    state.query = e.target.value
    if (state.query.length === 0) { if(!state.isFallback){ state.page = 0; await fetchProducts(); } render(); }
    else if (state.query.length > 2 && !state.isFallback) {
      const { data } = await supabase.from('products').select('*').or(`sku.ilike.%${state.query}%,name.ilike.%${state.query}%`).limit(50)
      if (data) {
        state.products = data.map(p => {
          const item = { sku: p.sku, name: p.name || p.sku, img: p.image_url || '/logo.png', prices: { 'Mayorista': p.price_mayorista || 0, 'Especial Mayorista': p.price_especial || 0, 'Súper Especial': p.price_super || 0, 'Distribuidor': p.price_distribuidor || 0 } }
          state.catalogCache[p.sku] = item
          return item
        })
        state.hasMore = false; render()
      }
    } else { render() }
  }

  $('btn-open-login').onclick = () => els.authModal.classList.add('show')
  
  // Navegación interna del Login/Registro
  $('go-register').onclick = (e) => { e.preventDefault(); $('login-form').classList.add('hidden'); $('register-form').classList.remove('hidden'); }
  $('go-login').onclick = (e) => { e.preventDefault(); $('register-form').classList.add('hidden'); $('login-form').classList.remove('hidden'); }

  $('btn-history').onclick = async () => {
    if (!state.user) return alert('Iniciá sesión')
    els.historyDrawer.classList.add('show')
    const { data } = await supabase.from('orders').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false })
    
    // Pre-cargar nombres de productos del historial si no están en cache
    const allSkusInHistory = [...new Set((data || []).flatMap(o => Object.keys(o.items)))]
    const missing = allSkusInHistory.filter(s => !state.catalogCache[s])
    if (missing.length > 0 && !state.isFallback) {
       const { data: pData } = await supabase.from('products').select('*').in('sku', missing)
       if (pData) pData.forEach(p => {
         state.catalogCache[p.sku] = { sku: p.sku, name: p.name || p.sku, img: p.image_url, prices: { 'Mayorista': p.price_mayorista || 0, 'Especial Mayorista': p.price_especial || 0, 'Súper Especial': p.price_super || 0, 'Distribuidor': p.price_distribuidor || 0 } }
       })
    }

    $('history-content').innerHTML = (data || []).map(o => `
      <div class="history-card" style="padding:15px; border-bottom:1px solid var(--line);">
        <div style="display:flex; justify-content:space-between; align-items:start;">
          <div><b>Pedido #${o.id.slice(0,6)}</b><br><small>${new Date(o.created_at).toLocaleDateString()}</small></div>
          <div style="text-align:right;">
            <div style="font-weight:800; color:var(--accent);">${ARS.format(o.total)}</div>
            <div style="display:flex; gap:10px; margin-top:8px; justify-content:flex-end;">
              <button class="btn-ghost" onclick="window.reOpenOrder('${o.id}')" style="padding:4px 8px; font-size:11px;">RE-EDITAR</button>
              <button class="btn-ghost" onclick="window.deleteOrder('${o.id}')" style="padding:4px 8px; font-size:11px; color:red;">BORRAR</button>
            </div>
          </div>
        </div>
        <details style="margin-top:10px; font-size:12px; color:var(--muted);">
          <summary style="cursor:pointer; font-weight:700;">Ver detalle de productos</summary>
          <div style="padding-top:8px;">
            ${Object.entries(o.items).map(([sku, q]) => `• ${q} x ${state.catalogCache[sku]?.name || sku}<br>`).join('')}
          </div>
        </details>
      </div>
    `).join('') || '<p style="text-align:center; padding:20px;">No hay pedidos</p>'
  }

  els.adminBtn.onclick = () => { els.adminDrawer.classList.add('show'); renderAdminOrders(); }
  $('admin-tab-orders').onclick = () => { $('admin-tab-orders').classList.add('primary'); $('admin-tab-users').classList.remove('primary'); renderAdminOrders(); }
  $('admin-tab-users').onclick = () => { $('admin-tab-users').classList.add('primary'); $('admin-tab-orders').classList.remove('primary'); renderAdminUsers(); }

  document.querySelectorAll('.btn-close, .mask').forEach(b => {
    b.onclick = () => { els.cartDrawer.classList.remove('show'); els.authModal.classList.remove('show'); els.historyDrawer.classList.remove('show'); els.adminDrawer.classList.remove('show'); }
  })

  $('btn-do-login').onclick = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: $('login-email').value, password: $('login-pass').value })
    if (error) alert('Error: ' + error.message)
  }

  $('btn-do-register').onclick = async () => {
    const email = $('reg-email').value
    const pass = $('reg-pass').value
    const name = $('reg-name').value
    const dni = $('reg-dni').value
    if (!email || !pass || !name) return alert('Completá todos los campos')
    
    const { data, error } = await signUp(email, pass, { full_name: name, dni_cuit: dni })
    if (error) return alert(error.message)
    
    alert('✅ Solicitud enviada. Pedile tu código de activación a Emanuel.')
    $('register-form').classList.add('hidden')
    $('activation-form').classList.remove('hidden')
  }

  $('btn-logout').onclick = async () => { await signOut(); location.reload(); }

  $('btn-checkout').onclick = async () => {
    if (!state.user) return alert('Iniciá sesión')
    const total = Object.entries(state.cart).reduce((s, [sku, q]) => {
      const p = state.catalogCache[sku]
      return s + ((p?.prices[state.tier] || 0) * q)
    }, 0)
    const { data, error } = await supabase.from('orders').insert({ user_id: state.user.id, total, items: state.cart }).select().single()
    if (error) return alert(error.message)
    const waUrl = `https://api.whatsapp.com/send?phone=5493624250452&text=${encodeURIComponent(`Soy ${state.profile?.full_name || 'Cliente'}. Confirmé el pedido #${data.id.slice(0,6)} por ${ARS.format(total)}`)}`
    
    // Limpiamos UI primero
    state.cart = {}
    renderCart()
    render()
    els.cartDrawer.classList.remove('show')
    
    // Abrimos WhatsApp
    window.open(waUrl, '_blank')
    
    setTimeout(() => {
      alert('✅ ¡Pedido guardado y enviado a WhatsApp!')
    }, 500)
  }
}

window.loadMore = async () => { state.page++; await fetchProducts(true); render(); }
window.modQty = (sku, delta) => {
  const c = state.cart[sku] || 0
  if (c + delta <= 0) delete state.cart[sku]
  else state.cart[sku] = c + delta
  renderCart(); render();
}

window.deleteOrder = async (id) => { if (confirm('¿Eliminar?')) { await supabase.from('orders').delete().eq('id', id); $('btn-history').click(); } }
window.reOpenOrder = async (id) => {
  const { data } = await supabase.from('orders').select('items').eq('id', id).single()
  if (data) { 
    state.cart = { ...state.cart, ...data.items }; 
    await renderCart(); 
    render(); 
    els.historyDrawer.classList.remove('show'); 
    els.cartDrawer.classList.add('show'); 
  }
}

async function renderAdminOrders() {
  const { data } = await supabase.from('orders').select('*, profiles(full_name)').order('created_at', { ascending: false })
  els.adminContent.innerHTML = `
    <table style="width:100%; font-size:12px; border-collapse:collapse;">
      ${(data || []).map(o => `
        <tr style="border-bottom:1px solid var(--line);">
          <td style="padding:10px;"><b>${o.profiles?.full_name || 'Cliente'}</b></td>
          <td style="padding:10px;">${ARS.format(o.total)}</td>
          <td style="padding:10px;"><details><summary style="cursor:pointer; color:var(--accent);">Items</summary>${Object.entries(o.items).map(([s,q])=>`• ${q}x ${state.catalogCache[s]?.name || s}<br>`).join('')}</details></td>
        </tr>
      `).join('')}
    </table>
  `
}

async function renderAdminUsers() {
  const { data } = await supabase.from('profiles').select('*').eq('is_active', false)
  els.adminContent.innerHTML = (data || []).map(u => `
    <div class="tile" style="height:auto; padding:15px; flex-direction:column; align-items:start; gap:10px;">
      <b>${u.full_name}</b> (${u.dni_cuit})
      <div style="display:flex; gap:10px; width:100%;">
        <input id="vcode-${u.id}" placeholder="Código" class="auth-btn" style="flex:1; height:32px;">
        <button class="btn-add" onclick="window.activateUser('${u.id}')" style="height:32px;">ACTIVAR</button>
      </div>
    </div>
  `).join('') || '<p>No hay clientes pendientes</p>'
}

window.activateUser = async (uid) => {
  const code = $(`vcode-${uid}`).value
  if (!code) return alert('Asigná un código')
  await supabase.from('profiles').update({ verification_code: code, is_active: true }).eq('id', uid)
  alert('Activado!'); renderAdminUsers();
}

init()
