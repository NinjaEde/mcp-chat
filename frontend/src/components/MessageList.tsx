import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Loader2, User, Bot, Zap, Plus } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import type { Message, Conversation } from '../App';

interface MessageListProps {
  activeConversation: Conversation | null;
  messages: Message[];
  loading: boolean;
  streamingMessage: string;
  isStreaming: boolean;
  chatEndRef: React.RefObject<HTMLDivElement>;
  createConversation: (title?: string) => Promise<void>;
}

const MessageList: React.FC<MessageListProps> = ({
  activeConversation,
  messages,
  loading,
  streamingMessage,
  isStreaming,
  chatEndRef,
  createConversation,
}) => {
  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const renderMessage = (message: Message, index: number) => {
    const isUser = message.role === 'user';
    const isAssistant = message.role === 'assistant';

    return (
      <div
        key={message.id || index}
        className={`flex mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}
      >
        <div
          className={`max-w-xs lg:max-w-4xl px-4 py-2 rounded-lg ${
            isUser
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
          }`}
        >
          {/* Role indicator */}
          <div
            className={`text-xs mb-1 opacity-70 ${
              isUser ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {isUser ? (
              <>
              <User className="inline w-4 h-4 mr-1 align-text-bottom" /> Du
              </>
            ) : (
              <>
              <Bot className="inline w-4 h-4 mr-1 align-text-bottom" /> AI
              </>
            )} • {formatTime(message.created_at || '')}
          </div>

          {/* Message content */}
          {isUser ? (
            // User messages as plain text
            <div className="whitespace-pre-wrap break-words">
              {message.content}
            </div>
          ) : (
            // Assistant messages with Markdown rendering
            <div className="prose dark:prose-invert max-w-none prose-sm">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Code blocks
                  code({ node, inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={tomorrow}
                        language={match[1]}
                        PreTag="div"
                        className="rounded-md my-2"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code
                        className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  // Links
                  a({ children, href, ...props }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                        {...props}
                      >
                        {children}
                      </a>
                    );
                  },
                  // Tables
                  table({ children, ...props }) {
                    return (
                      <div className="overflow-x-auto my-2">
                        <table
                          className="min-w-full border-collapse border border-gray-300 dark:border-gray-600"
                          {...props}
                        >
                          {children}
                        </table>
                      </div>
                    );
                  },
                  th({ children, ...props }) {
                    return (
                      <th className="border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 px-3 py-2 text-left font-semibold" {...props}>
                        {children}
                      </th>
                    );
                  },
                  td({ children, ...props }) {
                    return (
                      <td className="border border-gray-300 dark:border-gray-600 px-3 py-2" {...props}>
                        {children}
                      </td>
                    );
                  },
                  // Blockquotes
                  blockquote({ children, ...props }) {
                    return (
                      <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic my-2" {...props}>
                        {children}
                      </blockquote>
                    );
                  },
                  // Lists
                  ul({ children, ...props }) {
                    return (
                      <ul className="list-disc list-inside space-y-1 my-2" {...props}>
                        {children}
                      </ul>
                    );
                  },
                  ol({ children, ...props }) {
                    return (
                      <ol className="list-decimal list-inside space-y-1 my-2" {...props}>
                        {children}
                      </ol>
                    );
                  },
                  // Headings
                  h1({ children, ...props }) {
                    return <h1 className="text-xl font-bold mb-2 mt-4" {...props}>{children}</h1>;
                  },
                  h2({ children, ...props }) {
                    return <h2 className="text-lg font-bold mb-2 mt-3" {...props}>{children}</h2>;
                  },
                  h3({ children, ...props }) {
                    return <h3 className="text-md font-bold mb-1 mt-2" {...props}>{children}</h3>;
                  },
                  // Paragraphs
                  p({ children, ...props }) {
                    return <p className="mb-2 last:mb-0" {...props}>{children}</p>;
                  },
                  // Strong/Bold
                  strong({ children, ...props }) {
                    return <strong className="font-bold" {...props}>{children}</strong>;
                  },
                  // Emphasis/Italic
                  em({ children, ...props }) {
                    return <em className="italic" {...props}>{children}</em>;
                  }
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!activeConversation) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-gray-500 dark:text-gray-400 flex flex-col items-center max-w-md">
          <Bot className="w-16 h-16 mb-4 text-blue-500" />
          <h2 className="text-2xl font-semibold mb-3 text-gray-800 dark:text-gray-200">
            Willkommen beim MCP Chat!
          </h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">
            Wählen Sie eine bestehende Unterhaltung aus der Seitenleiste aus oder starten Sie eine neue Unterhaltung.
          </p>
          <button
            onClick={() => createConversation()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Neue Unterhaltung starten
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {/* Messages */}
      {messages.map((message, index) => renderMessage(message, index))}

      {/* Show streaming message */}
      {isStreaming && streamingMessage && (
        <div className="flex justify-start mb-4">
          <div className="max-w-xs lg:max-w-4xl px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white">
            {/* Role indicator */}
            <div className="text-xs mb-1 opacity-70 text-gray-500 dark:text-gray-400">
              AI • {formatTime(new Date().toISOString())}
              <span className="ml-2 animate-pulse">●</span>
            </div>

            {/* Streaming content with Markdown */}
            <div className="prose dark:prose-invert max-w-none prose-sm">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={tomorrow}
                        language={match[1]}
                        PreTag="div"
                        className="rounded-md my-2"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code
                        className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  p({ children, ...props }) {
                    return <p className="mb-2 last:mb-0" {...props}>{children}</p>;
                  },
                  strong({ children, ...props }) {
                    return <strong className="font-bold" {...props}>{children}</strong>;
                  },
                  em({ children, ...props }) {
                    return <em className="italic" {...props}>{children}</em>;
                  },
                  ul({ children, ...props }) {
                    return <ul className="list-disc list-inside space-y-1 my-2" {...props}>{children}</ul>;
                  },
                  ol({ children, ...props }) {
                    return <ol className="list-decimal list-inside space-y-1 my-2" {...props}>{children}</ol>;
                  }
                }}
              >
                {streamingMessage}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {/* Show loading indicator only when no streaming content yet */}
      {loading && !streamingMessage && (
        <div className="flex justify-start mb-4">
          <div className="max-w-xs lg:max-w-md px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white">
            <div className="flex items-center space-x-2">
              <Loader2 className="inline w-4 h-4 animate-spin text-blue-600" />
              <span>KI denkt nach...</span>
            </div>
          </div>
        </div>
      )}

      <div ref={chatEndRef} />
    </div>
  );
};

export default MessageList;
