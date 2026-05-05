import { login, signUp, signOut, getSession } from './auth'
import { createIcons, LayoutGrid, Clock, User, Search, ShoppingCart, LogOut, CheckCircle, ShieldCheck } from 'lucide'
import { supabase } from './supabase'

// --- STATE ---
const state = {
  products: [],
  cart: JSON.parse(localStorage.getItem('ryr_cart_v2') || '{}'),
  user: null,
  profile: null,
  tier: 'Mayorista',
  query: '',
  loading: true,
  page: 0, // Cambiamos a 0-indexed para Supabase
  pageSize: 50,
  hasMore: true
}

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0
})

// --- DOM ELEMENTS ---
const $ = (id) => document.getElementById(id)
const getEls = () => ({
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
})

let els = {}

// --- INITIALIZATION ---
async function init() {
  els = getEls()
  
  // Render inicial para mostrar "Cargando..."
  if (els.grid) els.grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:50px; color:var(--muted);">Cargando catálogo...</div>'

  try {
    createIcons({ icons: { LayoutGrid, Clock, User, Search, ShoppingCart, LogOut, CheckCircle, ShieldCheck } })
  } catch (e) { console.warn('Lucide error', e) }

  // Listener de cambios de auth
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      state.user = session.user
      await fetchProfile(session.user.id)
    } else {
      state.user = null
      state.profile = null
    }
    updateAuthUi()
    render()
    renderCart()
  })

  // Carga inicial (Solo 50 productos para que sea instantáneo en Safari)
  await fetchProducts()
  
  state.loading = false
  render()
  renderCart()
  setupEvents()
}

async function fetchProducts(append = false) {
  try {
    const from = state.page * state.pageSize
    const to = from + state.pageSize - 1

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('updated_at', { ascending: false })
      .range(from, to)

    if (error) throw error
    
    const mapped = (data || []).map(p => ({
      id: p.sku,
      sku: p.sku,
      name: p.sku, 
      prices: {
        'Mayorista': p.price_mayorista || 0,
        'Especial Mayorista': p.price_especial || 0,
        'Súper Especial': p.price_super || 0,
        'Distribuidor': p.price_distribuidor || 0
      },
      img: p.image_url
    }))

    if (append) {
      state.products = [...state.products, ...mapped]
    } else {
      state.products = mapped
    }

    state.hasMore = mapped.length === state.pageSize
  } catch (e) {
    console.error('Error fetchProducts:', e)
  }
}

async function fetchProfile(uid) {
  try {
    let { data: profile } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    if (!profile) {
      const { data: newProfile } = await supabase.from('profiles').insert({ 
        id: uid, 
        full_name: state.user?.email?.split('@')[0] || 'Cliente', 
        dni_cuit: '000',
        is_active: false 
      }).select().single()
      profile = newProfile
    }
    state.profile = profile
    if (profile?.assigned_tier) state.tier = profile.assigned_tier
  } catch (e) { console.error('Profile fail', e) }
}

function updateAuthUi() {
  if (!els.loggedUi) return
  if (state.user) {
    els.unloggedUi.classList.add('hidden')
    els.loggedUi.classList.remove('hidden')
    els.userEmail.textContent = state.user.email
    if (state.profile?.is_admin) els.adminBtn.classList.remove('hidden')
    if (els.tierSelect) els.tierSelect.value = state.tier
  } else {
    els.unloggedUi.classList.remove('hidden')
    els.loggedUi.classList.add('hidden')
    els.adminBtn.classList.add('hidden')
  }
}

