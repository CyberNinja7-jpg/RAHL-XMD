const express = require('express');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');
const qrcode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory storage for QR codes and sessions
const qrCodes = new NodeCache({ stdTTL: 300 }); // 5 minutes expiration for QR codes
let sock = null;

// Ensure sessions directory exists
function ensureSessionsDir() {
    const sessionsDir = path.join(__dirname, 'sessions');
    if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
        console.log('Created sessions directory:', sessionsDir);
    }
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Generate QR code endpoint
app.get('/api/qr', async (req, res) => {
    try {
        // Check if we already have an active connection
        if (sock && sock.user) {
            return res.json({ 
                status: 'connected', 
                message: 'WhatsApp is already connected' 
            });
        }

        // Initialize WhatsApp connection if not already done
        if (!sock) {
            await initWhatsAppBot();
        }

        // Wait a moment for QR code generation
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if we have a QR code stored
        const qr = qrCodes.get('current_qr');
        if (qr) {
            return res.json({ 
                status: 'qr_required', 
                qrCode: qr,
                message: 'Scan this QR code with WhatsApp to connect' 
            });
        } else {
            return res.json({ 
                status: 'generating', 
                message: 'QR code is being generated, please refresh' 
            });
        }
    } catch (error) {
        console.error('QR code generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Check connection status
app.get('/api/status', (req, res) => {
    if (sock && sock.user) {
        res.json({ 
            status: 'connected', 
            user: sock.user,
            message: 'WhatsApp is connected' 
        });
    } else {
        res.json({ 
            status: 'disconnected', 
            message: 'WhatsApp is not connected' 
        });
    }
});

// Initialize WhatsApp bot
async function initWhatsAppBot() {
    try {
        console.log('Initializing WhatsApp bot with QR code authentication...');
        ensureSessionsDir();
        
        const { state, saveCreds } = await useMultiFileAuthState('sessions');
        
        sock = makeWASocket({
            version: [2, 2323, 4],
            printQRInTerminal: true,
            auth: state,
            browser: ['RAHL XMD', 'Chrome', '1.0.0']
        });

        // Save credentials when updated
        sock.ev.on('creds.update', saveCreds);
        
        // Handle connection updates
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('QR code received, generating for web...');
                try {
                    // Generate QR code as data URL for web display
                    const qrDataUrl = await qrcode.toDataURL(qr);
                    qrCodes.set('current_qr', qrDataUrl);
                    console.log('QR code generated for web display');
                } catch (qrError) {
                    console.error('QR code generation error:', qrError);
                }
            }
            
            if (connection === 'close') {
                const shouldReconnect = 
                    (lastDisconnect.error)?.output?.statusCode !== 
                    DisconnectReason.loggedOut;
                
                console.log('Connection closed, reconnecting:', shouldReconnect);
                
                if (shouldReconnect) {
                    setTimeout(() => initWhatsAppBot(), 3000);
                } else {
                    // Clear QR code on permanent disconnect
                    qrCodes.del('current_qr');
                }
            } else if (connection === 'open') {
                console.log('✅ WhatsApp bot connected successfully!');
                // Clear QR code after successful connection
                qrCodes.del('current_qr');
            }
        });
        
        // Handle incoming messages
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const message = m.messages[0];
                if (!message.message || message.key.fromMe) return;
                
                const text = message.message.conversation || 
                            (message.message.extendedTextMessage && message.message.extendedTextMessage.text) || 
                            '';
                
                if (!text) return;
                
                console.log(`Received message from ${message.pushName}: ${text}`);
                
                // Handle commands
                if (text === '!help') {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: `🤖 *RAHL XMD BOT COMMANDS* 🤖\n\n` +
                              `!help - Show this help message\n` +
                              `!ping - Check if bot is alive\n` +
                              `!info - Bot information\n` +
                              `!time - Current time\n` +
                              `sticker - Create sticker from image\n` +
                              `joke - Get a random joke\n` +
                              `quote - Inspirational quote`
                    });
                } else if (text === '!ping') {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: '🏓 Pong! Bot is alive and connected.'
                    });
                } else if (text === '!info') {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: `🤖 *RAHL XMD BOT*\n\n` +
                              `Status: Connected ✅\n` +
                              `Version: 1.0.0\n` +
                              `Powered by Baileys WhatsApp API`
                    });
                }
                
            } catch (error) {
                console.error('Error processing message:', error);
            }
        });
        
    } catch (error) {
        console.error('Error initializing WhatsApp bot:', error);
    }
}

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Lord Rahl server running on port ${PORT}`);
    console.log(`📱 Visit http://localhost:${PORT} to connect WhatsApp`);
    initWhatsAppBot();
});
