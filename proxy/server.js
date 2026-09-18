const express = require('express');
const cors = require('cors');
const LaCaissePOSProvider = require('./providers/lacaisseProvider');
const { getGoogleReviewsSummary } = require('./services/googleReviews');
const { isConfigured: isAiConfigured, runAiAnalysis, runAiChat } = require('./services/aiAnalysis');

const app = express();
const PORT = process.env.PORT || 3000;

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://solo-pro.onrender.com';
const POS_PROVIDER = (process.env.POS_PROVIDER || 'lacaisse').toLowerCase();

const lacaisseProvider = new LaCaissePOSProvider();
let googleReviewsCache = null;
const GOOGLE_REVIEWS_CACHE_TTL_MS = 30 * 60 * 1000;
const aiRateLimitByIp = new Map();
const AI_RATE_LIMIT_MAX = Number(process.env.AI_ANALYSIS_RATE_LIMIT || 30);
const AI_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

function checkAiRateLimit(ip) {
    const now = Date.now();
    const entry = aiRateLimitByIp.get(ip) || { count: 0, resetAt: now + AI_RATE_LIMIT_WINDOW_MS };
    if (now > entry.resetAt) {
        entry.count = 0;
        entry.resetAt = now + AI_RATE_LIMIT_WINDOW_MS;
    }
    entry.count += 1;
    aiRateLimitByIp.set(ip, entry);
    return entry.count <= AI_RATE_LIMIT_MAX;
}

if (!lacaisseProvider.isConfigured()) {
    console.warn('ATTENTION: LACAISSE_LOGIN/LACAISSE_PASSWORD ou LACAISSE_SAMPLE_FILE requis pour l\'import des ventes.');
}
if (!FRONTEND_URL) {
    console.warn('ATTENTION: La variable d\'environnement FRONTEND_URL n\'est pas définie.');
}

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => {
    res.json({
        ok: true,
        provider: POS_PROVIDER,
        lacaisseConfigured: lacaisseProvider.isConfigured(),
        googlePlacesConfigured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
        openaiConfigured: isAiConfigured(),
        routes: ['/api/login', '/api/sales', '/api/journal', '/api/google-reviews', '/api/ai-analysis', '/api/ai-chat'],
        version: 'ai-analysis-v2'
    });
});

// Contrat inchangé pour le frontend SOLO : retourne un token opaque.
app.post('/api/login', async (req, res) => {
    console.log('Proxy received login request to /api/login');

    if (POS_PROVIDER !== 'lacaisse') {
        return res.status(500).json({ message: 'Fournisseur POS non supporté.' });
    }

    if (!lacaisseProvider.isConfigured()) {
        return res.status(500).json({
            message: 'LaCaisse non configuré. Définissez LACAISSE_LOGIN et LACAISSE_PASSWORD sur le proxy.'
        });
    }

    res.json({ token: 'lacaisse-session' });
});

// Contrat inchangé : { code: 200, data: [...] } au format IAM historique.
app.get('/api/sales', async (req, res) => {
    console.log('Proxy received sales request to /api/sales');
    const { startDate, endDate, pageNum = 1, pageSize = 100, token } = req.query;

    if (!token) {
        return res.status(401).json({ message: 'Jeton d\'authentification manquant.' });
    }
    if (!startDate || !endDate) {
        return res.status(400).json({ message: 'Dates de début et de fin requises.' });
    }
    if (!lacaisseProvider.isConfigured()) {
        return res.status(500).json({ message: 'LaCaisse non configuré sur le proxy.' });
    }

    try {
        const data = await lacaisseProvider.getIamSalesPage(startDate, endDate, pageNum, pageSize);
        res.json({ code: 200, data });
    } catch (error) {
        console.error('Error in /api/sales (LaCaisse):', error);
        res.status(500).json({
            message: `Erreur import LaCaisse: ${error.message}`
        });
    }
});

