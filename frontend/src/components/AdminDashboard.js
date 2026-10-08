import { useState, useEffect } from 'react';
import axios from 'axios';

function AdminDashboard() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const fetchOrders = async () => {
      const token = localStorage.getItem('adminToken');
      const { data } = await axios.get('/api/orders', {
        headers: { Authorization: `Bearer ${token}` }
      });

      setOrders(data);
    };

    fetchOrders();
  }, []);

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

        {orders.length === 0 ? (
          <div className="empty-panel">
            <span className="empty-mark">✦</span>
            <h3>No orders just yet.</h3>
            <p>When customers place an order, it will appear here.</p>
          </div>
        ) : (
          <ul className="order-list">
            {orders.map(order => (
              <li key={order._id}>
                <div>
                  <strong>{order.user.email}</strong>
                  <span>Order #{order._id.slice(-6)}</span>
                </div>
                <strong>${Number(order.total).toFixed(2)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default AdminDashboard;