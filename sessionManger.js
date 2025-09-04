const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

class SessionManager {
    constructor(sessionId = 'lord-rahl-session') {
        this.sessionId = sessionId;
        this.sessionPath = path.join(__dirname, 'sessions', sessionId);
        this.ensureSessionDirectoryExists();
    }

    ensureSessionDirectoryExists() {
        if (!fs.existsSync(this.sessionPath)) {
            fs.mkdirSync(this.sessionPath, { recursive: true });
        }
    }

    async getAuthState() {
        try {
            return await useMultiFileAuthState(this.sessionPath);
        } catch (error) {
            console.error('Error getting auth state:', error);
            throw error;
        }
    }

    async createSocket() {
        try {
            const { state, saveCreds } = await this.getAuthState();
            
            const sock = makeWASocket({
                version: [2, 2323, 4],
                printQRInTerminal: true,
                auth: state,
                browser: ['RAHL XMD', 'Chrome', '1.0.0']
            });

            // Save credentials when updated
            sock.ev.on('creds.update', saveCreds);

            return sock;
        } catch (error) {
            console.error('Error creating socket:', error);
            throw error;
        }
    }

    // Check if session exists and is valid
    async hasValidSession() {
        try {
            const files = fs.readdirSync(this.sessionPath);
            // Check if we have the necessary credential files
            const requiredFiles = ['creds.json', 'pre-key-1.json', 'pre-key-2.json', 'pre-key-3.json', 'pre-key-4.json', 'pre-key-5.json'];
            const hasRequiredFiles = requiredFiles.every(file => files.includes(file));
            
            if (!hasRequiredFiles) return false;
            
            // Check if credentials are not expired
            const creds = JSON.parse(fs.readFileSync(path.join(this.sessionPath, 'creds.json'), 'utf-8'));
            return creds && !creds.me?.id?.endsWith(':0'); // Check if not logged out
        } catch (error) {
            return false;
        }
    }

    // Clear session data
    async clearSession() {
        try {
            const files = fs.readdirSync(this.sessionPath);
            for (const file of files) {
                fs.unlinkSync(path.join(this.sessionPath, file));
            }
            fs.rmdirSync(this.sessionPath);
            return true;
        } catch (error) {
            console.error('Error clearing session:', error);
            return false;
        }
    }

    // Get session info
    getSessionInfo() {
        try {
            if (fs.existsSync(path.join(this.sessionPath, 'creds.json'))) {
                const creds = JSON.parse(fs.readFileSync(path.join(this.sessionPath, 'creds.json'), 'utf-8'));
                return {
                    phone: creds.me?.id?.replace(/:\d+@/, '@') || 'Unknown',
                    platform: creds.me?.platform || 'Unknown',
                    isLoggedIn: !creds.me?.id?.endsWith(':0')
                };
            }
            return null;
        } catch (error) {
            console.error('Error getting session info:', error);
            return null;
        }
    }
}

module.exports = SessionManager;
