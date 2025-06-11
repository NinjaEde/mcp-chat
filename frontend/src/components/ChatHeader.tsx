import React from 'react';
import { Menu, ChevronLeft } from 'lucide-react';
import type { Conversation, AIConnection } from '../App';

interface ChatHeaderProps {
  showSidebar: boolean;
  setShowSidebar: (v: boolean) => void;
  activeConversation: Conversation | null;
  aiConnections: AIConnection[];
  selectedAIConnection: number | null;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  showSidebar,
  setShowSidebar,
  activeConversation,
  aiConnections,
  selectedAIConnection,
}) => (
  <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
    <div className="flex items-center space-x-3">
      {!showSidebar && (
        <button
          onClick={() => setShowSidebar(true)}
          className="p-2 rounded-lg transition-colors
              hover:bg-gray-100 hover:text-blue-700
              dark:hover:bg-gray-700 dark:hover:text-blue-300
              text-gray-600 dark:text-gray-400"
        >
          <Menu size={20} />
        </button>
      )}
      {showSidebar && (
        <button
          onClick={() => setShowSidebar(false)}
          className="p-2 rounded-lg transition-colors
              hover:bg-gray-100 hover:text-blue-700
              dark:hover:bg-gray-700 dark:hover:text-blue-300
              text-gray-600 dark:text-gray-400"
          title="Sidebar ausblenden"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {activeConversation?.title || 'Wähle eine Unterhaltung'}
        </h2>
        {selectedAIConnection && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {aiConnections.find(ai => ai.id === selectedAIConnection)?.name}
          </p>
        )}
      </div>
    </div>
    <div className="flex items-center space-x-2">

    </div>
  </div>
);

export default ChatHeader;
