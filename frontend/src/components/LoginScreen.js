// AUTH-PATCH 2026-06-02: شاشة تسجيل الدخول OAuth2 Password Flow

import React, { useState } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const LoginScreen = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const res = await fetch(`${API_BASE_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Invalid credentials');
      }

      const data = await res.json();
      localStorage.setItem('nrc_token', data.access_token);
      localStorage.setItem('nrc_user', JSON.stringify(data.user));
      
      onLogin({ token: data.access_token, user: data.user });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #1F4E78 0%, #2c3e50 100%)', direction: 'rtl'
    }}>
      <div style={{
        background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        width: '100%', maxWidth: '400px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{ fontSize: '48px' }}>🏗️</div>
          <h2 style={{ color: '#1F4E78' }}>نظام تتبع الحمامات</h2>
          <p style={{ color: '#7f8c8d' }}>NRC Latrine Tracker</p>
        </div>

        {error && (
          <div style={{ background: '#fdedec', color: '#c0392b', padding: '12px', borderRadius: '6px', marginBottom: '20px', textAlign: 'center' }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>اسم المستخدم</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }}
              required
            />
          </div>
          <div style={{ marginBottom: '25px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>كلمة المرور</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ddd', boxSizing: 'border-box' }}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '14px', background: loading ? '#95a5a6' : '#27ae60', color: 'white',
              border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? '⏳ جاري الدخول...' : '🔐 تسجيل الدخول'}
          </button>
        </form>

        <div style={{ marginTop: '20px', padding: '15px', background: '#f8f9fa', borderRadius: '6px', fontSize: '13px', textAlign: 'center' }}>
          <strong>الوصول الافتراضي:</strong><br/>
          اسم المستخدم: <code>admin</code><br/>
          كلمة المرور: <code>{process.env.REACT_APP_DEFAULT_PASSWORD || 'admin123'}</code><br/>
          <small style={{ color: '#e74c3c' }}>⚠️ غيّر كلمة السر فوراً في البيئة (ADMIN_PASSWORD)</small>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;