import React from 'react';

interface ChatStatusBarProps {
  isConnected: boolean;
  isStreaming: boolean;
}

const ChatStatusBar: React.FC<ChatStatusBarProps> = ({ isConnected, isStreaming }) => {
  let statusText = '';
  let color = '';
  let dot = '';

  if (isStreaming) {
    statusText = 'KI antwortet (Streaming läuft)';
    color = 'text-blue-600';
    dot = 'bg-blue-500';
  } else if (isConnected) {
    statusText = 'Streaming verbunden - Warten auf Antwort';
    color = 'text-yellow-600';
    dot = 'bg-yellow-500';
  } else {
    statusText = 'Bereit für neue Anfrage';
    color = 'text-green-600';
    dot = 'bg-green-500';
  }

  return (
    <div className={`sticky top-0 left-0 w-full z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-2 text-sm ${color}`}>
      <span className={`inline-block w-2 h-2 rounded-full ${dot} mr-2`}></span>
      {statusText}
    </div>
  );
};

export default ChatStatusBar;
