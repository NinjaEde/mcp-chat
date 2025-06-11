import React, { useState, useEffect, useRef } from 'react';
import { useSSE } from '../hooks/useSSE';
import { chatAPI } from '../api';
import ChatMessage from './ChatMessage';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Message {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

interface ChatInterfaceProps {
  conversationId: number;
  aiConnectionId?: number;
  model?: string;
}

export default function ChatInterface({ conversationId, aiConnectionId, model }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // SSE Hook für Streaming
  const { 
    isConnected, 
    startStreaming, 
    stopStreaming 
  } = useSSE({
    conversationId,
    enabled: false,
    onChunk: (content: string) => {
      console.log('🔄 Received chunk:', content);
      setIsStreaming(true);
      setStreamingContent(prev => {
        const newContent = prev + content;
        console.log('📝 Updated streaming content length:', newContent.length);
        return newContent;
      });
    },
    onComplete: (messageId: number) => {
      console.log('✅ Streaming complete, message ID:', messageId);
      setStreamingMessageId(messageId);
      
      // Warten und dann Messages neu laden
      setTimeout(async () => {
        console.log('🔄 Reloading messages after streaming complete...');
        await loadMessages();
        
        // Reset streaming state AFTER messages are loaded
        setStreamingContent('');
        setIsStreaming(false);
        setIsLoading(false);
        setStreamingMessageId(null);
        stopStreaming();
      }, 200);
    },
    onError: (error: string) => {
      console.error('❌ Streaming error:', error);
      setIsLoading(false);
      setStreamingContent('');
      setIsStreaming(false);
      setStreamingMessageId(null);
      stopStreaming();
    }
  });

  const loadMessages = async () => {
    try {
      console.log('Loading messages for conversation:', conversationId);
      const response = await chatAPI.getMessages(conversationId);
      if (response.success) {
        console.log('Messages loaded successfully:', response.conversation.messages?.length || 0);
        setMessages(response.conversation.messages || []);
      } else {
        console.error('Failed to load messages:', response);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const messageContent = input.trim();
    const userMessage: Message = {
      id: Date.now(), // Temporary ID
      role: 'user',
      content: messageContent,
      created_at: new Date().toISOString()
    };

    // Immediately show user message (temporär)
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setStreamingContent('');
    setIsStreaming(false);

    try {
      console.log('=== STARTING MESSAGE SEND PROCESS ===');
      // 1. SSE-Verbindung etablieren
      startStreaming();
      // 2. Warten auf SSE-Verbindung (vor dem Senden!)
      console.log('2. Waiting for SSE connection BEFORE sending message...');
      let connectionWaitTime = 0;
      const maxWaitTime = 4000; // ggf. Timeout erhöhen
      while (!isConnected && connectionWaitTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 100));
        connectionWaitTime += 100;
      }
      if (!isConnected) {
        console.warn('SSE connection not established within timeout, aborting streaming!');
        setIsLoading(false);
        setStreamingContent('');
        setIsStreaming(false);
        stopStreaming();
        return;
      } else {
        console.log('SSE connection established successfully, sending message...');
      }
      // 3. Nachricht senden (erst jetzt!)
      const response = await chatAPI.sendMessage(
        conversationId, 
        messageContent, 
        aiConnectionId, 
        model, 
        true
      );
      if (response.success) {
        // Hole die echte User-Message aus der Response
        let realUserMessage = null;
        if (response.message && response.message.role === 'user') {
          realUserMessage = response.message;
        } else if (response.data && response.data.role === 'user') {
          realUserMessage = response.data;
        }
        // Ersetze temporäre User-Message durch echte Backend-Message
        if (realUserMessage) {
          setMessages(prev => {
            // Entferne die temporäre User-Message (per Inhalt und Rolle)
            const filtered = prev.filter(m => !(m.role === 'user' && m.content === messageContent));
            return [...filtered, realUserMessage];
          });
        }
        if (!response.streaming) {
          // Kein Streaming: Prüfe, ob AI-Antwort im Response enthalten ist
          let aiMessage = null;
          if (response.message && response.message.role === 'assistant') {
            aiMessage = response.message;
          } else if (response.aiMessage) {
            aiMessage = response.aiMessage;
          } else if (response.data && response.data.role === 'assistant') {
            aiMessage = response.data;
          }
          if (aiMessage) {
            setMessages(prev => [...prev, aiMessage]);
            setIsLoading(false);
            setIsStreaming(false);
            setStreamingContent('');
            setStreamingMessageId(null);
            stopStreaming();
          } else {
            // Polling: Warte auf neue AI-Antwort in der DB
            const pollTimeout = 10000; // 10s max
            const pollInterval = 500;
            let waited = 0;
            let found = false;
            while (waited < pollTimeout && !found) {
              await new Promise(resolve => setTimeout(resolve, pollInterval));
              waited += pollInterval;
              const msgResp = await chatAPI.getMessages(conversationId);
              if (msgResp.success && Array.isArray(msgResp.conversation?.messages)) {
                const allMsgs = msgResp.conversation.messages;
                // Finde die echte User-Message im Backend
                let lastUserMsgIdx = -1;
                if (realUserMessage) {
                  lastUserMsgIdx = allMsgs.findIndex((m: Message) => m.id === realUserMessage.id);
                } else {
                  lastUserMsgIdx = allMsgs.map((m: Message) => m.content).lastIndexOf(messageContent);
                }
                if (lastUserMsgIdx !== -1) {
                  // Suche nach der ersten Assistant-Message NACH der User-Message
                  const aiMsg = allMsgs.slice(lastUserMsgIdx + 1).find((m: Message) => m.role === 'assistant');
                  if (aiMsg) {
                    setMessages(allMsgs);
                    found = true;
                    setIsLoading(false);
                    setIsStreaming(false);
                    setStreamingContent('');
                    setStreamingMessageId(null);
                    stopStreaming();
                    break;
                  }
                }
              }
            }
            if (!found) {
              setIsLoading(false);
              setIsStreaming(false);
              setStreamingContent('');
              setStreamingMessageId(null);
              stopStreaming();
              console.warn('AI-Antwort wurde nach Timeout nicht gefunden.');
            }
          }
        } else {
          // Streaming: Ladeanimation bleibt, chunks/complete werden über SSE verarbeitet
        }
      } else {
        setIsLoading(false);
        setStreamingContent('');
        setIsStreaming(false);
        stopStreaming();
      }
    } catch (error) {
      setIsLoading(false);
      setStreamingContent('');
      setIsStreaming(false);
      stopStreaming();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    loadMessages();
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  return (
    <div className="flex flex-col h-full">
      {/* Connection Status */}
      <div className="p-2 bg-gray-100 dark:bg-gray-800 text-sm text-center">
        {isConnected ? (
          <span className="text-green-600">🟢 Live-Streaming aktiv</span>
        ) : isLoading ? (
          <span className="text-yellow-600">🟡 KI antwortet...</span>
        ) : (
          <span className="text-gray-600">⚪ Bereit für Chat</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message, index) => (
          <ChatMessage
            key={message.id || index}
            message={message}
            streamingContent={undefined}
            isCurrentlyStreaming={false}
          />
        ))}

        {/* Show streaming assistant message */}
        {(isStreaming || isLoading) && streamingContent && (
          <div className="flex justify-start mb-4">
            <div className="max-w-xs lg:max-w-4xl px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white">
              <div className="prose dark:prose-invert max-w-none">
                <ReactMarkdown
                  components={{
                    code({ node, inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      return !inline && match ? (
                        <SyntaxHighlighter
                          style={tomorrow}
                          language={match[1]}
                          PreTag="div"
                          {...props}
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    }
                  }}
                >
                  {streamingContent}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Show loading indicator only when no streaming content yet */}
        {isLoading && !streamingContent && (
          <div className="flex justify-start mb-4">
            <div className="max-w-xs lg:max-w-md px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span>KI denkt nach...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Nachricht eingeben..."
            disabled={isLoading}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '⏳' : '📤'}
          </button>
        </div>
      </div>
    </div>
  );
}
