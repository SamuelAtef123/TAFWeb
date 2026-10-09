// Small shared helpers for the shop: money, cart lines, login session.

export const egp = n =>
  `${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} EGP`;

export const notifyCart = () => window.dispatchEvent(new Event('cart:updated'));

export const isObjectId = s => /^[a-f\d]{24}$/i.test(String(s));

// A product from the API ({ _id, code, ... }) in the shape the menu uses.
export const fromApi = p => ({
  id: p._id,
  _id: p._id,
  code: p.code,
  name: p.name,
  category: p.category,
  price: p.price,
  currency: p.currency || 'EGP',
  description: p.description || '',
  image: p.image || (p.code ? `/images/products/${p.code}.webp` : ''),
  available: p.available !== false,
  featured: !!p.featured,
});

// The cart line we store in localStorage.
export const toCartItem = (product, quantity = 1) => ({
  _id: product._id || product.id,
  id: product._id || product.id,
  code: product.code,
  name: product.name,
  price: product.price,
  image: product.image,
  category: product.category,
  quantity,
});

export const readCart = () => {
  try {
    const c = JSON.parse(localStorage.getItem('cart') || '[]');
    return Array.isArray(c) ? c : [];
  } catch (err) {
    return [];
  }
};

export const writeCart = cart => {
  try {
    localStorage.setItem('cart', JSON.stringify(cart));
  } catch (err) {
    /* storage blocked - nothing we can do */
  }
  notifyCart();
};

// What we send to POST /api/orders. Mongo ids go as `product`, menu codes as `code`.
export const toOrderLines = cart =>
  cart.map(item => {
    const id = item._id || item.id;
    return isObjectId(id)
      ? { product: id, quantity: item.quantity }
      : { code: item.code || id, quantity: item.quantity };
  });

// Rewrite stored cart lines so they point at the live product (Mongo id, current price,
// name and photo), and merge lines that turn out to be the same product.
export const normalizeCart = (cart, menu) => {
  const byKey = new Map();
  menu.forEach(p => {
    byKey.set(p.id, p);
    if (p.code) byKey.set(p.code, p);
  });
  const out = new Map();
  for (const it of cart) {
    const p = byKey.get(it._id || it.id) || (it.code && byKey.get(it.code));
    const line = p ? { ...it, ...toCartItem(p, it.quantity) } : { ...it };
    const key = line._id || line.id;
    if (out.has(key)) out.get(key).quantity += line.quantity;
    else out.set(key, line);
  }
  const next = [...out.values()];
  return JSON.stringify(next) === JSON.stringify(cart) ? cart : next;
};

/* ---------- customer login session ---------- */
export const getSession = () => {
  const token = localStorage.getItem('token');
  const email = localStorage.getItem('userEmail');
  return token ? { token, email } : null;
};
export const setSession = (token, email) => {
  localStorage.setItem('token', token);
  localStorage.setItem('userEmail', email || '');
};
export const clearSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('userEmail');
};
