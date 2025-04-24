const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Create HTTP server to serve static files
const server = http.createServer((req, res) => {
  // Simple static file server for the frontend
  let filePath = path.join(__dirname, "frontend", req.url === "/" ? "index.html" : req.url);
  
  // Default to index.html for directory requests
  if (!path.extname(filePath)) {
    filePath = path.join(filePath, "index.html");
  }

  const extname = path.extname(filePath);
  let contentType = "text/html";
  
  // Set the content type based on file extension
  switch (extname) {
    case ".js":
      contentType = "text/javascript";
      break;
    case ".css":
      contentType = "text/css";
      break;
    case ".json":
      contentType = "application/json";
      break;
    case ".png":
      contentType = "image/png";
      break;
    case ".jpg":
    case ".jpeg":
      contentType = "image/jpeg";
      break;
    case ".gif":
      contentType = "image/gif";
      break;
    case ".svg":
      contentType = "image/svg+xml";
      break;
  }

  // Read the file and serve it
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404);
        res.end("File not found");
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
});

// Create WebSocket server attached to the HTTP server
const wss = new WebSocket.Server({ 
  server,
  // Add ping interval to detect stale connections
  clientTracking: true,
  // Increase the timeout to improve stability
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    // Below options specified as default values.
    concurrencyLimit: 10, // Limits zlib concurrency for performance.
    threshold: 1024 // Size below which messages are not compressed.
  },
  // Increase max payload size for image transfer
  maxPayload: 50 * 1024 * 1024 // 50MB
});

// Data structures for app state
const users = {}; // Stores usernames mapped to WebSocket connections
const userStatus = {}; // Tracks user online status
const messageHistory = {}; // Stores message history
const connectionToUser = new Map(); // Map WebSocket connections to usernames
const userLastSeen = {}; // Tracks when users were last seen online
const userPublicKeys = {}; // Stores user public keys for E2EE

// Set up ping interval to keep connections alive
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      // Connection is stale, terminate it
      const username = connectionToUser.get(ws);
      if (username) {
        userStatus[username] = "offline";
        userLastSeen[username] = new Date().toISOString();
        console.log(`${username} disconnected (ping timeout).`);
        broadcast(JSON.stringify({
          type: "system",
          message: `${username} has left the chat.`
        }));
        connectionToUser.delete(ws);
        updateUsersList();
      }
      return ws.terminate();
    }
    
    // Mark as inactive, will be marked active again when pong is received
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

// Clean up interval on server close
wss.on('close', function close() {
  clearInterval(pingInterval);
});

// Broadcast to all connected clients
function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Send a system notification to a specific user
function sendNotification(username, message) {
  if (users[username] && users[username].readyState === WebSocket.OPEN) {
    users[username].send(
      JSON.stringify({
        type: "notification",
        message: message
      })
    );
  }
}

// Update and broadcast online users list
function updateUsersList() {
  try {
    const onlineUsers = Object.keys(users).filter(user => userStatus[user] === "online");
    
    // Create user status object with last seen timestamps
    const userStatusData = {};
    Object.keys(userStatus).forEach(user => {
      userStatusData[user] = {
        status: userStatus[user],
        lastSeen: userLastSeen[user] || null,
        publicKey: userPublicKeys[user] || null
      };
    });
    
    const userListMessage = JSON.stringify({
      type: "userList",
      users: onlineUsers,
      userStatus: userStatusData
    });
    
    broadcast(userListMessage);
  } catch (error) {
    console.error("Error updating users list:", error);
  }
}

// Store message in history
function storeMessage(from, to, message, messageType = "text", imageData = null) {
  try {
    // Create conversation ID (sorted usernames to ensure consistency)
    const conversationId = [from, to].sort().join("-");
    
    if (!messageHistory[conversationId]) {
      messageHistory[conversationId] = [];
    }
    
    // Store message with timestamp
    const messageObj = {
      from,
      message,
      messageType,
      timestamp: new Date().toISOString()
    };
    
    // Add image data if present
    if (imageData && messageType === "image") {
      messageObj.imageData = imageData;
    }
    
    messageHistory[conversationId].push(messageObj);
    
    // Limit history to 50 messages per conversation
    if (messageHistory[conversationId].length > 50) {
      messageHistory[conversationId].shift();
    }
    
    return messageObj;
  } catch (error) {
    console.error("Error storing message:", error);
    return null;
  }
}

// Generate a server keypair for secure handshakes
const serverKeys = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

