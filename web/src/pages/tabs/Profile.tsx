import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../theme/colors';

export function Profile() {
  const navigate = useNavigate();
  const { username, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: Colors.bgMain }}>
      {/* Header */}
      <div style={{
        backgroundColor: Colors.navBg, padding: '12px 16px',
        borderBottom: `0.5px solid ${Colors.navBorder}`, flexShrink: 0,
      }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: Colors.textPrimary }}>我</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* User info */}
        <div style={{
          display: 'flex', alignItems: 'center',
          backgroundColor: Colors.bgWhite, padding: '20px 16px', marginBottom: 8,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 10,
            backgroundColor: Colors.bgCard,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, marginRight: 16,
          }}>
            🙂
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: Colors.textPrimary, marginBottom: 4 }}>
              {username ?? '用户'}
            </div>
            <div style={{ fontSize: 13, color: Colors.textSecondary }}>隐界用户</div>
          </div>
        </div>

        {/* Menu items */}
        {[
          { icon: '📦', label: '导入角色', action: () => navigate('/import') },
        ].map((item, i) => (
          <div
            key={i}
            onClick={item.action}
            style={{
              display: 'flex', alignItems: 'center',
              backgroundColor: Colors.bgWhite, padding: '14px 16px',
              borderBottom: `0.5px solid ${Colors.border}`, cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 20, marginRight: 12 }}>{item.icon}</span>
            <span style={{ flex: 1, fontSize: 15, color: Colors.textPrimary }}>{item.label}</span>
            <span style={{ fontSize: 18, color: Colors.textLight }}>›</span>
          </div>
        ))}

        {/* Logout */}
        <div style={{ padding: '24px 16px' }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%', padding: '14px',
              backgroundColor: 'rgba(248,81,73,0.1)',
              border: `1px solid rgba(248,81,73,0.3)`,
              borderRadius: 10, fontSize: 15,
              color: '#F85149', cursor: 'pointer',
            }}
          >
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
