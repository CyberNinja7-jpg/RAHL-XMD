const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

// To track which number requested pairing
let pendingPairingNumber = null;
let sock = null;
const ADMIN_NUMBER = '254112399557@s.whatsapp.net';

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Home route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Generate WhatsApp pairing code and send to phone number
app.post('/api/generate-pairing-code', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    // Save the number requesting pairing
    pendingPairingNumber = phoneNumber;

    // If bot not running, start it
    if (!sock) {
        await initWhatsAppBot();
        return res.json({ success: true, message: 'Bot initializing. You will receive a WhatsApp message with the pairing code soon.' });
    } else {
        return res.json({ success: true, message: 'Bot already running. If not paired, try restarting the bot.' });
    }
});

// Helper: send WhatsApp message
async function sendMessage(jid, text) {
    if (sock) {
        await sock.sendMessage(jid, { text });
    }
}

// Initialize WhatsApp bot and handle pairing
async function initWhatsAppBot() {
    const { state, saveCreds } = await useMultiFileAuthState('sessions');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        browser: ['RAHL XMD', 'Chrome', '1.0.0'],
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, pairingCode } = update;

        // When Baileys emits a pairingCode, send it to the user
        if (pairingCode && pendingPairingNumber) {
            const jid = `${pendingPairingNumber}@s.whatsapp.net`;
            await sendMessage(jid, `Your WhatsApp pairing code: ${pairingCode}\nGo to WhatsApp > Linked Devices > Link a Device > Paste this code.`);
            console.log(`Pairing code sent to ${jid}: ${pairingCode}`);
        }

        if (connection === 'open') {
            // Paired successfully!
            if (pendingPairingNumber) {
                const jid = `${pendingPairingNumber}@s.whatsapp.net`;
                await sendMessage(jid, `✅ Device paired! Here are your session credentials (keep safe):\n${JSON.stringify(sock.authState.creds)}`);
                pendingPairingNumber = null; // Reset after sending
            }
            await sendMessage(ADMIN_NUMBER, '✅ WhatsApp bot paired and connected!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message?.extendedTextMessage?.text;

        if (text === 'hi') {
            await sendMessage(from, 'Hello 👋, I am Lord Rahl Bot!');
        }
    });
}

// Start server
app.listen(PORT, () => {
    console.log(`🌍 Server running on port ${PORT}`);
});
