const express = require('express');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory storage for pairing codes
const pairingCodes = new NodeCache({ stdTTL: 600 }); // 10 minutes expiration
let sock = null;
let isConnected = false;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Store admin number (your number)
const ADMIN_NUMBER = '254112399557@s.whatsapp.net';

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Generate pairing code endpoint
app.post('/api/generate-pairing-code', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        // Generate random 8-digit code
        const code = Math.floor(10000000 + Math.random() * 90000000).toString();
        
        // Store code with user info
        pairingCodes.set(code, {
            phoneNumber,
            createdAt: Date.now(),
            status: 'pending'
        });

        console.log(`Generated pairing code ${code} for ${phoneNumber}`);
        
        res.json({ 
            success: true, 
            code, 
            message: "Check WhatsApp for a notification to link your device" 
        });

    } catch (error) {
        console.error('Error generating pairing code:', error);
        res.status(500).json({ error: error.message });
    }
});

// Initialize WhatsApp bot
async function initWhatsAppBot() {
    try {
        console.log('Initializing WhatsApp bot...');
        
        const { state, saveCreds } = await useMultiFileAuthState('sessions');
        
        sock = makeWASocket({
            version: [2, 2323, 4],
            printQRInTerminal: false, // We're using pairing codes, not QR
            auth: state,
            browser: ['RAHL XMD', 'Chrome', '1.0.0']
        });

        // Save credentials when updated
        sock.ev.on('creds.update', saveCreds);
        
        // Handle connection updates
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                isConnected = false;
                const shouldReconnect = 
                    (lastDisconnect.error)?.output?.statusCode !== 
                    DisconnectReason.loggedOut;
                
                console.log('Connection closed, reconnecting:', shouldReconnect);
                
                if (shouldReconnect) {
                    setTimeout(() => initWhatsAppBot(), 3000);
                }
            } else if (connection === 'open') {
                console.log('✅ WhatsApp bot connected successfully!');
                isConnected = true;
                
                // Send connection success message to admin
                sendAdminMessage('✅ WhatsApp bot connected successfully!');
            }
        });
        
        // Handle incoming messages - including pairing codes
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const message = m.messages[0];
                if (!message.message || message.key.fromMe) return;
                
                const text = extractMessageText(message);
                const sender = message.key.remoteJid;
                
                if (!text) return;
                
                console.log(`Received message from ${sender}: ${text}`);
                
                // Check for pairing code message
                if (text.match(/^[0-9]{8}$/)) { // 8-digit code
                    await handlePairingCode(text, sender, message.pushName);
                } 
                // Check for admin commands
                else if (sender === ADMIN_NUMBER) {
                    await handleAdminCommand(text, sender);
                }
                // Handle regular user commands
                else {
                    await handleUserCommand(text, sender, message.pushName);
                }
                
            } catch (error) {
                console.error('Error processing message:', error);
            }
        });
        
    } catch (error) {
        console.error('Error initializing WhatsApp bot:', error);
        setTimeout(() => initWhatsAppBot(), 5000);
    }
}

// Extract message text from different message types
function extractMessageText(message) {
    const msg = message.message;
    if (msg?.conversation) return msg.conversation;
    if (msg?.extendedTextMessage?.text) return msg.extendedTextMessage.text;
    if (msg?.imageMessage?.caption) return msg.imageMessage.caption;
    if (msg?.videoMessage?.caption) return msg.videoMessage.caption;
    return '';
}

// Handle pairing code messages
async function handlePairingCode(code, sender, pushName) {
    const codeData = pairingCodes.get(code);
    
    if (codeData) {
        // Update code status to completed
        codeData.status = 'completed';
        codeData.connectedAt = Date.now();
        codeData.userJid = sender;
        codeData.userName = pushName;
        pairingCodes.set(code, codeData);
        
        // Send confirmation to user
        await sock.sendMessage(sender, { 
            text: `✅ Device linking successful! Welcome to RAHL XMD, ${pushName || 'user'}!\n\nType !help to see available commands.` 
        });
        
        console.log(`User ${codeData.phoneNumber} (${pushName}) paired successfully with code ${code}`);
        
        // Send notification to admin
        await sendAdminMessage(
            `🔗 New device linked:\n` +
            `Name: ${pushName || 'Unknown'}\n` +
            `Phone: ${codeData.phoneNumber}\n` +
            `Code: ${code}\n` +
            `Session: ${sender}`
        );
        
    } else {
        // Invalid code
        await sock.sendMessage(sender, { 
            text: `❌ Invalid pairing code. Please generate a new code from the web panel.` 
        });
    }
}

// Send message to admin
async function sendAdminMessage(text) {
    try {
        if (sock && isConnected) {
            await sock.sendMessage(ADMIN_NUMBER, { text });
        }
    } catch (error) {
        console.error('Error sending admin message:', error);
    }
}

// Handle admin commands
async function handleAdminCommand(text, sender) {
    if (text === '!status') {
        const status = isConnected ? 'Connected ✅' : 'Disconnected ❌';
        const codeCount = pairingCodes.keys().length;
        await sock.sendMessage(sender, {
            text: `🤖 Bot Status:\n\n` +
                  `Connection: ${status}\n` +
                  `Active pairing codes: ${codeCount}\n` +
                  `Uptime: ${process.uptime().toFixed(0)} seconds`
        });
    }
    else if (text === '!codes') {
        const codes = pairingCodes.keys();
        if (codes.length === 0) {
            await sock.sendMessage(sender, { text: 'No active pairing codes.' });
        } else {
            let message = 'Active pairing codes:\n\n';
            codes.forEach(code => {
                const data = pairingCodes.get(code);
                message += `Code: ${code} | Phone: ${data.phoneNumber} | Status: ${data.status}\n`;
            });
            await sock.sendMessage(sender, { text: message });
        }
    }
}

// Handle user commands
async function handleUserCommand(text, sender, pushName) {
    if (text === '!help') {
        await sock.sendMessage(sender, {
            text: `🤖 *RAHL XMD BOT COMMANDS* 🤖\n\n` +
                  `!help - Show this help message\n` +
                  `!ping - Check if bot is alive\n` +
                  `!info - Bot information\n` +
                  `!time - Current time\n` +
                  `!status - Check your connection status`
        });
    }
    else if (text === '!ping') {
        await sock.sendMessage(sender, {
            text: '🏓 Pong! Bot is alive and connected.'
        });
    }
    else if (text === '!info') {
        await sock.sendMessage(sender, {
            text: `🤖 *RAHL XMD BOT*\n\n` +
                  `Status: Connected ✅\n` +
                  `Version: 1.0.0\n` +
                  `Powered by Baileys WhatsApp API`
        });
    }
    else if (text === '!status') {
        await sock.sendMessage(sender, {
            text: `📊 *YOUR CONNECTION STATUS*\n\n` +
                  `Name: ${pushName || 'Unknown'}\n` +
                  `Connected: ✅\n` +
                  `Your ID: ${sender}`
        });
    }
    else if (text === '!time') {
        await sock.sendMessage(sender, {
            text: `⏰ Current time: ${new Date().toLocaleString()}`
        });
    }
}

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Lord Rahl server running on port ${PORT}`);
    console.log(`📱 Visit http://localhost:${PORT} for pairing interface`);
    initWhatsAppBot();
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    if (sock) {
        await sock.end();
    }
    process.exit(0);
});
