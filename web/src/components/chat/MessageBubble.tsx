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
          backgroundColor: 'rgba(255,255,255,0.06)',
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
          backgroundColor: isUser ? Colors.bubbleUser : Colors.bubbleAI,
          border: isUser ? 'none' : `0.5px solid ${Colors.border}`,
        }}>
          <span style={{ fontSize: 15, lineHeight: '22px', color: Colors.textPrimary, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {message.text}
          </span>
        </div>
      </div>
      {isUser && <div style={{ width: 40, flexShrink: 0 }} />}
    </div>
  );
}
