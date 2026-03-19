import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Colors } from '../theme/colors';

export function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (isRegister: boolean) => {
    const u = username.trim();
    const p = password.trim();
    if (!u || !p) { setError('请输入用户名和密码'); return; }
    setError('');
    setLoading(true);
    try {
      const res = isRegister ? await api.register(u, p) : await api.login(u, p);
      login(res.token, res.userId, res.username, res.onboardingCompleted);
      navigate('/tabs/chat', { replace: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'transparent', height: '100%',
      padding: '0 24px',
    }}>
      <div style={{
        fontSize: 56, fontWeight: 700, letterSpacing: 8, marginBottom: 8,
        background: 'linear-gradient(135deg, #F97316 0%, #FBBF24 50%, #FB923C 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}>
        隐界
      </div>
      <div style={{ fontSize: 13, color: 'rgba(249,115,22,0.7)', letterSpacing: 2, marginBottom: 48 }}>
        推开隐界，他们都在
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          style={{
            backgroundColor: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(249,115,22,0.20)',
            borderRadius: 12,
            padding: '14px 12px', fontSize: 15, color: Colors.textPrimary,
            width: '100%',
          }}
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
        />
        <input
          style={{
            backgroundColor: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(249,115,22,0.20)',
            borderRadius: 12,
            padding: '14px 12px', fontSize: 15, color: Colors.textPrimary,
            width: '100%',
          }}
          placeholder="密码"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAuth(false)}
        />
        {error && (
          <div style={{ fontSize: 13, color: '#F85149', textAlign: 'center' }}>{error}</div>
        )}
        <button
          onClick={() => handleAuth(false)}
          disabled={loading}
          style={{
            background: 'linear-gradient(135deg, #F97316 0%, #FB923C 50%, #FBBF24 100%)',
            boxShadow: '0 4px 20px rgba(249,115,22,0.40)',
            borderRadius: 12,
            padding: '14px', fontSize: 15, fontWeight: 600,
            color: '#fff', marginTop: 4, cursor: loading ? 'not-allowed' : 'pointer',
            border: 'none',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? '登录中…' : '登录'}
        </button>
        <button
          onClick={() => handleAuth(true)}
          disabled={loading}
          style={{
            backgroundColor: 'rgba(255,255,255,0.8)',
            border: '1px solid rgba(249,115,22,0.18)',
            borderRadius: 12,
            padding: '14px', fontSize: 15,
            color: Colors.textSecondary,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          注册新账号
        </button>
      </div>
    </div>
  );
}
