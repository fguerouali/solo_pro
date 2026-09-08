const fetch = require('node-fetch');

const DEFAULT_QUERY = 'Solo Pizzeria Napoletana Casablanca';
const DEFAULT_MAPS_URL = 'https://share.google/GX15aEMbOqaVjxGMs';

function parseRelativeReviewAgeDays(relativeTime) {
    const text = String(relativeTime || '').toLowerCase();
    if (!text) return null;
    if (/heure|minute|hour|minute|just|à l'instant|an hour|a minute/.test(text)) return 0;
    if (/hier|yesterday/.test(text)) return 1;
    const numMatch = text.match(/(\d+)/);
    const n = numMatch ? parseInt(numMatch[1], 10) : 1;
    if (/jour|day/.test(text)) return n;
    if (/semaine|week/.test(text)) return n * 7;
    if (/mois|month/.test(text)) return n * 30;
    if (/an|year/.test(text)) return n * 365;
    return null;
}

async function findPlaceId(apiKey, query) {
    const url =
        'https://maps.googleapis.com/maps/api/place/findplacefromtext/json?' +
        new URLSearchParams({
            input: query,
            inputtype: 'textquery',
            fields: 'place_id,name,rating,user_ratings_total',
            language: 'fr',
            key: apiKey
        }).toString();

    const response = await fetch(url);
    const payload = await response.json();
    if (payload.status !== 'OK' || !payload.candidates?.length) {
        throw new Error(`Find Place: ${payload.status || response.status} ${payload.error_message || ''}`.trim());
    }
    return payload.candidates[0];
}

async function fetchPlaceDetails(apiKey, placeId) {
    const url =
        'https://maps.googleapis.com/maps/api/place/details/json?' +
        new URLSearchParams({
            place_id: placeId,
            fields: 'name,rating,user_ratings_total,reviews,url',
            language: 'fr',
            reviews_sort: 'newest',
            key: apiKey
        }).toString();

    const response = await fetch(url);
    const payload = await response.json();
    if (payload.status !== 'OK' || !payload.result) {
        throw new Error(`Place Details: ${payload.status || response.status} ${payload.error_message || ''}`.trim());
    }
    return payload.result;
}

/**
 * Note globale + total avis + avis récents (Places API).
 * Requiert GOOGLE_PLACES_API_KEY. GOOGLE_PLACE_ID optionnel.
 */
async function getGoogleReviewsSummary(options = {}) {
    const apiKey = options.apiKey || process.env.GOOGLE_PLACES_API_KEY || '';
    if (!apiKey) {
        const err = new Error(
            'GOOGLE_PLACES_API_KEY manquant sur le proxy. Ajoutez une clé Google Places (API Places) sur Render.'
        );
        err.code = 'MISSING_API_KEY';
        throw err;
    }

    let placeId = options.placeId || process.env.GOOGLE_PLACE_ID || '';
    let preview = null;
    if (!placeId) {
        preview = await findPlaceId(apiKey, options.query || process.env.GOOGLE_PLACE_QUERY || DEFAULT_QUERY);
        placeId = preview.place_id;
    }

    const details = await fetchPlaceDetails(apiKey, placeId);
    const recentReviews = Array.isArray(details.reviews)
        ? details.reviews.map((review) => ({
              rating: review.rating,
              relativeTime: review.relative_time_description || '',
              time: review.time || null,
              ageDays: review.time
                  ? Math.max(0, Math.floor((Date.now() / 1000 - review.time) / 86400))
                  : parseRelativeReviewAgeDays(review.relative_time_description)
          }))
        : [];

    return {
        source: 'places_api',
        placeId,
        name: details.name || preview?.name || 'Solo Pizzeria Napoletana',
        rating: details.rating ?? preview?.rating ?? null,
        reviewCount: details.user_ratings_total ?? preview?.user_ratings_total ?? null,
        url: details.url || DEFAULT_MAPS_URL,
        recentReviews,
        fetchedAt: new Date().toISOString()
    };
}

module.exports = {
    getGoogleReviewsSummary,
    parseRelativeReviewAgeDays,
    DEFAULT_MAPS_URL,
    DEFAULT_QUERY
};
