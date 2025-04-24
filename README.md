# Private Chat App

A real-time end-to-end encrypted chat application using WebSockets, allowing private messaging between users with advanced features.

## Features

- User registration with username
- Real-time private messaging
- Message history preservation
- Typing indicators
- Read receipts
- Online users display
- Offline message delivery
- User status tracking (online/offline)
- Last seen time for offline users
- End-to-end encryption for messages
- Image/file sharing with encryption
- Clean, responsive UI

## Getting Started

### Prerequisites

- Node.js (v12 or higher)
- npm (v6 or higher)
- A modern browser with WebCrypto API support (Chrome, Firefox, Edge, Safari)

### Installation

1. Clone the repository or download the files
2. Install dependencies:
   ```
   npm install
   ```

### Running the App

1. Start the server:
   ```
   npm start
   ```
   Or use the development server with auto-restart:
   ```
   npm run dev
   ```

2. Open a web browser and go to:
   ```
   http://localhost:8080
   ```

## How to Use for 2 Users

1. **Start the server** as described above.

2. **Open two different browser windows** (or tabs) and navigate to `http://localhost:8080` in both.

3. **Register with different usernames**:
   - In the first window, enter a username (e.g., "User1") and click "Register"
   - In the second window, enter a different username (e.g., "User2") and click "Register"

4. **Start chatting**:
   - In the first window, you'll see "User2" in the online users list - click on it
   - In the second window, you'll see "User1" in the online users list - click on it
   - Now you can exchange messages between the two windows
   
5. **Using End-to-End Encryption**:
   - Toggle the "E2E Encryption" switch before sending a message
   - Encrypted messages are indicated with a lock icon
   - Only the intended recipient can decrypt the message
   
6. **Sending Images**:
   - Click the "Upload" button to select an image
   - The image will be previewed before sending
   - Click "Send" to transmit the image
   - Images can also be encrypted before sending

## Security Details

The app implements end-to-end encryption using:

- RSA-OAEP (2048 bit) for key exchange
- AES-GCM (256 bit) for message and file encryption
- WebCrypto API for cryptographic operations

In end-to-end encryption mode:
1. The sender and recipient exchange public keys
2. Messages are encrypted on the sender's device
3. Only the recipient can decrypt the messages
4. The server cannot access the content of encrypted messages

## Technical Details

- Backend: Node.js with `ws` WebSocket library
- Frontend: HTML, CSS, and vanilla JavaScript
- Encryption: Web Cryptography API
- Communication: JSON messages over WebSocket protocol

## Message Types

- `register`: Register a new user
- `message`: Send a plain text message to another user
- `encrypted_message`: Send an encrypted message 
- `image_metadata`: Send information about an upcoming image
- `image`: Send an image file (can be encrypted)
- `typing`: Indicate when a user is typing
- `read`: Send read receipts
- `key_exchange`: Exchange public keys for encryption
- `userList`: Update the list of online users with status
- `system`: System notifications
- `error`: Error messages

## License

This project is licensed under the ISC License. 