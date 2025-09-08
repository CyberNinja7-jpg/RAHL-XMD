const express = require('express');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

let sock = null;
let isConnected = false;
const ADMIN_NUMBER = '254112399557@s.whatsapp.net';

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Home route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Generate official WhatsApp pairing code
app.post('/api/generate-pairing-code', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        if (!sock) {
            return res.status(500).json({ error: 'WhatsApp bot not initialized yet' });
        }

        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`✅ WhatsApp pairing code for ${phoneNumber}: ${code}`);

        res.json({ success: true, code });
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
            auth: state,
            printQRInTerminal: false,
            browser: ['RAHL XMD', 'Chrome', '1.0.0']
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'close') {
                isConnected = false;
                const shouldReconnect =
                    (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Connection closed. Reconnect?', shouldReconnect);
                if (shouldReconnect) setTimeout(() => initWhatsAppBot(), 3000);
            } else if (connection === 'open') {
                console.log('✅ WhatsApp bot connected successfully!');
                isConnected = true;
                sendAdminMessage('✅ WhatsApp bot connected successfully!');
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const from = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message?.extendedTextMessage?.text;

            console.log('💬 New message:', text);

            if (text === 'hi') {
                await sock.sendMessage(from, { text: 'Hello 👋, I am Lord Rahl Bot!' });
            }
        });

    } catch (error) {
        console.error('Error initializing bot:', error);
    }
}

// Helper function
async function sendAdminMessage(text) {
    if (sock && isConnected) {
        await sock.sendMessage(ADMIN_NUMBER, { text });
    }
}

// Start everything
initWhatsAppBot();

app.listen(PORT, () => {
    console.log(`🌍 Server running on port ${PORT}`);
});
