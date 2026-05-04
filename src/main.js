import { login, signUp, signOut, getSession } from './auth'

// --- INITIALIZATION ---
createIcons({
  icons: { LayoutGrid, Clock, User, Search, Send, Mail, Lock, Plus, Minus, Trash2, LogOut, Search }
})

const state = {
  products: [],
  cart: JSON.parse(localStorage.getItem('ryr_cart') || '{}'),
  view: 'catalog', // 'catalog', 'history', 'profile'
  user: null,
  tier: 'Especial Mayorista',
  searchQuery: '',
  loading: true
}

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0
})

// --- UI ELEMENTS ---
const elements = {
  grid: document.getElementById('main-view-content'),
  search: document.getElementById('main-search'),
  cartList: document.getElementById('cart-items-list'),
  cartSubtotal: document.getElementById('cart-subtotal'),
  cartTotal: document.getElementById('cart-total'),
  cartCount: document.getElementById('cart-count-badge'),
  tierSelect: document.getElementById('tier-select'),
  btnCheckout: document.getElementById('btn-checkout'),
  authModal: document.getElementById('auth-modal'),
  btnLoginTrigger: document.getElementById('btn-login-trigger'),
  btnLogout: document.getElementById('btn-logout'),
  userInfo: document.getElementById('user-info'),
  userEmail: document.getElementById('user-email')
}

