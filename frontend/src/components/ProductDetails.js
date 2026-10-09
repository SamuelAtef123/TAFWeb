import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';
import { MENU } from '../data/menu';
import { egp, fromApi, readCart, writeCart, toCartItem } from '../utils/shop';

function ProductDetails() {
  const { id } = useParams(); // a Mongo id OR a menu code such as COL001
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let alive = true;
    const fetchProduct = async () => {
      try {
        const { data } = await axios.get(`/api/products/${encodeURIComponent(id)}`);
        if (alive) setProduct(fromApi(data));
      } catch (err) {
        if (!alive) return;
        if (err.response && err.response.status === 404) {
          setError('Product not found');
        } else {
          // server unreachable: fall back to the menu that ships with the website
          const local = MENU.find(p => p.id === id.toUpperCase());
          if (local) setProduct(local);
          else setError('Unable to load product');
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    fetchProduct();
    return () => {
      alive = false;
    };
  }, [id]);

  const addToCart = () => {
    const cart = readCart();
    const key = product._id || product.id;
    const existing = cart.find(item => (item._id || item.id) === key || (product.code && item.code === product.code));
    if (existing) existing.quantity += 1;
    else cart.push(toCartItem(product, 1));
    writeCart(cart);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  if (loading) {
    return (
      <main className="page-shell">
        <p className="status-message">Loading product...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page-shell">
        <div className="empty-panel">
          <p>{error}</p>
          <Link className="secondary-button" to="/">
            Back to products
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell detail-page">
      <Link className="back-link" to="/">
        ← Back to the bakery
      </Link>

      <section className="detail-card">
        <div className="detail-image">
          {product.image ? <img src={product.image} alt={product.name} /> : <span>✦</span>}
        </div>

        <div className="detail-copy">
          <p className="eyebrow">{product.category || 'Fresh from our kitchen'}</p>
          <h1>{product.name}</h1>
          <p className="detail-description">
            {product.description ||
              'Made by hand with thoughtfully chosen ingredients and a little extra care.'}
          </p>
          <p className="detail-price">{egp(product.price)}</p>

          <button
            className="primary-button"
            type="button"
            onClick={addToCart}
            disabled={product.available === false}
          >
            {product.available === false ? 'Sold out' : added ? 'Added ✓' : 'Add to cart'}{' '}
            {product.available !== false && !added && <span>+</span>}
          </button>

          <p>
            <Link className="text-link" to="/cart">
              View your cart →
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

export default ProductDetails;
