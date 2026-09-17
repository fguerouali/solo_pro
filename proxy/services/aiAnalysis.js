const fetch = require('node-fetch');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = `Tu es l'analyste de pilotage de Solo Pizzeria Napoletana (Casablanca).
Tu reçois un JSON compact de données métier réelles (ventes, canaux, stock, inventaire, pertes, charges, RH, avis Google, tops produits).

Règles strictes:
- Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de texte hors JSON).
- Exactement 5 préconisations, classées par impact décroissant (rank 1 = priorité max).
- Chaque préconisation doit être actionnable, concrète, adaptée à une pizzeria.
- Justification basée UNIQUEMENT sur les chiffres fournis. Ne jamais inventer de montants ni de faits absents.
- Si une donnée manque, ne pas spéculer : base-toi sur ce qui est présent.
- Langue : français.
- Priorités possibles : CRITIQUE, IMPORTANT, OPPORTUNITE.

Format JSON obligatoire:
{
  "summary": "synthèse business en 2-4 phrases",
  "recommendations": [
    {
      "rank": 1,
      "priority": "CRITIQUE",
      "preconisation": "titre court de la recommandation",
      "action": "action concrète à entreprendre (qui/quoi/quand si possible)",
      "justification": "justification chiffrée tirée des données"
    }
  ]
}`;

function isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
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
        justification: String(item.justification || '').trim()
    })).filter(r => r.preconisation && r.action);
}

async function runAiAnalysis(snapshot) {
    if (!isConfigured()) {
        const err = new Error('OPENAI_API_KEY non configurée sur le proxy.');
        err.code = 'MISSING_OPENAI_KEY';
        throw err;
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const payload = {
        model,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
                role: 'user',
                content: `Analyse ces données Solo et fournis exactement 5 préconisations avec actions et justifications.\n\n${JSON.stringify(snapshot)}`
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

    return {
        summary: String(parsed.summary || '').trim(),
        recommendations,
        model,
        usage: body.usage || null
    };
}

module.exports = {
    isConfigured,
    runAiAnalysis
};
