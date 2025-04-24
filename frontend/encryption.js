/**
 * End-to-End Encryption helper functions for the chat application
 */

// Generate RSA key pair for asymmetric encryption
async function generateKeyPair() {
  try {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"]
    );
    
    // Export the keys to JWK format
    const publicKey = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const privateKey = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
    
    return { publicKey, privateKey, keyPair };
  } catch (error) {
    console.error("Error generating key pair:", error);
    throw error;
  }
}

// Import a public key from JWK format
async function importPublicKey(jwkKey) {
  try {
    return await window.crypto.subtle.importKey(
      "jwk",
      jwkKey,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      true,
      ["encrypt"]
    );
  } catch (error) {
    console.error("Error importing public key:", error);
    throw error;
  }
}

// Import a private key from JWK format
async function importPrivateKey(jwkKey) {
  try {
    return await window.crypto.subtle.importKey(
      "jwk",
      jwkKey,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      true,
      ["decrypt"]
    );
  } catch (error) {
    console.error("Error importing private key:", error);
    throw error;
  }
}

// Generate symmetric key for AES encryption
async function generateSymmetricKey() {
  try {
    return await window.crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"]
    );
  } catch (error) {
    console.error("Error generating symmetric key:", error);
    throw error;
  }
}

// Export a symmetric key to raw format
async function exportSymmetricKey(key) {
  try {
    const rawKey = await window.crypto.subtle.exportKey("raw", key);
    return new Uint8Array(rawKey);
  } catch (error) {
    console.error("Error exporting symmetric key:", error);
    throw error;
  }
}

// Import a symmetric key from raw format
async function importSymmetricKey(rawKey) {
  try {
    return await window.crypto.subtle.importKey(
      "raw",
      rawKey,
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"]
    );
  } catch (error) {
    console.error("Error importing symmetric key:", error);
    throw error;
  }
}

// Encrypt a message using RSA-OAEP (for key exchange)
async function encryptWithRSA(publicKey, data) {
  try {
    // Convert string data to ArrayBuffer if needed
    let dataBuffer;
    if (typeof data === 'string') {
      dataBuffer = new TextEncoder().encode(data);
    } else if (data instanceof Uint8Array) {
      dataBuffer = data;
    } else {
      throw new Error("Data must be string or Uint8Array");
    }
    
    const encryptedData = await window.crypto.subtle.encrypt(
      {
        name: "RSA-OAEP"
      },
      publicKey,
      dataBuffer
    );
    
    return new Uint8Array(encryptedData);
  } catch (error) {
    console.error("Error encrypting with RSA:", error);
    throw error;
  }
}

// Decrypt a message using RSA-OAEP (for key exchange)
async function decryptWithRSA(privateKey, encryptedData) {
  try {
    const decryptedData = await window.crypto.subtle.decrypt(
      {
        name: "RSA-OAEP"
      },
      privateKey,
      encryptedData
    );
    
    return new Uint8Array(decryptedData);
  } catch (error) {
    console.error("Error decrypting with RSA:", error);
    throw error;
  }
}

// Encrypt a message using AES-GCM (for message encryption)
async function encryptWithAES(key, data) {
  try {
    // Generate initialization vector (IV)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    // Convert string data to ArrayBuffer if needed
    let dataBuffer;
    if (typeof data === 'string') {
      dataBuffer = new TextEncoder().encode(data);
    } else if (data instanceof Uint8Array) {
      dataBuffer = data;
    } else {
      throw new Error("Data must be string or Uint8Array");
    }
    
    const encryptedData = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      dataBuffer
    );
    
    // Combine the IV and encrypted data
    const result = new Uint8Array(iv.length + encryptedData.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encryptedData), iv.length);
    
    return result;
  } catch (error) {
    console.error("Error encrypting with AES:", error);
    throw error;
  }
}

