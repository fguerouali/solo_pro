const fetch = require('node-fetch');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = `Tu es un contrôleur de gestion senior spécialisé restauration / pizzeria (marché Maroc / Casablanca).
Tu analyses les données Solo Pizzeria Napoletana de façon TRÈS APPROFONDIE.

Tu reçois un JSON riche : tickets, horaires de vente, horaires d'ouverture officiels (businessContext), mix produits, marges, achats, food cost, charges d'exploitation, lancement Panuozzo, et un référentiel best practice.

MISSION
Produire un diagnostic de pilotage exhaustif, chiffré, actionnable — pas un résumé générique.

RÈGLES
- Réponds UNIQUEMENT en JSON valide (aucun markdown hors JSON).
- Langue : français.
- Ne jamais inventer de chiffres absents des données. Si une donnée manque, indique-le explicitement.
- Compare systématiquement les ratios au bloc bestPractices fourni (ou au scorecard pré-calculé si présent).
- Utilise businessContext.openingHours et closedDays pour juger les pics/creux (ex. fermé lundi ; pause 16:30–19:30 mar–ven ; continu sam/dim).
- Utilise panuozzoMarketing (avant vs depuis juin 2026) pour juger l'effet du marketing Panuozzo.
- Relie tickets ↔ horaires d'ouverture ↔ mix ↔ food cost ↔ achats ↔ charges (lecture croisée obligatoire).
- Distingue fait démontré vs hypothèse à vérifier.
- Exactement 5 préconisations, classées par impact économique décroissant.

CONTENU ATTENDU (profond)
1) Tickets & horaires : panier moyen, distribution, pics vs créneaux d'ouverture officiels, jours faibles/forts (lundi fermé), densités, opportunités staffing / promo créneau.
2) Produits : stars / flops, mix familles, Panuozzo avant/après lancement marketing juin 2026, taux d'accompagnement boisson/dessert, marges, cannibalisation éventuelle.
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

async function callOpenAiChat({ messages, temperature = 0.3, max_tokens = 1200, jsonMode = false }) {
    const model = process.env.OPENAI_MODEL || 'gpt-4o';
    const payload = {
        model,
        temperature,
        max_tokens,
        messages
    };
    if (jsonMode) {
        payload.response_format = { type: 'json_object' };
    }

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

    return { content, model, usage: body.usage || null };
}

async function runAiAnalysis(snapshot) {
    if (!isConfigured()) {
        const err = new Error('OPENAI_API_KEY non configurée sur le proxy.');
        err.code = 'MISSING_OPENAI_KEY';
        throw err;
    }

    const { content, model, usage } = await callOpenAiChat({
        temperature: 0.25,
        max_tokens: 4500,
        jsonMode: true,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
                role: 'user',
                content: `Analyse APPROFONDIE de Solo. Couvre tickets, horaires, produits, food cost, achats, charges vs best practices. Fournis le JSON complet demandé.\n\n${JSON.stringify(snapshot)}`
            }
        ]
    });

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
        usage
    };
}

const CHAT_SYSTEM_PROMPT = `Tu es l'analyste Solo Pizzeria Napoletana (Casablanca).
Tu réponds en français, de façon concrète et chiffrée, en t'appuyant UNIQUEMENT sur :
1) la dernière analyse approfondie fournie,
2) le snapshot métier compact fourni,
3) l'historique de conversation.

Règles:
- Pas d'invention de chiffres absents.
- Si la data manque, dis-le et propose quoi vérifier dans Solo.
- Réponses courtes à moyennes (8-15 lignes max), actionnables.
- Tu peux challenger une préconisation ou la préciser si l'utilisateur le demande.
- Pas de JSON : texte clair.`;

async function runAiChat({ message, analysis, snapshot, history = [] }) {
    if (!isConfigured()) {
        const err = new Error('OPENAI_API_KEY non configurée sur le proxy.');
        err.code = 'MISSING_OPENAI_KEY';
        throw err;
    }

    const cleanHistory = (Array.isArray(history) ? history : [])
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content)
        .slice(-12)
        .map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

    const contextBlock = {
        analysis: analysis || null,
        snapshot: snapshot || null
    };

    const { content, model, usage } = await callOpenAiChat({
        temperature: 0.35,
        max_tokens: 1200,
        messages: [
            { role: 'system', content: CHAT_SYSTEM_PROMPT },
            {
                role: 'user',
                content: `Contexte analyse + données Solo (JSON):\n${JSON.stringify(contextBlock).slice(0, 28000)}`
            },
            ...cleanHistory,
            { role: 'user', content: String(message || '').slice(0, 800) }
        ]
    });

    return {
        reply: String(content).trim(),
        model,
        usage
    };
}

module.exports = {
    isConfigured,
    runAiAnalysis,
    runAiChat
};
