import React, { useState } from 'react';
import type { Moment } from '../../types/moment';
import { useMomentsStore } from '../../store/momentsStore';
import { Colors } from '../../theme/colors';

interface MomentCardProps {
  moment: Moment;
}

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export function MomentCard({ moment }: MomentCardProps) {
  const { toggleLike } = useMomentsStore();
  const [showActions, setShowActions] = useState(false);
  const isLiked = moment.userInteraction?.type === 'like';

  const likes = moment.interactions.filter((i) => i.type === 'like');
  const comments = moment.interactions.filter((i) => i.type === 'comment');

  return (
    <div style={{ backgroundColor: Colors.bgWhite, marginBottom: 8, padding: '12px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 6,
          backgroundColor: Colors.bgInput,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginRight: 8, flexShrink: 0, fontSize: 24,
        }}>
          {moment.authorAvatar}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, color: Colors.primary, fontWeight: 500 }}>
            {moment.authorName}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 2 }}>
            <span style={{ fontSize: 11, color: Colors.textLight }}>
              {formatTime(moment.postedAt)}
            </span>
            {moment.location && (
              <span style={{ fontSize: 11, color: Colors.textLight }}>
                  📍 {moment.location}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 15, color: Colors.textPrimary, lineHeight: '22px' }}>
          {moment.text}
        </div>
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4, position: 'relative' }}>
        <button
          onClick={() => setShowActions(!showActions)}
          style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 18, color: Colors.textSecondary, letterSpacing: 2 }}>···</span>
        </button>
        {showActions && (
          <div style={{
            position: 'absolute', right: 0, top: 28,
            backgroundColor: Colors.bgInput, borderRadius: 6,
            display: 'flex', flexDirection: 'row', overflow: 'hidden', zIndex: 10,
          }}>
            <button
              onClick={() => { toggleLike(moment.id); setShowActions(false); }}
              style={{
                padding: '10px 14px', background: isLiked ? 'rgba(255,255,255,0.1)' : 'none',
                border: 'none', cursor: 'pointer',
              }}
            >
              <span style={{ color: isLiked ? '#FF6B6B' : '#fff', fontSize: 13 }}>
                {isLiked ? '❤️ 已赞' : '🤍 赞'}
              </span>
            </button>
            <button
              onClick={() => setShowActions(false)}
              style={{ padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <span style={{ color: '#fff', fontSize: 13 }}>💬 评论</span>
            </button>
          </div>
        )}
      </div>

      {/* Interactions */}
      {(likes.length > 0 || comments.length > 0 || isLiked) && (
        <div style={{
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderRadius: 4, padding: 8, marginTop: 4,
        }}>
          {likes.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, marginRight: 4 }}>❤️</span>
              <span style={{ fontSize: 13, color: Colors.primary, flex: 1 }}>
                {likes.map((l) => l.characterName).join('、')}
                {isLiked ? (likes.length > 0 ? '、我' : '我') : ''}
              </span>
            </div>
          )}
          {likes.length > 0 && comments.length > 0 && (
            <div style={{ height: 1, backgroundColor: Colors.border, margin: '6px 0' }} />
          )}
          {comments.map((c, i) => (
            <div key={i} style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 3 }}>
              <span style={{ fontSize: 13, color: Colors.primary, fontWeight: 500 }}>
                {c.characterName}：
              </span>
              <span style={{ fontSize: 13, color: Colors.textPrimary, flex: 1 }}>
                {c.commentText}
              </span>
            </div>
          ))}
          {moment.userInteraction?.type === 'comment' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 3 }}>
              <span style={{ fontSize: 13, color: Colors.primary, fontWeight: 500 }}>我：</span>
              <span style={{ fontSize: 13, color: Colors.textPrimary, flex: 1 }}>
                {moment.userInteraction.commentText}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
