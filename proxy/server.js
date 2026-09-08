const express = require('express');
const cors = require('cors');
const LaCaissePOSProvider = require('./providers/lacaisseProvider');
const { getGoogleReviewsSummary } = require('./services/googleReviews');

const app = express();
const PORT = process.env.PORT || 3000;

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://solo-pro.onrender.com';
const POS_PROVIDER = (process.env.POS_PROVIDER || 'lacaisse').toLowerCase();

const lacaisseProvider = new LaCaissePOSProvider();
let googleReviewsCache = null;
const GOOGLE_REVIEWS_CACHE_TTL_MS = 30 * 60 * 1000;

if (!lacaisseProvider.isConfigured()) {
    console.warn('ATTENTION: LACAISSE_LOGIN/LACAISSE_PASSWORD ou LACAISSE_SAMPLE_FILE requis pour l\'import des ventes.');
}
if (!FRONTEND_URL) {
    console.warn('ATTENTION: La variable d\'environnement FRONTEND_URL n\'est pas définie.');
}

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({
        ok: true,
        provider: POS_PROVIDER,
        lacaisseConfigured: lacaisseProvider.isConfigured(),
        googlePlacesConfigured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
        routes: ['/api/login', '/api/sales', '/api/journal', '/api/google-reviews'],
        version: 'google-reviews-v1'
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
