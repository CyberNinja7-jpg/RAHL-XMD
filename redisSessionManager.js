const { createClient } = require('redis');
const { promisify } = require('util');

class RedisSessionManager {
    constructor() {
        this.client = createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379'
        });
        
        this.client.on('error', (err) => console.log('Redis Client Error', err));
        this.client.connect();
        
        this.getAsync = promisify(this.client.get).bind(this.client);
        this.setAsync = promisify(this.client.set).bind(this.client);
        this.delAsync = promisify(this.client.del).bind(this.client);
    }

    async storeSession(sessionId, data) {
        await this.client.set(`session:${sessionId}`, JSON.stringify(data));
    }

    async getSession(sessionId) {
        const data = await this.client.get(`session:${sessionId}`);
        return data ? JSON.parse(data) : null;
    }

    async clearSession(sessionId) {
        await this.client.del(`session:${sessionId}`);
    }
}

module.exports = RedisSessionManager;
