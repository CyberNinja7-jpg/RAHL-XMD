const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

let sock = null;
let pendingPairingNumber = null;
let pairingCodeCurrent = null;

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API to request pairing code
app.post('/api/generate-pairing-code', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    pendingPairingNumber = phoneNumber;
    pairingCodeCurrent = null; // Reset

    if (!sock) {
        await initWhatsAppBot();
    }

    // Wait for pairing code to be generated
    let tries = 0;
    while (!pairingCodeCurrent && tries < 20) {
        await new Promise(resolve => setTimeout(resolve, 500));
        tries++;
    }

    if (pairingCodeCurrent) {
        res.json({ success: true, code: pairingCodeCurrent });
        // pairingCodeCurrent is reset on connection
    } else {
        res.status(500).json({ error: 'Failed to generate pairing code.' });
    }
});

// Helper: Send WhatsApp message
async function sendMessage(jid, text) {
    if (sock) {
        await sock.sendMessage(jid, { text });
    }
}

// WhatsApp bot init
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

        if (pairingCode) {
            pairingCodeCurrent = pairingCode;
            console.log(`Pairing code generated: ${pairingCode}`);
        }

        if (connection === 'open') {
            // Paired successfully; send session credentials to user
            if (pendingPairingNumber) {
                const jid = `${pendingPairingNumber}@s.whatsapp.net`;
                await sendMessage(jid, `✅ Device linked! Here is your session id: \n${JSON.stringify(sock.authState.creds)}`);
                pendingPairingNumber = null;
                pairingCodeCurrent = null;
            }
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
