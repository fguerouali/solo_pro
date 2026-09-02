/**
 * Convertit YYYY-MM-DD (frontend SOLO) vers MM/DD/YYYY (LaCaisse).
 */
function toLaCaisseDate(isoDate) {
    const [year, month, day] = String(isoDate).split('-');
    if (!year || !month || !day) {
        throw new Error(`Date invalide: ${isoDate}`);
    }
    return `${month}/${day}/${year}`;
}

module.exports = { toLaCaisseDate };
