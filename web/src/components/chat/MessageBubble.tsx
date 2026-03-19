import React from 'react';
import type { Message } from '../../types/message';
import { Colors } from '../../theme/colors';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.senderType === 'user';

  if (message.type === 'system') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 16px' }}>
        <span style={{
          fontSize: 11, color: Colors.textLight,
          backgroundColor: 'rgba(0,0,0,0.05)',
          padding: '3px 10px', borderRadius: 10,
        }}>
          {message.text}
        </span>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      padding: '4px 12px',
      alignItems: 'flex-start',
    }}>
      {!isUser && (
        <div style={{
          width: 40, height: 40, borderRadius: 6,
          backgroundColor: Colors.bgCard,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, fontSize: 22,
          border: '1px solid rgba(0,0,0,0.06)',
        }}>
          {message.senderAvatar}
        </div>
      )}
      <div style={{
        maxWidth: '72%',
        margin: isUser ? '0 0 0 8px' : '0 8px 0 8px',
      }}>
        {!isUser && (
          <div style={{ fontSize: 11, color: Colors.textSecondary, marginBottom: 3, marginLeft: 2 }}>
            {message.senderName}
          </div>
        )}
        <div style={{
          borderRadius: 18,
          borderBottomRightRadius: isUser ? 4 : 18,
          borderBottomLeftRadius: isUser ? 18 : 4,
          padding: '9px 14px',
          ...(isUser ? {
            background: 'linear-gradient(135deg, #F97316 0%, #FBBF24 100%)',
            boxShadow: '0 2px 12px rgba(249,115,22,0.30)',
          } : {
            backgroundColor: 'rgba(255,255,255,0.95)',
            border: '0.5px solid rgba(0,0,0,0.08)',
            boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
          }),
        }}>
          <span style={{ fontSize: 15, lineHeight: '22px', color: isUser ? Colors.textWhite : Colors.textPrimary, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {message.text}
          </span>
        </div>
      </div>
      {isUser && <div style={{ width: 40, flexShrink: 0 }} />}
    </div>
  );
}
