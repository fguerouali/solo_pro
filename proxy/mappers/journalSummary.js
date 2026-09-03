function parseAmount(value) {
    if (value === null || value === undefined) return 0;
    const cleaned = String(value)
        .replace(/MAD/gi, '')
        .replace(/\s/g, '')
        .replace(',', '.')
        .trim();
    const amount = parseFloat(cleaned);
    return Number.isFinite(amount) ? amount : 0;
}

function normalizeLabel(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function findPaymentAmount(payments, matcher) {
    const list = Array.isArray(payments) ? payments : [];
    const match = list.find((entry) => matcher(normalizeLabel(entry.type_paiement)));
    return match ? parseAmount(match.montant) : 0;
}

function findStatAmount(stats, matcher) {
    const list = Array.isArray(stats) ? stats : [];
    const match = list.find((entry) => matcher(normalizeLabel(entry.cle)));
    return match ? parseAmount(match.valeur) : 0;
}

/**
 * Mappe la réponse details_journal.php vers les champs Finance SOLO.
 */
function mapJournalToFinanceSummary(payload = {}) {
    const payments = payload.moyennes_paiement || [];
    const stats = payload.statistique || [];

    return {
        tpeAmount: findPaymentAmount(
            payments,
            (label) => label.includes('carte bancaire') && !label.includes('dont')
        ),
        glovoTpeAmount: findPaymentAmount(
            payments,
            (label) => label.includes('glovo') && label.includes('card')
        ),
        glovoCashAmount: findPaymentAmount(
            payments,
            (label) => label.includes('glovo') && label.includes('espece')
        ),
        notesSurPlace: findStatAmount(stats, (label) => label.includes('total notes sur place')),
        notesEmporter: findStatAmount(
            stats,
            (label) => label.includes('total notes') && label.includes('emporter')
        ),
        notesLivraison: findStatAmount(
            stats,
            (label) => label.includes('total notes') && label.includes('livraison')
        ),
        articlesAnnulesAvantNote: findStatAmount(
            stats,
            (label) => label.includes('articles annules avant note')
        ),
        articlesAnnulesApresNote: findStatAmount(
            stats,
            (label) => label.includes('articles annules apres note')
        ),
        totalNotesPayee: findStatAmount(
            stats,
            (label) => label.includes('total notes payee') || label.includes('total notes payees')
        ),
        totalTtc: findPaymentAmount(payments, (label) => label === 'total ttc'),
        dateDebut: payload.date_debut || null,
        dateFin: payload.date_fin || null
    };
}

module.exports = {
    parseAmount,
    mapJournalToFinanceSummary
};
