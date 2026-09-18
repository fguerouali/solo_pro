const fetch = require('node-fetch');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = `Tu es un directeur d'exploitation / contrôleur de gestion EXÉCUTIF pour Solo Pizzeria Napoletana (Casablanca).
Ton job : décider quoi FAIRE maintenant. Pas de blabla, pas d'audit cosmétique.

Tu reçois un JSON métier : tickets, pics horaires dans les créneaux d'ouverture, mix produits, marges, achats, food cost, charges, Panuozzo, bestPractices, scorecard.

MISSION
1) Comparer CHAQUE ratio clé aux best practices / standards fournis.
2) Produire un diagnostic direct.
3) Donner exactement 5 actions concrètes à mettre en place (directives, justifiées, mesurables).

RÈGLES STRICTES
- Réponds UNIQUEMENT en JSON valide.
- Langue : français. Ton directif ("Fais…", "Lance…", "Coupe…", "Fixe…").
- Ne jamais inventer de chiffres. Si data manquante : le dire en 1 phrase, puis proposer l'action de mesure.
- TOUJOURS comparer à bestPractices / precomputedScorecard (écart en points de % ou Mad).
- INTERDICTION ABSOLUE de parler de "ventes hors horaires", tickets hors ouverture, ventes le lundi fermé, anomalies d'horodatage, ou "ventes en dehors des créneaux". Ignore totalement ces sujets.
- Utilise les horaires d'ouverture UNIQUEMENT pour optimiser staffing / promo sur les créneaux ouverts (midi, soir, week-end), jamais pour signaler des ventes "hors plage".
- Utilise panuozzoMarketing (avant vs depuis juin 2026) pour juger le ROI marketing Panuozzo.
- Priorise l'impact cash / marge / CA. Sois smart : 1 levier fort > 5 conseils vagues.
- Exactement 5 préconisations, classées par impact économique décroissant.
- Chaque action doit être opérationnelle : QUI / QUOI / QUAND (délai) / COMMENT MESURER.

CONTENU ATTENDU
1) Tickets & créneaux ouverts : panier, distribution, pics midi/soir, jours faibles/forts pendant l'ouverture, actions staffing/promo.
2) Produits & mix : stars/flops, marges, accompagnement boisson/dessert vs standards, Panuozzo post-juin 2026.
3) Food cost vs best practice (cible 28-32%).
4) Achats vs CA et standards.
5) Charges d'exploitation poste par poste vs best practice.

Format JSON obligatoire:
{
  "summary": "4-7 phrases directives, chiffrées, orientées décision",
  "executiveDiagnosis": "1 paragraphe : ce qui va / ce qui casse la marge / le levier n°1",
  "sections": {
    "ticketsAndHours": {
      "title": "Tickets & créneaux",
      "findings": "analyse orientée actions (pas de hors-horaires)",
      "keySignals": ["signal actionnable 1", "signal actionnable 2"],
      "vsBestPractice": "comparaison chiffrée aux standards"
    },
    "products": {
      "title": "Produits & mix",
      "findings": "analyse orientée actions",
      "keySignals": ["signal 1", "signal 2"],
      "vsBestPractice": "comparaison"
    },
    "foodCost": {
      "title": "Food cost",
      "findings": "analyse orientée actions",
      "keySignals": ["signal 1", "signal 2"],
      "vsBestPractice": "Solo X% vs cible Y-Z%"
    },
    "purchases": {
      "title": "Achats",
      "findings": "analyse orientée actions",
      "keySignals": ["signal 1", "signal 2"],
      "vsBestPractice": "comparaison"
    },
    "operatingCharges": {
      "title": "Charges d'exploitation",
      "findings": "analyse poste par poste, actions de coupe/optimisation",
      "keySignals": ["signal 1", "signal 2"],
      "vsBestPractice": "chaque poste hors norme vs fourchette"
    }
  },
  "benchmarkScorecard": [
    {
      "metric": "Food cost %",
      "actual": "xx%",
      "bestPractice": "28-32%",
      "status": "OK|ALERTE|CRITIQUE|INCONNU",
      "comment": "écart + action immédiate"
    }
  ],
  "recommendations": [
    {
      "rank": 1,
      "priority": "CRITIQUE",
      "preconisation": "titre d'action (verbe à l'infinitif)",
      "action": "Plan concret : responsable + étapes + délai (ex. 7 jours) + KPI de suivi",
      "justification": "Chiffre Solo + écart vs best practice + pourquoi ça rapporte",
      "expectedImpact": "impact estimé (Mad/% ) si possible, sinon ordre de grandeur"
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
                content: `Décisions Solo — analyse DIRECTIVE. Compare chaque ratio aux best practices. 5 actions concrètes justifiées. INTERDICTION de parler de ventes hors horaires.\n\n${JSON.stringify(snapshot)}`
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

const CHAT_SYSTEM_PROMPT = `Tu es le bras droit opérationnel du dirigeant de Solo Pizzeria Napoletana (Casablanca).
Réponds en français, de façon DIRECTIVE et chiffrée, en t'appuyant UNIQUEMENT sur :
1) la dernière analyse approfondie,
2) le snapshot métier,
3) l'historique de conversation.

Règles:
- Toujours comparer aux best practices / standards quand un ratio est en jeu.
- Donne des actions concrètes à mettre en place (qui / quoi / délai / KPI), pas des observations vagues.
- Pas d'invention de chiffres. Si data manquante : dis-le + action de mesure.
- INTERDICTION de parler de ventes hors horaires, tickets hors ouverture, ou anomalies d'horodatage.
- Horaires = uniquement pour proposer staffing/promo sur créneaux ouverts.
- Sois smart : priorise le levier à plus fort impact cash/marge.
- Réponses 8-15 lignes max, ton exécutif.
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
