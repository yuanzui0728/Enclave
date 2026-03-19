import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useChatStore } from '../../store/chatStore';
import { Colors } from '../../theme/colors';

const TABS = [
  { path: '/tabs/chat', icon: '💬', label: '消息' },
  { path: '/tabs/moments', icon: '🌐', label: '朋友圈' },
  { path: '/tabs/discover', icon: '🎬', label: '发现' },
  { path: '/tabs/contacts', icon: '👥', label: '通讯录' },
  { path: '/tabs/profile', icon: '👤', label: '我' },
];

export function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const conversations = useChatStore((s) => s.conversations);
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      backgroundColor: 'rgba(255,251,245,0.92)',
      borderTop: '0.5px solid rgba(249,115,22,0.15)',
      flexShrink: 0,
      position: 'relative',
    }}>
      {/* Top highlight line */}
      <div style={{
        position: 'absolute',
        top: 0, left: '10%', right: '10%', height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(249,115,22,0.35), transparent)',
        pointerEvents: 'none',
      }} />
      {TABS.map((tab) => {
        const active = location.pathname === tab.path;
        const showBadge = tab.path === '/tabs/chat' && totalUnread > 0;
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 8,
              paddingBottom: 12,
              gap: 3,
              position: 'relative',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {/* Active top indicator */}
            {active && (
              <div style={{
                position: 'absolute', top: 0, left: '50%',
                transform: 'translateX(-50%)',
                width: 20, height: 2, borderRadius: 1,
                background: '#F97316',
              }} />
            )}
            {/* Active bottom glow */}
            {active && (
              <div style={{
                position: 'absolute', bottom: 0, left: '50%',
                transform: 'translateX(-50%)',
                width: 40, height: 24,
                background: 'radial-gradient(ellipse 100% 100% at 50% 100%, rgba(249,115,22,0.45) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />
            )}
            <div style={{ position: 'relative' }}>
              <span style={{
                fontSize: 22,
                filter: active ? 'drop-shadow(0 0 6px rgba(249,115,22,0.6))' : 'none',
                transition: 'filter 0.2s ease',
              }}>{tab.icon}</span>
              {showBadge && (
                <span style={{
                  position: 'absolute',
                  top: -4,
                  right: -8,
                  backgroundColor: Colors.unreadBadge,
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 600,
                  borderRadius: 10,
                  minWidth: 16,
                  height: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingLeft: 3,
                  paddingRight: 3,
                  boxShadow: '0 0 6px rgba(248,113,113,0.5)',
                }}>
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </div>
            <span style={{
              fontSize: 10,
              color: active ? '#F97316' : Colors.textLight,
              fontWeight: active ? 600 : 400,
              textShadow: active ? '0 0 8px rgba(249,115,22,0.4)' : 'none',
              transition: 'color 0.2s ease, text-shadow 0.2s ease',
            }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
