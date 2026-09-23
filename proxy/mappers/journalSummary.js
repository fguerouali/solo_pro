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

function isFoodwebsiteLabel(label) {
    return /food\s*web|foodwebsite|foodweb|site\s*web|website/.test(label);
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

    const notesLivraisonGlovo = findStatAmount(
        stats,
        (label) => label.includes('glovo') && (label.includes('note') || label.includes('livraison') || label.includes('canal'))
    ) || findPaymentAmount(
        payments,
        (label) => label.includes('glovo') && !label.includes('card') && !label.includes('espece')
    );
    const notesLivraisonFoodwebsite = findStatAmount(
        stats,
        (label) => isFoodwebsiteLabel(label)
    ) || findPaymentAmount(
        payments,
        (label) => isFoodwebsiteLabel(label)
    );
    const notesLivraisonGeneric = findStatAmount(
        stats,
        (label) =>
            label.includes('total notes')
            && label.includes('livraison')
            && !label.includes('glovo')
            && !isFoodwebsiteLabel(label)
    );

    const tpeAmount = findPaymentAmount(
        payments,
        (label) => label.includes('carte bancaire') && !label.includes('dont')
    );
    const glovoTpeAmount = findPaymentAmount(
        payments,
        (label) => label.includes('glovo') && label.includes('card')
    );
    const glovoCashAmount = findPaymentAmount(
        payments,
        (label) => label.includes('glovo') && label.includes('espece')
    );
    const lacaissePayAmount = findPaymentAmount(
        payments,
        (label) => label.includes('lacaisse') && label.includes('pay')
    );
    const totalNotesPayee = findStatAmount(
        stats,
        (label) => label.includes('total notes payee') || label.includes('total notes payees')
    ) || findPaymentAmount(payments, (label) => label === 'total ttc');
    const especeAmount = Math.max(
        0,
        Number((totalNotesPayee - tpeAmount - glovoTpeAmount - glovoCashAmount - lacaissePayAmount).toFixed(2))
    );

    return {
        tpeAmount,
        glovoTpeAmount,
        glovoCashAmount,
        lacaissePayAmount,
        especeAmount,
        notesSurPlace: findStatAmount(stats, (label) => label.includes('total notes sur place')),
        notesEmporter: findStatAmount(
            stats,
            (label) => label.includes('total notes') && label.includes('emporter')
        ),
        notesLivraisonGlovo,
        notesLivraisonFoodwebsite,
        notesLivraison: (notesLivraisonGlovo + notesLivraisonFoodwebsite) || notesLivraisonGeneric,
        articlesAnnulesAvantNote: findStatAmount(
            stats,
            (label) => label.includes('articles annules avant note')
        ),
        articlesAnnulesApresNote: findStatAmount(
            stats,
            (label) => label.includes('articles annules apres note')
        ),
        totalNotesPayee,
        totalTtc: findPaymentAmount(payments, (label) => label === 'total ttc'),
        dateDebut: payload.date_debut || null,
        dateFin: payload.date_fin || null
    };
}

module.exports = {
    parseAmount,
    mapJournalToFinanceSummary
};
