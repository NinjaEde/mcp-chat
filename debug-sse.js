#!/usr/bin/env node

// SSE Debug Tool
const EventSource = require('eventsource').default || require('eventsource');

const conversationId = process.argv[2] || '1';
const token = process.argv[3] || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInVzZXJuYW1lIjoiYWRtaW4iLCJpYXQiOjE3MzM5MjY5NzN9.C0qRkrL5LIDj2r0A8v0O7KXEKPGNnrz2e7dNPZQlUmU';

const url = `http://localhost:3001/api/conversations/${conversationId}/stream?token=${encodeURIComponent(token)}`;

console.log('🔍 SSE Debug Tool');
console.log('URL:', url);
console.log('Conversation ID:', conversationId);
console.log('Token (first 20 chars):', token.substring(0, 20) + '...');
console.log('---');

const eventSource = new EventSource(url);

eventSource.onopen = () => {
    console.log('✅ SSE connection opened');
};

eventSource.onmessage = (event) => {
    console.log('📨 SSE message received:', event.data);
    try {
        const data = JSON.parse(event.data);
        console.log('📊 Parsed data:', data);
    } catch (e) {
        console.log('❌ Failed to parse JSON:', e.message);
    }
};

eventSource.onerror = (error) => {
    console.log('❌ SSE error:', error);
    console.log('ReadyState:', eventSource.readyState);
    process.exit(1);
};

console.log('Listening for SSE events... Press Ctrl+C to exit');

process.on('SIGINT', () => {
    console.log('\n🛑 Closing SSE connection...');
    eventSource.close();
    process.exit(0);
});