// Journal caisse → préremplissage Finance (TPE, Glovo, notes, annulations).
app.get('/api/journal', async (req, res) => {
    console.log('Proxy received journal request to /api/journal');
    const { date, token } = req.query;

    if (!token) {
        return res.status(401).json({ message: 'Jeton d\'authentification manquant.' });
    }
    if (!date) {
        return res.status(400).json({ message: 'Date requise (YYYY-MM-DD).' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
        return res.status(400).json({ message: 'Format de date invalide. Attendu: YYYY-MM-DD.' });
    }
    if (!lacaisseProvider.isConfigured()) {
        return res.status(500).json({ message: 'LaCaisse non configuré sur le proxy.' });
    }

    try {
        const data = await lacaisseProvider.getJournalSummary(date);
        res.json({ code: 200, data });
    } catch (error) {
        console.error('Error in /api/journal (LaCaisse):', error);
        res.status(500).json({
            message: `Erreur journal LaCaisse: ${error.message}`
        });
    }
});

// Analyse IA dashboard : snapshot agrégé côté front → LLM cloud → 5 préconisations.
app.post('/api/ai-analysis', async (req, res) => {
    console.log('Proxy received AI analysis request');
    try {
        if (!isAiConfigured()) {
            return res.status(503).json({
                message: 'OPENAI_API_KEY non configurée sur le proxy Render.',
                code: 'MISSING_OPENAI_KEY'
            });
        }

        const ip = getClientIp(req);
        if (!checkAiRateLimit(ip)) {
            return res.status(429).json({
                message: 'Trop d\'analyses IA. Réessayez dans une heure.',
                code: 'RATE_LIMIT'
            });
        }

        const snapshot = req.body?.snapshot;
        if (!snapshot || typeof snapshot !== 'object') {
            return res.status(400).json({
                message: 'Snapshot métier manquant.',
                code: 'MISSING_SNAPSHOT'
            });
        }

        const result = await runAiAnalysis(snapshot);
        res.json({
            code: 200,
            data: {
                summary: result.summary,
                executiveDiagnosis: result.executiveDiagnosis,
                sections: result.sections,
                benchmarkScorecard: result.benchmarkScorecard,
                recommendations: result.recommendations,
                model: result.model,
                generatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error in /api/ai-analysis:', error);
        const status = error.code === 'MISSING_OPENAI_KEY' ? 503 : (error.status && error.status < 500 ? 502 : 500);
        res.status(status).json({
            message: error.message || 'Erreur analyse IA',
            code: error.code || 'AI_ANALYSIS_ERROR'
        });
    }
});

// Chat IA live sur la dernière analyse + snapshot métier.
app.post('/api/ai-chat', async (req, res) => {
    console.log('Proxy received AI chat request');
    try {
        if (!isAiConfigured()) {
            return res.status(503).json({
                message: 'OPENAI_API_KEY non configurée sur le proxy Render.',
                code: 'MISSING_OPENAI_KEY'
            });
        }

        const ip = getClientIp(req);
        if (!checkAiRateLimit(ip)) {
            return res.status(429).json({
                message: 'Trop de requêtes IA. Réessayez dans une heure.',
                code: 'RATE_LIMIT'
            });
        }

        const message = String(req.body?.message || '').trim();
        if (!message) {
            return res.status(400).json({
                message: 'Message manquant.',
                code: 'MISSING_MESSAGE'
            });
        }
        if (message.length > 800) {
            return res.status(400).json({
                message: 'Message trop long (max 800 caractères).',
                code: 'MESSAGE_TOO_LONG'
            });
        }

        const result = await runAiChat({
            message,
            analysis: req.body?.analysis || null,
            snapshot: req.body?.snapshot || null,
            history: req.body?.history || []
        });

        res.json({
            code: 200,
            data: {
                reply: result.reply,
                model: result.model,
                generatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error in /api/ai-chat:', error);
        const status = error.code === 'MISSING_OPENAI_KEY' ? 503 : (error.status && error.status < 500 ? 502 : 500);
        res.status(status).json({
            message: error.message || 'Erreur chat IA',
            code: error.code || 'AI_CHAT_ERROR'
        });
    }
});

// Avis Google (note globale + total + avis récents).
app.get('/api/google-reviews', async (req, res) => {
    console.log('Proxy received google-reviews request');
    try {
        if (
            googleReviewsCache &&
            Date.now() - googleReviewsCache.cachedAt < GOOGLE_REVIEWS_CACHE_TTL_MS
        ) {
            return res.json({ code: 200, data: googleReviewsCache.data, cached: true });
        }

        const data = await getGoogleReviewsSummary();
        googleReviewsCache = { cachedAt: Date.now(), data };
        res.json({ code: 200, data, cached: false });
    } catch (error) {
        console.error('Error in /api/google-reviews:', error);
        const status = error.code === 'MISSING_API_KEY' ? 503 : 500;
        res.status(status).json({
            message: error.message,
            code: error.code || 'GOOGLE_REVIEWS_ERROR'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Proxy server listening on port ${PORT}`);
    console.log(`Allowing requests from: ${FRONTEND_URL}`);
    console.log(`POS provider: ${POS_PROVIDER}`);
    console.log(`LaCaisse configured: ${lacaisseProvider.isConfigured() ? 'yes' : 'NO'}`);
});
