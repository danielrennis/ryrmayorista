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
  page: 1,
  pageSize: 50
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
  unloggedUi: $('auth-unlogged'),
  adminBtn: $('btn-admin'),
  adminDrawer: $('admin-drawer'),
  adminContent: $('admin-content')
}

// --- INITIALIZATION ---
async function init() {
  createIcons({ icons: { LayoutGrid, Clock, User, Search, ShoppingCart, LogOut, CheckCircle, ShieldCheck } })

  const session = await getSession()
  if (session) {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    state.user = session.user
    state.profile = profile
    updateAuthUi()
  }

  try {
    // Traemos ordenado por fecha de actualización (descendente)
    const { data } = await supabase.from('products').select('*').order('updated_at', { ascending: false })
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
    if (state.profile?.is_admin) {
      els.adminBtn.classList.remove('hidden')
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

  const totalFiltered = filtered.length
  const paginated = filtered.slice(0, state.page * state.pageSize)

  els.grid.innerHTML = paginated.map(p => {
    const price = p.prices[state.tier] || p.prices['Mayorista'] || 0
    const imagePath = p.img || '/logo.png'
    const qty = state.cart[p.sku] || 0
    
    // Lógica Distribuidor
    const hasDistPrice = (p.prices['Distribuidor'] || 0) > 0
    const cardClass = hasDistPrice ? 'card is-dist' : 'card'
    const distBadge = hasDistPrice ? '<div class="dist-label">DISTRIBUIDOR</div>' : ''

    // Si no está logueado, ocultamos el precio y el botón de agregar
    const priceHtml = state.user 
      ? `<div class="price">${ARS.format(price)}</div>`
      : `<div class="price" style="font-size: 14px; cursor: pointer; color: var(--muted);" onclick="document.getElementById('auth-modal').classList.add('show')">Ingresá para ver precios</div>`

    const controlsHtml = state.user
      ? `<div class="controls">
            <div class="qty-box">
              <button class="qty-btn" onclick="window.modQty('${p.sku}', -1)">-</button>
              <span class="qty-val">${qty}</span>
              <button class="qty-btn" onclick="window.modQty('${p.sku}', 1)">+</button>
            </div>
            <button class="btn-add" onclick="window.modQty('${p.sku}', 1)">AGREGAR</button>
          </div>`
      : `<button class="btn-add" style="background: var(--line); color: var(--muted);" onclick="document.getElementById('auth-modal').classList.add('show')">SOLICITAR ACCESO</button>`

    return `
      <div class="${cardClass}">
        ${distBadge}
        <div class="img"><img src="${imagePath}" onerror="this.src='/logo.png'"></div>
        <div class="body">
          <div class="name">${p.name}</div>
          ${priceHtml}
          ${controlsHtml}
        </div>
      </div>
    `
  }).join('')

  // Botón Cargar Más
  if (paginated.length < totalFiltered) {
    els.grid.innerHTML += `
      <div style="grid-column: 1/-1; text-align: center; padding: 20px;">
        <button class="tile" style="margin: 0 auto; cursor: pointer; font-weight: 800; padding: 0 40px;" onclick="window.loadMore()">
          CARGAR MÁS (${totalFiltered - paginated.length} restantes)
        </button>
      </div>
    `
  }
}

window.loadMore = () => {
  state.page++
  render()
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
      <div style="display:flex; gap:12px; align-items:center; margin-bottom:12px; padding:10px; border-bottom:1px solid var(--line);">
        <img src="${p.img || '/logo.png'}" style="width:50px; height:50px; object-fit:contain; border-radius:8px; border:1px solid var(--line); background:white;">
        <div style="flex:1;">
          <div style="font-weight:700; font-size:13px;">${p.name}</div>
          <div style="color:var(--accent); font-weight:800; font-size:14px;">${qty} x ${ARS.format(price)}</div>
        </div>
        <button onclick="window.modQty('${sku}', -999)" style="background:none; border:none; cursor:pointer; color:var(--muted); font-size:20px;">&times;</button>
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
  els.search.oninput = (e) => { state.query = e.target.value; state.page = 1; render(); }
  els.tierSelect.onchange = (e) => { state.tier = e.target.value; render(); renderCart(); }
  
  $('btn-cart').onclick = () => els.cartDrawer.classList.add('show')
  $('btn-open-login').onclick = () => els.authModal.classList.add('show')
  $('btn-history').onclick = async () => {
    if (!state.user) return alert('Iniciá sesión para ver tus pedidos')
    els.historyDrawer.classList.add('show')
    const { data } = await supabase.from('orders').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false })
    $('history-content').innerHTML = (data || []).map(o => {
      const itemsCount = Object.values(o.items).reduce((a,b) => a+b, 0)
      return `
        <div class="history-card" style="padding:15px; border-bottom:1px solid var(--line); position:relative;">
          <div style="display:flex; justify-content:space-between; align-items:start;">
            <div>
              <b>Pedido #${o.id.slice(0,6)}</b><br>
              <small>${new Date(o.created_at).toLocaleDateString()} - ${itemsCount} items</small>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:800; color:var(--accent); font-size:18px;">${ARS.format(o.total)}</div>
              <div style="display:flex; gap:10px; margin-top:8px; justify-content:flex-end;">
                <button class="btn-ghost" onclick="window.reOpenOrder('${o.id}')" title="Re-editar" style="padding:4px 8px; font-size:11px;">RE-EDITAR</button>
                <button class="btn-ghost" onclick="window.deleteOrder('${o.id}')" title="Eliminar" style="padding:4px 8px; font-size:11px; color:red;">BORRAR</button>
              </div>
            </div>
          </div>
          <details style="margin-top:10px; font-size:12px; color:var(--muted);">
            <summary style="cursor:pointer; font-weight:700;">Ver detalle de productos</summary>
            <div style="padding-top:8px;">
              ${Object.entries(o.items).map(([sku, q]) => {
                const p = state.products.find(x => x.sku === sku)
                return `• ${q} x ${p ? p.name : sku}<br>`
              }).join('')}
            </div>
          </details>
        </div>
      `
    }).join('')
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email: $('login-email').value,
        password: $('login-pass').value
      })
      
      if (error) throw error
      if (!data || !data.user) throw new Error('No se pudo recuperar la información del usuario.')

      // Guardamos en el estado
      state.user = data.user

      // Intentamos traer el perfil
      let { data: profile, error: profError } = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle()
      
      // Si no existe, lo creamos
      if (!profile) {
        const { data: newProfile, error: insError } = await supabase.from('profiles').insert({ 
          id: data.user.id, 
          full_name: 'Usuario Nuevo', 
          dni_cuit: '000',
          is_active: false 
        }).select().single()
        
        if (insError) throw insError
        profile = newProfile
      }

      state.profile = profile

      if (profile && !profile.is_active) {
        $('login-form').classList.add('hidden'); $('activation-form').classList.remove('hidden');
        return
      }
      location.reload()
    } catch (e) { 
      console.error('Error detallado:', e)
      alert('Error al ingresar: ' + (e.message || 'Error desconocido')) 
    }
  }

  $('btn-do-register').onclick = async () => {
    try {
      const email = $('reg-email').value
      const { data, error } = await supabase.auth.signUp({ email, password: $('reg-pass').value })
      if (error) throw error
      await supabase.from('profiles').insert({ id: data.user.id, full_name: $('reg-name').value, dni_cuit: $('reg-dni').value, phone: '' })
      $('register-form').classList.add('hidden'); $('activation-form').classList.remove('hidden');
      state.user = data.user
    } catch (e) { 
      console.error(e)
      alert('Error al registrar: ' + e.message) 
    }
  }

  $('btn-do-activate').onclick = async () => {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', state.user.id).single()
    if (profile.verification_code === $('activate-code').value) {
      await supabase.from('profiles').update({ is_active: true }).eq('id', state.user.id)
      alert('¡Cuenta activada!')
      location.reload()
    } else { alert('Código incorrecto') }
  }

  $('btn-wa-emanuel').onclick = () => {
    const text = `Hola! Me registré en la web y necesito mi código de activación.`
    window.open(`https://wa.me/5493624250452?text=${encodeURIComponent(text)}`, '_blank')
  }

  $('btn-logout').onclick = async () => { await signOut(); location.reload(); }

  // Admin Events
  els.adminBtn.onclick = () => { els.adminDrawer.classList.add('show'); renderAdminOrders(); }
  $('admin-tab-orders').onclick = () => { 
    $('admin-tab-orders').classList.add('primary'); 
    $('admin-tab-users').classList.remove('primary'); 
    renderAdminOrders(); 
  }
  $('admin-tab-users').onclick = () => { 
    $('admin-tab-users').classList.add('primary'); 
    $('admin-tab-orders').classList.remove('primary'); 
    renderAdminUsers(); 
  }

  $('btn-checkout').onclick = async () => {
    if (!state.user) return alert('Iniciá sesión para comprar')
    const total = Object.entries(state.cart).reduce((s, [sku, q]) => {
      const p = state.products.find(x => x.sku === sku)
      return s + ((p?.prices[state.tier] || 0) * q)
    }, 0)
    const { data, error } = await supabase.from('orders').insert({ user_id: state.user.id, total, items: state.cart }).select().single()
    if (error) return alert(error.message)
    const customerName = state.profile?.full_name || 'Cliente'
    const message = `Soy ${customerName}. Confirmé el pedido #${data.id.slice(0,6)} por un total de ${ARS.format(total)}.`
    window.open(`https://wa.me/5493624250452?text=${encodeURIComponent(message)}`, '_blank')
    state.cart = {}
    renderCart()
    render()
  }
}

