const fetch = require('node-fetch');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = `Tu es un contrôleur de gestion senior spécialisé restauration / pizzeria (marché Maroc / Casablanca).
Tu analyses les données Solo Pizzeria Napoletana de façon TRÈS APPROFONDIE.

Tu reçois un JSON riche : tickets, horaires, mix produits, marges, achats, food cost, charges d'exploitation, et un référentiel best practice.

MISSION
Produire un diagnostic de pilotage exhaustif, chiffré, actionnable — pas un résumé générique.

RÈGLES
- Réponds UNIQUEMENT en JSON valide (aucun markdown hors JSON).
- Langue : français.
- Ne jamais inventer de chiffres absents des données. Si une donnée manque, indique-le explicitement.
- Compare systématiquement les ratios au bloc bestPractices fourni (ou au scorecard pré-calculé si présent).
- Relie tickets ↔ horaires ↔ mix ↔ food cost ↔ achats ↔ charges (lecture croisée obligatoire).
- Distingue fait démontré vs hypothèse à vérifier.
- Exactement 5 préconisations, classées par impact économique décroissant.

CONTENU ATTENDU (profond)
1) Tickets & horaires : panier moyen, distribution des tickets, pics horaires, jours faibles/forts, densités, opportunités staffing / promo créneau.
2) Produits : stars / flops, mix familles, taux d'accompagnement boisson/dessert, marges produit, cannibalisation éventuelle.
3) Food cost : théorique vs cible, écarts, produits/ingrédients qui tirent le coût, lien inventaire/pertes.
4) Achats : poids vs CA, concentration fournisseurs, impayés, dérive prix/volumes.
5) Charges d'exploitation : chaque poste en % du CA vs best practice, postes hors normes, leviers.

Format JSON obligatoire:
{
  "summary": "synthèse dirigeant 4-7 phrases, ton direct, chiffrée",
  "executiveDiagnosis": "diagnostic global en 1 paragraphe dense",
  "sections": {
    "ticketsAndHours": {
      "title": "Tickets & horaires",
      "findings": "analyse détaillée",
      "keySignals": ["signal 1", "signal 2"],
      "vsBestPractice": "comparaison"
    },
    "products": {
      "title": "Produits & mix",
      "findings": "analyse détaillée",
      "keySignals": ["signal 1", "signal 2"],
      "vsBestPractice": "comparaison"
    },
    "foodCost": {
      "title": "Food cost",
      "findings": "analyse détaillée",
      "keySignals": ["signal 1", "signal 2"],
      "vsBestPractice": "comparaison"
    },
    "purchases": {
      "title": "Achats",
      "findings": "analyse détaillée",
      "keySignals": ["signal 1", "signal 2"],
      "vsBestPractice": "comparaison"
    },
    "operatingCharges": {
      "title": "Charges d'exploitation",
      "findings": "analyse détaillée",
      "keySignals": ["signal 1", "signal 2"],
      "vsBestPractice": "comparaison poste par poste"
    }
  },
  "benchmarkScorecard": [
    {
      "metric": "Food cost %",
      "actual": "xx%",
      "bestPractice": "28-32%",
      "status": "OK|ALERTE|CRITIQUE|INCONNU",
      "comment": "commentaire court"
    }
  ],
  "recommendations": [
    {
      "rank": 1,
      "priority": "CRITIQUE",
      "preconisation": "titre court",
      "action": "plan d'action concret (qui/quoi/quand/comment mesurer)",
      "justification": "preuve chiffrée + écart vs best practice",
      "expectedImpact": "impact estimé si possible"
    }
  ]
}`;

function isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
}

function normalizeSection(section, fallbackTitle) {
    if (!section || typeof section !== 'object') {
        return {
            title: fallbackTitle,
            findings: '',
            keySignals: [],
            vsBestPractice: ''
        };
    }
    return {
        title: String(section.title || fallbackTitle).trim(),
        findings: String(section.findings || section.analysis || '').trim(),
        keySignals: Array.isArray(section.keySignals)
            ? section.keySignals.map(s => String(s).trim()).filter(Boolean).slice(0, 8)
            : [],
        vsBestPractice: String(section.vsBestPractice || '').trim()
    };
}

