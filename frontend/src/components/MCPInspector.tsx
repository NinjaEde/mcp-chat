import { useState } from 'react';
import MCPServerManager from './MCPServerManager';
import MCPToolsPanel from './MCPToolsPanel';

export default function MCPInspector() {
  const [activeTab, setActiveTab] = useState<'servers' | 'tools'>('servers');

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          MCP Inspector
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Verwalte Model Context Protocol Server und teste verfügbare Tools
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1 mb-6">
        <button
          onClick={() => setActiveTab('servers')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'servers'
              ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Server Verwaltung
        </button>
        <button
          onClick={() => setActiveTab('tools')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'tools'
              ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Tools Tester
        </button>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'servers' && <MCPServerManager />}
        {activeTab === 'tools' && <MCPToolsPanel />}
      </div>

      {/* Info Panel */}
      <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
          Model Context Protocol (MCP)
        </h3>
        <p className="text-blue-800 dark:text-blue-200 text-sm">
          MCP ermöglicht es AI-Modellen, mit externen Tools und Datenquellen zu interagieren. 
          Verbinde Server, um Funktionalitäten wie Dateisystem-Zugriff, Web-Suche oder 
          API-Integrationen bereitzustellen.
        </p>
      </div>
    </div>
  );
}
