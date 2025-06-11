import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow, prism } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

interface Message {
  id?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
  isStreaming?: boolean;
}

interface ChatMessageProps {
  message: Message;
  streamingContent?: string;
  isCurrentlyStreaming?: boolean;
}

export default function ChatMessage({ message, streamingContent, isCurrentlyStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const content = streamingContent || message.content;

  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString('de-DE', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return '';
    }
  };

  return (
    <div className={`flex mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-xs lg:max-w-4xl px-4 py-2 rounded-lg ${
        isUser 
          ? 'bg-blue-600 text-white' 
          : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
      }`}>
        {/* Role indicator */}
        <div className={`text-xs mb-1 opacity-70 ${isUser ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
          {isUser ? 'Du' : 'AI'} • {formatTime(message.created_at)}
          {isCurrentlyStreaming && <span className="ml-2 animate-pulse">●</span>}
        </div>

        {/* Message content */}
        {isUser ? (
          // User messages as plain text
          <div className="whitespace-pre-wrap break-words">
            {content}
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
                      className="rounded-md"
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
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600" {...props}>
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
                    <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic" {...props}>
                      {children}
                    </blockquote>
                  );
                },
                // Lists
                ul({ children, ...props }) {
                  return (
                    <ul className="list-disc list-inside space-y-1" {...props}>
                      {children}
                    </ul>
                  );
                },
                ol({ children, ...props }) {
                  return (
                    <ol className="list-decimal list-inside space-y-1" {...props}>
                      {children}
                    </ol>
                  );
                },
                // Headings
                h1({ children, ...props }) {
                  return <h1 className="text-xl font-bold mb-2" {...props}>{children}</h1>;
                },
                h2({ children, ...props }) {
                  return <h2 className="text-lg font-bold mb-2" {...props}>{children}</h2>;
                },
                h3({ children, ...props }) {
                  return <h3 className="text-md font-bold mb-1" {...props}>{children}</h3>;
                },
                // Paragraphs
                p({ children, ...props }) {
                  return <p className="mb-2 last:mb-0" {...props}>{children}</p>;
                }
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
