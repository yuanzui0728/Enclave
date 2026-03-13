import React from 'react';
import { Colors } from '../../theme/colors';

export function TypingIndicator() {
  return (
    <div style={{ padding: '4px 12px', display: 'flex', alignItems: 'flex-start' }}>
      <div style={{
        backgroundColor: Colors.bubbleAI,
        borderRadius: 18,
        borderBottomLeftRadius: 4,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        border: `0.5px solid ${Colors.border}`,
      }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: '50%',
            backgroundColor: Colors.primaryLight,
            animation: `bounce 1s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}
