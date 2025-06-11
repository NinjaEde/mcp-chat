import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import AIDialog from '../AIDialog';

// Mock the AIConnection interface
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

const mockAIConnections: AIConnection[] = [
  {
    id: 1,
    name: 'Test OpenAI',
    provider: 'openai',
    description: 'Test OpenAI connection',
    config: {
      apiKey: 'test-key',
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 2048
    },
    is_active: true,
    status: 'connected'
  }
];

const mockProps = {
  aiConnections: mockAIConnections,
  editingAI: null,
  onClose: vi.fn(),
  onSave: vi.fn(),
  onEdit: vi.fn(),
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
  onTest: vi.fn(),
  onLoadModels: vi.fn()
};

describe('AIDialog Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render dialog with title', () => {
    render(<AIDialog {...mockProps} />);
    
    expect(screen.getByText('KI-Modelle Konfiguration')).toBeInTheDocument();
  });

  it('should handle editing with null description', () => {
    const aiWithNullDescription: AIConnection = {
      ...mockAIConnections[0],
      description: null as any // Simulate null description from backend
    };
    
    const editProps = {
      ...mockProps,
      editingAI: aiWithNullDescription
    };
    
    // Should not throw error when rendering with null description
    expect(() => render(<AIDialog {...editProps} />)).not.toThrow();
  });

  it('should handle editing with undefined description', () => {
    const aiWithUndefinedDescription: AIConnection = {
      ...mockAIConnections[0],
      description: undefined as any // Simulate undefined description
    };
    
    const editProps = {
      ...mockProps,
      editingAI: aiWithUndefinedDescription
    };
    
    // Should not throw error when rendering with undefined description
    expect(() => render(<AIDialog {...editProps} />)).not.toThrow();
  });

  it('should handle null config values gracefully', () => {
    const aiWithNullConfig: AIConnection = {
      ...mockAIConnections[0],
      config: {
        apiKey: null as any,
        endpoint: null as any,
        model: null as any,
        temperature: null as any,
        maxTokens: null as any
      }
    };
    
    const editProps = {
      ...mockProps,
      editingAI: aiWithNullConfig
    };
    
    // Should not throw error when rendering with null config values
    expect(() => render(<AIDialog {...editProps} />)).not.toThrow();
  });
});
