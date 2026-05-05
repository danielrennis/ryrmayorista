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
  page: 0,
  pageSize: 50,
  hasMore: true,
  isFallback: false
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
  console.log('🏁 Iniciando App...')
  els = getEls()
  
  if (els.grid) {
    els.grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:50px; color:var(--muted); font-weight:700;">CARGANDO PRODUCTOS...</div>'
  }

  try {
    createIcons({ icons: { LayoutGrid, Clock, User, Search, ShoppingCart, LogOut, CheckCircle, ShieldCheck } })
  } catch (e) { console.error('Lucide error:', e) }

  // Auth
  supabase.auth.onAuthStateChange(async (event, session) => {
    state.user = session?.user || null
    if (state.user) await fetchProfile(state.user.id)
    updateAuthUi()
    render()
    renderCart()
  })

  // Carga con tiempo límite para que no se trabe
  const loadSupabase = fetchProducts()
  const timeout = new Promise(res => setTimeout(() => res('timeout'), 5000))

  const result = await Promise.race([loadSupabase, timeout])

  if (result === 'timeout' || state.products.length === 0) {
    console.warn('⚡ Supabase lento o vacío, usando JSON local...')
    await fetchJsonFallback()
  }
  
  state.loading = false
  console.log('✅ App lista')
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
      sku: p.sku,
      name: p.name || p.sku, 
      prices: {
        'Mayorista': p.price_mayorista || 0,
        'Especial Mayorista': p.price_especial || 0,
        'Súper Especial': p.price_super || 0,
        'Distribuidor': p.price_distribuidor || 0
      },
      img: p.image_url
    }))

    if (append) state.products = [...state.products, ...mapped]
    else state.products = mapped

    state.hasMore = mapped.length === state.pageSize
    state.isFallback = false
    return true
  } catch (e) {
    console.error('Fetch error:', e)
    return false
  }
}

async function fetchJsonFallback() {
  try {
    const res = await fetch('/catalog.json')
    const json = await res.json()
    const raw = json.products || json
    state.products = raw.map(p => ({
      sku: p.sku,
      name: p.name || p.sku,
      prices: p.prices,
      img: (p.imageUrls && p.imageUrls[0]) || '/logo.png'
    }))
    state.hasMore = false
    state.isFallback = true
  } catch (e) { console.error('Fallback fail:', e) }
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
    els.unloggedUi.classList.add('hidden'); els.loggedUi.classList.remove('hidden');
    els.userEmail.textContent = state.user.email
    if (state.profile?.is_admin) els.adminBtn.classList.remove('hidden')
  } else {
    els.unloggedUi.classList.remove('hidden'); els.loggedUi.classList.add('hidden');
    els.adminBtn.classList.add('hidden')
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
          ${state.user ? `
            <div class="controls">
              <div class="qty-box">
                <button class="qty-btn" onclick="window.modQty('${p.sku}', -1)">-</button>
                <span class="qty-val">${qty}</span>
                <button class="qty-btn" onclick="window.modQty('${p.sku}', 1)">+</button>
              </div>
              <button class="btn-add" onclick="window.modQty('${p.sku}', 1)">SUMAR</button>
            </div>` : `<button class="btn-add" onclick="$('auth-modal').classList.add('show')">INGRESAR</button>`}
        </div>
      </div>
    `
  }).join('')

  if (state.hasMore) {
    els.grid.innerHTML += `<div style="grid-column:1/-1; text-align:center; padding:20px;"><button id="btn-load-more" class="tile" style="margin:0 auto; cursor:pointer; font-weight:800; padding:0 40px;">VER MÁS</button></div>`
    setTimeout(() => { if($('btn-load-more')) $('btn-load-more').onclick = window.loadMore }, 50)
  }
}

function renderCart() {
  if (!els.cartItems) return
  let total = 0, count = 0
  const html = Object.entries(state.cart).map(([sku, qty]) => {
    const p = state.products.find(x => x.sku === sku)
    if (!p) return ''
    const pr = p.prices[state.tier] || p.prices['Mayorista'] || 0
    total += pr * qty; count += qty
    return `<div style="display:flex; gap:10px; padding:10px; border-bottom:1px solid var(--line); font-size:12px;">
      <img src="${p.img || '/logo.png'}" style="width:40px; height:40px; object-fit:contain; background:white;">
      <div style="flex:1;"><b>${p.name}</b><br><span style="color:var(--accent); font-weight:800;">${qty} x ${ARS.format(pr)}</span></div>
      <button onclick="window.modQty('${sku}', -999)" style="background:none; border:none; cursor:pointer;">&times;</button>
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
        state.products = data.map(p => ({ sku: p.sku, name: p.name || p.sku, img: p.image_url, prices: { 'Mayorista': p.price_mayorista || 0, 'Especial Mayorista': p.price_especial || 0, 'Súper Especial': p.price_super || 0, 'Distribuidor': p.price_distribuidor || 0 } }))
        state.hasMore = false; render()
      }
    } else { render() }
  }

  els.tierSelect.onchange = (e) => { state.tier = e.target.value; render(); renderCart(); }
  $('btn-cart').onclick = () => els.cartDrawer.classList.add('show')
  $('btn-open-login').onclick = () => els.authModal.classList.add('show')
  els.adminBtn.onclick = () => { els.adminDrawer.classList.add('show'); renderAdminOrders(); }

  document.querySelectorAll('.btn-close, .mask').forEach(b => {
    b.onclick = () => { els.cartDrawer.classList.remove('show'); els.authModal.classList.remove('show'); els.historyDrawer.classList.remove('show'); els.adminDrawer.classList.remove('show'); }
  })

  $('btn-do-login').onclick = async () => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: $('login-email').value, password: $('login-pass').value })
      if (error) throw error
    } catch (e) { alert('Error: ' + e.message) }
  }

  $('btn-logout').onclick = async () => { await signOut(); location.reload(); }

  $('btn-checkout').onclick = async () => {
    if (!state.user) return alert('Iniciá sesión')
    const total = Object.entries(state.cart).reduce((s, [sku, q]) => {
      const p = state.products.find(x => x.sku === sku)
      return s + ((p?.prices[state.tier] || 0) * q)
    }, 0)
    const { data, error } = await supabase.from('orders').insert({ user_id: state.user.id, total, items: state.cart }).select().single()
    if (error) return alert(error.message)
    window.open(`https://wa.me/5493624250452?text=${encodeURIComponent(`Pedido #${data.id.slice(0,6)} por ${ARS.format(total)}`)}`, '_blank')
    state.cart = {}; renderCart(); render();
  }
}

window.loadMore = async () => { state.page++; await fetchProducts(true); render(); }
window.modQty = (sku, delta) => {
  const c = state.cart[sku] || 0
  if (c + delta <= 0) delete state.cart[sku]
  else state.cart[sku] = c + delta
  renderCart(); render();
}

async function renderAdminOrders() {
  const { data } = await supabase.from('orders').select('*, profiles(full_name)').order('created_at', { ascending: false })
  els.adminContent.innerHTML = (data || []).map(o => `<div style="padding:10px; border-bottom:1px solid var(--line);"><b>${o.profiles?.full_name}</b> - ${ARS.format(o.total)}</div>`).join('')
}

init()
