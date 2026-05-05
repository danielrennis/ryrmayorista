import { login, signUp, signOut, getSession } from './auth'
import { createIcons, LayoutGrid, Clock, User, Search, ShoppingCart, LogOut, CheckCircle, ShieldCheck } from 'lucide'
import { supabase } from './supabase'

// --- STATE ---
const state = {
  products: [],
  catalogCache: {},
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
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0
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
    console.log('👤 Auth Change:', event, state.user?.email)
    
    if (state.user) {
      await fetchProfile(state.user.id)
      
      // AUTO-SANACIÓN: Si no existe el perfil, lo creamos de emergencia
      if (!state.profile) {
        console.log('🛠 Creando perfil de emergencia...')
        const { data: newProf } = await supabase.from('profiles').insert({
          id: state.user.id,
          full_name: state.user.user_metadata?.full_name || state.user.email,
          dni_cuit: state.user.user_metadata?.dni_cuit || '',
          is_active: false
        }).select().single()
        state.profile = newProf
      }

      if (state.profile && !state.profile.is_active) {
        els.authModal.classList.add('show')
        showAuthForm('activation-form')
      } else {
        els.authModal.classList.remove('show')
      }
    }
    updateAuthUi()
    render()
    renderCart()
  })

  setTimeout(async () => {
    const ok = await fetchProducts()
    if (ok) { state.isFallback = false; render(); }
  }, 1000)
}

function showAuthForm(id) {
  ['login-form', 'register-form', 'activation-form'].forEach(f => {
    if ($(f)) $(f).classList.add('hidden')
  })
  if ($(id)) $(id).classList.remove('hidden')
}

