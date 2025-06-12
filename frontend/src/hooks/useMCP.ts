import { useState, useEffect, useCallback } from 'react';
import type { MCPServer, MCPTool } from '../services/mcpClient';
import { mcpClient } from '../services/mcpClient';

export function useMCPServers() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = mcpClient.subscribe(setServers);
    
    // Load saved servers on mount
    mcpClient.loadSavedServers().finally(() => setIsLoading(false));

    return unsubscribe;
  }, []);

  const connectServer = useCallback(async (serverConfig: Omit<MCPServer, 'status' | 'capabilities' | 'tools' | 'resources' | 'prompts' | 'reconnectAttempts'>) => {
    await mcpClient.connectToServer(serverConfig);
  }, []);

  const disconnectServer = useCallback(async (serverId: string) => {
    await mcpClient.disconnectServer(serverId);
  }, []);

  const refreshTools = useCallback(async (serverId: string) => {
    await mcpClient.refreshTools(serverId);
  }, []);

  const saveServer = useCallback(async (server: Omit<MCPServer, 'status' | 'capabilities' | 'tools' | 'resources' | 'prompts' | 'reconnectAttempts'>) => {
    await mcpClient.saveServer(server);
  }, []);

  const deleteServer = async (serverId: string) => {
    console.log('🗑️ Hook: deleting server', serverId);
    try {
      await mcpClient.deleteServer(serverId);
    } catch (error) {
      console.error('Error in deleteServer hook:', error);
      // Show user-friendly error message
      if (error instanceof Error) {
        alert(`Fehler beim Löschen des Servers: ${error.message}`);
      }
      throw error;
    }
  };

  const refreshServers = useCallback(async () => {
    console.log('🔄 Hook: refreshing all servers');
    try {
      await mcpClient.refreshServers();
    } catch (error) {
      console.error('Error in refreshServers hook:', error);
      throw error;
    }
  }, []);

  return {
    servers,
    isLoading,
    connectServer,
    disconnectServer,
    refreshTools,
    saveServer,
    deleteServer,
    refreshServers
  };
}

export function useMCPTools(serverId?: string) {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!serverId) {
      setTools([]);
      return;
    }

    const unsubscribe = mcpClient.subscribe((servers) => {
      const server = servers.find(s => s.id === serverId);
      setTools(server?.tools || []);
    });

    return unsubscribe;
  }, [serverId]);

  const callTool = useCallback(async (toolName: string, toolArgs: Record<string, any>) => {
    if (!serverId) throw new Error('No server selected');
    
    setIsLoading(true);
    try {
      const result = await mcpClient.callTool(serverId, toolName, toolArgs);
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [serverId]);

  return {
    tools,
    isLoading,
    callTool
  };
}
