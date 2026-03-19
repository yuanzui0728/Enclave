import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { ChatListItem } from '../../components/chat/ChatListItem';
import { Colors } from '../../theme/colors';

export function ChatList() {
  const navigate = useNavigate();
  const conversations = useChatStore((s) => s.conversations);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const userId = useAuthStore((s) => s.userId);

  useEffect(() => {
    if (userId) fetchConversations(userId);
  }, [userId]);

  const sorted = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: 'rgba(255,251,245,0.88)',
        padding: '12px 16px',
        borderBottom: '0.5px solid rgba(249,115,22,0.15)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: Colors.textPrimary }}>隐界</span>
        <button onClick={() => navigate('/characters')} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
          <span style={{ fontSize: 22, color: Colors.textPrimary }}>＋</span>
        </button>
      </div>

      {/* Search */}
      <div style={{ backgroundColor: 'rgba(255,251,245,0.88)', padding: '0 16px 8px', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.04)',
          border: '1px solid rgba(0,0,0,0.06)',
          borderRadius: 10, padding: '6px 8px',
        }}>
          <span style={{ fontSize: 14, marginRight: 6 }}>🔍</span>
          <input
            style={{ flex: 1, fontSize: 13, color: Colors.textPrimary, background: 'none' }}
            placeholder="搜索"
          />
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sorted.map((conv, i) => (
          <React.Fragment key={conv.id}>
            <ChatListItem
              conversation={conv}
              onPress={() => navigate(`/chat/${conv.id}`)}
            />
            {i < sorted.length - 1 && (
              <div style={{ height: 0.5, backgroundColor: Colors.border, marginLeft: 76 }} />
            )}
          </React.Fragment>
        ))}
        {sorted.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80 }}>
            <span style={{ fontSize: 48, marginBottom: 16 }}>💬</span>
            <span style={{ fontSize: 15, color: Colors.textSecondary }}>还没有会话</span>
            <span style={{ fontSize: 13, color: Colors.textLight, marginTop: 6 }}>去通讯录添加角色开始聊天</span>
          </div>
        )}
      </div>
    </div>
  );
}
