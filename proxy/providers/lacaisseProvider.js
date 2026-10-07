const fs = require('fs');
const fetch = require('node-fetch');
const XLSX = require('xlsx');
const { toJournalDateTime } = require('../utils/dateFormat');
const { mapLaCaisseRowsToIam } = require('../mappers/lacaisseToIam');
const { mapJournalToFinanceSummary } = require('../mappers/journalSummary');
const LaCaisseAuthService = require('../services/lacaisseAuth');

const DEFAULT_BASE_URL = 'https://api-legacy.lacaisse.ma';
const DEFAULT_CAISSE_ID = '4418';
const DEFAULT_JOURNAL_ID = '18';
const SALES_EXPORT_TYPE = '1';
const EXPORT_POLL_MS = 2000;
const EXPORT_TIMEOUT_MS = 4 * 60 * 1000;
const EXPORT_DONE = new Set(['COMPLETED', 'DONE', 'SUCCESS', 'FINISHED', 'READY', 'OK']);
const EXPORT_FAILED = new Set(['FAILED', 'ERROR', 'KO', 'EXPIRED', 'CANCELLED', 'CANCELED']);

class LaCaissePOSProvider {
    constructor(options = {}) {
        this.baseUrl = (options.baseUrl || process.env.LACAISSE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
        this.caisseId = options.caisseId || process.env.LACAISSE_CAISSE_ID || DEFAULT_CAISSE_ID;
        this.idCaisseList =
            options.idCaisseList ||
            process.env.LACAISSE_ID_CAISSE_LIST ||
            this.caisseId;
        this.journalId = options.journalId || process.env.LACAISSE_JOURNAL_ID || DEFAULT_JOURNAL_ID;
        this.sampleFile = options.sampleFile || process.env.LACAISSE_SAMPLE_FILE || '';
        this.auth = options.auth || new LaCaisseAuthService(options.authOptions || {});
        this.cache = new Map();
        this.journalCache = new Map();
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

    toExportIsoDate(value) {
        const text = String(value || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
            throw new Error(`Date invalide: ${value}`);
        }
        return text;
    }

    async startSalesExport(startDate, endDate, tokenApi) {
        const body = new URLSearchParams({
            caisse: this.caisseId,
            export_type: SALES_EXPORT_TYPE,
            startDate: this.toExportIsoDate(startDate),
            endDate: this.toExportIsoDate(endDate),
            idcaisselist: this.idCaisseList,
            token_api: tokenApi
        });
        const response = await fetch(`${this.baseUrl}/exports/export_start.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json'
            },
            body: body.toString()
        });
        const text = await response.text();
        let payload;
        try {
            payload = JSON.parse(text);
        } catch {
            if (text.includes('Nous avons modifié la clé')) {
                this.auth.clearCache();
                throw new Error(
                    'Token LaCaisse invalide ou expiré. Vérifiez LACAISSE_LOGIN / LACAISSE_PASSWORD sur le proxy.'
                );
            }
            throw new Error(`Export LaCaisse invalide (HTTP ${response.status}).`);
        }
        if (!payload.reference) {
            throw new Error(payload.error || payload.message || `Export LaCaisse HTTP ${response.status}`);
        }
        return payload.reference;
    }

    async waitForSalesExport(reference) {
        const started = Date.now();
        while (Date.now() - started < EXPORT_TIMEOUT_MS) {
            await new Promise((resolve) => setTimeout(resolve, EXPORT_POLL_MS));
            const response = await fetch(
                `${this.baseUrl}/exports/export_status.php?reference=${encodeURIComponent(reference)}&_=${Date.now()}`,
                { headers: { Accept: 'application/json' } }
            );
            const payload = await response.json();
            const status = String(payload.status || '').toUpperCase();
            console.log(`[LaCaisse] Export ${reference.slice(0, 8)} ${status || 'inconnu'}`);
            if (EXPORT_DONE.has(status)) {
                const download = payload.download_url || `export_download.php?reference=${encodeURIComponent(reference)}`;
                if (/^https?:\/\//i.test(download)) return download;
                return `${this.baseUrl}/exports/${String(download).replace(/^\//, '')}`;
            }
            if (EXPORT_FAILED.has(status)) {
                throw new Error(payload.error || payload.message || 'Export LaCaisse en échec.');
            }
        }
        throw new Error('Export LaCaisse trop long. Réessayez dans un instant.');
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
        console.log(`[LaCaisse] Demande export ventes ${startDate} → ${endDate}`);
        const reference = await this.startSalesExport(startDate, endDate, tokenApi);
        const url = await this.waitForSalesExport(reference);
        console.log(`[LaCaisse] Téléchargement Excel: ${url}`);

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

    buildJournalUrl(isoDate, tokenApi) {
        const params = new URLSearchParams({
            id_journal: this.journalId,
            id_caisse: this.caisseId,
            date_debut: toJournalDateTime(isoDate, '00:00:00'),
            date_fin: toJournalDateTime(isoDate, '23:59:59'),
            token_api: tokenApi
        });
        return `${this.baseUrl}/details_journal.php?${params.toString()}`;
    }

    async getJournalSummary(isoDate) {
        const cacheKey = `journal|${isoDate}`;
        const entry = this.journalCache.get(cacheKey);
        if (entry && Date.now() - entry.createdAt <= this.cacheTtlMs) {
            return entry.data;
        }

        const tokenApi = await this.auth.getTokenApi();
        const url = this.buildJournalUrl(isoDate, tokenApi);
        console.log(`[LaCaisse] Journal: ${url.replace(tokenApi, this.maskToken(tokenApi))}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json,*/*' }
        });
        const bodyText = await response.text();

        if (!response.ok) {
            throw new Error(`Journal LaCaisse HTTP ${response.status}: ${bodyText.slice(0, 200)}`);
        }

        if (bodyText.includes('Nous avons modifié la clé')) {
            this.auth.clearCache();
            throw new Error('Token LaCaisse invalide ou expiré pour le journal.');
        }

        let payload;
        try {
            payload = JSON.parse(bodyText);
        } catch {
            throw new Error('Réponse journal LaCaisse invalide (JSON attendu).');
        }

        const summary = mapJournalToFinanceSummary(payload);
        this.journalCache.set(cacheKey, { createdAt: Date.now(), data: summary });
        return summary;
    }
}

module.exports = LaCaissePOSProvider;
