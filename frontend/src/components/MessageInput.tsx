import React from 'react';
import { Send, Zap } from 'lucide-react';

interface MessageInputProps {
  input: string;
  setInput: (v: string) => void;
  handleSendMessage: (e: React.FormEvent, streaming?: boolean) => void;
  loading: boolean;
  streamingEnabled?: boolean;
  setStreamingEnabled?: (enabled: boolean) => void;
}

const MessageInput: React.FC<MessageInputProps> = ({
  input,
  setInput,
  handleSendMessage,
  loading,
  streamingEnabled = true,
  setStreamingEnabled,
}) => (
  <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
    <form onSubmit={(e) => handleSendMessage(e, streamingEnabled)} className="flex space-x-2">
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="Nachricht eingeben..."
        className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        disabled={loading}
      />
      
      {setStreamingEnabled && (
        <button
          type="button"
          onClick={() => setStreamingEnabled(!streamingEnabled)}
          className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1 ${
            streamingEnabled 
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' 
              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
          }`}
          title={streamingEnabled ? 'Streaming aktiviert' : 'Streaming deaktiviert'}
        >
          <Zap size={16} />
        </button>
      )}
      
      <button
        type="submit"
        disabled={loading || !input.trim()}
        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
      >
        <Send size={18} /> {streamingEnabled ? 'Stream' : 'Senden'}
      </button>
    </form>
  </div>
);

export default MessageInput;
