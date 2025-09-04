const express = require('express');
const NodeCache = require('node-cache');
const SessionManager = require('./sessionManager');
const { DisconnectReason } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory storage for pairing codes
const pairingCodes = new NodeCache({ stdTTL: 600 });

// Initialize session manager
const sessionManager = new SessionManager('lord-rahl-bot');

// Store WhatsApp socket
let sock = null;

// Middleware
app.use(express.json());
app.use(express.static('public'));

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

// Validate code endpoint
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

// Get session status
app.get('/session-status', async (req, res) => {
    try {
        const sessionInfo = sessionManager.getSessionInfo();
        const hasValidSession = await sessionManager.hasValidSession();
        
        res.json({
            hasValidSession,
            sessionInfo,
            isConnected: sock !== null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Clear session endpoint
app.post('/clear-session', async (req, res) => {
    try {
        const success = await sessionManager.clearSession();
        sock = null;
        res.json({ success });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Initialize WhatsApp bot
async function initWhatsAppBot() {
    try {
        // Check if we have a valid session first
        const hasValidSession = await sessionManager.hasValidSession();
        
        if (hasValidSession) {
            console.log('Found valid session, reconnecting...');
        } else {
            console.log('No valid session found, generating new QR code...');
        }
        
        sock = await sessionManager.createSocket();
        
        // Handle connection updates
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('QR code received, scan with WhatsApp');
            }
            
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
                    setTimeout(() => initWhatsAppBot(), 3000);
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
app.listen(PORT, async () => {
    console.log(`Lord Rahl pairing server running on port ${PORT}`);
    try {
        await initWhatsAppBot();
        console.log('WhatsApp bot initialized');
    } catch (error) {
        console.error('Failed to initialize WhatsApp bot:', error);
    }
});

module.exports = app;
