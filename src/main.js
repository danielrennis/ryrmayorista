import { login, signUp, signOut, getSession } from './auth'
import { createIcons, LayoutGrid, Clock, User, Search, Send, Mail, Lock, Plus, Minus, Trash2, LogOut, CheckCircle } from 'lucide'
import { supabase } from './supabase'

// --- INITIALIZATION ---
createIcons({
  icons: { LayoutGrid, Clock, User, Search, Send, Mail, Lock, Plus, Minus, Trash2, LogOut, CheckCircle }
})

const state = {
  products: [],
  cart: JSON.parse(localStorage.getItem('ryr_cart') || '{}'),
  view: 'catalog',
  user: null,
  profile: null,
  tier: 'Mayorista',
  searchQuery: '',
  loading: true
}

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0
})

const elements = {
  get grid() { return document.getElementById('main-view-content') },
  get search() { return document.getElementById('main-search') },
  get cartList() { return document.getElementById('cart-items-list') },
  get cartSubtotal() { return document.getElementById('cart-subtotal') },
  get cartTotal() { return document.getElementById('cart-total') },
  get cartCount() { return document.getElementById('cart-count-badge') },
  get tierSelect() { return document.getElementById('tier-select') },
  get btnCheckout() { return document.getElementById('btn-checkout') },
  get authModal() { return document.getElementById('auth-modal') },
  get btnLoginTrigger() { return document.getElementById('btn-login-trigger') },
  get btnLogout() { return document.getElementById('btn-logout') },
  get userInfo() { return document.getElementById('user-info') },
  get userEmail() { return document.getElementById('user-email') }
}

// --- CORE LOGIC ---
async function init() {
  const session = await getSession()
  if (session) {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    state.profile = profile
    updateUser(session.user)
    if (profile?.assigned_tier) {
      state.tier = profile.assigned_tier
      if (elements.tierSelect) elements.tierSelect.value = state.tier
    }
  } else {
    updateUser(null)
  }

  try {
    const { data, error } = await supabase.from('products').select('*')
    if (data && data.length > 0) {
      state.products = data.map(p => ({
        id: p.sku,
        sku: p.sku,
        name: p.sku, 
        prices: {
          'Mayorista': p.price_mayorista,
          'Especial Mayorista': p.price_especial,
          'Súper Especial': p.price_super,
          'Distribuidor': p.price_distribuidor
        },
        imageUrls: [p.image_url]
      }))
    } else {
      const res = await fetch('/catalog.json')
      const json = await res.json()
      state.products = json.products || json
    }
  } catch (e) {
    console.error('Failed to load products', e)
  }

  state.loading = false
  render()
  setupEventListeners()
  renderCart()
}

function updateUser(user) {
  state.user = user
  if (user) {
    if (elements.userInfo) elements.userInfo.classList.remove('hidden')
    if (elements.userEmail) elements.userEmail.textContent = user.email
    if (elements.btnLoginTrigger) elements.btnLoginTrigger.classList.add('hidden')
  } else {
    if (elements.userInfo) elements.userInfo.classList.add('hidden')
    if (elements.btnLoginTrigger) elements.btnLoginTrigger.classList.remove('hidden')
  }
}

// --- RENDERING ---
function render() {
  if (state.loading) return
  if (state.view === 'catalog') renderCatalog()
  else if (state.view === 'history') renderHistory()
}

function renderCatalog() {
  const query = state.searchQuery.toLowerCase()
  const filtered = state.products.filter(p => {
    const text = `${p.name} ${p.sku}`.toLowerCase()
    return text.includes(query)
  })

  if (!elements.grid) return

  elements.grid.innerHTML = filtered.map(p => {
    const price = p.prices[state.tier] || p.prices['Mayorista'] || 0
    const img = (p.imageUrls && p.imageUrls[0]) || '/logo.png'
    const qty = state.cart[p.sku] || 0

    return `
      <div class="product-card animate-in">
        <div class="product-image">
          <img src="${img}" alt="${p.sku}" onerror="this.src='/logo.png'">
        </div>
        <div class="product-info">
          <h3 style="font-size: 13px;">${p.name}</h3>
          <p style="font-size: 11px; color: var(--text-muted); margin: 4px 0;">SKU: ${p.sku}</p>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
            <span class="product-price">${ARS.format(price)}</span>
            <button class="btn-primary" style="padding: 8px 16px; font-size: 12px;" onclick="window.addToCart('${p.sku}')">
              ${qty > 0 ? `(${qty}) +` : 'AGREGAR'}
            </button>
          </div>
        </div>
      </div>
    `
  }).join('')
}

function updateCart() {
  localStorage.setItem('ryr_cart', JSON.stringify(state.cart))
  renderCart()
}

function renderCart() {
  let subtotal = 0
  let count = 0
  if (!elements.cartList) return

  const itemsHtml = Object.entries(state.cart).map(([sku, qty]) => {
    const p = state.products.find(x => x.sku === sku)
    if (!p) return ''
    const price = p.prices[state.tier] || p.prices['Mayorista'] || 0
    subtotal += price * qty
    count += qty
    return `<div class="bento-card" style="padding: 10px; margin-bottom: 8px; background: var(--surface-brighter); display: flex; justify-content: space-between; border-radius: 12px;">
      <span style="font-size: 12px;">${qty} x ${sku}</span>
      <span style="font-weight: 800; color: var(--accent);">${ARS.format(price * qty)}</span>
      <button onclick="window.adjustQty('${sku}', -1)" style="background:none; border:none; color:var(--text-muted); cursor:pointer;">&times;</button>
    </div>`
  }).join('')

  elements.cartList.innerHTML = itemsHtml || '<p style="text-align:center; color:var(--text-muted);">Carrito vacío</p>'
  if (elements.cartSubtotal) elements.cartSubtotal.textContent = ARS.format(subtotal)
  if (elements.cartTotal) elements.cartTotal.textContent = ARS.format(subtotal)
  if (elements.cartCount) elements.cartCount.textContent = count
  
  createIcons()
}

