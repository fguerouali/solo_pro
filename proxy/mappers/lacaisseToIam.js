function cleanLabel(value) {
    return String(value || '')
        .replace(/\s*-\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeHeure(heure) {
    const raw = String(heure || '').trim();
    if (!raw) return '00:00:00';
    const parts = raw.split(':');
    const hours = String(parts[0] || '0').padStart(2, '0');
    const minutes = String(parts[1] || '0').padStart(2, '0');
    const seconds = String(parts[2] || '0').padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function buildBillNo(row) {
    const orderId = row['Id commande'];
    if (orderId !== '' && orderId !== null && orderId !== undefined) {
        return String(orderId);
    }
    const date = row.Date || 'unknown-date';
    const ticket = row['Num ticket'] ?? 'unknown-ticket';
    return `LC_${date}_${ticket}`;
}

function getTicketKey(row) {
    const orderId = row['Id commande'];
    if (orderId !== '' && orderId !== null && orderId !== undefined) {
        return `order:${orderId}`;
    }
    return `ticket:${row.Date}|${row['Num ticket']}`;
}

function isCancelledSaleType(saleType) {
    const normalized = String(saleType || '').trim().toLowerCase();
    if (!normalized || normalized === 'vente') return false;
    return /annul|avoir|retour|rembours|cancel|void/.test(normalized);
}

function buildTicketVenteTotals(rows) {
    const totals = new Map();
    for (const row of rows) {
        if (isCancelledSaleType(row['Type de vente'])) continue;
        const key = getTicketKey(row);
        const vente = parseFloat(row['Prix de vente']) || 0;
        totals.set(key, (totals.get(key) || 0) + vente);
    }
    return totals;
}

function isActiveSaleRow(row, ticketTotals) {
    if (isCancelledSaleType(row['Type de vente'])) return false;
    if (!cleanLabel(row.Produit)) return false;

    const vente = parseFloat(row['Prix de vente']) || 0;
    if (vente <= 0) return false;

    const ticketTotal = ticketTotals.get(getTicketKey(row)) || 0;
    return ticketTotal > 0;
}

function resolveGoodsNameAndMemo(row) {
    const produit = cleanLabel(row.Produit);
    const sousProduit = cleanLabel(row['Sous produit']);
    const categorie = cleanLabel(row.Categorie);
    const canal = String(row['Canal de vente'] || '').toLowerCase();

    if (/menu\s*panuozzo/i.test(produit) || (categorie.toLowerCase() === 'menu' && /panuozzo/i.test(produit))) {
        return {
            goodsName: canal.includes('glovo') ? 'glovo' : 'menu',
            printMemo: sousProduit || cleanLabel(row['Titre ticket']) || ''
        };
    }

    if (/^menu$/i.test(produit) || /^glovo$/i.test(produit)) {
        return {
            goodsName: produit.toLowerCase(),
            printMemo: sousProduit || cleanLabel(row['Titre ticket']) || ''
        };
    }

    return {
        goodsName: produit,
        printMemo: sousProduit
    };
}

function mapLaCaisseRowToIam(row) {
    const qty = parseFloat(row['Quantité']) || 0;
    const catalogue = parseFloat(row['Prix catalogue']) || 0;
    const vente = parseFloat(row['Prix de vente']) || 0;
    const unitPrice = qty > 0 ? vente / qty : vente;

    let discount = 100;
    if (catalogue > 0 && vente > 0 && vente !== catalogue) {
        discount = Math.min(100, Math.max(0, (vente / catalogue) * 100));
    }

    const { goodsName, printMemo } = resolveGoodsNameAndMemo(row);
    const date = row.Date || '';
    const operDate = `${date} ${normalizeHeure(row.Heure)}`.trim();

    const iam = {
        billNo: buildBillNo(row),
        goodsName,
        numNum: qty,
        numPrice: unitPrice,
        numPriceAdd: 0,
        numBack: 0,
        discount: Number(discount.toFixed(2)),
        operDate
    };

    if (printMemo) {
        iam.printMemo = printMemo;
    }

    return iam;
}

function mapLaCaisseRowsToIam(rows) {
    const ticketTotals = buildTicketVenteTotals(rows);
    return rows
        .filter(row => isActiveSaleRow(row, ticketTotals))
        .map(mapLaCaisseRowToIam);
}

module.exports = {
    cleanLabel,
    buildBillNo,
    getTicketKey,
    isCancelledSaleType,
    isActiveSaleRow,
    mapLaCaisseRowToIam,
    mapLaCaisseRowsToIam
};
