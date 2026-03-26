import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from '../config';
import { useToast } from '../components/Toast';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const showToast = useToast();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('adminToken')) navigate('/dashboard');
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`${BACKEND_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('adminToken', data.token);
        showToast('Authentication successful', 'success');
        setTimeout(() => navigate('/dashboard'), 500);
      } else {
        showToast(data.message || 'Authentication failed', 'error');
        setLoading(false);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        showToast('Login request timed out. Try again.', 'error');
      } else {
        showToast('Network error connecting to server.', 'error');
      }
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh',
      background: `radial-gradient(circle at top right, rgba(168,85,247,0.05), transparent 50%),
        radial-gradient(circle at bottom left, rgba(251,146,60,0.05), transparent 50%),
        var(--bg-color)`
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{
          background: 'var(--orange-gradient)', width: 48, height: 48, borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
          transform: 'rotate(-10deg)', boxShadow: '0 8px 15px rgba(251,146,60,0.3)'
        }}>
          <span className="material-symbols-rounded">bolt</span>
        </div>
        <h1 className="text-gradient" style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0, letterSpacing: -1 }}>BuzzIt!</h1>
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginBottom: '2rem', fontWeight: 500 }}>
        The Ultimate Interactive Quiz Experience
      </div>

      {/* Role toggle */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <button onClick={() => navigate('/')} style={{
          padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', fontFamily: "'Nunito',sans-serif",
          fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: 'white', color: 'var(--text-main)', border: '1px solid rgba(226,232,240,0.8)',
          boxShadow: 'var(--shadow-soft)', transition: 'background 0.2s'
        }}
          onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
          onMouseLeave={e => e.currentTarget.style.background = 'white'}
        >
          <span className="material-symbols-rounded" style={{ fontSize: 20 }}>groups</span> Participant Login
        </button>
        <button style={{
          padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', fontFamily: "'Nunito',sans-serif",
          fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: 'var(--primary-gradient)', color: 'white', border: 'none',
          boxShadow: '0 8px 15px rgba(168,85,247,0.2)'
        }}>
          <span className="material-symbols-rounded" style={{ fontSize: 20 }}>admin_panel_settings</span> Admin Login
        </button>
      </div>

      {/* Login card */}
      <div style={{ width: '100%', maxWidth: 500 }}>
        <div className="white-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{
              width: 48, height: 48, background: 'var(--text-main)', borderRadius: 12,
              color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span className="material-symbols-rounded">shield_person</span>
            </div>
            <div>
              <h2 style={{ margin: 0, fontWeight: 800, fontSize: '1.5rem' }}>Admin Portal</h2>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Login to manage the arena</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label className="input-label">Admin Username</label>
              <input
                type="text"
                className="input-field"
                placeholder="Enter admin username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
              />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label className="input-label">Password</label>
              <input
                type="password"
                className="input-field"
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', marginTop: '1rem' }}
              disabled={loading}
            >
              {loading
                ? <><span className="material-symbols-rounded spin">sync</span> Verifying...</>
                : <>Access Dashboard <span className="material-symbols-rounded" style={{ fontSize: 18 }}>arrow_forward</span></>
              }
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
