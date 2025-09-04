const express = require('express');
const { create } = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory storage for pairing codes (use a database in production)
const pairingCodes = new NodeCache({ stdTTL: 600 }); // 10 minutes expiration

// Middleware
app.use(express.json());
app.use(express.static('public')); // Serve your frontend files

// Store WhatsApp sessions
let sessions = new Map();

// Generate pairing code endpoint
app.post('/generate-code', (req, res) => {
    const { userId, phoneNumber } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }
    
    // Generate random 8-digit code
    const code = Math.floor(10000000 + Math.random() * 90000000).toString();
    
    // Store code with user info
    pairingCodes.set(code, {
        userId: userId || phoneNumber,
        phoneNumber,
        createdAt: Date.now(),
        status: 'pending'
    });
    
    console.log(`Generated code ${code} for ${phoneNumber}`);
    res.json({ code, expiresIn: 600 });
});

// Validate code endpoint (for your WhatsApp bot)
app.get('/validate-code/:code', (req, res) => {
    const { code } = req.params;
    const codeData = pairingCodes.get(code);
    
    if (!codeData) {
        return res.status(404).json({ valid: false, message: 'Code not found' });
    }
    
    res.json({ 
        valid: true, 
        userId: codeData.userId, 
        phoneNumber: codeData.phoneNumber 
    });
});

// Complete pairing endpoint
app.post('/complete-pairing/:code', (req, res) => {
    const { code } = req.params;
    const codeData = pairingCodes.get(code);
    
    if (!codeData) {
        return res.status(404).json({ success: false, message: 'Code not found' });
    }
    
    // Update code status
    codeData.status = 'completed';
    pairingCodes.set(code, codeData);
    
    res.json({ success: true, userId: codeData.userId });
});

// Get pairing status
app.get('/pairing-status/:code', (req, res) => {
    const { code } = req.params;
    const codeData = pairingCodes.get(code);
    
    if (!codeData) {
        return res.status(404).json({ status: 'invalid' });
    }
    
    res.json({ status: codeData.status });
});

// Initialize WhatsApp bot
async function initWhatsAppBot() {
    try {
        const sessionId = 'lord-rahl-bot';
        const { state, saveCreds } = await useMultiFileAuthState(sessionId);
        
        const sock = makeWASocket({
            version: [2, 2323, 4],
            printQRInTerminal: true,
            auth: state,
            browser: ['Lord Rahl Bot', 'Chrome', '1.0.0']
        });
        
        // Save credentials when updated
        sock.ev.on('creds.update', saveCreds);
        
        // Handle connection updates
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                const shouldReconnect = 
                    (lastDisconnect.error)?.output?.statusCode !== 
                    DisconnectReason.loggedOut;
                
                console.log(
                    'Connection closed due to ', 
                    lastDisconnect.error, 
                    ', reconnecting ', 
                    shouldReconnect
                );
                
                if (shouldReconnect) {
                    initWhatsAppBot();
                }
            } else if (connection === 'open') {
                console.log('WhatsApp bot connected successfully!');
            }
        });
        
        // Handle incoming messages
        sock.ev.on('messages.upsert', async (m) => {
            const message = m.messages[0];
            if (!message.message || message.key.fromMe) return;
            
            const jid = message.key.remoteJid;
            const text = extractMessageText(message);
            
            // Check for pairing message
            if (text && text.startsWith('Lord Rahl')) {
                const code = text.replace('Lord Rahl', '').trim();
                
                // Validate the code
                const codeData = pairingCodes.get(code);
                if (codeData) {
                    // Update code status
                    codeData.status = 'completed';
                    pairingCodes.set(code, codeData);
                    
                    // Send confirmation message
                    await sock.sendMessage(jid, { 
                        text: `Session established! Welcome to RAHL XMD, ${codeData.userId || 'user'}.` 
                    });
                    
                    console.log(`User ${codeData.phoneNumber} paired successfully`);
                } else {
                    await sock.sendMessage(jid, { 
                        text: `Invalid pairing code. Please generate a new code.` 
                    });
                }
            }
        });
        
        sessions.set(sessionId, sock);
        return sock;
        
    } catch (error) {
        console.error('Error initializing WhatsApp bot:', error);
        throw error;
    }
}

// Helper function to extract message text
function extractMessageText(message) {
    const msg = message.message;
    if (msg?.conversation) return msg.conversation;
    if (msg?.extendedTextMessage?.text) return msg.extendedTextMessage.text;
    if (msg?.imageMessage?.caption) return msg.imageMessage.caption;
    if (msg?.videoMessage?.caption) return msg.videoMessage.caption;
    return '';
}

// Start server
app.listen(PORT, () => {
    console.log(`Lord Rahl pairing server running on port ${PORT}`);
    initWhatsAppBot().then(() => {
        console.log('WhatsApp bot initialized');
    }).catch(console.error);
});

module.exports = app;
