import React from 'react';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div style={{
      maxWidth: 480,
      width: '100%',
      height: '100dvh',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: 'transparent',
    }}>
      {children}
    </div>
  );
}