async function renderHistory() {
  if (!elements.grid) return
  if (!state.user) {
    elements.grid.innerHTML = '<p style="text-align:center; grid-column:1/-1; padding:40px;">Iniciá sesión para ver tus pedidos.</p>'
    return
  }
  const { data: orders } = await supabase.from('orders').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false })
  elements.grid.innerHTML = (orders || []).map(o => `
    <div class="bento-card" style="grid-column: 1/-1; margin-bottom: 12px;">
      <div style="display:flex; justify-content:space-between; font-weight:800;">
        <span>Pedido #${o.id.slice(0,8)}</span>
        <span>${ARS.format(o.total)}</span>
      </div>
      <div style="font-size:12px; color:var(--text-muted);">${new Date(o.created_at).toLocaleString()}</div>
    </div>
  `).join('')
}

// --- EVENT HANDLERS ---
function setupEventListeners() {
  if (document.getElementById('show-signup')) {
    document.getElementById('show-signup').onclick = () => {
      document.getElementById('login-section').classList.add('hidden')
      document.getElementById('signup-section').classList.remove('hidden')
    }
  }
  if (document.getElementById('show-login')) {
    document.getElementById('show-login').onclick = () => {
      document.getElementById('signup-section').classList.add('hidden')
      document.getElementById('login-section').classList.remove('hidden')
    }
  }

  if (document.getElementById('btn-do-signup')) {
    document.getElementById('btn-do-signup').onclick = async () => {
      const email = document.getElementById('reg-email').value
      const pass = document.getElementById('reg-pass').value
      const name = document.getElementById('reg-name').value
      const dni = document.getElementById('reg-dni').value
      const phone = document.getElementById('reg-phone').value

      try {
        const { data, error } = await supabase.auth.signUp({ email, password: pass })
        if (error) throw error
        await supabase.from('profiles').insert({ id: data.user.id, full_name: name, dni_cuit: dni, phone: phone })
        document.getElementById('signup-section').classList.add('hidden')
        document.getElementById('post-signup-section').classList.remove('hidden')
      } catch (e) {
        alert('Error: ' + e.message)
      }
    }
  }

  if (document.getElementById('btn-do-login')) {
    document.getElementById('btn-do-login').onclick = async () => {
      const email = document.getElementById('login-email').value
      const pass = document.getElementById('login-password').value
      try {
        const data = await login(email, pass)
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single()
        if (profile && !profile.is_active) {
          document.getElementById('login-section').classList.add('hidden')
          document.getElementById('post-signup-section').classList.remove('hidden')
          return
        }
        updateUser(data.user)
        state.profile = profile
        if (profile?.assigned_tier) state.tier = profile.assigned_tier
        elements.authModal.classList.remove('show')
        render()
      } catch (e) {
        alert('Error: ' + e.message)
      }
    }
  }

  if (elements.search) elements.search.oninput = (e) => { state.searchQuery = e.target.value; state.view = 'catalog'; render(); }
  if (elements.tierSelect) elements.tierSelect.onchange = (e) => { state.tier = e.target.value; render(); renderCart(); }
  if (elements.btnLoginTrigger) elements.btnLoginTrigger.onclick = () => elements.authModal.classList.add('show')
  if (elements.authModal) elements.authModal.onclick = (e) => { if (e.target === elements.authModal) elements.authModal.classList.remove('show') }
  
  if (document.getElementById('nav-catalog')) document.getElementById('nav-catalog').onclick = (e) => { e.preventDefault(); state.view = 'catalog'; render(); }
  if (document.getElementById('nav-history')) document.getElementById('nav-history').onclick = (e) => { e.preventDefault(); state.view = 'history'; render(); }
  if (elements.btnLogout) elements.btnLogout.onclick = async () => { await signOut(); updateUser(null); render(); }

  if (elements.btnCheckout) {
    elements.btnCheckout.onclick = async () => {
      if (!state.user) return alert('Debés iniciar sesión')
      if (Object.keys(state.cart).length === 0) return alert('Carrito vacío')
      const total = Object.entries(state.cart).reduce((s, [sku, q]) => {
        const p = state.products.find(x => x.sku === sku)
        return s + ((p?.prices[state.tier] || 0) * q)
      }, 0)
      const { data: order, error } = await supabase.from('orders').insert({ user_id: state.user.id, total, items: state.cart }).select().single()
      if (error) return alert('Error al guardar: ' + error.message)
      alert('Pedido guardado!')
      state.cart = {}
      updateCart()
      render()
    }
  }
}

window.addToCart = (sku) => {
  state.cart[sku] = (state.cart[sku] || 0) + 1
  updateCart()
  render()
}

window.adjustQty = (sku, delta) => {
  const current = state.cart[sku] || 0
  if (current + delta <= 0) delete state.cart[sku]
  else state.cart[sku] = current + delta
  updateCart()
  render()
}

init()
