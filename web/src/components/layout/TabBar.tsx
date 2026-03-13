import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useChatStore } from '../../store/chatStore';
import { Colors } from '../../theme/colors';

const TABS = [
  { path: '/tabs/chat', icon: '💬', label: '消息' },
  { path: '/tabs/moments', icon: '🌐', label: '朋友圈' },
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
      backgroundColor: Colors.navBg,
      borderTop: `0.5px solid ${Colors.navBorder}`,
      flexShrink: 0,
    }}>
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
            <div style={{ position: 'relative' }}>
              <span style={{ fontSize: 22 }}>{tab.icon}</span>
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
                }}>
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </div>
            <span style={{
              fontSize: 10,
              color: active ? Colors.primary : Colors.textLight,
              fontWeight: active ? 600 : 400,
            }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
