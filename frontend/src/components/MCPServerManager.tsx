import React, { useState, useEffect, useRef } from 'react';
import { useMCPServers } from '../hooks/useMCP';
import type { MCPServer } from '../services/mcpClient';
import { RefreshCcw, RefreshCwOff, Trash, Unplug, Wrench } from 'lucide-react';

export default function MCPServerManager() {
    const { servers, connectServer, disconnectServer, refreshTools, saveServer, deleteServer, refreshServers } = useMCPServers();
    const [showAddForm, setShowAddForm] = useState(false);
    const [isPolling, setIsPolling] = useState(false);
    const pollCountRef = useRef(0);
    const maxPollAttempts = 10; // Reduced attempts
    const [formData, setFormData] = useState({
        id: '',
        name: '',
        protocol: 'sse' as 'stdio' | 'sse' | 'http-stream',
        command: '',
        args: '',
        endpoint: ''
    });

    // Simplified polling - only for very short periods after actions
    useEffect(() => {
        let pollInterval: NodeJS.Timeout | null = null;

        // Only start polling if we have servers with transitional status and haven't exceeded attempts
        const hasTransitionalServers = servers.some(s => s.status === 'connecting');

        if (hasTransitionalServers && pollCountRef.current < maxPollAttempts) {
            setIsPolling(true);
            console.log(`🔄 Starting short polling for transitional servers (${pollCountRef.current}/${maxPollAttempts})`);

            pollInterval = setInterval(async () => {
                pollCountRef.current += 1;
                console.log(`🔄 Polling attempt ${pollCountRef.current}/${maxPollAttempts}`);

                try {
                    // Use the new refreshServers method
                    if (refreshServers) {
                        await refreshServers();
                        console.log('✅ Server refresh completed during polling');
                    } else {
                        // Fallback to refreshing tools for connecting servers
                        console.warn('⚠️ refreshServers not available, falling back to refreshTools');
                        const connectingServers = servers.filter(s => s.status === 'connecting');
                        for (const server of connectingServers) {
                            try {
                                await refreshTools(server.id);
                                console.log(`✅ Refreshed tools for ${server.name}`);
                            } catch (error) {
                                console.warn(`⚠️ Failed to refresh tools for ${server.name}:`, error);
                            }
                        }
                    }
                } catch (error) {
                    console.warn('⚠️ Polling error:', error);
                }

                // Stop polling after max attempts
                if (pollCountRef.current >= maxPollAttempts) {
                    console.log('🛑 Max polling attempts reached, stopping');
                    setIsPolling(false);
                    if (pollInterval) clearInterval(pollInterval);
                }
            }, 2000); // Poll every 2 seconds
        } else {
            // Reset counter when no transitional servers
            if (!hasTransitionalServers) {
                pollCountRef.current = 0;
            }
            setIsPolling(false);
        }

        return () => {
            if (pollInterval) {
                clearInterval(pollInterval);
            }
        };
    }, [servers, refreshTools, refreshServers]); // Add refreshServers to dependencies

    const handleConnect = async (server: MCPServer) => {
        console.log(`🔌 Manually connecting to server: ${server.name} (${server.id})`);
        console.log('Server config:', server);

        // Reset poll counter for new connection attempt
        pollCountRef.current = 0;

        try {
            await connectServer(server);
            console.log(`✅ Connection to ${server.name} initiated successfully`);

            // Immediately refresh to get updated status
            if (refreshServers) {
                await refreshServers();
                console.log('✅ Server status refreshed after connection');
            }

        } catch (error) {
            console.error(`❌ Failed to connect to ${server.name}:`, error);
            if (error instanceof Error) {
                console.error('Connection error details:', {
                    message: error.message,
                    stack: error.stack,
                    server: server
                });
            }

            // Show user-friendly error message
            alert(`Verbindung zu ${server.name} fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
        }
    };

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

        console.log('🔄 Attempting to save and connect server:', serverConfig);
        pollCountRef.current = 0; // Reset poll counter

        try {
            console.log('💾 Saving server configuration...');
            await saveServer(serverConfig);
            console.log('✅ Server configuration saved successfully');

            console.log('🔌 Attempting to connect to server...');
            await connectServer(serverConfig);
            console.log('✅ Server connection initiated successfully');

            // Clear form immediately
            setFormData({ id: '', name: '', protocol: 'stdio', command: '', args: '', endpoint: '' });
            setShowAddForm(false);

            // Schedule status check after a delay
            setTimeout(async () => {
                try {
                    console.log(`🔄 Checking status for new server: ${serverConfig.name}`);
                    await refreshTools(serverConfig.id);
                } catch (error) {
                    console.warn(`⚠️ Could not check status for new server:`, error);
                }
            }, 2000);

        } catch (error) {
            console.error('❌ Error adding/connecting server:', error);
            console.error('Server config that failed:', serverConfig);

            // Log specific error details
            if (error instanceof Error) {
                console.error('Error message:', error.message);
                console.error('Error stack:', error.stack);
            }

            // Show user-friendly error
            alert(`Fehler beim Hinzufügen des Servers: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
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

    const handleRefreshTools = async (serverId: string) => {
        const server = servers.find(s => s.id === serverId);
        console.log(`🔄 Refreshing tools for server: ${server?.name} (${serverId})`);

        try {
            await refreshTools(serverId);
            console.log(`✅ Tools refreshed for ${server?.name}`);

            // Also refresh server list to get updated tool count
            if (refreshServers) {
                await refreshServers();
                console.log('✅ Server list refreshed after tool refresh');
            }
        } catch (error) {
            console.error(`❌ Failed to refresh tools for ${server?.name}:`, error);
        }
    };

    // Manual refresh that works with existing API
    const handleManualRefresh = async () => {
        console.log('🔄 Manual refresh of all servers...');
        setIsPolling(true);
        try {
            if (refreshServers) {
                await refreshServers();
                console.log('✅ Manual refresh completed');
            } else {
                console.warn('⚠️ refreshServers not available, refreshing individual tools');
                for (const server of servers) {
                    try {
                        console.log(`🔄 Refreshing individual server: ${server.name} (${server.id})`);
                        await refreshTools(server.id);
                    } catch (error) {
                        console.warn(`Failed to refresh ${server.name}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Manual refresh failed:', error);
        } finally {
            setIsPolling(false);
        }
    };

    const stopPolling = () => {
        pollCountRef.current = maxPollAttempts;
        setIsPolling(false);
        console.log('🛑 Polling manually stopped');
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center space-x-4">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">MCP Server</h2>
                    {isPolling && (
                        <div className="flex items-center space-x-2 text-sm text-blue-600">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                            <span>Aktualisiere... ({pollCountRef.current}/{maxPollAttempts})</span>
                        </div>
                    )}
                </div>
                <div className="flex space-x-2">
                    {isPolling && (
                        <button
                            onClick={stopPolling}
                            className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                            title="Polling stoppen"
                        >
                            <RefreshCwOff />
                        </button>
                    )}
                    <button
                        onClick={handleManualRefresh}
                        disabled={isPolling}
                        className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm disabled:opacity-50"
                        title="Alle Server-Status aktualisieren"
                    >
                        <RefreshCcw />
                    </button>
                    <button
                        onClick={() => setShowAddForm(!showAddForm)}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        {showAddForm ? 'Abbrechen' : 'Server hinzufügen'}
                    </button>
                </div>
            </div>

            {showAddForm && (
                <form onSubmit={handleSubmit} className="mb-6 p-4 border border-gray-200 dark:border-gray-700 rounded">
                    <div className="grid grid-cols-1 gap-4">
                        <input
                            type="text"
                            placeholder="Server Name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                            required
                        />
                        <select
                            value={formData.protocol}
                            onChange={(e) => setFormData({ ...formData, protocol: e.target.value as 'stdio' | 'sse' | 'http-stream' })}
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
                                    onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                    required
                                />
                                <input
                                    type="text"
                                    placeholder="Arguments (optional)"
                                    value={formData.args}
                                    onChange={(e) => setFormData({ ...formData, args: e.target.value })}
                                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                />
                            </>
                        ) : (
                            <input
                                type="text"
                                placeholder="Endpoint URL"
                                value={formData.endpoint}
                                onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
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
                                    {/* Debug info for development */}
                                    <span className="text-xs text-gray-400 ml-2" title={`ID: ${server.id}, Status: ${server.status}, Tools: ${server.tools?.length || 0}, Protocol: ${server.protocol}`}>
                                        🔍 Debug
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
                                    <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                                        <p className="text-sm text-red-600 dark:text-red-400 font-medium">Error:</p>
                                        <p className="text-xs text-red-600 dark:text-red-400 break-all">{server.error}</p>
                                        {server.protocol === 'stdio' && (
                                            <div className="mt-1 text-xs text-red-500 dark:text-red-400">
                                                <p>Mögliche Ursachen:</p>
                                                <ul className="list-disc list-inside ml-2">
                                                    <li>Command nicht gefunden oder nicht ausführbar</li>
                                                    <li>Fehlende Dependencies (npm install erforderlich?)</li>
                                                    <li>Falsche Argumente oder Pfade</li>
                                                </ul>
                                            </div>
                                        )}
                                        {server.protocol !== 'stdio' && (
                                            <div className="mt-1 text-xs text-red-500 dark:text-red-400">
                                                <p>Mögliche Ursachen:</p>
                                                <ul className="list-disc list-inside ml-2">
                                                    <li>Server nicht erreichbar</li>
                                                    <li>Falsche Endpoint URL</li>
                                                    <li>CORS-Probleme</li>
                                                    <li>Server unterstützt {server.protocol.toUpperCase()} nicht</li>
                                                </ul>
                                            </div>
                                        )}
                                    </div>
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
                                            onClick={() => handleRefreshTools(server.id)}
                                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                                            title="Tools aktualisieren"
                                        >
                                            <Wrench />
                                        </button>
                                        <button
                                            onClick={() => disconnectServer(server.id)}
                                            className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                                        >
                                            <Unplug />
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => handleConnect(server)}
                                        disabled={server.status === 'connecting'}
                                        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                    >
                                        {server.status === 'connecting' ? 'Verbinde...' : 'Verbinden'}
                                    </button>
                                )}
                                <button
                                    onClick={() => deleteServer(server.id)}
                                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                                    title="Server löschen"                                  
                                >
                                    <Trash />
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