function render() {
  if (!els.grid) return
  
  const q = state.query.toLowerCase()
  const filtered = state.products.filter(p => {
    const text = `${p.name} ${p.sku}`.toLowerCase()
    return text.includes(q)
  })

  if (filtered.length === 0 && !state.loading) {
    els.grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:50px; color:var(--muted);">No se encontraron productos</div>'
    return
  }

  els.grid.innerHTML = filtered.map(p => {
    const price = p.prices[state.tier] || p.prices['Mayorista'] || 0
    const qty = state.cart[p.sku] || 0
    const hasDistPrice = (p.prices['Distribuidor'] || 0) > 0
    
    return `
      <div class="card ${hasDistPrice ? 'is-dist' : ''}">
        ${hasDistPrice ? '<div class="dist-label">DISTRIBUIDOR</div>' : ''}
        <div class="img"><img src="${p.img || '/logo.png'}" onerror="this.src='/logo.png'"></div>
        <div class="body">
          <div class="name">${p.name}</div>
          ${state.user 
            ? `<div class="price">${ARS.format(price)}</div>`
            : `<div class="price" style="font-size:13px; color:var(--muted); cursor:pointer;" onclick="document.getElementById('auth-modal').classList.add('show')">Ingresá para ver precios</div>`
          }
          ${state.user
            ? `<div class="controls">
                <div class="qty-box">
                  <button class="qty-btn" onclick="window.modQty('${p.sku}', -1)">-</button>
                  <span class="qty-val">${qty}</span>
                  <button class="qty-btn" onclick="window.modQty('${p.sku}', 1)">+</button>
                </div>
                <button class="btn-add" onclick="window.modQty('${p.sku}', 1)">AGREGAR</button>
              </div>`
            : `<button class="btn-add" style="background:var(--line); color:var(--muted);" onclick="document.getElementById('auth-modal').classList.add('show')">SOLICITAR ACCESO</button>`
          }
        </div>
      </div>
    `
  }).join('')

  if (state.hasMore) {
    els.grid.innerHTML += `
      <div style="grid-column:1/-1; text-align:center; padding:20px;">
        <button id="btn-load-more" class="tile" style="margin:0 auto; cursor:pointer; font-weight:800; padding:0 40px;">CARGAR MÁS</button>
      </div>
    `
    // Necesitamos re-bindear el evento porque innerHTML lo borra
    setTimeout(() => {
      const btn = $('btn-load-more')
      if (btn) btn.onclick = window.loadMore
    }, 10)
  }
}

function renderCart() {
  if (!els.cartItems) return
  let total = 0
  let count = 0
  const html = Object.entries(state.cart).map(([sku, qty]) => {
    const p = state.products.find(x => x.sku === sku)
    if (!p) return ''
    const price = p.prices[state.tier] || p.prices['Mayorista'] || 0
    total += price * qty
    count += qty
    return `
      <div style="display:flex; gap:12px; align-items:center; margin-bottom:12px; padding:10px; border-bottom:1px solid var(--line);">
        <img src="${p.img || '/logo.png'}" style="width:40px; height:40px; object-fit:contain; border-radius:5px; border:1px solid var(--line); background:white;">
        <div style="flex:1;">
          <div style="font-weight:700; font-size:12px;">${p.name}</div>
          <div style="color:var(--accent); font-weight:800; font-size:13px;">${qty} x ${ARS.format(price)}</div>
        </div>
        <button onclick="window.modQty('${sku}', -999)" style="background:none; border:none; cursor:pointer; color:var(--muted); font-size:18px;">&times;</button>
      </div>
    `
  }).join('')

  els.cartItems.innerHTML = html || '<p style="text-align:center; padding:40px; color:var(--muted);">Carrito vacío</p>'
  els.cartTotal.textContent = ARS.format(total)
  els.cartCount.textContent = count
  localStorage.setItem('ryr_cart_v2', JSON.stringify(state.cart))
}

