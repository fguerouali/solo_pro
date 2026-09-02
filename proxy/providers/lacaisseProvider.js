const fs = require('fs');
const fetch = require('node-fetch');
const XLSX = require('xlsx');
const { toLaCaisseDate } = require('../utils/dateFormat');
const { mapLaCaisseRowsToIam } = require('../mappers/lacaisseToIam');
const LaCaisseAuthService = require('../services/lacaisseAuth');

const DEFAULT_BASE_URL = 'https://api-legacy.lacaisse.ma';
const DEFAULT_CAISSE_ID = '4418';

class LaCaissePOSProvider {
    constructor(options = {}) {
        this.baseUrl = (options.baseUrl || process.env.LACAISSE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
        this.caisseId = options.caisseId || process.env.LACAISSE_CAISSE_ID || DEFAULT_CAISSE_ID;
        this.idCaisseList =
            options.idCaisseList ||
            process.env.LACAISSE_ID_CAISSE_LIST ||
            this.caisseId;
        this.sampleFile = options.sampleFile || process.env.LACAISSE_SAMPLE_FILE || '';
        this.auth = options.auth || new LaCaisseAuthService(options.authOptions || {});
        this.cache = new Map();
        this.cacheTtlMs = options.cacheTtlMs || 5 * 60 * 1000;
    }

    isConfigured() {
        return Boolean(this.sampleFile || this.auth.isConfigured());
    }

    getCacheKey(startDate, endDate) {
        return `${startDate}|${endDate}`;
    }

    readCache(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.createdAt > this.cacheTtlMs) {
            this.cache.delete(key);
            return null;
        }
        return entry.data;
    }

    writeCache(key, data) {
        this.cache.set(key, { createdAt: Date.now(), data });
    }

    buildExportUrl(startDate, endDate, tokenApi) {
        const params = new URLSearchParams({
            caisse: this.caisseId,
            startDate: toLaCaisseDate(startDate),
            endDate: toLaCaisseDate(endDate),
            token_api: tokenApi,
            idcaisselist: this.idCaisseList
        });
        return `${this.baseUrl}/export_excel.php?${params.toString()}`;
    }

    maskToken(value) {
        if (!value) return '***';
        if (value.length <= 8) return '***';
        return `${value.slice(0, 4)}...${value.slice(-4)}`;
    }

    async fetchExcelBuffer(startDate, endDate) {
        if (this.sampleFile) {
            if (!fs.existsSync(this.sampleFile)) {
                throw new Error(`Fichier sample LaCaisse introuvable: ${this.sampleFile}`);
            }
            return fs.readFileSync(this.sampleFile);
        }

        const tokenApi = await this.auth.getTokenApi();
        const url = this.buildExportUrl(startDate, endDate, tokenApi);
        console.log(`[LaCaisse] Téléchargement Excel: ${url.replace(tokenApi, this.maskToken(tokenApi))}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/vnd.ms-excel,application/octet-stream,*/*'
            }
        });

        const buffer = await response.buffer();
        const contentType = response.headers.get('content-type') || '';

        if (!response.ok) {
            throw new Error(`LaCaisse HTTP ${response.status}: ${buffer.toString('utf8').slice(0, 200)}`);
        }

        if (contentType.includes('text/html') || buffer.slice(0, 15).toString('utf8').includes('Nous avons')) {
            this.auth.clearCache();
            throw new Error(
                'Token LaCaisse invalide ou expiré. Vérifiez LACAISSE_LOGIN / LACAISSE_PASSWORD sur le proxy.'
            );
        }

        return buffer;
    }

    parseExcelBuffer(buffer) {
        const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) return [];
        return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    }

    async getIamSalesLines(startDate, endDate) {
        const cacheKey = this.getCacheKey(startDate, endDate);
        const cached = this.readCache(cacheKey);
        if (cached) return cached;

        const buffer = await this.fetchExcelBuffer(startDate, endDate);
        const rows = this.parseExcelBuffer(buffer);
        const iamLines = mapLaCaisseRowsToIam(rows);

        console.log(`[LaCaisse] ${rows.length} lignes Excel → ${iamLines.length} lignes IAM`);
        this.writeCache(cacheKey, iamLines);
        return iamLines;
    }

    async getIamSalesPage(startDate, endDate, pageNum = 1, pageSize = 100) {
        const allLines = await this.getIamSalesLines(startDate, endDate);
        const page = Math.max(1, parseInt(pageNum, 10) || 1);
        const size = Math.max(1, parseInt(pageSize, 10) || 100);
        const start = (page - 1) * size;
        return allLines.slice(start, start + size);
    }
}

module.exports = LaCaissePOSProvider;
