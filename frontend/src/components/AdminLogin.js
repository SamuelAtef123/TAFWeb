import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function AdminLogin() {
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const { data } = await axios.post('/api/auth/admin-login', { password });
      localStorage.setItem('adminToken', data.token);
      navigate('/admin/dashboard');
    } catch (err) {
      alert('Invalid password');
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark">T&amp;F</div>
        <p className="eyebrow">Behind the counter</p>
        <h1>Welcome back.</h1>
        <p className="muted-text">Sign in to manage today's bakery orders.</p>

        <input
          className="form-input"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Enter admin password"
        />

        <button className="primary-button form-button" onClick={handleLogin}>
          Enter dashboard <span>→</span>
        </button>
      </section>
    </main>
  );
}

export default AdminLogin;