// Handle WebSocket connections
wss.on("connection", function connection(ws) {
  console.log("A user connected.");
  let currentUser = null;
  
  // Setup heartbeat to detect dead connections
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
    
    // Update last seen time when active
    if (currentUser) {
      userLastSeen[currentUser] = new Date().toISOString();
    }
  });

  ws.on("message", function incoming(message) {
    try {
      // Handle binary message (image data)
      if (message instanceof Buffer) {
        if (!currentUser) {
          return; // Ignore binary messages from unauthenticated users
        }
        
        // Last message should have metadata about the image
        const imageMetadata = ws.imageMetadata;
        if (!imageMetadata) {
          console.error("Received binary message without metadata");
          return;
        }
        
        // Store and forward image
        const imageData = message.toString('base64');
        const recipient = imageMetadata.to;
        
        // Store in history
        const storedMessage = storeMessage(
          currentUser, 
          recipient, 
          imageMetadata.filename || "Image", 
          "image", 
          imageData
        );
        
        if (!storedMessage) {
          ws.send(JSON.stringify({
            type: "error",
            error: "Failed to store image"
          }));
          return;
        }
        
        // Send to recipient if online
        if (users[recipient] && userStatus[recipient] === "online") {
          try {
            users[recipient].send(JSON.stringify({
              type: "image",
              from: currentUser,
              message: imageMetadata.filename || "Image",
              imageData: imageData,
              timestamp: storedMessage.timestamp,
              encrypted: imageMetadata.encrypted || false
            }));
          } catch (error) {
            console.error("Error sending image:", error);
          }
        }
        
        // Clear metadata
        delete ws.imageMetadata;
        return;
      }
      
      const data = JSON.parse(message);

      // Handle user registration
      if (data.type === "register") {
        const username = data.username;
        
        if (!username || username.trim() === "") {
          ws.send(JSON.stringify({ 
            type: "error", 
            error: "Username cannot be empty" 
          }));
          return;
        }
        
        // Store public key if provided
        if (data.publicKey) {
          userPublicKeys[username] = data.publicKey;
        }
        
        // Check if username is already taken by an active user
        if (users[username] && userStatus[username] === "online") {
          ws.send(JSON.stringify({ 
            type: "error", 
            error: "Username already taken" 
          }));
          return;
        }
        
        // If user was previously registered but went offline
        if (users[username]) {
          // Remove old connection
          const oldConnection = users[username];
          if (oldConnection && oldConnection !== ws) {
            try {
              oldConnection.terminate();
            } catch (err) {
              console.log("Could not close previous connection");
            }
          }
        }
        
        // Register the user
        users[username] = ws;
        userStatus[username] = "online";
        currentUser = username;
        connectionToUser.set(ws, username);
        userLastSeen[username] = new Date().toISOString();
        console.log(`${username} registered.`);
        
        // Send welcome message with server public key
        ws.send(JSON.stringify({
          type: "system",
          message: `Welcome ${username}! You are now connected.`,
          serverPublicKey: serverKeys.publicKey
        }));
        
        // Send message history if they have any
        Object.keys(messageHistory).forEach(conversationId => {
          if (conversationId.includes(username)) {
            ws.send(JSON.stringify({
              type: "history",
              conversationId: conversationId,
              messages: messageHistory[conversationId]
            }));
          }
        });
        
        // Update and broadcast online users
        updateUsersList();
        
        // Notify others that a new user has joined
        broadcast(JSON.stringify({
          type: "system",
          message: `${username} has joined the chat.`
        }));
        
        return;
      }

      // Handle private messaging
      if (data.type === "message" || data.type === "encrypted_message") {
        const toUser = data.to;
        const msg = data.message;
        const fromUser = data.from;
        const isEncrypted = data.type === "encrypted_message";
        
        if (!currentUser) {
          ws.send(JSON.stringify({ 
            type: "error", 
            error: "You must register first" 
          }));
          return;
        }
        
        // Validate the sender
        if (fromUser !== currentUser) {
          ws.send(JSON.stringify({ 
            type: "error", 
            error: "Unauthorized message sender" 
          }));
          return;
        }
        
        if (!toUser || toUser.trim() === "") {
          ws.send(JSON.stringify({ 
            type: "error", 
            error: "Recipient cannot be empty" 
          }));
          return;
        }
        
        if (!msg || msg.trim() === "") {
          ws.send(JSON.stringify({ 
            type: "error", 
            error: "Message cannot be empty" 
          }));
          return;
        }
        
        // Store the message - store encrypted messages as is
        const messageType = isEncrypted ? "encrypted" : "text";
        storeMessage(fromUser, toUser, msg, messageType);
        
        // Send to recipient if online
        if (users[toUser] && userStatus[toUser] === "online") {
          try {
            users[toUser].send(
              JSON.stringify({
                type: isEncrypted ? "encrypted_message" : "message",
                from: fromUser,
                message: msg,
                timestamp: new Date().toISOString()
              })
            );
          } catch (error) {
            console.error("Error sending message:", error);
            ws.send(JSON.stringify({ 
              type: "error", 
              error: "Failed to send message" 
            }));
          }
        } else if (users[toUser]) {
          // User exists but is offline
          ws.send(JSON.stringify({ 
            type: "info", 
            message: `Message saved. ${toUser} is currently offline.` 
          }));
        } else {
          // User doesn't exist
          ws.send(JSON.stringify({ 
            type: "error", 
            error: "User not found" 
          }));
        }
      }
      
      // Handle image metadata (before sending binary data)
      if (data.type === "image_metadata") {
        if (!currentUser) {
          ws.send(JSON.stringify({ 
            type: "error", 
            error: "You must register first" 
          }));
          return;
        }
        
        const toUser = data.to;
        if (!toUser || !users[toUser]) {
          ws.send(JSON.stringify({ 
            type: "error", 
            error: "Invalid recipient" 
          }));
          return;
        }
        
        // Store metadata for the upcoming binary message
        ws.imageMetadata = {
          to: toUser,
          filename: data.filename,
          encrypted: data.encrypted || false
        };
        
        ws.send(JSON.stringify({
          type: "upload_ready"
        }));
        
        return;
      }
      
      // Handle typing indicator
      if (data.type === "typing") {
        const toUser = data.to;
        
        if (!currentUser) return;
        
        if (users[toUser] && userStatus[toUser] === "online") {
          try {
            users[toUser].send(
              JSON.stringify({
                type: "typing",
                from: currentUser,
                isTyping: data.isTyping
              })
            );
          } catch (error) {
            console.error("Error sending typing indicator:", error);
          }
        }
      }
      
      // Handle read receipts
      if (data.type === "read") {
        const toUser = data.to;
        
        if (!currentUser) return;
        
        if (users[toUser] && userStatus[toUser] === "online") {
          try {
            users[toUser].send(
              JSON.stringify({
                type: "read",
                from: currentUser,
                timestamp: data.timestamp
              })
            );
          } catch (error) {
            console.error("Error sending read receipt:", error);
          }
        }
      }
      
      // Handle key exchange requests
      if (data.type === "key_exchange") {
        const targetUser = data.to;
        
        if (!currentUser) {
          ws.send(JSON.stringify({ 
            type: "error", 
            error: "You must register first" 
          }));
          return;
        }
        
        if (!targetUser || !users[targetUser]) {
          ws.send(JSON.stringify({ 
            type: "error", 
            error: "User not found" 
          }));
          return;
        }
        
        // Store the sender's public key
        if (data.publicKey) {
          userPublicKeys[currentUser] = data.publicKey;
        }
        
        // Forward the public key to the target user
        if (users[targetUser] && userStatus[targetUser] === "online") {
          try {
            users[targetUser].send(
              JSON.stringify({
                type: "key_exchange",
                from: currentUser,
                publicKey: data.publicKey
              })
            );
          } catch (error) {
            console.error("Error during key exchange:", error);
            ws.send(JSON.stringify({ 
              type: "error", 
              error: "Failed to exchange keys" 
            }));
          }
        } else {
          ws.send(JSON.stringify({ 
            type: "error", 
            error: "Target user is offline" 
          }));
        }
      }
      
    } catch (e) {
      console.error("Error processing message:", e);
      try {
        ws.send(JSON.stringify({ 
          type: "error", 
          error: "Invalid message format" 
        }));
      } catch (sendError) {
        console.error("Error sending error message:", sendError);
      }
    }
  });

  ws.on("close", () => {
    // Handle disconnection
    if (currentUser) {
      userStatus[currentUser] = "offline";
      userLastSeen[currentUser] = new Date().toISOString();
      console.log(`${currentUser} disconnected.`);
      
      // Clean up connection mapping
      connectionToUser.delete(ws);
      
      // Notify others that user has left
      broadcast(JSON.stringify({
        type: "system",
        message: `${currentUser} has left the chat.`
      }));
      
      // Update online users list
      updateUsersList();
      
      // Keep the user record for potential reconnection
      // but don't delete from users map so we maintain historical data
    }
  });
  
  // Handle errors
  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    try {
      if (currentUser) {
        userStatus[currentUser] = "offline";
        userLastSeen[currentUser] = new Date().toISOString();
        connectionToUser.delete(ws);
        updateUsersList();
      }
    } catch (e) {
      console.error("Error handling WebSocket error:", e);
    }
  });
});

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

