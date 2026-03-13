import React from 'react';
import { Colors } from '../../theme/colors';

interface AvatarProps {
  emoji: string;
  size?: number;
  showOnline?: boolean;
  isOnline?: boolean;
  onPress?: () => void;
}

export function Avatar({ emoji, size = 44, showOnline = false, isOnline = false, onPress }: AvatarProps) {
  return (
    <div
      onClick={onPress}
      style={{
        width: size, height: size,
        borderRadius: size / 5,
        backgroundColor: Colors.bgCard,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
        cursor: onPress ? 'pointer' : 'default',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: size * 0.6 }}>{emoji}</span>
      {showOnline && (
        <div style={{
          position: 'absolute', bottom: -2, right: -2,
          width: 10, height: 10, borderRadius: 5,
          backgroundColor: isOnline ? Colors.online : Colors.textLight,
          border: `1.5px solid ${Colors.bgMain}`,
        }} />
      )}
    </div>
  );
}
