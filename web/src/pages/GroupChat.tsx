import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useCharacterStore } from '../store/characterStore';
import { api } from '../services/api';
import { socketService } from '../services/socket';
import { MessageBubble } from '../components/chat/MessageBubble';
import { Colors } from '../theme/colors';
import type { Message } from '../types/message';

interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderType: 'user' | 'character';
  senderName: string;
  senderAvatar?: string;
  text: string;
  type: 'text' | 'system';
  createdAt: string;
}

export function GroupChat() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userId, username } = useAuthStore();
  const getById = useCharacterStore((s) => s.getById);
  const [group, setGroup] = useState<{ id: string; name: string } | null>(null);
  const [members, setMembers] = useState<{ memberId: string; memberType: string; memberName?: string; memberAvatar?: string }[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getGroup(id),
      api.getGroupMembers(id),
      api.getGroupMessages(id),
    ]).then(([g, m, msgs]) => {
      setGroup(g as { id: string; name: string });
      setMembers(m as typeof members);
      setMessages((msgs as GroupMessage[]).reverse());
    }).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !id || !userId) return;
    setInputText('');

    const optimistic: GroupMessage = {
      id: `local-${Date.now()}`,
      groupId: id,
      senderId: userId,
      senderType: 'user',
      senderName: username ?? '我',
      text,
      type: 'text',
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    // Send via REST (group chat uses REST for now)
    fetch(`/api/groups/${id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${useAuthStore.getState().token}`,
      },
      body: JSON.stringify({ senderId: userId, senderType: 'user', senderName: username, text }),
    }).catch(console.error);
  }, [inputText, id, userId, username]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toMessage = (m: GroupMessage): Message => ({
    id: m.id,
    conversationId: m.groupId,
    senderType: m.senderType,
    senderId: m.senderId,
    senderName: m.senderName,
    senderAvatar: m.senderAvatar ?? (m.senderType === 'character' ? (getById(m.senderId)?.avatar ?? '') : '🙂'),
    type: m.type === 'system' ? 'system' : 'text',
    text: m.text,
    createdAt: new Date(m.createdAt),
    isRead: true,
  });

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', backgroundColor: Colors.bgChat }}>
      <span style={{ color: Colors.textSecondary }}>加载中…</span>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100dvh', backgroundColor: Colors.bgChat, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        backgroundColor: Colors.navBg, padding: '8px',
        borderBottom: `0.5px solid ${Colors.navBorder}`, flexShrink: 0,
      }}>
        <button onClick={() => navigate('/tabs/chat')} style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer' }}>
          <span style={{ fontSize: 28, color: Colors.textPrimary, lineHeight: '30px' }}>‹</span>
        </button>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: Colors.textPrimary }}>{group?.name ?? '群聊'}</span>
          <span style={{ fontSize: 11, color: Colors.textSecondary }}>{members.length} 人</span>
        </div>
        <div style={{ width: 40 }} />
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8, paddingBottom: 8 }}>
        {messages.map((m) => (
          <MessageBubble key={m.id} message={toMessage(m)} />
        ))}
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: Colors.textSecondary, fontSize: 13 }}>
            群聊已创建，开始聊天吧
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        display: 'flex', alignItems: 'flex-end',
        backgroundColor: Colors.navBg, padding: '8px',
        borderTop: `0.5px solid ${Colors.navBorder}`, gap: 6, flexShrink: 0,
      }}>
        <input
          style={{
            flex: 1, backgroundColor: Colors.bgWhite, borderRadius: 6,
            padding: '8px', fontSize: 15, color: Colors.textPrimary, minHeight: 36,
          }}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="发送消息"
        />
        {inputText.trim() ? (
          <button
            onClick={handleSend}
            style={{
              backgroundColor: Colors.primary, borderRadius: 6,
              padding: '8px 14px', fontSize: 13, fontWeight: 600,
              color: '#fff', cursor: 'pointer', border: 'none', flexShrink: 0,
            }}
          >
            发送
          </button>
        ) : (
          <button style={{
            width: 36, height: 36, borderRadius: 6,
            backgroundColor: Colors.bgInput, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: 22, color: Colors.textPrimary }}>＋</span>
          </button>
        )}
      </div>
    </div>
  );
}
