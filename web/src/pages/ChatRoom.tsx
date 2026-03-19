import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
import { useCharacterStore } from '../store/characterStore';
import { useAuthStore } from '../store/authStore';
import { socketService } from '../services/socket';
import { MessageBubble } from '../components/chat/MessageBubble';
import { TypingIndicator } from '../components/chat/TypingIndicator';
import type { Message } from '../types/message';
import { Colors } from '../theme/colors';

export function ChatRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [inputText, setInputText] = useState('');
  const [typingCharId, setTypingCharId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { conversations, messages, addMessage, markAsRead, fetchMessages, fetchConversations, isLoading } = useChatStore();
  const getById = useCharacterStore((s) => s.getById);
  const { userId } = useAuthStore();

  const conversation = conversations.find((c) => c.id === id);
  const msgList = messages[id ?? ''] ?? [];

  useEffect(() => {
    if (id) fetchMessages(id);
  }, [id]);

  useEffect(() => {
    if (!conversation && userId && !isLoading) {
      fetchConversations(userId);
    }
  }, [conversation, userId, isLoading]);

  useEffect(() => {
    if (!id) return;
    socketService.connect();
    socketService.joinConversation(id);

    const handleNewMessage = (msg: unknown) => addMessage(id, msg as Message);
    const handleTypingStart = ({ characterId }: { characterId: string }) => setTypingCharId(characterId);
    const handleTypingStop = () => setTypingCharId(null);

    socketService.onNewMessage(handleNewMessage);
    socketService.onTypingStart(handleTypingStart);
    socketService.onTypingStop(handleTypingStop);

    return () => {
      socketService.offNewMessage(handleNewMessage);
      socketService.offTypingStart(handleTypingStart);
      socketService.offTypingStop(handleTypingStop);
    };
  }, [id]);

  useEffect(() => {
    if (id) markAsRead(id);
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgList.length, typingCharId]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !id || !conversation || !userId) return;
    setInputText('');

    // 本地立即插入用户消息，模拟微信体验
    const optimisticMsg: Message = {
      id: `local-${Date.now()}`,
      conversationId: id,
      senderType: 'user',
      senderId: userId,
      senderName: '我',
      senderAvatar: '',
      type: 'text',
      text,
      createdAt: new Date(),
      isRead: true,
    };
    addMessage(id, optimisticMsg);

    socketService.sendMessage({
      conversationId: id,
      characterId: conversation.participants[0],
      text,
      userId,
    });
  }, [inputText, id, conversation, userId, addMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!conversation) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100dvh', backgroundColor: Colors.bgChat,
      }}>
        <span style={{ color: Colors.textSecondary, fontSize: 14 }}>加载中...</span>
      </div>
    );
  }

  const isGroup = conversation.type === 'group';
  const mainChar = !isGroup ? getById(conversation.participants[0]) : null;
  const typingChar = typingCharId ? getById(typingCharId) : null;

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      height: '100dvh', backgroundColor: 'transparent', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        backgroundColor: 'rgba(255,251,245,0.92)',
        padding: '8px',
        borderBottom: '0.5px solid rgba(249,115,22,0.15)', flexShrink: 0,
      }}>
        <button
          onClick={() => navigate('/tabs/chat')}
          style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 28, color: Colors.textPrimary, lineHeight: '30px' }}>‹</span>
        </button>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: Colors.textPrimary }}>
            {conversation.title}
          </span>
          {isGroup && (
            <span style={{ fontSize: 11, color: Colors.textSecondary }}>
              {conversation.participants.length} 人
            </span>
          )}
        </div>
        {mainChar && (
          <button
            onClick={() => navigate(`/character/${mainChar.id}`)}
            style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <span style={{ fontSize: 22 }}>{mainChar.avatar}</span>
          </button>
        )}
        {isGroup && (
          <button style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer' }}>
            <span style={{ fontSize: 22, color: Colors.textPrimary }}>⋯</span>
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8, paddingBottom: 8 }}>
        {msgList.map((msg) => {
          const char = msg.senderType === 'character' ? getById(msg.senderId) : null;
          const enriched = char ? { ...msg, senderAvatar: char.avatar } : msg;
          return <MessageBubble key={msg.id} message={enriched} />;
        })}
        {typingCharId && (
          <div style={{ paddingLeft: 12 }}>
            {typingChar && (
              <div style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 2, marginLeft: 2 }}>
                {typingChar.avatar} {typingChar.name}
              </div>
            )}
            <TypingIndicator />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div style={{
        display: 'flex', alignItems: 'flex-end',
        backgroundColor: 'rgba(255,251,245,0.92)',
        padding: '8px',
        borderTop: '0.5px solid rgba(249,115,22,0.15)', gap: 6, flexShrink: 0,
      }}>
        <button style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer' }}>
          <span style={{ fontSize: 22 }}>🎤</span>
        </button>
        <input
          ref={inputRef}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.04)',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: 20,
            padding: '8px 14px', fontSize: 15, color: Colors.textPrimary,
            minHeight: 36,
          }}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="发送消息"
        />
        <button style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer' }}>
          <span style={{ fontSize: 22 }}>😊</span>
        </button>
        {inputText.trim() ? (
          <button
            onClick={handleSend}
            style={{
              background: 'linear-gradient(135deg, #F97316 0%, #FBBF24 100%)',
              boxShadow: '0 2px 10px rgba(249,115,22,0.35)',
              borderRadius: 20,
              padding: '8px 14px', fontSize: 13, fontWeight: 600,
              color: '#fff', cursor: 'pointer', border: 'none', flexShrink: 0,
            }}
          >
            发送
          </button>
        ) : (
          <button style={{
            width: 36, height: 36, borderRadius: 20,
            backgroundColor: 'rgba(0,0,0,0.05)',
            border: '1px solid rgba(0,0,0,0.06)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: 22, color: Colors.textPrimary }}>＋</span>
          </button>
        )}
      </div>
    </div>
  );
}
