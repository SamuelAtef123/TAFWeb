import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { egp } from '../utils/shop';

function AdminDashboard() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOrders = async () => {
      const token = localStorage.getItem('adminToken');
      if (!token) {
        navigate('/admin/login');
        return;
      }
      try {
        const { data } = await axios.get('/api/orders', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setOrders(data);
      } catch (err) {
        if (err.response && [401, 403].includes(err.response.status)) {
          localStorage.removeItem('adminToken');
          navigate('/admin/login');
        } else {
          setError('Unable to load orders. Is the backend running?');
        }
      }
    };

    fetchOrders();
  }, [navigate]);

  return (
    <main className="page-shell dashboard-page">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">Behind the counter</p>
          <h1>Good morning, baker.</h1>
          <p className="muted-text">
            Here is what is happening at Tino &amp; Friends today.
          </p>
        </div>
        <span className="dashboard-date">Today's orders</span>
      </div>

      <section className="stats-row">
        <div>
          <span className="stat-label">Open orders</span>
          <strong>{orders.length}</strong>
        </div>
        <div>
          <span className="stat-label">Your kitchen</span>
          <strong>Warm</strong>
        </div>
        <div>
          <span className="stat-label">Status</span>
          <strong className="status-dot">● Live</strong>
        </div>
      </section>

      <section className="orders-panel">
        <div className="panel-heading">
          <h2>Orders</h2>
          <span>{orders.length} total</span>
        </div>

        {error && <p className="error-message">{error}</p>}

        {orders.length === 0 && !error ? (
          <div className="empty-panel">
            <span className="empty-mark">✦</span>
            <h3>No orders just yet.</h3>
            <p>When customers place an order, it will appear here.</p>
          </div>
        ) : (
          <ul className="order-list">
            {orders.map(order => {
              const items = (order.products || []).reduce((sum, line) => sum + line.quantity, 0);
              return (
                <li key={order._id}>
                  <div>
                    <strong>{order.user ? order.user.email : 'Deleted account'}</strong>
                    <span>
                      Order #{order._id.slice(-6)} · {items} {items === 1 ? 'item' : 'items'} ·{' '}
                      {new Date(order.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <strong>{egp(order.total)}</strong>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

export default AdminDashboard;
