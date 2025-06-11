#!/bin/bash

# MCP Chat Configuration Test Script
echo "🧪 Testing MCP Chat Configuration..."
echo "================================="

# Test Backend Health
echo "1. Testing Backend Health..."
HEALTH_RESPONSE=$(curl -s http://localhost:3001/api/health)
if [[ $? -eq 0 ]]; then
    echo "   ✅ Backend is running"
    echo "   📊 Health: $HEALTH_RESPONSE" | jq '.' 2>/dev/null || echo "   📊 Health: $HEALTH_RESPONSE"
else
    echo "   ❌ Backend is not running"
fi

echo ""

# Test CORS with different origins
echo "2. Testing CORS Configuration..."

ORIGINS=(
    "http://localhost:5173"
    "http://localhost:3002"
    "http://localhost:8080"
    "http://frontend:5173"
)

for origin in "${ORIGINS[@]}"; do
    echo "   Testing origin: $origin"
    CORS_RESPONSE=$(curl -s -I -H "Origin: $origin" http://localhost:3001/api/health)
    if echo "$CORS_RESPONSE" | grep -q "Access-Control-Allow-Origin: $origin"; then
        echo "   ✅ CORS allowed for $origin"
    elif echo "$CORS_RESPONSE" | grep -q "Access-Control-Allow-Origin"; then
        ACTUAL_ORIGIN=$(echo "$CORS_RESPONSE" | grep "Access-Control-Allow-Origin" | cut -d' ' -f2- | tr -d '\r\n')
        echo "   ⚠️  CORS returned different origin: $ACTUAL_ORIGIN"
    else
        echo "   ❌ CORS not configured for $origin"
    fi
done

echo ""

# Test SSE Endpoint
echo "3. Testing SSE Endpoint..."
if command -v timeout > /dev/null; then
    TIMEOUT_CMD="timeout 3"
else
    TIMEOUT_CMD="gtimeout 3"
fi

# First get a valid token
echo "   Getting authentication token..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin"}')

if echo "$LOGIN_RESPONSE" | grep -q '"success":true'; then
    TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token' 2>/dev/null)
    echo "   ✅ Login successful"
    
    # Get conversations
    CONVERSATIONS=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/conversations)
    CONV_ID=$(echo "$CONVERSATIONS" | jq -r '.conversations[0].id' 2>/dev/null)
    
    if [[ "$CONV_ID" != "null" && "$CONV_ID" != "" ]]; then
        echo "   Testing SSE connection for conversation $CONV_ID..."
        SSE_RESPONSE=$($TIMEOUT_CMD curl -s -H "Accept: text/event-stream" \
            -H "Origin: http://localhost:5173" \
            "http://localhost:3001/api/conversations/$CONV_ID/stream?token=$TOKEN" 2>/dev/null)
        
        if echo "$SSE_RESPONSE" | grep -q '"type":"connected"'; then
            echo "   ✅ SSE connection successful"
        else
            echo "   ❌ SSE connection failed"
            echo "   Response: $SSE_RESPONSE"
        fi
    else
        echo "   ⚠️  No conversations found, creating one..."
        NEW_CONV=$(curl -s -X POST http://localhost:3001/api/conversations \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d '{"title":"Test Conversation"}')
        
        NEW_CONV_ID=$(echo "$NEW_CONV" | jq -r '.conversation.id' 2>/dev/null)
        if [[ "$NEW_CONV_ID" != "null" && "$NEW_CONV_ID" != "" ]]; then
            echo "   ✅ Conversation created: $NEW_CONV_ID"
        else
            echo "   ❌ Failed to create conversation"
        fi
    fi
else
    echo "   ❌ Login failed"
    echo "   Response: $LOGIN_RESPONSE"
fi

echo ""

# Test Environment Variables
echo "4. Environment Configuration..."
echo "   NODE_ENV: ${NODE_ENV:-not set}"
echo "   ALLOWED_ORIGINS: ${ALLOWED_ORIGINS:-not set (using defaults)}"
echo "   FRONTEND_URL: ${FRONTEND_URL:-not set}"
echo "   JWT_SECRET: ${JWT_SECRET:-not set (using default)}"

echo ""

# Summary
echo "🎯 Configuration Test Complete!"
echo "================================="
echo ""
echo "💡 Tips:"
echo "   - Set ALLOWED_ORIGINS environment variable for custom domains"
echo "   - Use .env files for persistent configuration"
echo "   - Check DEPLOYMENT.md for detailed setup instructions"
echo ""
