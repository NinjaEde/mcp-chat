import React, { useState } from 'react';
import { useMCPServers } from '../hooks/useMCP';
import type { MCPServer } from '../services/mcpClient';

export default function MCPServerManager() {
  const { servers, connectServer, disconnectServer, refreshTools, saveServer, deleteServer } = useMCPServers();
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    protocol: 'sse' as 'stdio' | 'sse' | 'http-stream',
    command: '',
    args: '',
    endpoint: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const serverConfig = {
      id: formData.id || `server_${Date.now()}`,
      name: formData.name,
      protocol: formData.protocol,
      command: formData.command.split(' '),
      args: formData.args ? formData.args.split(' ') : undefined,
      endpoint: formData.protocol !== 'stdio' ? formData.endpoint : undefined
    };

    try {
      await saveServer(serverConfig);
      await connectServer(serverConfig);
      setFormData({ id: '', name: '', protocol: 'stdio', command: '', args: '', endpoint: '' });
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding server:', error);
    }
  };

  const getStatusColor = (status: MCPServer['status']) => {
    switch (status) {
      case 'connected': return 'text-green-600';
      case 'connecting': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: MCPServer['status']) => {
    switch (status) {
      case 'connected': return '🟢';
      case 'connecting': return '🟡';
      case 'error': return '🔴';
      default: return '⚪';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">MCP Server</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {showAddForm ? 'Abbrechen' : 'Server hinzufügen'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 border border-gray-200 dark:border-gray-700 rounded">
          <div className="grid grid-cols-1 gap-4">
            <input
              type="text"
              placeholder="Server Name"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
            <select
              value={formData.protocol}
              onChange={(e) => setFormData({...formData, protocol: e.target.value as 'stdio' | 'sse' | 'http-stream'})}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="stdio">STDIO</option>
              <option value="sse">SSE</option>
              <option value="http-stream">HTTP Stream</option>
            </select>
            {formData.protocol === 'stdio' ? (
              <>
                <input
                  type="text"
                  placeholder="Command (z.B. npx @modelcontextprotocol/server-filesystem)"
                  value={formData.command}
                  onChange={(e) => setFormData({...formData, command: e.target.value})}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  required
                />
                <input
                  type="text"
                  placeholder="Arguments (optional)"
                  value={formData.args}
                  onChange={(e) => setFormData({...formData, args: e.target.value})}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                />
              </>
            ) : (
              <input
                type="text"
                placeholder="Endpoint URL"
                value={formData.endpoint}
                onChange={(e) => setFormData({...formData, endpoint: e.target.value})}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                required
              />
            )}
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Server hinzufügen
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {servers.map((server) => (
          <div key={server.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-lg">{getStatusIcon(server.status)}</span>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{server.name}</h3>
                  <span className={`text-sm ${getStatusColor(server.status)}`}>
                    {server.status}
                  </span>
                  <span className="text-xs bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded">
                    {server.protocol.toUpperCase()}
                  </span>
                </div>
                {server.protocol === 'stdio' ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Command: {server.command.join(' ')}
                  </p>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Endpoint: {server.endpoint}
                  </p>
                )}
                {server.tools && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Tools: {server.tools.length}
                  </p>
                )}
                {server.error && (
                  <p className="text-sm text-red-600 mt-2">Error: {server.error}</p>
                )}
                {server.lastConnected && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Zuletzt verbunden: {new Date(server.lastConnected).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex space-x-2">
                {server.status === 'connected' ? (
                  <>
                    <button
                      onClick={() => refreshTools(server.id)}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      🔄
                    </button>
                    <button
                      onClick={() => disconnectServer(server.id)}
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Trennen
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => connectServer(server)}
                    disabled={server.status === 'connecting'}
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    {server.status === 'connecting' ? 'Verbinde...' : 'Verbinden'}
                  </button>
                )}
                <button
                  onClick={() => deleteServer(server.id)}
                  className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        ))}
        
        {servers.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Keine MCP Server konfiguriert
          </div>
        )}
      </div>
    </div>
  );
}