// Decrypt a message using AES-GCM
async function decryptWithAES(key, encryptedData) {
  try {
    // Extract the IV from the beginning of the data
    const iv = encryptedData.slice(0, 12);
    const data = encryptedData.slice(12);
    
    const decryptedData = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      data
    );
    
    return new Uint8Array(decryptedData);
  } catch (error) {
    console.error("Error decrypting with AES:", error);
    throw error;
  }
}

// Convert ArrayBuffer to base64 string for transmission
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Convert base64 string to ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Convert ArrayBuffer to text
function arrayBufferToText(buffer) {
  return new TextDecoder().decode(buffer);
}

// Generate a session key and encrypt it with the recipient's public key
async function encryptSessionKey(recipientPublicKey) {
  try {
    // Generate a new symmetric key for this session
    const sessionKey = await generateSymmetricKey();
    
    // Export the session key
    const rawSessionKey = await exportSymmetricKey(sessionKey);
    
    // Encrypt the session key with the recipient's public key
    const encryptedSessionKey = await encryptWithRSA(recipientPublicKey, rawSessionKey);
    
    return {
      sessionKey,
      encryptedSessionKey: arrayBufferToBase64(encryptedSessionKey)
    };
  } catch (error) {
    console.error("Error encrypting session key:", error);
    throw error;
  }
}

// Decrypt a session key using your private key
async function decryptSessionKey(encryptedSessionKey, privateKey) {
  try {
    // Convert from base64 to ArrayBuffer
    const encryptedKeyBuffer = base64ToArrayBuffer(encryptedSessionKey);
    
    // Decrypt the session key
    const rawSessionKey = await decryptWithRSA(privateKey, encryptedKeyBuffer);
    
    // Import as AES key
    return await importSymmetricKey(rawSessionKey);
  } catch (error) {
    console.error("Error decrypting session key:", error);
    throw error;
  }
}

// Encrypt a message for a recipient using their session key
async function encryptMessage(message, sessionKey) {
  try {
    // Encrypt the message with AES
    const encryptedData = await encryptWithAES(sessionKey, message);
    
    // Convert to base64 for transmission
    return arrayBufferToBase64(encryptedData);
  } catch (error) {
    console.error("Error encrypting message:", error);
    throw error;
  }
}

// Decrypt a message using a session key
async function decryptMessage(encryptedMessage, sessionKey) {
  try {
    // Convert from base64 to ArrayBuffer
    const encryptedData = base64ToArrayBuffer(encryptedMessage);
    
    // Decrypt with AES
    const decryptedData = await decryptWithAES(sessionKey, encryptedData);
    
    // Convert to text
    return arrayBufferToText(decryptedData);
  } catch (error) {
    console.error("Error decrypting message:", error);
    throw error;
  }
}

// Encrypt a file using a session key
async function encryptFile(file, sessionKey) {
  try {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          const fileData = new Uint8Array(event.target.result);
          const encryptedData = await encryptWithAES(sessionKey, fileData);
          resolve(arrayBufferToBase64(encryptedData));
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = (error) => {
        reject(error);
      };
      
      reader.readAsArrayBuffer(file);
    });
  } catch (error) {
    console.error("Error encrypting file:", error);
    throw error;
  }
}

// Decrypt a file using a session key
async function decryptFile(encryptedFile, sessionKey, fileName, fileType) {
  try {
    // Convert from base64 to ArrayBuffer
    const encryptedData = base64ToArrayBuffer(encryptedFile);
    
    // Decrypt with AES
    const decryptedData = await decryptWithAES(sessionKey, encryptedData);
    
    // Create a Blob from the decrypted data
    return new Blob([decryptedData], { type: fileType || 'application/octet-stream' });
  } catch (error) {
    console.error("Error decrypting file:", error);
    throw error;
  }
}

// Export the functions
window.E2EE = {
  generateKeyPair,
  importPublicKey,
  importPrivateKey,
  encryptSessionKey,
  decryptSessionKey,
  encryptMessage,
  decryptMessage,
  encryptFile,
  decryptFile,
  arrayBufferToBase64,
  base64ToArrayBuffer
}; 