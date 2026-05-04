import { login, signUp, signOut, getSession } from './auth'
import { createIcons, LayoutGrid, Clock, User, Search, ShoppingCart, LogOut, CheckCircle } from 'lucide'
import { supabase } from './supabase'

// --- STATE ---
const state = {
  products: [],
  cart: JSON.parse(localStorage.getItem('ryr_cart_v2') || '{}'),
  user: null,
  profile: null,
  tier: 'Mayorista',
  query: '',
  loading: true
}

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0
})

// --- DOM ELEMENTS ---
const $ = (id) => document.getElementById(id)
const els = {
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
  unloggedUi: $('auth-unlogged')
}

// --- INITIALIZATION ---
async function init() {
  createIcons({ icons: { LayoutGrid, Clock, User, Search, ShoppingCart, LogOut, CheckCircle } })

  const session = await getSession()
  if (session) {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    state.user = session.user
    state.profile = profile
    updateAuthUi()
  }

  try {
    const { data } = await supabase.from('products').select('*')
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
        img: p.image_url // Normalizado a 'img'
      }))
    } else {
      const res = await fetch('/catalog.json')
      const json = await res.json()
      const raw = json.products || json
      state.products = raw.map(p => ({
        ...p,
        img: (p.imageUrls && p.imageUrls[0]) || '/logo.png' // Normalizado a 'img'
      }))
    }
  } catch (e) {
    console.error('Failed load', e)
  }

  state.loading = false
  render()
  renderCart()
  setupEvents()
}

// --- LOGIC ---
function updateAuthUi() {
  if (state.user) {
    els.unloggedUi.classList.add('hidden')
    els.loggedUi.classList.remove('hidden')
    els.userEmail.textContent = state.user.email
    if (state.profile?.assigned_tier) {
      state.tier = state.profile.assigned_tier
      els.tierSelect.value = state.tier
    }
  } else {
    els.unloggedUi.classList.remove('hidden')
    els.loggedUi.classList.add('hidden')
  }
}

function render() {
  if (state.loading) return
  const q = state.query.toLowerCase()
  const filtered = state.products.filter(p => {
    const text = `${p.name} ${p.sku}`.toLowerCase()
    return text.includes(q)
  })

  els.grid.innerHTML = filtered.map(p => {
    const price = p.prices[state.tier] || p.prices['Mayorista'] || 0
    const imagePath = p.img || '/logo.png'
    const qty = state.cart[p.sku] || 0
    return `
      <div class="card">
        <div class="img"><img src="${imagePath}" onerror="this.src='/logo.png'"></div>
        <div class="body">
          <div class="name">${p.name}</div>
          <div class="price">${ARS.format(price)}</div>
          <div class="controls">
            <div class="qty-box">
              <button class="qty-btn" onclick="window.modQty('${p.sku}', -1)">-</button>
              <span class="qty-val">${qty}</span>
              <button class="qty-btn" onclick="window.modQty('${p.sku}', 1)">+</button>
            </div>
            <button class="btn-add" onclick="window.modQty('${p.sku}', 1)">AGREGAR</button>
          </div>
        </div>
      </div>
    `
  }).join('')
}

function renderCart() {
  let total = 0
  let count = 0
  const html = Object.entries(state.cart).map(([sku, qty]) => {
    const p = state.products.find(x => x.sku === sku)
    if (!p) return ''
    const price = p.prices[state.tier] || p.prices['Mayorista'] || 0
    total += price * qty
    count += qty
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding:10px; border-bottom:1px solid var(--line);">
        <div>
          <div style="font-weight:700; font-size:14px;">${p.name}</div>
          <div style="color:var(--accent); font-weight:800;">${qty} x ${ARS.format(price)}</div>
        </div>
        <button onclick="window.modQty('${sku}', -999)" style="background:none; border:none; cursor:pointer; color:var(--muted);">&times;</button>
      </div>
    `
  }).join('')

  els.cartItems.innerHTML = html || '<p style="text-align:center; padding:40px; color:var(--muted);">Carrito vacío</p>'
  els.cartTotal.textContent = ARS.format(total)
  els.cartCount.textContent = count
  localStorage.setItem('ryr_cart_v2', JSON.stringify(state.cart))
}

// --- EVENTS ---
function setupEvents() {
  els.search.oninput = (e) => { state.query = e.target.value; render(); }
  els.tierSelect.onchange = (e) => { state.tier = e.target.value; render(); renderCart(); }
  
  $('btn-cart').onclick = () => els.cartDrawer.classList.add('show')
  $('btn-open-login').onclick = () => els.authModal.classList.add('show')
  $('btn-history').onclick = async () => {
    if (!state.user) return alert('Iniciá sesión para ver tus pedidos')
    els.historyDrawer.classList.add('show')
    const { data } = await supabase.from('orders').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false })
    $('history-content').innerHTML = (data || []).map(o => `
      <div style="padding:15px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between;">
        <div><b>Pedido #${o.id.slice(0,6)}</b><br><small>${new Date(o.created_at).toLocaleDateString()}</small></div>
        <div style="font-weight:800; color:var(--accent);">${ARS.format(o.total)}</div>
      </div>
    `).join('')
  }

  // Close drawers
  document.querySelectorAll('.btn-close, .mask').forEach(b => {
    b.onclick = () => {
      els.cartDrawer.classList.remove('show')
      els.authModal.classList.remove('show')
      els.historyDrawer.classList.remove('show')
    }
  })

  // Auth logic
  $('go-register').onclick = () => { $('login-form').classList.add('hidden'); $('register-form').classList.remove('hidden'); }
  $('go-login').onclick = () => { $('register-form').classList.add('hidden'); $('login-form').classList.remove('hidden'); }
  
  $('btn-do-login').onclick = async () => {
    try {
      const { data } = await login($('login-email').value, $('login-pass').value)
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single()
      if (profile && !profile.is_active) {
        $('login-form').classList.add('hidden'); $('activation-form').classList.remove('hidden');
        state.user = data.user
        return
      }
      location.reload()
    } catch (e) { alert(e.message) }
  }

  $('btn-do-register').onclick = async () => {
    try {
      const email = $('reg-email').value
      const { data } = await supabase.auth.signUp({ email, password: $('reg-pass').value })
      await supabase.from('profiles').insert({ id: data.user.id, full_name: $('reg-name').value, dni_cuit: $('reg-dni').value, phone: '' })
      $('register-form').classList.add('hidden'); $('activation-form').classList.remove('hidden');
      state.user = data.user
    } catch (e) { alert(e.message) }
  }

  $('btn-do-activate').onclick = async () => {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', state.user.id).single()
    if (profile.verification_code === $('activate-code').value) {
      await supabase.from('profiles').update({ is_active: true }).eq('id', state.user.id)
      alert('¡Cuenta activada!')
      location.reload()
    } else { alert('Código incorrecto') }
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
    alert('Pedido confirmado! Avisale a Emanuel por WhatsApp.')
    window.open(`https://wa.me/5493624996333?text=Confirmé el pedido #${data.id.slice(0,6)}`, '_blank')
    state.cart = {}
    renderCart()
    render()
  }
}

window.modQty = (sku, delta) => {
  const current = state.cart[sku] || 0
  if (current + delta <= 0) delete state.cart[sku]
  else state.cart[sku] = current + delta
  renderCart()
  render()
}

init()
