import React, { useState, useEffect } from 'react';
import { aiConnectionsAPI } from '../api';
import { Link2, Edit, Package, Trash2, RefreshCw } from 'lucide-react';

interface AIConnection {
  id: number;
  name: string;
  provider: 'openai' | 'ollama' | 'anthropic' | 'custom';
  description: string;
  config: {
    apiKey?: string;
    endpoint?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  is_active: boolean;
  status?: 'connected' | 'disconnected' | 'error';
  availableModels?: string[];
}

interface AIDialogProps {
  aiConnections: AIConnection[];
  onClose: () => void;
  onAIConnectionsChange: (aiConnections: AIConnection[]) => void;
}

export default function AIDialog({ aiConnections, onClose, onAIConnectionsChange }: AIDialogProps) {
  const [editingAI, setEditingAI] = useState<AIConnection | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    provider: 'openai' as 'openai' | 'ollama' | 'anthropic' | 'custom',
    description: '',
    apiKey: '',
    endpoint: '',
    model: '',
    temperature: 0.7,
    maxTokens: 2048
  });

  // State für verfügbare Modelle bei Ollama
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [useCustomModel, setUseCustomModel] = useState(false);

  useEffect(() => {
    if (editingAI) {
      setFormData({
        name: editingAI.name || '',
        provider: editingAI.provider,
        description: editingAI.description || '',
        apiKey: editingAI.config.apiKey || '',
        endpoint: editingAI.config.endpoint || '',
        model: editingAI.config.model || '',
        temperature: editingAI.config.temperature || 0.7,
        maxTokens: editingAI.config.maxTokens || 2048
      });
      
      // Lade verfügbare Modelle wenn es eine Ollama-Verbindung ist
      if (editingAI.provider === 'ollama' && editingAI.availableModels) {
        setAvailableModels(editingAI.availableModels);
      }
    } else {
      setFormData({
        name: '',
        provider: 'openai',
        description: '',
        apiKey: '',
        endpoint: '',
        model: '',
        temperature: 0.7,
        maxTokens: 2048
      });
      setAvailableModels([]);
    }
    setUseCustomModel(false);
  }, [editingAI]);

  // Automatisches Laden der Modelle bei Ollama-Provider
  useEffect(() => {
    if (formData.provider === 'ollama' && formData.endpoint) {
      loadOllamaModels();
    } else {
      setAvailableModels([]);
    }
  }, [formData.provider, formData.endpoint]);

  const createAIConnection = async (connectionData: Omit<AIConnection, 'id' | 'created_at' | 'is_active' | 'status' | 'availableModels'>) => {
    try {
      const response = await aiConnectionsAPI.create(connectionData);
      if (response.success) {
        const updatedAIConnections = [...aiConnections, response.ai_connection];
        onAIConnectionsChange(updatedAIConnections);
        setEditingAI(null);
      }
    } catch (error) {
      console.error('Error creating AI connection:', error);
      alert('Fehler beim Erstellen der KI-Verbindung: ' + (error as Error).message);
    }
  };

  const updateAIConnection = async (id: number, updates: Partial<AIConnection>) => {
    try {
      const response = await aiConnectionsAPI.update(id, updates);
      if (response.success) {
        const updatedAIConnections = aiConnections.map(ai => ai.id === id ? { ...ai, ...updates } : ai);
        onAIConnectionsChange(updatedAIConnections);
        setEditingAI(null);
      }
    } catch (error) {
      console.error('Error updating AI connection:', error);
    }
  };

  const deleteAIConnection = async (id: number) => {
    if (!confirm('KI-Verbindung wirklich löschen?')) return;
    
    try {
      const response = await aiConnectionsAPI.delete(id);
      if (response.success) {
        const updatedAIConnections = aiConnections.filter(ai => ai.id !== id);
        onAIConnectionsChange(updatedAIConnections);
      }
    } catch (error) {
      console.error('Error deleting AI connection:', error);
    }
  };

  const testAIConnection = async (id: number) => {
    try {
      const response = await aiConnectionsAPI.testConnection(id);
      const updatedConnection = { ...aiConnections.find(ai => ai.id === id), status: response.connected ? 'connected' : 'error' };
      const updatedAIConnections = aiConnections.map(ai => ai.id === id ? updatedConnection as AIConnection : ai);
      onAIConnectionsChange(updatedAIConnections);
    } catch (error) {
      console.error('Error testing AI connection:', error);
    }
  };

  const loadAvailableModels = async (id: number) => {
    try {
      const response = await aiConnectionsAPI.getAvailableModels(id);
      if (response.success) {
        const updatedAIConnections = aiConnections.map(ai => 
          ai.id === id ? { ...ai, availableModels: response.models } : ai
        );
        onAIConnectionsChange(updatedAIConnections);
      }
    } catch (error) {
      console.error('Error loading models:', error);
    }
  };

  const loadOllamaModels = async () => {
    if (!formData.endpoint) return;
    
    setLoadingModels(true);
    try {
      const response = await fetch(`${formData.endpoint}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        const models = data.models?.map((m: any) => m.name) || [];
        setAvailableModels(models);
        
        // Wenn noch kein Modell ausgewählt ist, wähle das erste verfügbare
        if (!formData.model && models.length > 0) {
          setFormData(prev => ({ ...prev, model: models[0] }));
        }
      }
    } catch (error) {
      console.error('Fehler beim Laden der Ollama-Modelle:', error);
      setAvailableModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const aiData = {
      name: formData.name,
      provider: formData.provider,
      description: formData.description,
      config: {
        ...(formData.apiKey && { apiKey: formData.apiKey }),
        ...(formData.endpoint && { endpoint: formData.endpoint }),
        ...(formData.model && { model: formData.model }),
        temperature: formData.temperature,
        maxTokens: formData.maxTokens
      }
    };

    if (editingAI) {
      updateAIConnection(editingAI.id, aiData);
    } else {
      createAIConnection(aiData);
    }
  };

  const getDefaultEndpoint = (provider: string) => {
    switch (provider) {
      case 'openai': return 'https://api.openai.com/v1';
      case 'ollama': return 'http://localhost:11434';
      case 'anthropic': return 'https://api.anthropic.com';
      default: return '';
    }
  };

  const getEndpointHelp = (provider: string) => {
    if (provider === 'ollama') {
      return (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          <p>Lokal: http://localhost:11434</p>
          <p>Docker: http://host.docker.internal:11434</p>
          <p>Compose: http://ollama:11434</p>
        </div>
      );
    }
    return null;
  };

  const getDefaultModel = (provider: string) => {
    switch (provider) {
      case 'openai': return 'gpt-4';
      case 'ollama': return 'llama3.2:latest';
      case 'anthropic': return 'claude-3-sonnet-20240229';
      default: return '';
    }
  };

  const renderModelField = () => {
    if (formData.provider === 'ollama') {
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Modell
            {loadingModels && (
              <span className="ml-2 text-blue-600">
                <RefreshCw size={12} className="inline animate-spin" />
              </span>
            )}
          </label>
          
          {!useCustomModel && availableModels.length > 0 ? (
            <div className="space-y-2">
              <select
                value={formData.model}
                onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Modell auswählen...</option>
                {availableModels.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
              
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setUseCustomModel(true)}
                  className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
                >
                  Eigenes Modell eingeben
                </button>
                <button
                  type="button"
                  onClick={loadOllamaModels}
                  disabled={loadingModels}
                  className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 flex items-center gap-1"
                  title="Modelle neu laden"
                >
                  <RefreshCw size={12} className={loadingModels ? 'animate-spin' : ''} />
                  Neu laden
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                value={formData.model}
                onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
                placeholder={getDefaultModel(formData.provider)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              
              {availableModels.length > 0 && (
                <button
                  type="button"
                  onClick={() => setUseCustomModel(false)}
                  className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
                >
                  Aus verfügbaren Modellen auswählen
                </button>
              )}
            </div>
          )}
          
          {availableModels.length === 0 && !loadingModels && formData.endpoint && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Keine Modelle gefunden. Stellen Sie sicher, dass Ollama läuft und erreichbar ist.
            </p>
          )}
        </div>
      );
    }

    // Für alle anderen Anbieter: normales Textfeld
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Modell
        </label>
        <input
          value={formData.model}
          onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
          placeholder={getDefaultModel(formData.provider)}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            KI-Modelle Konfiguration
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AI Form */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {editingAI ? 'KI-Verbindung bearbeiten' : 'Neue KI-Verbindung hinzufügen'}
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
                  Anbieter
                </label>
                <select
                  value={formData.provider}
                  onChange={(e) => {
                    const provider = e.target.value as any;
                    setFormData(prev => ({ 
                      ...prev, 
                      provider,
                      endpoint: getDefaultEndpoint(provider),
                      model: getDefaultModel(provider)
                    }));
                    setUseCustomModel(false);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="openai">OpenAI</option>
                  <option value="ollama">Ollama</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Beschreibung
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Endpoint URL
                </label>
                <input
                  value={formData.endpoint}
                  onChange={(e) => setFormData(prev => ({ ...prev, endpoint: e.target.value }))}
                  placeholder={getDefaultEndpoint(formData.provider)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                {getEndpointHelp(formData.provider)}
              </div>

              {formData.provider !== 'ollama' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    API-Schlüssel
                  </label>
                  <input
                    type="password"
                    value={formData.apiKey}
                    onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              )}

              {renderModelField()}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Temperatur
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={formData.temperature}
                    onChange={(e) => setFormData(prev => ({ ...prev, temperature: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Max. Tokens
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="8192"
                    value={formData.maxTokens}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxTokens: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingAI ? 'Verbindung aktualisieren' : 'Verbindung hinzufügen'}
              </button>

              {editingAI && (
                <button
                  type="button"
                  onClick={() => setEditingAI(null)}
                  className="w-full bg-gray-600 text-white py-2 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Abbrechen
                </button>
              )}
            </form>
          </div>

          {/* AI Connections List */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Vorhandene KI-Verbindungen ({aiConnections.length})
            </h3>
            
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {aiConnections.map(ai => (
                <div
                  key={ai.id}
                  className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 dark:text-white">
                        {ai.name}
                      </h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {ai.provider} • {ai.config.model || 'Kein Modell'}
                      </p>
                      {ai.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                          {ai.description}
                        </p>
                      )}
                      
                      <div className="flex items-center mt-2 space-x-2">
                        <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                          ai.is_active 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                        }`}>
                          {ai.is_active ? 'Aktiv' : 'Inaktiv'}
                        </span>
                        
                        {ai.status && (
                          <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                            ai.status === 'connected'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : ai.status === 'error'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                          }`}>
                            {ai.status === 'connected' ? 'Verbunden' : 
                             ai.status === 'error' ? 'Fehler' : 'Getrennt'}
                          </span>
                        )}
                      </div>

                      {ai.availableModels && ai.availableModels.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Verfügbare Modelle: {ai.availableModels.join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2 ml-4">
                      <button
                        onClick={() => testAIConnection(ai.id)}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        title="Verbindung testen"
                      >
                        <Link2 size={16} />
                      </button>
                      {ai.provider === 'ollama' && ai.status === 'connected' && (
                        <button
                          onClick={() => loadAvailableModels(ai.id)}
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="Modelle laden"
                        >
                          <Package size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => setEditingAI(ai)}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        title="Bearbeiten"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => deleteAIConnection(ai.id)}
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