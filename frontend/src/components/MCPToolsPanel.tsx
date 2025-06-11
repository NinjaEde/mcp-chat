import { useState } from 'react';
import { useMCPServers, useMCPTools } from '../hooks/useMCP';

export default function MCPToolsPanel() {
  const { servers } = useMCPServers();
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const { tools, callTool, isLoading } = useMCPTools(selectedServerId);
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [toolArguments, setToolArguments] = useState<string>('{}');
  const [toolResult, setToolResult] = useState<any>(null);

  const connectedServers = servers.filter(s => s.status === 'connected');
  const selectedServer = servers.find(s => s.id === selectedServerId);

  const handleCallTool = async () => {
    if (!selectedTool) return;

    try {
      const args = JSON.parse(toolArguments);
      const result = await callTool(selectedTool, args);
      setToolResult(result);
    } catch (error) {
      setToolResult({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  };

  const selectedToolSchema = tools.find(t => t.name === selectedTool);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">MCP Tools</h2>

      {/* Server Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Server auswählen:
        </label>
        <select
          value={selectedServerId}
          onChange={(e) => {
            setSelectedServerId(e.target.value);
            setSelectedTool('');
            setToolResult(null);
          }}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
        >
          <option value="">Server wählen...</option>
          {connectedServers.map((server) => (
            <option key={server.id} value={server.id}>
              {server.name} ({server.tools?.length || 0} Tools)
            </option>
          ))}
        </select>
      </div>

      {/* Server Status */}
      {selectedServer && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded">
          <div className="flex items-center space-x-2">
            <span className="text-green-600">🟢</span>
            <span className="font-medium text-gray-900 dark:text-white">{selectedServer.name}</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {selectedServer.tools?.length || 0} verfügbare Tools
          </p>
        </div>
      )}

      {/* Tools List */}
      {tools.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Tool auswählen:
          </label>
          <select
            value={selectedTool}
            onChange={(e) => {
              setSelectedTool(e.target.value);
              setToolResult(null);
              // Reset arguments to empty object
              setToolArguments('{}');
            }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          >
            <option value="">Tool wählen...</option>
            {tools.map((tool) => (
              <option key={tool.name} value={tool.name}>
                {tool.name} - {tool.description || 'Keine Beschreibung'}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tool Schema */}
      {selectedToolSchema && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tool Schema:</h3>
          <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-3 rounded overflow-x-auto">
            {JSON.stringify(selectedToolSchema.inputSchema, null, 2)}
          </pre>
        </div>
      )}

      {/* Tool Arguments */}
      {selectedTool && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Arguments (JSON):
          </label>
          <textarea
            value={toolArguments}
            onChange={(e) => setToolArguments(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white font-mono text-sm"
            placeholder='{"parameter": "value"}'
          />
          <button
            onClick={handleCallTool}
            disabled={isLoading || !selectedTool}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Führe aus...' : 'Tool ausführen'}
          </button>
        </div>
      )}

      {/* Tool Result */}
      {toolResult && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ergebnis:</h3>
          <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-3 rounded overflow-x-auto max-h-64 overflow-y-auto">
            {JSON.stringify(toolResult, null, 2)}
          </pre>
        </div>
      )}

      {/* Empty State */}
      {connectedServers.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Keine verbundenen MCP Server gefunden.<br />
          Verbinde zuerst einen Server, um Tools zu verwenden.
        </div>
      )}
    </div>
  );
}
