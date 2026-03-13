import React from 'react';
import type { Conversation } from '../../types/message';
import { useCharacterStore } from '../../store/characterStore';
import { Colors } from '../../theme/colors';

interface ChatListItemProps {
  conversation: Conversation;
  onPress: () => void;
}

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export function ChatListItem({ conversation, onPress }: ChatListItemProps) {
  const getById = useCharacterStore((s) => s.getById);
  const isGroup = conversation.type === 'group';
  const avatarEmoji = isGroup ? '👥' : getById(conversation.participants[0])?.avatar ?? '🤖';
  const lastText = conversation.lastMessage?.text ?? '';
  const preview = lastText.length > 28 ? lastText.slice(0, 28) + '…' : lastText;

  return (
    <div
      onClick={onPress}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.bgWhite,
        padding: '12px 16px',
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 8,
        backgroundColor: Colors.bgInput,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: 26,
      }}>
        {avatarEmoji}
      </div>
      <div style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
          <span style={{
            fontSize: 15, color: Colors.textPrimary, fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8,
          }}>
            {conversation.title}
          </span>
          <span style={{ fontSize: 11, color: Colors.textLight, flexShrink: 0 }}>
            {conversation.updatedAt ? formatTime(conversation.updatedAt) : ''}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: 13, color: Colors.textSecondary,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8,
          }}>
            {preview}
          </span>
          {(conversation.unreadCount ?? 0) > 0 && (
            <span style={{
              backgroundColor: Colors.unreadBadge, color: '#fff',
              fontSize: 11, fontWeight: 600,
              borderRadius: 10, minWidth: 18, height: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 4px', flexShrink: 0,
            }}>
              {(conversation.unreadCount ?? 0) > 99 ? '99+' : conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
