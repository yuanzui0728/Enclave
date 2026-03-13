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
      login(res.token, res.userId, res.username);
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
      backgroundColor: Colors.bgMain, height: '100%',
      padding: '0 24px',
    }}>
      <div style={{ fontSize: 56, fontWeight: 700, color: Colors.primaryLight, letterSpacing: 8, marginBottom: 8 }}>
        隐界
      </div>
      <div style={{ fontSize: 13, color: 'rgba(167,139,250,0.6)', letterSpacing: 2, marginBottom: 48 }}>
        推开隐界，他们都在
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          style={{
            backgroundColor: Colors.bgInput, borderRadius: 10,
            padding: '14px 12px', fontSize: 15, color: Colors.textPrimary,
            border: `1px solid ${Colors.border}`, width: '100%',
          }}
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
        />
        <input
          style={{
            backgroundColor: Colors.bgInput, borderRadius: 10,
            padding: '14px 12px', fontSize: 15, color: Colors.textPrimary,
            border: `1px solid ${Colors.border}`, width: '100%',
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
            backgroundColor: Colors.primary, borderRadius: 10,
            padding: '14px', fontSize: 15, fontWeight: 600,
            color: '#fff', marginTop: 4, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? '登录中…' : '登录'}
        </button>
        <button
          onClick={() => handleAuth(true)}
          disabled={loading}
          style={{
            borderRadius: 10, padding: '14px', fontSize: 15,
            color: Colors.textSecondary, border: `1px solid ${Colors.border}`,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          注册新账号
        </button>
      </div>
    </div>
  );
}
