/**
 * Convertit YYYY-MM-DD (frontend SOLO) vers MM/DD/YYYY (LaCaisse export).
 */
function toLaCaisseDate(isoDate) {
    const [year, month, day] = String(isoDate).split('-');
    if (!year || !month || !day) {
        throw new Error(`Date invalide: ${isoDate}`);
    }
    return `${month}/${day}/${year}`;
}

/**
 * Convertit YYYY-MM-DD vers DD-MM-YYYY HH:mm:ss (details_journal).
 */
function toJournalDateTime(isoDate, time = '00:00:00') {
    const [year, month, day] = String(isoDate).split('-');
    if (!year || !month || !day) {
        throw new Error(`Date invalide: ${isoDate}`);
    }
    return `${day}-${month}-${year} ${time}`;
}

module.exports = { toLaCaisseDate, toJournalDateTime };