// --- CORE LOGIC ---
async function init() {
  // Check session
  const { data: { session } } = await supabase.auth.getSession()
  updateUser(session?.user || null)

  // Load products
  try {
    // Try Supabase first
    const { data, error } = await supabase.from('products').select('*')
    if (data && data.length > 0) {
      state.products = data
    } else {
      // Fallback to local JSON
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
}

function updateUser(user) {
  state.user = user
  if (user) {
    elements.userInfo.classList.remove('hidden')
    elements.userEmail.textContent = user.email
    elements.btnLoginTrigger.classList.add('hidden')
  } else {
    elements.userInfo.classList.add('hidden')
    elements.btnLoginTrigger.classList.remove('hidden')
  }
}

function getPrice(p, tier) {
  if (!p.prices) return 0
  const price = p.prices[tier] || p.prices['Mayorista'] || 0
  return parseFloat(price)
}

function updateCart() {
  localStorage.setItem('ryr_cart', JSON.stringify(state.cart))
  renderCart()
}

function addToCart(id) {
  state.cart[id] = (state.cart[id] || 0) + 1
  updateCart()
}

function setQty(id, qty) {
  if (qty <= 0) delete state.cart[id]
  else state.cart[id] = qty
  updateCart()
}

// --- RENDERING ---
function render() {
  if (state.loading) return

  if (state.view === 'catalog') {
    renderCatalog()
  } else if (state.view === 'history') {
    renderHistory()
  }
}

function renderCatalog() {
  const query = state.searchQuery.toLowerCase()
  const filtered = state.products.filter(p => {
    const text = `${p.name} ${p.brand} ${p.sku}`.toLowerCase()
    return text.includes(query)
  })

  elements.grid.innerHTML = filtered.map(p => {
    const price = getPrice(p, state.tier)
    const img = (p.imageUrls && p.imageUrls[0]) || '/logo.png'
    const qty = state.cart[p.id] || 0

    return `
      <div class="product-card animate-in">
        <div class="product-image">
          <img src="${img}" alt="${p.name}" onerror="this.src='/logo.png'">
        </div>
        <div class="product-info">
          <h3>${p.name}</h3>
          <p style="font-size: 11px; color: var(--text-muted); margin: 4px 0;">${p.brand || 'S/M'} • SKU: ${p.sku}</p>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
            <span class="product-price">${ARS.format(price)}</span>
            ${qty > 0 ? `
              <div style="display: flex; align-items: center; gap: 8px; background: var(--surface); padding: 4px; border-radius: 12px;">
                <button class="qty-btn" onclick="window.adjustQty('${p.id}', -1)"><i data-lucide="minus" style="width: 14px;"></i></button>
                <span style="font-weight: 800; font-size: 14px;">${qty}</span>
                <button class="qty-btn" onclick="window.adjustQty('${p.id}', 1)"><i data-lucide="plus" style="width: 14px;"></i></button>
              </div>
            ` : `
              <button class="btn-primary" style="padding: 8px 16px; font-size: 12px;" onclick="window.addToCart('${p.id}')">AGREGAR</button>
            `}
          </div>
        </div>
      </div>
    `
  }).join('')
  
  createIcons() // Re-init icons for dynamic content
}

function renderCart() {
  let subtotal = 0
  let count = 0

  const itemsHtml = Object.entries(state.cart).map(([id, qty]) => {
    const p = state.products.find(x => String(x.id) === String(id))
    if (!p) return ''
    const price = getPrice(p, state.tier)
    subtotal += price * qty
    count += qty

    return `
      <div class="bento-card" style="padding: 12px; display: flex; gap: 12px; background: var(--surface-brighter);">
        <img src="${p.imageUrls?.[0] || '/logo.png'}" style="width: 50px; height: 50px; object-fit: contain; background: white; border-radius: 8px;">
        <div style="flex: 1;">
          <h4 style="margin: 0; font-size: 12px; font-weight: 600;">${p.name}</h4>
          <p style="margin: 4px 0 0 0; color: var(--accent); font-weight: 800; font-size: 13px;">${qty} x ${ARS.format(price)}</p>
        </div>
        <button onclick="window.adjustQty('${id}', -999)" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer;">
          <i data-lucide="trash-2" style="width: 16px;"></i>
        </button>
      </div>
    `
  }).join('')

  elements.cartList.innerHTML = itemsHtml || '<p style="text-align: center; color: var(--text-muted); padding: 40px;">Tu carrito está vacío</p>'
  elements.cartSubtotal.textContent = ARS.format(subtotal)
  elements.cartTotal.textContent = ARS.format(subtotal) // Shipping logic can be added here
  elements.cartCount.textContent = count
  
  createIcons()
}

async function renderHistory() {
  if (!state.user) {
    elements.grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px;">
        <i data-lucide="lock" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 20px;"></i>
        <h3>Debes iniciar sesión</h3>
        <p style="color: var(--text-muted);">Para ver tu historial de pedidos, por favor ingresa a tu cuenta.</p>
        <button class="btn-primary" style="margin-top: 20px;" onclick="document.getElementById('auth-modal').classList.add('show')">INGRESAR</button>
      </div>
    `
    createIcons()
    return
  }

  elements.grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 100px;"><div class="spinner"></div><p>Cargando historial...</p></div>'

  const { data: orders, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })

  if (error) {
    elements.grid.innerHTML = `<p style="color: red; text-align: center; grid-column: 1/-1;">Error: ${error.message}</p>`
    return
  }

  if (!orders || orders.length === 0) {
    elements.grid.innerHTML = '<p style="text-align: center; color: var(--text-muted); grid-column: 1/-1; padding: 100px;">Aún no tienes pedidos realizados.</p>'
    return
  }

  elements.grid.innerHTML = orders.map(order => `
    <div class="bento-card animate-in" style="grid-column: 1/-1; background: var(--surface-brighter);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div>
          <span style="font-weight: 800; font-size: 18px;">Pedido #${order.id.slice(0, 8)}</span>
          <p style="margin: 4px 0 0 0; color: var(--text-muted); font-size: 13px;">${new Date(order.created_at).toLocaleDateString()} ${new Date(order.created_at).toLocaleTimeString()}</p>
        </div>
        <span style="background: var(--accent); color: white; padding: 4px 12px; border-radius: 8px; font-size: 12px; font-weight: 800;">${order.status.toUpperCase()}</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${order.order_items.map(item => `
          <div style="display: flex; justify-content: space-between; font-size: 14px;">
            <span>${item.quantity} x Producto ID: ${item.product_id}</span>
            <span style="font-weight: 600;">${ARS.format(item.price_at_time * item.quantity)}</span>
          </div>
        `).join('')}
      </div>
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: 800;">Total</span>
        <span style="font-weight: 900; font-size: 20px; color: var(--accent);">${ARS.format(order.total)}</span>
      </div>
    </div>
  `).join('')
  
  createIcons()
}

// --- EVENTS ---
function setupEventListeners() {
  elements.search.addEventListener('input', (e) => {
    state.searchQuery = e.target.value
    state.view = 'catalog'
    render()
  })

  elements.tierSelect.addEventListener('change', (e) => {
    state.tier = e.target.value
    render()
    renderCart()
  })

  elements.btnLoginTrigger.addEventListener('click', () => {
    elements.authModal.classList.add('show')
  })

  elements.authModal.addEventListener('click', (e) => {
    if (e.target === elements.authModal) elements.authModal.classList.remove('show')
  })

  document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value
    const password = document.getElementById('auth-password').value
    try {
      const data = await login(email, password)
      updateUser(data.user)
      elements.authModal.classList.remove('show')
      render()
    } catch (e) {
      alert('Error de ingreso: ' + e.message)
    }
  })

  document.getElementById('nav-catalog').addEventListener('click', (e) => {
    e.preventDefault()
    state.view = 'catalog'
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'))
    e.target.closest('.nav-link').classList.add('active')
    document.getElementById('view-title').textContent = 'Catálogo'
    render()
  })

  document.getElementById('nav-history').addEventListener('click', (e) => {
    e.preventDefault()
    state.view = 'history'
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'))
    e.target.closest('.nav-link').classList.add('active')
    document.getElementById('view-title').textContent = 'Historial de Pedidos'
    render()
  })

  elements.userInfo.querySelector('#btn-logout').addEventListener('click', async () => {
    await signOut()
    updateUser(null)
    state.view = 'catalog'
    render()
  })

  elements.btnCheckout.addEventListener('click', async () => {
    if (Object.keys(state.cart).length === 0) return alert('El carrito está vacío')
    
    if (!state.user) {
      alert('Debes iniciar sesión para confirmar el pedido.')
      elements.authModal.classList.add('show')
      return
    }

    try {
      const total = Object.entries(state.cart).reduce((sum, [id, qty]) => {
        const p = state.products.find(x => String(x.id) === String(id))
        return sum + (getPrice(p, state.tier) * qty)
      }, 0)

      // Create Order in Supabase
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          user_id: state.user.id,
          total,
          status: 'pending',
          client_data: { tier: state.tier }
        })
        .select()
        .single()

      if (orderErr) throw orderErr

      // Create Order Items
      const items = Object.entries(state.cart).map(([id, qty]) => {
        const p = state.products.find(x => String(x.id) === String(id))
        return {
          order_id: order.id,
          product_id: String(id),
          quantity: qty,
          price_at_time: getPrice(p, state.tier)
        }
      })

      const { error: itemsErr } = await supabase.from('order_items').insert(items)
      if (itemsErr) throw itemsErr

      alert('¡Pedido realizado con éxito! Redirigiendo a WhatsApp para confirmación final.')
      
      // WhatsApp Text Logic...
      const waText = `*PEDIDO WEB #${order.id.slice(0, 8)}*\nTotal: ${ARS.format(total)}\n\nDetalles en el sistema.`
      window.open(`https://wa.me/5493624996333?text=${encodeURIComponent(waText)}`, '_blank')
      
      state.cart = {}
      updateCart()
      render()
    } catch (e) {
      alert('Error al procesar pedido: ' + e.message)
    }
  })
}

// --- GLOBAL EXPOSE ---
window.addToCart = addToCart
window.adjustQty = (id, delta) => {
  const current = state.cart[id] || 0
  setQty(id, current + delta)
}

init()