function setupEvents() {
  els.search.oninput = async (e) => { 
    state.query = e.target.value
    if (state.query.length > 2) {
      // Búsqueda real en base de datos para no limitarnos a los 50 cargados
      const { data } = await supabase.from('products').select('*').ilike('sku', `%${state.query}%`).limit(50)
      if (data) {
        state.products = data.map(p => ({
          id: p.sku, sku: p.sku, name: p.sku, img: p.image_url,
          prices: { 'Mayorista': p.price_mayorista || 0, 'Especial Mayorista': p.price_especial || 0, 'Súper Especial': p.price_super || 0, 'Distribuidor': p.price_distribuidor || 0 }
        }))
        state.hasMore = false // En búsqueda desactivamos el cargar más simple
        render()
      }
    } else if (state.query.length === 0) {
      state.page = 0
      await fetchProducts()
      render()
    }
  }

  els.tierSelect.onchange = (e) => { state.tier = e.target.value; render(); renderCart(); }
  $('btn-cart').onclick = () => els.cartDrawer.classList.add('show')
  $('btn-open-login').onclick = () => els.authModal.classList.add('show')
  
  $('btn-history').onclick = async () => {
    if (!state.user) return alert('Iniciá sesión para ver tus pedidos')
    els.historyDrawer.classList.add('show')
    const { data } = await supabase.from('orders').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false })
    $('history-content').innerHTML = (data || []).map(o => `
      <div class="history-card" style="padding:15px; border-bottom:1px solid var(--line);">
        <div style="display:flex; justify-content:space-between; align-items:start;">
          <div><b>Pedido #${o.id.slice(0,6)}</b><br><small>${new Date(o.created_at).toLocaleDateString()}</small></div>
          <div style="text-align:right;">
            <div style="font-weight:800; color:var(--accent);">${ARS.format(o.total)}</div>
            <button class="btn-ghost" onclick="window.deleteOrder('${o.id}')" style="color:red; font-size:10px; padding:2px;">BORRAR</button>
          </div>
        </div>
      </div>
    `).join('') || '<p style="text-align:center; padding:20px;">No hay pedidos</p>'
  }

  els.adminBtn.onclick = () => { els.adminDrawer.classList.add('show'); renderAdminOrders(); }

  document.querySelectorAll('.btn-close, .mask').forEach(b => {
    b.onclick = () => {
      els.cartDrawer.classList.remove('show')
      els.authModal.classList.remove('show')
      els.historyDrawer.classList.remove('show')
      els.adminDrawer.classList.remove('show')
    }
  })

  $('btn-do-login').onclick = async () => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: $('login-email').value, password: $('login-pass').value })
      if (error) throw error
    } catch (e) { alert('Error: ' + e.message) }
  }

  $('btn-logout').onclick = async () => { await signOut(); location.reload(); }

  $('btn-checkout').onclick = async () => {
    if (!state.user) return alert('Iniciá sesión para comprar')
    const total = Object.entries(state.cart).reduce((s, [sku, q]) => {
      const p = state.products.find(x => x.sku === sku)
      return s + ((p?.prices[state.tier] || 0) * q)
    }, 0)
    const { data, error } = await supabase.from('orders').insert({ user_id: state.user.id, total, items: state.cart }).select().single()
    if (error) return alert(error.message)
    const customerName = state.profile?.full_name || 'Cliente'
    window.open(`https://wa.me/5493624250452?text=${encodeURIComponent(`Soy ${customerName}. Confirmé el pedido #${data.id.slice(0,6)} por ${ARS.format(total)}`)}`, '_blank')
    state.cart = {}
    renderCart(); render();
    alert('Pedido confirmado!')
  }
}

window.loadMore = async () => {
  state.page++
  const btn = $('btn-load-more')
  if (btn) btn.textContent = 'CARGANDO...'
  await fetchProducts(true)
  render()
}

window.modQty = (sku, delta) => {
  const current = state.cart[sku] || 0
  if (current + delta <= 0) delete state.cart[sku]
  else state.cart[sku] = current + delta
  renderCart(); render();
}

window.deleteOrder = async (id) => {
  if (!confirm('Eliminar?')) return
  await supabase.from('orders').delete().eq('id', id)
  $('btn-history').click()
}

async function renderAdminOrders() {
  const { data } = await supabase.from('orders').select('*, profiles(full_name)').order('created_at', { ascending: false })
  els.adminContent.innerHTML = (data || []).map(o => `
    <div style="padding:10px; border-bottom:1px solid var(--line); font-size:12px;">
      <b>${o.profiles?.full_name}</b> - ${ARS.format(o.total)}<br>
      <small>${new Date(o.created_at).toLocaleString()}</small>
    </div>
  `).join('')
}

init()
