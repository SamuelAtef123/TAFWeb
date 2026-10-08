import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';

function ProductDetails() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const { data } = await axios.get('/api/products');
        const selectedProduct = data.find(item => item._id === id);

        if (!selectedProduct) {
          setError('Product not found');
        } else {
          setProduct(selectedProduct);
        }
      } catch (err) {
        setError('Unable to load product');
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id]);

  const addToCart = () => {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const existingItem = cart.find(item => item._id === product._id);

    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.push({ ...product, quantity: 1 });
    }

    localStorage.setItem('cart', JSON.stringify(cart));
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
          <p className="eyebrow">Fresh from our kitchen</p>
          <h1>{product.name}</h1>
          <p className="detail-description">
            {product.description ||
              'Made by hand with thoughtfully chosen ingredients and a little extra care.'}
          </p>
          <p className="detail-price">${Number(product.price).toFixed(2)}</p>

          <button className="primary-button" type="button" onClick={addToCart}>
            Add to cart <span>+</span>
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
