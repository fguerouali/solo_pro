const fetch = require('node-fetch');

const DEFAULT_AUTH_URL = 'https://apiv2.lacaisse.ma/api/v1/auth';
const DEFAULT_CACHE_TTL_MS = 50 * 60 * 1000;

class LaCaisseAuthService {
    constructor(options = {}) {
        this.authUrl = options.authUrl || process.env.LACAISSE_AUTH_URL || DEFAULT_AUTH_URL;
        this.login = options.login || process.env.LACAISSE_LOGIN || '';
        this.password = options.password || process.env.LACAISSE_PASSWORD || '';
        this.staticToken = options.staticToken || process.env.LACAISSE_API_TOKEN || '';
        this.cacheTtlMs = options.cacheTtlMs || DEFAULT_CACHE_TTL_MS;
        this.cachedLicence = null;
        this.cachedAt = 0;
    }

    isConfigured() {
        return Boolean(this.staticToken || (this.login && this.password));
    }

    clearCache() {
        this.cachedLicence = null;
        this.cachedAt = 0;
    }

    async getTokenApi() {
        if (this.staticToken) {
            return this.staticToken;
        }

        if (!this.login || !this.password) {
            throw new Error('LACAISSE_LOGIN et LACAISSE_PASSWORD requis sur le proxy.');
        }

        if (this.cachedLicence && Date.now() - this.cachedAt < this.cacheTtlMs) {
            return this.cachedLicence;
        }

        const response = await fetch(this.authUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: this.login, password: this.password })
        });

        const bodyText = await response.text();
        let payload;
        try {
            payload = JSON.parse(bodyText);
        } catch {
            throw new Error(`Réponse auth LaCaisse invalide (HTTP ${response.status}).`);
        }

        if (!response.ok) {
            const status = payload.status || payload.message || `HTTP ${response.status}`;
            throw new Error(`Authentification LaCaisse échouée: ${status}`);
        }

        const licence = payload.licence || payload.uuid;
        if (!licence) {
            throw new Error('Réponse auth LaCaisse sans champ licence.');
        }

        this.cachedLicence = licence;
        this.cachedAt = Date.now();
        return licence;
    }
}

module.exports = LaCaisseAuthService;
