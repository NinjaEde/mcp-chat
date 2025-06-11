import React, { useState, useEffect } from 'react';
import { toolsAPI } from '../api';
import { Edit, Trash2, Pause, Play } from 'lucide-react';

interface Tool {
  id: number;
  name: string;
  type: string;
  description: string;
  config: {
    protocol: 'sse' | 'http-stream' | 'stdio';
    endpoint?: string;
    command?: string;
    args?: string[];
  };
  is_active: boolean;
  created_at: string;
}

interface ToolsDialogProps {
  tools: Tool[];
  onClose: () => void;
  onToolsChange: (tools: Tool[]) => void;
}

export default function ToolsDialog({ tools, onClose, onToolsChange }: ToolsDialogProps) {
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    description: '',
    protocol: 'sse' as 'sse' | 'http-stream' | 'stdio',
    endpoint: '',
    command: '',
    args: ''
  });

  useEffect(() => {
    if (editingTool) {
      setFormData({
        name: editingTool.name,
        type: editingTool.type,
        description: editingTool.description,
        protocol: editingTool.config.protocol,
        endpoint: editingTool.config.endpoint || '',
        command: editingTool.config.command || '',
        args: editingTool.config.args?.join(' ') || ''
      });
    } else {
      setFormData({
        name: '',
        type: '',
        description: '',
        protocol: 'sse',
        endpoint: '',
        command: '',
        args: ''
      });
    }
  }, [editingTool]);

  const createTool = async (toolData: Omit<Tool, 'id' | 'created_at' | 'is_active'>) => {
    try {
      const response = await toolsAPI.create(toolData);
      if (response.success) {
        const updatedTools = [...tools, response.tool];
        onToolsChange(updatedTools);
        setEditingTool(null);
      }
    } catch (error) {
      console.error('Error creating tool:', error);
      alert('Fehler beim Erstellen des Tools: ' + (error as Error).message);
    }
  };

  const updateTool = async (id: number, updates: Partial<Tool>) => {
    try {
      const response = await toolsAPI.update(id, updates);
      if (response.success) {
        const updatedTools = tools.map(tool => tool.id === id ? { ...tool, ...updates } : tool);
        onToolsChange(updatedTools);
        // Modal nur schließen wenn es nicht nur ein Status-Update ist
        if (!('is_active' in updates && Object.keys(updates).length === 1)) {
          setEditingTool(null);
        }
      }
    } catch (error) {
      console.error('Error updating tool:', error);
    }
  };

  const deleteTool = async (id: number) => {
    if (!confirm('Tool wirklich löschen?')) return;
    
    try {
      await toolsAPI.delete(id);
      const updatedTools = tools.filter(tool => tool.id !== id);
      onToolsChange(updatedTools);
    } catch (error) {
      console.error('Error deleting tool:', error);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const toolData = {
      name: formData.name,
      type: formData.type,
      description: formData.description,
      config: {
        protocol: formData.protocol,
        ...(formData.endpoint && { endpoint: formData.endpoint }),
        ...(formData.command && { command: formData.command }),
        ...(formData.args && { args: formData.args.split(' ').filter(Boolean) })
      }
    };

    if (editingTool) {
      updateTool(editingTool.id, toolData);
    } else {
      createTool(toolData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Tools Konfiguration
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tool Form */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {editingTool ? 'Tool bearbeiten' : 'Neues Tool hinzufügen'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Name
                </label>
                <input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Typ
                </label>
                <input
                  value={formData.type}
                  onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                  placeholder="z.B. web-search, calculator, file-manager"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Beschreibung
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  MCP-Protokoll
                </label>
                <select
                  value={formData.protocol}
                  onChange={(e) => setFormData(prev => ({ ...prev, protocol: e.target.value as any }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="sse">Server-Sent Events (SSE)</option>
                  <option value="http-stream">HTTP Streaming</option>
                  <option value="stdio">Standard I/O</option>
                </select>
              </div>

              {(formData.protocol === 'sse' || formData.protocol === 'http-stream') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Endpoint URL
                  </label>
                  <input
                    value={formData.endpoint}
                    onChange={(e) => setFormData(prev => ({ ...prev, endpoint: e.target.value }))}
                    placeholder="http://localhost:8080/mcp"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              )}

              {formData.protocol === 'stdio' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Kommando
                    </label>
                    <input
                      value={formData.command}
                      onChange={(e) => setFormData(prev => ({ ...prev, command: e.target.value }))}
                      placeholder="node"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Argumente (getrennt durch Leerzeichen)
                    </label>
                    <input
                      value={formData.args}
                      onChange={(e) => setFormData(prev => ({ ...prev, args: e.target.value }))}
                      placeholder="server.js --mcp"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingTool ? 'Tool aktualisieren' : 'Tool hinzufügen'}
              </button>

              {editingTool && (
                <button
                  type="button"
                  onClick={() => setEditingTool(null)}
                  className="w-full bg-gray-600 text-white py-2 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Abbrechen
                </button>
              )}
            </form>
          </div>

          {/* Tools List */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Vorhandene Tools ({tools.length})
            </h3>
            
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {tools.map(tool => (
                <div
                  key={tool.id}
                  className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 dark:text-white">
                        {tool.name}
                      </h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {tool.type} • {tool.config.protocol}
                      </p>
                      {tool.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                          {tool.description}
                        </p>
                      )}
                      <div className="flex items-center mt-2">
                        <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                          tool.is_active 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                        }`}>
                          {tool.is_active ? 'Aktiv' : 'Inaktiv'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2 ml-4">
                      <button
                        onClick={() => updateTool(tool.id, { is_active: !tool.is_active })}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        title={tool.is_active ? 'Deaktivieren' : 'Aktivieren'}
                      >
                        {tool.is_active ? <Pause size={16} /> : <Play size={16} />}
                      </button>
                      <button
                        onClick={() => setEditingTool(tool)}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        title="Bearbeiten"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => deleteTool(tool.id)}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-red-600"
                        title="Löschen"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}