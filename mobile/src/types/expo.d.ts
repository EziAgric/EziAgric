declare module 'expo-status-bar' {
  import React from 'react';
  interface StatusBarProps {
    style?: 'auto' | 'inverted' | 'light' | 'dark';
    animated?: boolean;
    hidden?: boolean;
    hideTransitionAnimation?: 'fade' | 'slide' | 'none';
    networkActivityIndicatorVisible?: boolean;
    translucent?: boolean;
  }
  export const StatusBar: React.FC<StatusBarProps>;
}