function normalizeRecommendations(parsed) {
    const list = Array.isArray(parsed?.recommendations) ? parsed.recommendations : [];
    return list.slice(0, 5).map((item, index) => ({
        rank: Number(item.rank) || index + 1,
        priority: ['CRITIQUE', 'IMPORTANT', 'OPPORTUNITE'].includes(item.priority)
            ? item.priority
            : 'IMPORTANT',
        preconisation: String(item.preconisation || item.title || '').trim(),
        action: String(item.action || '').trim(),
        justification: String(item.justification || '').trim(),
        expectedImpact: String(item.expectedImpact || '').trim()
    })).filter(r => r.preconisation && r.action);
}

function normalizeScorecard(parsed) {
    const list = Array.isArray(parsed?.benchmarkScorecard) ? parsed.benchmarkScorecard : [];
    return list.slice(0, 12).map(item => ({
        metric: String(item.metric || '').trim(),
        actual: String(item.actual ?? item.actualPct ?? '').trim(),
        bestPractice: String(item.bestPractice || item.bestPracticeRange || '').trim(),
        status: ['OK', 'ALERTE', 'CRITIQUE', 'INCONNU'].includes(item.status) ? item.status : 'INCONNU',
        comment: String(item.comment || '').trim()
    })).filter(i => i.metric);
}

async function runAiAnalysis(snapshot) {
    if (!isConfigured()) {
        const err = new Error('OPENAI_API_KEY non configurée sur le proxy.');
        err.code = 'MISSING_OPENAI_KEY';
        throw err;
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4o';
    const payload = {
        model,
        temperature: 0.25,
        max_tokens: 4500,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
                role: 'user',
                content: `Analyse APPROFONDIE de Solo. Couvre tickets, horaires, produits, food cost, achats, charges vs best practices. Fournis le JSON complet demandé.\n\n${JSON.stringify(snapshot)}`
            }
        ]
    };

    const response = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify(payload)
    });

    const raw = await response.text();
    let body;
    try {
        body = JSON.parse(raw);
    } catch {
        const err = new Error('Réponse OpenAI illisible.');
        err.code = 'OPENAI_PARSE_ERROR';
        throw err;
    }

    if (!response.ok) {
        const err = new Error(body?.error?.message || `Erreur OpenAI HTTP ${response.status}`);
        err.code = 'OPENAI_HTTP_ERROR';
        err.status = response.status;
        throw err;
    }

    const content = body?.choices?.[0]?.message?.content;
    if (!content) {
        const err = new Error('Réponse OpenAI vide.');
        err.code = 'OPENAI_EMPTY';
        throw err;
    }

    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch {
        const err = new Error('Le modèle n\'a pas renvoyé un JSON valide.');
        err.code = 'MODEL_JSON_ERROR';
        throw err;
    }

    const recommendations = normalizeRecommendations(parsed);
    if (recommendations.length < 1) {
        const err = new Error('Aucune préconisation exploitable renvoyée par le modèle.');
        err.code = 'NO_RECOMMENDATIONS';
        throw err;
    }

    const sectionsRaw = parsed.sections || {};
    return {
        summary: String(parsed.summary || '').trim(),
        executiveDiagnosis: String(parsed.executiveDiagnosis || '').trim(),
        sections: {
            ticketsAndHours: normalizeSection(sectionsRaw.ticketsAndHours, 'Tickets & horaires'),
            products: normalizeSection(sectionsRaw.products, 'Produits & mix'),
            foodCost: normalizeSection(sectionsRaw.foodCost, 'Food cost'),
            purchases: normalizeSection(sectionsRaw.purchases, 'Achats'),
            operatingCharges: normalizeSection(sectionsRaw.operatingCharges, 'Charges d\'exploitation')
        },
        benchmarkScorecard: normalizeScorecard(parsed),
        recommendations,
        model,
        usage: body.usage || null
    };
}

module.exports = {
    isConfigured,
    runAiAnalysis
};