async function fetchProducts(append = false) {
  try {
    const from = state.page * state.pageSize
    const to = from + state.pageSize - 1
    const { data, error } = await supabase.from('products').select('*').order('last_buy', { ascending: false, nullsFirst: false }).range(from, to)
    if (error) throw error
    const mapped = (data || []).map(p => {
      const item = { sku: p.sku, name: p.name || p.sku, prices: { 'Mayorista': p.price_mayorista || 0, 'Especial Mayorista': p.price_especial || 0, 'Súper Especial': p.price_super || 0, 'Distribuidor': p.price_distribuidor || 0 }, img: p.image_url || '/logo.png' }
      state.catalogCache[p.sku] = item
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
    state.hasMore = false; state.isFallback = true
  } catch (e) {}
}

async function fetchProfile(uid) {
  const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
  state.profile = data || null
  if (data && data.assigned_tier) state.tier = data.assigned_tier
}

function updateAuthUi() {
  if (!els.loggedUi) return
  if (state.user && state.profile?.is_active) {
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
          ${state.user && state.profile?.is_active ? `<div class="price">${ARS.format(price)}</div>` : `<div class="price" onclick="$('auth-modal').classList.add('show')" style="cursor:pointer; font-size:12px; color:var(--muted);">Ingresá para ver precios</div>`}
          
          ${isDist && state.user && state.profile?.is_active ? `<div style="font-size:11px; color:var(--accent); font-weight:700; margin-top:4px; opacity:0.8;">Lista Distribuidor: ${ARS.format(p.prices['Distribuidor'])}</div>` : ''}

          <div class="controls">
            ${state.user && state.profile?.is_active ? `
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
  const missing = Object.keys(state.cart).filter(s => !state.catalogCache[s])
  if (missing.length > 0 && !state.isFallback) {
    const { data } = await supabase.from('products').select('*').in('sku', missing)
    if (data) data.forEach(p => { state.catalogCache[p.sku] = { sku: p.sku, name: p.name || p.sku, img: p.image_url, prices: { 'Mayorista': p.price_mayorista || 0, 'Especial Mayorista': p.price_especial || 0, 'Súper Especial': p.price_super || 0, 'Distribuidor': p.price_distribuidor || 0 } } })
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
  els.cartTotal.textContent = ARS.format(total); els.cartCount.textContent = count
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

  els.tierSelect.onchange = (e) => { state.tier = e.target.value; render(); renderCart(); }
  $('btn-cart').onclick = () => { els.cartDrawer.classList.add('show'); renderCart(); }
  $('btn-open-login').onclick = () => { els.authModal.classList.add('show'); showAuthForm('login-form'); }
  
  // Navegación Auth
  $('go-register').onclick = (e) => { e.preventDefault(); showAuthForm('register-form'); }
  $('go-login').onclick = (e) => { e.preventDefault(); showAuthForm('login-form'); }

  $('btn-history').onclick = async () => {
    if (!state.user) return alert('Iniciá sesión')
    els.historyDrawer.classList.add('show')
    const { data } = await supabase.from('orders').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false })
    const allSkusInHistory = [...new Set((data || []).flatMap(o => Object.keys(o.items)))]
    const missing = allSkusInHistory.filter(s => !state.catalogCache[s])
    if (missing.length > 0 && !state.isFallback) {
       const { data: pData } = await supabase.from('products').select('*').in('sku', missing)
       if (pData) pData.forEach(p => { state.catalogCache[p.sku] = { sku: p.sku, name: p.name || p.sku, img: p.image_url, prices: { 'Mayorista': p.price_mayorista || 0, 'Especial Mayorista': p.price_especial || 0, 'Súper Especial': p.price_super || 0, 'Distribuidor': p.price_distribuidor || 0 } } })
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
        <details style="margin-top:10px; font-size:12px; color:var(--muted);"><summary style="cursor:pointer; font-weight:700;">Ver detalle de productos</summary><div style="padding-top:8px;">${Object.entries(o.items).map(([sku, q]) => `• ${q} x ${state.catalogCache[sku]?.name || sku}<br>`).join('')}</div></details>
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
    const email = $('reg-email').value, pass = $('reg-pass').value, name = $('reg-name').value, dni = $('reg-dni').value
    if (!email || !pass || !name) return alert('Completá todos los campos')
    const btn = $('btn-do-register')
    const oldText = btn.textContent; btn.textContent = 'PROCESANDO...'; btn.disabled = true
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Tiempo de espera agotado.')), 10000))
      await Promise.race([signUp(email, pass, { full_name: name, dni_cuit: dni }), timeout])
      alert('✅ Solicitud enviada. Pedile tu código de activación a Emanuel.')
      showAuthForm('activation-form')
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      btn.textContent = oldText; btn.disabled = false
    }
  }

  $('btn-do-activate').onclick = async () => {
    const code = $('activate-code').value.trim().toUpperCase() // Convertimos a Mayúsculas
    if (!code) return alert('Ingresá el código')
    
    console.log('🔐 Intentando activar con código:', code)
    
    // Verificamos si el código coincide (buscando en mayúsculas también en la DB)
    const { data, error } = await supabase.from('profiles')
      .select('id, verification_code')
      .eq('id', state.user.id)
      .maybeSingle()
    
    const dbCode = (data?.verification_code || '').trim().toUpperCase()
    
    if (error || !data || dbCode !== code) {
      return alert('Código incorrecto. Verificá con Emanuel.')
    }
    
    // Si coincide, lo activamos
    const { error: upErr } = await supabase.from('profiles').update({ is_active: true }).eq('id', state.user.id)
    if (upErr) return alert(upErr.message)
    
    alert('🎉 ¡Cuenta activada! Ya podés ver los precios y comprar.')
    location.reload()
  }

  $('btn-wa-emanuel').onclick = () => {
    window.open('https://wa.me/5493624250452?text=Hola%20Emanuel,%20necesito%20mi%20código%20de%20acceso%20para%20el%20carrito.', '_blank')
  }

  $('btn-logout').onclick = async () => { await signOut(); location.reload(); }

  $('btn-checkout').onclick = async () => {
    if (!state.user) return alert('Iniciá sesión')
    if (Object.keys(state.cart).length === 0) return alert('El carrito está vacío')
    
    const total = Object.entries(state.cart).reduce((s, [sku, q]) => {
      const p = state.catalogCache[sku]
      return s + ((p?.prices[state.tier] || 0) * q)
    }, 0)
    
    const { data, error } = await supabase.from('orders').insert({ 
      user_id: state.user.id, 
      total, 
      items: state.cart 
    }).select().single()
    
    if (error) {
      console.error('❌ Error al guardar pedido:', error)
      return alert('Error al guardar pedido: ' + error.message)
    }
    
    const waUrl = `https://api.whatsapp.com/send?phone=5493624250452&text=${encodeURIComponent(`Soy ${state.profile?.full_name || 'Cliente'}. Confirmé el pedido #${data.id.slice(0,6)} por ${ARS.format(total)}`)}`
    
    window.open(waUrl, '_blank')
    
    state.cart = {}
    renderCart()
    render()
    els.cartDrawer.classList.remove('show')
    setTimeout(() => alert('✅ ¡Pedido guardado y enviado a WhatsApp!'), 500)
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
  if (data) { state.cart = { ...state.cart, ...data.items }; await renderCart(); render(); els.historyDrawer.classList.remove('show'); els.cartDrawer.classList.add('show'); }
}

async function renderAdminOrders() {
  const { data, error } = await supabase.from('orders').select('*, profiles(full_name)').order('created_at', { ascending: false })
  if (error) return els.adminContent.innerHTML = `<p>Error: ${error.message}</p>`
  
  els.adminContent.innerHTML = `<table style="width:100%; font-size:12px; border-collapse:collapse;">${(data || []).map(o => `
    <tr style="border-bottom:1px solid var(--line); ${o.status === 'vendido' ? 'opacity:0.5; background:#f9f9f9;' : ''}">
      <td style="padding:10px;">
        <b>${o.profiles?.full_name || 'Sin Nombre'}</b>
        ${o.status === 'vendido' ? '<span style="color:green; font-weight:800; margin-left:5px;">[VENDIDO]</span>' : ''}
        <br><small>${new Date(o.created_at).toLocaleString()}</small>
      </td>
      <td style="padding:10px; font-weight:800;">${ARS.format(o.total)}</td>
      <td style="padding:10px; display:flex; gap:5px; align-items:center;">
        <details style="flex:1;">
          <summary style="cursor:pointer; color:var(--accent);">Items</summary>
          <div style="padding:5px;">${Object.entries(o.items).map(([s,q]) => `• ${q}x ${state.catalogCache[s]?.name || s}<br>`).join('')}</div>
        </details>
        ${o.status !== 'vendido' ? `<button class="btn-add" onclick="window.markOrderSold('${o.id}')" style="height:24px; padding:0 8px; font-size:10px;">VENDIDO</button>` : ''}
      </td>
    </tr>`).join('')}</table>`
}

window.markOrderSold = async (id) => {
  if (!confirm('¿Marcar este pedido como vendido?')) return
  await supabase.from('orders').update({ status: 'vendido' }).eq('id', id)
  renderAdminOrders()
}

async function renderAdminUsers() {
  const { data } = await supabase.from('profiles').select('*').eq('is_active', false)
  els.adminContent.innerHTML = (data || []).map(u => `<div class="tile" style="height:auto; padding:15px; flex-direction:column; align-items:start; gap:10px;"><b>${u.full_name}</b> (${u.dni_cuit})<div style="display:flex; gap:10px; width:100%;"><input id="vcode-${u.id}" placeholder="Código" class="auth-btn" style="flex:1; height:32px;"><button class="btn-add" onclick="window.activateUser('${u.id}')" style="height:32px;">ACTIVAR</button></div></div>`).join('') || '<p>No hay clientes pendientes</p>'
}

window.activateUser = async (uid) => {
  const code = $(`vcode-${uid}`).value
  if (!code) return alert('Ingresá un código primero')
  
  // Solo asignamos el código, NO lo activamos aún
  const { error } = await supabase.from('profiles').update({ verification_code: code }).eq('id', uid)
  
  if (error) {
    console.error('❌ Error al asignar código:', error)
    return alert('Error al guardar en la base de datos: ' + error.message)
  }
  
  alert('✅ Código "' + code + '" asignado con éxito. Ya podés pasárselo al cliente.'); 
  renderAdminUsers();
}

init()
