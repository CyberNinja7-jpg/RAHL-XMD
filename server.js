const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

let sock = null;

// Your pairing site URL
const PAIRING_SITE_URL = 'https://rahl-verse-empire-pair-site.onrender.com';

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Command System (Same as before)
const commands = {
    'menu': {
        description: '📋 Show all available commands',
        category: 'General',
        execute: async (from, sock, args) => {
            let menuText = '🤖 *RAHL XMD BOT COMMANDS* 🤖\n\n';
            
            const categories = {};
            for (const [cmd, info] of Object.entries(commands)) {
                if (!categories[info.category]) {
                    categories[info.category] = [];
                }
                categories[info.category].push(`• .${cmd} - ${info.description}`);
            }
            
            for (const [category, cmdList] of Object.entries(categories)) {
                menuText += `*${category}*\n`;
                menuText += cmdList.join('\n') + '\n\n';
            }
            
            menuText += `📊 Total Commands: ${Object.keys(commands).length}\n`;
            menuText += `💡 Use: .<command> to execute`;
            
            await sock.sendMessage(from, { text: menuText });
        }
    },

    'help': {
        description: '❓ Get help for specific command',
        category: 'General',
        execute: async (from, sock, args) => {
            if (args.length === 0) {
                await sock.sendMessage(from, { 
                    text: '💡 Usage: .help <command>\nExample: .help ping' 
                });
                return;
            }
            
            const cmd = args[0].toLowerCase();
            if (commands[cmd]) {
                await sock.sendMessage(from, { 
                    text: `*Command:* .${cmd}\n*Description:* ${commands[cmd].description}\n*Category:* ${commands[cmd].category}` 
                });
            } else {
                await sock.sendMessage(from, { 
                    text: `❌ Command ".${cmd}" not found. Use .menu to see all commands.` 
                });
            }
        }
    },

    'ping': {
        description: '🏓 Check bot response time',
        category: 'General',
        execute: async (from, sock, args) => {
            const start = Date.now();
            await sock.sendMessage(from, { text: '🏓 Pong!' });
            const latency = Date.now() - start;
            await sock.sendMessage(from, { 
                text: `⏱️ Response time: ${latency}ms\n💾 Uptime: ${process.uptime().toFixed(0)}s` 
            });
        }
    },

    'info': {
        description: '🤖 Get bot information',
        category: 'General',
        execute: async (from, sock, args) => {
            const infoText = 
                `🤖 *RAHL XMD BOT INFORMATION* 🤖\n\n` +
                `✨ *Version:* 2.0.0\n` +
                `🔧 *Multi-Device:* Supported ✅\n` +
                `📊 *Total Commands:* ${Object.keys(commands).length}\n` +
                `🕒 *Uptime:* ${Math.floor(process.uptime() / 60)} minutes\n` +
                `💾 *Memory Usage:* ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n\n` +
                `⚡ *Powered by:* Baileys WhatsApp API\n` +
                `🌟 *Created by:* Lord Rahl\n` +
                `🔗 *Pairing Site:* ${PAIRING_SITE_URL}`;
            
            await sock.sendMessage(from, { text: infoText });
        }
    },

    'pair': {
        description: '🔗 Get pairing site link',
        category: 'General',
        execute: async (from, sock, args) => {
            await sock.sendMessage(from, { 
                text: `🔗 *RAHL VERSE EMPIRE PAIRING SITE*\n\n` +
                      `Visit this link to generate pairing codes:\n` +
                      `${PAIRING_SITE_URL}\n\n` +
                      `After getting your code, send it to this bot to link your device.`
            });
        }
    },

    'joke': {
        description: '😂 Get a random joke',
        category: 'Entertainment',
        execute: async (from, sock, args) => {
            const jokes = [
                "Why don't scientists trust atoms? Because they make up everything!",
                "Why did the scarecrow win an award? He was outstanding in his field!",
                "Why don't eggs tell jokes? They'd crack each other up!",
                "What do you call a fake noodle? An impasta!",
                "Why did the math book look so sad? Because it had too many problems!"
            ];
            const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
            await sock.sendMessage(from, { text: `😂 *Joke:* ${randomJoke}` });
        }
    },

    'quote': {
        description: '💫 Get inspirational quote',
        category: 'Entertainment',
        execute: async (from, sock, args) => {
            const quotes = [
                "The only way to do great work is to love what you do. - Steve Jobs",
                "Innovation distinguishes between a leader and a follower. - Steve Jobs",
                "Your time is limited, so don't waste it living someone else's life. - Steve Jobs",
                "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt",
                "Strive not to be a success, but rather to be of value. - Albert Einstein"
            ];
            const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
            await sock.sendMessage(from, { text: `💫 *Quote:* ${randomQuote}` });
        }
    },

    'fact': {
        description: '📚 Get random fact',
        category: 'Entertainment',
        execute: async (from, sock, args) => {
            const facts = [
                "Honey never spoils. Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old!",
                "Octopuses have three hearts. Two pump blood through the gills, while the third pumps it through the rest of the body.",
                "A day on Venus is longer than a year on Venus.",
                "The shortest war in history was between Britain and Zanzibar in 1896. It lasted only 38 minutes.",
                "Bananas are berries, but strawberries aren't."
            ];
            const randomFact = facts[Math.floor(Math.random() * facts.length)];
            await sock.sendMessage(from, { text: `📚 *Did You Know?* ${randomFact}` });
        }
    },

    'roll': {
        description: '🎲 Roll a dice (1-6)',
        category: 'Entertainment',
        execute: async (from, sock, args) => {
            const roll = Math.floor(Math.random() * 6) + 1;
            await sock.sendMessage(from, { text: `🎲 You rolled: ${roll}` });
        }
    },

    'time': {
        description: '⏰ Get current time',
        category: 'Utility',
        execute: async (from, sock, args) => {
            await sock.sendMessage(from, { 
                text: `⏰ Current time: ${new Date().toLocaleString()}` 
            });
        }
    },

    'calc': {
        description: '🧮 Calculate math expression',
        category: 'Utility',
        execute: async (from, sock, args) => {
            if (args.length === 0) {
                await sock.sendMessage(from, { 
                    text: '❌ Please provide a math expression.\nUsage: .calc 2+2' 
                });
                return;
            }
            
            try {
                const expression = args.join(' ').replace(/[^-()\d/*+.]/g, '');
                const result = eval(expression);
                await sock.sendMessage(from, { 
                    text: `🧮 Calculation: ${expression} = ${result}` 
                });
            } catch (error) {
                await sock.sendMessage(from, { 
                    text: '❌ Invalid math expression. Please check your input.' 
                });
            }
        }
    },

    'weather': {
        description: '🌤️ Get weather information',
        category: 'Utility',
        execute: async (from, sock, args) => {
            const city = args.join(' ') || 'your location';
            const weatherResponses = [
                `🌤️ Weather in ${city}: Partly cloudy, 25°C`,
                `☀️ Weather in ${city}: Sunny, 30°C`,
                `🌧️ Weather in ${city}: Rainy, 18°C`,
                `⛅ Weather in ${city}: Mostly cloudy, 22°C`
            ];
            const randomWeather = weatherResponses[Math.floor(Math.random() * weatherResponses.length)];
            await sock.sendMessage(from, { text: randomWeather });
        }
    }
};

// Command handler function
async function handleCommand(text, from, sock) {
    const args = text.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    if (commands[command]) {
        try {
            await commands[command].execute(from, sock, args);
        } catch (error) {
            console.error(`Error executing command ${command}:`, error);
            await sock.sendMessage(from, { 
                text: '❌ Error executing command. Please try again.' 
            });
        }
    } else {
        await sock.sendMessage(from, { 
            text: `❌ Unknown command: .${command}\nUse .menu to see all available commands.` 
        });
    }
}

// Helper: Send WhatsApp message
async function sendMessage(jid, text) {
    if (sock) {
        await sock.sendMessage(jid, { text });
    }
}

// Store pairing codes and their validation
const pendingPairingCodes = new Map();

// Handle pairing codes from your external site
async function handlePairingCode(code, from, pushName) {
    // Here you would validate the code with your pairing site
    // For now, we'll simulate successful pairing
    
    console.log(`Processing pairing code: ${code} from ${pushName} (${from})`);
    
    // Simulate API call to your pairing site to validate code
    try {
        // This is where you would make the actual API call to your pairing site
        // const response = await axios.post(`${PAIRING_SITE_URL}/api/validate-code`, { code });
        
        // For now, we'll simulate a successful validation
        const isValid = true; // response.data.valid
        
        if (isValid) {
            await sock.sendMessage(from, { 
                text: `✅ *Device Linked Successfully!*\n\nWelcome to RAHL XMD, ${pushName}! 🎉\n\nYour device has been successfully linked to the bot.\n\nUse .menu to see all available commands.\nUse .help <command> for command help.` 
            });
            
            // Send admin notification
            const adminJid = '254112399557@s.whatsapp.net';
            await sock.sendMessage(adminJid, {
                text: `🔗 *New Device Linked*\n\n👤 User: ${pushName}\n📞 Number: ${from}\n🔑 Code: ${code}\n⏰ Time: ${new Date().toLocaleString()}`
            });
            
            console.log(`User ${pushName} (${from}) paired successfully with code ${code}`);
        } else {
            await sock.sendMessage(from, { 
                text: `❌ *Invalid Pairing Code*\n\nThe code "${code}" is invalid or has expired.\n\nPlease visit ${PAIRING_SITE_URL} to generate a new pairing code.` 
            });
        }
    } catch (error) {
        console.error('Error validating pairing code:', error);
        await sock.sendMessage(from, { 
            text: `❌ *Validation Error*\n\nThere was an error validating your pairing code.\n\nPlease try again or visit ${PAIRING_SITE_URL} for a new code.` 
        });
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
        const { connection } = update;

        if (connection === 'open') {
            console.log('✅ WhatsApp bot connected successfully!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message?.extendedTextMessage?.text;
        const pushName = msg.pushName || 'User';

        if (!text) return;

        // Handle commands starting with .
        if (text && text.startsWith('.')) {
            await handleCommand(text, from, sock);
        }
        // Handle pairing codes (8-digit numbers)
        else if (text && text.match(/^[0-9]{8}$/)) {
            await handlePairingCode(text, from, pushName);
        }
        // Handle legacy hi command
        else if (text === 'hi' || text === 'hello') {
            await sendMessage(from, 
                `Hello ${pushName}! 👋\n\nI am RAHL XMD Bot! 🦾\n\n` +
                `🔗 *To link your device:*\n` +
                `1. Visit: ${PAIRING_SITE_URL}\n` +
                `2. Generate a pairing code\n` +
                `3. Send the 8-digit code here\n\n` +
                `💡 *Already linked?*\n` +
                `Use .menu to see all commands\n` +
                `Use .help for assistance`
            );
        }
        // Handle any other message
        else if (text) {
            const responses = [
                `Hello ${pushName}! 👋 Visit ${PAIRING_SITE_URL} to link your device, or use .menu for commands.`,
                `Hi ${pushName}! 🔗 Get pairing codes from ${PAIRING_SITE_URL} or type .menu to explore commands.`,
                `Hey ${pushName}! 🤖 Use .pair to get the pairing site link, or .menu to see all bot features.`
            ];
            const randomResponse = responses[Math.floor(Math.random() * responses.length)];
            await sendMessage(from, randomResponse);
        }
    });
}

// API endpoint to receive pairing codes from your external site
app.post('/api/validate-pairing', async (req, res) => {
    try {
        const { code, phoneNumber, deviceName } = req.body;
        
        if (!code || !phoneNumber) {
            return res.status(400).json({ 
                success: false, 
                error: 'Code and phone number are required' 
            });
        }

        // Store the pairing code for validation
        pendingPairingCodes.set(code, {
            phoneNumber,
            deviceName: deviceName || 'Unknown Device',
            createdAt: Date.now(),
            status: 'pending'
        });

        console.log(`Pairing code ${code} registered for ${phoneNumber}`);

        res.json({ 
            success: true, 
            message: 'Pairing code registered successfully',
            code 
        });

    } catch (error) {
        console.error('Error in pairing validation:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

// Get bot status
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        status: sock ? 'connected' : 'disconnected',
        pairingSite: PAIRING_SITE_URL,
        totalCommands: Object.keys(commands).length,
        uptime: process.uptime()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🌍 RAHL XMD Bot Server running on port ${PORT}`);
    console.log(`🔗 Pairing Site: ${PAIRING_SITE_URL}`);
    console.log(`🤖 Loaded ${Object.keys(commands).length} commands`);
    
    // Initialize WhatsApp bot
    initWhatsAppBot();
});
