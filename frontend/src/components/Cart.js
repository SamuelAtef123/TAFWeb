import { useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import {
  egp,
  readCart,
  writeCart,
  toOrderLines,
  getSession,
  setSession,
  clearSession,
} from '../utils/shop';
import './Checkout.css';

function Cart() {
  const [cart, setCart] = useState(readCart);
  const [session, setSessionState] = useState(getSession);
  const [view, setView] = useState('cart'); // 'cart' | 'auth' | 'done'
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);

  const updateCart = nextCart => {
    setCart(nextCart);
    writeCart(nextCart);
  };

  const changeQuantity = (id, change) => {
    const nextCart = cart
      .map(item =>
        (item._id || item.id) === id ? { ...item, quantity: item.quantity + change } : item
      )
      .filter(item => item.quantity > 0);
    updateCart(nextCart);
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);

  /* ---------- talking to the backend ---------- */
  const explain = (err, fallback) => {
    if (!err.response) return 'Cannot reach the bakery server. Please make sure the backend is running.';
    const msg = err.response.data && err.response.data.message;
    if (err.response.status === 409) return 'That email already has an account. Try signing in instead.';
    if (msg && /^Unknown product/.test(msg)) {
      return 'Something in your basket is no longer on the menu. Remove it or empty the basket and try again.';
    }
    return msg || fallback;
  };

  const submitOrder = async token => {
    setBusy(true);
    setError('');
    try {
      const { data } = await axios.post(
        '/api/orders',
        { products: toOrderLines(cart) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReceipt({ order: data, lines: cart });
      setCart([]);
      writeCart([]);
      setView('done');
    } catch (err) {
      if (err.response && err.response.status === 401) {
        clearSession();
        setSessionState(null);
        setView('auth');
        setError('Your session has ended. Please sign in again to place the order.');
      } else {
        setError(explain(err, 'We could not place your order. Please try again.'));
      }
    } finally {
      setBusy(false);
    }
  };

  const checkout = () => {
    setError('');
    if (!session) {
      setView('auth');
      return;
    }
    submitOrder(session.token);
  };

  const authenticate = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await axios.post(`/api/auth/${mode}`, { email, password });
      setSession(data.token, data.user.email);
      setSessionState({ token: data.token, email: data.user.email });
      setBusy(false);
      await submitOrder(data.token); // sign in and order in one go
    } catch (err) {
      setBusy(false);
      setError(explain(err, mode === 'login' ? 'Could not sign in.' : 'Could not create the account.'));
    }
  };

  const signOut = () => {
    clearSession();
    setSessionState(null);
    setView('cart');
  };

  /* ---------- order placed ---------- */
  if (view === 'done' && receipt) {
    const { order, lines } = receipt;
    return (
      <main className="page-shell cart-page">
        <section className="co-done">
          <span className="co-check" aria-hidden="true">
            ✓
          </span>
          <p className="eyebrow">Order placed</p>
          <h1>Thank you!</h1>
          <p className="muted-text">
            Order <strong>#{String(order._id).slice(-6)}</strong> is on its way to the oven. Pay and
            collect it at the bakery.
          </p>

          <ul className="co-receipt">
            {lines.map(item => (
              <li key={item._id || item.id}>
                <span>
                  {item.quantity} × {item.name}
                </span>
                <span>{egp(item.price * item.quantity)}</span>
              </li>
            ))}
            <li className="co-receipt-total">
              <span>Total</span>
              <strong>{egp(order.total)}</strong>
            </li>
          </ul>

          {order.pointsEarned > 0 && (
            <p className="co-points">★ You earned {order.pointsEarned} bakery points</p>
          )}

          <Link className="primary-button" to="/">
            Back to the menu <span>→</span>
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell cart-page">
      <p className="eyebrow">A little something to take home</p>

      <div className="page-heading">
        <div>
          <h1>Your Cart</h1>
          <p className="muted-text">Freshly picked for your table.</p>
        </div>
        <Link className="secondary-button" to="/">
          Continue shopping
        </Link>
      </div>

      {cart.length === 0 ? (
        <div className="empty-panel">
          <span className="empty-mark">✦</span>
          <h2>Your basket is waiting.</h2>
          <p>Fill it with something warm, buttery, and made with care.</p>
          <Link className="primary-button" to="/">
            Browse the menu
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-items">
            {cart.map(item => {
              const id = item._id || item.id;
              return (
                <article className="cart-item" key={id}>
                  <div className="cart-thumb">
                    {item.image ? <img src={item.image} alt="" /> : <span>✦</span>}
                  </div>

                  <div className="cart-item-copy">
                    <h2>{item.name}</h2>
                    <p>{egp(item.price)} each</p>
                  </div>

                  <div className="quantity-control">
                    <button
                      type="button"
                      onClick={() => changeQuantity(id, -1)}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => changeQuantity(id, 1)}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>

                  <strong>{egp(item.price * item.quantity)}</strong>
                </article>
              );
            })}
          </div>

          <aside className="order-summary">
            <p className="eyebrow">Your order</p>
            <h2>Ready when you are.</h2>

            <div className="summary-row">
              <span>
                {count} {count === 1 ? 'item' : 'items'}
              </span>
              <strong>{egp(total)}</strong>
            </div>

            <div className="summary-row">
              <span>Pickup</span>
              <span>At the bakery</span>
            </div>

            {view === 'auth' && !session ? (
              <form className="co-auth" onSubmit={authenticate}>
                <div className="co-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'login'}
                    className={mode === 'login' ? 'active' : ''}
                    onClick={() => {
                      setMode('login');
                      setError('');
                    }}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'register'}
                    className={mode === 'register' ? 'active' : ''}
                    onClick={() => {
                      setMode('register');
                      setError('');
                    }}
                  >
                    Create account
                  </button>
                </div>

                <label htmlFor="co-email">Email</label>
                <input
                  id="co-email"
                  className="co-input"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />

                <label htmlFor="co-password">Password</label>
                <input
                  id="co-password"
                  className="co-input"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
                />

                {error && (
                  <p className="co-error" role="alert">
                    {error}
                  </p>
                )}

                <button className="primary-button co-submit" type="submit" disabled={busy}>
                  {busy ? 'One moment…' : mode === 'login' ? 'Sign in & place order' : 'Create account & place order'}
                  <span>→</span>
                </button>
                <button type="button" className="co-link" onClick={() => setView('cart')}>
                  ← Back
                </button>
              </form>
            ) : (
              <>
                {session && (
                  <p className="co-who">
                    Ordering as <strong>{session.email || 'your account'}</strong>
                    <button type="button" className="co-link" onClick={signOut}>
                      Not you?
                    </button>
                  </p>
                )}

                {error && (
                  <p className="co-error" role="alert">
                    {error}
                  </p>
                )}

                <button className="primary-button" type="button" onClick={checkout} disabled={busy}>
                  {busy ? 'Placing your order…' : 'Place order'} <span>→</span>
                </button>
                <button type="button" className="co-link" onClick={() => updateCart([])}>
                  Empty basket
                </button>
              </>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

export default Cart;
