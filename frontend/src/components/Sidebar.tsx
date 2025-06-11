import React from 'react';
import { Settings, LogOut, Wrench, Bot } from 'lucide-react';
import type { Conversation, AIConnection } from '../App';

interface SidebarProps {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  setActiveConversation: (c: Conversation | null) => void;
  selectConversation: (c: Conversation) => void;
  deleteConversation: (id: number) => void;
  createConversation: (title?: string) => void;
  showSettings: () => void;
  handleLogout: () => void;
  setShowToolsDialog: (v: boolean) => void;
  setShowAIDialog: (v: boolean) => void;
  aiConnections: AIConnection[];
  selectedAIConnection: number | null;
  setSelectedAIConnection: (id: number | null) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeConversation,
  selectConversation,
  deleteConversation,
  createConversation,
  showSettings,
  handleLogout,
  setShowToolsDialog,
  setShowAIDialog,
  aiConnections,
  selectedAIConnection,
  setSelectedAIConnection,
}) => (
  <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">MCP Chat</h1>
        <div className="flex items-center space-x-2">
          <button
            onClick={showSettings}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Einstellungen"
          >
            <Settings size={20} />
          </button>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Abmelden"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setShowToolsDialog(true)}
          className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors text-sm font-medium flex items-center gap-2"
        >
          <Wrench size={16} /> Tools
        </button>
        <button
          onClick={() => setShowAIDialog(true)}
          className="p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors text-sm font-medium flex items-center gap-2"
        >
          <Bot size={16} /> KI-Modelle
        </button>
      </div>
    </div>
    {aiConnections.length > 0 && (
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Aktives KI-Modell
        </label>
        <select
          value={selectedAIConnection || ''}
          onChange={e => setSelectedAIConnection(e.target.value ? Number(e.target.value) : null)}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="">Standard</option>
          {aiConnections.filter(ai => ai.is_active).map(ai => (
            <option key={ai.id} value={ai.id}>
              {ai.name} ({ai.provider})
            </option>
          ))}
        </select>
      </div>
    )}
    <div className="flex-1 overflow-y-auto">
      <div className="p-4">
        <button
          onClick={() => createConversation()}
          className="w-full p-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 font-medium"
        >
          + Neue Unterhaltung
        </button>
      </div>
      <div className="px-4 space-y-2">
        {conversations.map(conversation => (
          <div
            key={conversation.id}
            className={`w-full p-3 rounded-lg transition-colors flex items-center justify-between group ${
              activeConversation?.id === conversation.id
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            <button
              onClick={() => selectConversation(conversation)}
              className="flex-1 text-left"
            >
              <div className="font-medium truncate">{conversation.title}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {conversation.message_count || 0} Nachrichten
              </div>
            </button>
            <button
              onClick={e => {
                e.stopPropagation();
                deleteConversation(conversation.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-all duration-200"
              title="Unterhaltung löschen"
            >
              <LogOut size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default Sidebar;
