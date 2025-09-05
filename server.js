const express = require('express');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const NodeCache = require('node-cache');
const qrcode = require('qrcode-terminal');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory storage for pairing codes
const pairingCodes = new NodeCache({ stdTTL: 600 });
let sock = null;

// Ensure sessions directory exists
function ensureSessionsDir() {
    const sessionsDir = path.join(__dirname, 'sessions', 'lord-rahl-bot');
    if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
        console.log('Created sessions directory:', sessionsDir);
    }
}

// Middleware
app.use(express.json());

// Routes
app.get('/', (req, res) => {
    res.send(`
        <h1>Lord Rahl WhatsApp Bot</h1>
        <p>Bot is running! Use POST /generate-code to get a pairing code.</p>
        <p>Send "Lord Rahl [CODE]" to the bot on WhatsApp to pair.</p>
    `);
});

app.post('/generate-code', (req, res) => {
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
    
    console.log(`Generated code ${code} for ${phoneNumber}`);
    res.json({ code, expiresIn: 600 });
});

// Initialize WhatsApp bot
async function initWhatsAppBot() {
    try {
        console.log('Initializing WhatsApp bot...');
        ensureSessionsDir();
        
        // This will automatically create the session files
        const { state, saveCreds } = await useMultiFileAuthState('sessions/lord-rahl-bot');
        
        sock = makeWASocket({
            version: [2, 2323, 4],
            printQRInTerminal: true,
            auth: state,
            browser: ['RAHL XMD', 'Chrome', '1.0.0']
        });

        // Save credentials when updated
        sock.ev.on('creds.update', saveCreds);
        
        // Handle connection updates
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('\n📲 QR code for pairing:');
                qrcode.generate(qr, { small: true });
                console.log('Scan the QR code above with WhatsApp to connect your bot.');
            }
            
            if (connection === 'close') {
                const shouldReconnect = 
                    (lastDisconnect.error)?.output?.statusCode !== 
                    DisconnectReason.loggedOut;
                
                console.log('Connection closed, reconnecting:', shouldReconnect);
                
                if (shouldReconnect) {
                    setTimeout(() => initWhatsAppBot(), 3000);
                }
            } else if (connection === 'open') {
                console.log('✅ WhatsApp bot connected successfully!');
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
                
                if (text && text.startsWith('Lord Rahl')) {
                    const code = text.replace('Lord Rahl', '').trim();
                    const codeData = pairingCodes.get(code);
                    
                    if (codeData) {
                        codeData.status = 'completed';
                        pairingCodes.set(code, codeData);
                        
                        await sock.sendMessage(message.key.remoteJid, { 
                            text: `✅ Session established! Welcome to RAHL XMD.` 
                        });
                        
                        console.log(`User ${codeData.phoneNumber} paired successfully`);
                    } else {
                        await sock.sendMessage(message.key.remoteJid, { 
                            text: `❌ Invalid pairing code. Please generate a new code.` 
                        });
                    }
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
    initWhatsAppBot();
});
