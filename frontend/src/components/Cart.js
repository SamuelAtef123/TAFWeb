import { useState } from 'react';
import { Link } from 'react-router-dom';

function readCart() {
  try {
    return JSON.parse(localStorage.getItem('cart') || '[]');
  } catch (err) {
    return [];
  }
}

function Cart() {
  const [cart, setCart] = useState(readCart);

  const updateCart = nextCart => {
    setCart(nextCart);
    localStorage.setItem('cart', JSON.stringify(nextCart));
  };

  const changeQuantity = (id, change) => {
    const nextCart = cart
      .map(item =>
        item._id === id ? { ...item, quantity: item.quantity + change } : item
      )
      .filter(item => item.quantity > 0);

    updateCart(nextCart);
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

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
            {cart.map(item => (
              <article className="cart-item" key={item._id}>
                <div className="cart-thumb">
                  {item.image ? <img src={item.image} alt="" /> : <span>✦</span>}
                </div>

                <div className="cart-item-copy">
                  <h2>{item.name}</h2>
                  <p>${Number(item.price).toFixed(2)} each</p>
                </div>

                <div className="quantity-control">
                  <button
                    type="button"
                    onClick={() => changeQuantity(item._id, -1)}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => changeQuantity(item._id, 1)}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                <strong>${(item.price * item.quantity).toFixed(2)}</strong>
              </article>
            ))}
          </div>

          <aside className="order-summary">
            <p className="eyebrow">Your order</p>
            <h2>Ready when you are.</h2>

            <div className="summary-row">
              <span>Subtotal</span>
              <strong>${total.toFixed(2)}</strong>
            </div>

            <div className="summary-row">
              <span>Pickup</span>
              <span>At the bakery</span>
            </div>

            <button className="primary-button" type="button">
              Checkout <span>→</span>
            </button>
          </aside>
        </div>
      )}
    </main>
  );
}

export default Cart;