async function renderAdminOrders() {
  const { data } = await supabase.from('orders').select('*, profiles(full_name)').order('created_at', { ascending: false })
  els.adminContent.innerHTML = `
    <table style="width:100%; border-collapse:collapse; font-size:13px;">
      <thead><tr style="text-align:left; color:var(--muted); border-bottom:1px solid var(--line);">
        <th style="padding:10px;">FECHA</th><th style="padding:10px;">CLIENTE</th><th style="padding:10px;">TOTAL</th><th style="padding:10px;">ACCIONES</th>
      </tr></thead>
      <tbody>
        ${(data || []).map(o => `
          <tr style="border-bottom:1px solid var(--line);">
            <td style="padding:10px;">${new Date(o.created_at).toLocaleDateString()}</td>
            <td style="padding:10px;"><b>${o.profiles?.full_name || 'Desconocido'}</b></td>
            <td style="padding:10px; font-weight:800; color:var(--accent);">${ARS.format(o.total)}</td>
            <td style="padding:10px;"><button class="btn-ghost" onclick="alert('Ver detalle pronto...')">VER</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
}

async function renderAdminUsers() {
  const { data } = await supabase.from('profiles').select('*').eq('is_active', false)
  els.adminContent.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:12px;">
      ${(data || []).map(u => `
        <div class="tile" style="height:auto; padding:15px; flex-direction:column; align-items:start; gap:8px;">
          <div><b>${u.full_name}</b> (${u.dni_cuit})</div>
          <div style="font-size:12px; color:var(--muted);">${u.id}</div>
          <div style="display:flex; gap:10px; width:100%;">
            <input id="vcode-${u.id}" placeholder="Código de activación" class="auth-btn" style="flex:1; height:36px; font-size:12px;">
            <button class="btn-add" onclick="window.activateUser('${u.id}')" style="height:36px; padding:0 15px;">ACTIVAR</button>
          </div>
        </div>
      `).join('') || '<p>No hay clientes pendientes</p>'}
    </div>
  `
}

window.activateUser = async (uid) => {
  const code = document.getElementById(`vcode-${uid}`).value
  if (!code) return alert('Debes asignar un código')
  const { error } = await supabase.from('profiles').update({ verification_code: code, is_active: true }).eq('id', uid)
  if (error) return alert(error.message)
  alert('Cliente activado correctamente')
  renderAdminUsers()
}

window.deleteOrder = async (id) => {
  if (!confirm('¿Seguro querés eliminar este pedido?')) return
  const { error } = await supabase.from('orders').delete().eq('id', id)
  if (error) return alert(error.message)
  $('btn-history').click() // Refresh
}

window.reOpenOrder = async (id) => {
  if (!confirm('Esto cargará los productos del pedido en tu carrito actual. ¿Continuar?')) return
  const { data } = await supabase.from('orders').select('items').eq('id', id).single()
  if (data) {
    state.cart = { ...state.cart, ...data.items }
    renderCart()
    render()
    els.historyDrawer.classList.remove('show')
    els.cartDrawer.classList.add('show')
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
