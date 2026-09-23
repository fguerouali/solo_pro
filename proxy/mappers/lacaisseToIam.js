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

function parsePaidTotal(moyens) {
    const raw = String(moyens || '').trim();
    if (!raw) return 0;
    const amounts = [];
    const re = /(?:^|,)\s*[^0-9,]+?(\d+(?:\.\d+)?)/g;
    let match;
    while ((match = re.exec(raw))) {
        const amount = parseFloat(match[1]);
        if (Number.isFinite(amount)) amounts.push(amount);
    }
    return amounts.reduce((sum, amount) => sum + amount, 0);
}

function lineAmount(line) {
    const qty = parseFloat(line.numNum) || 0;
    const price = parseFloat(line.numPrice) || 0;
    const priceAdd = parseFloat(line.numPriceAdd) || 0;
    let discount = parseFloat(line.discount);
    if (!Number.isFinite(discount)) discount = 100;
    return ((price * qty) + priceAdd) * (discount / 100);
}

function appendInvoiceExtras(rows, iamLines) {
    const paidByBill = new Map();
    const metaByBill = new Map();

    for (const row of rows) {
        if (isCancelledSaleType(row['Type de vente'])) continue;
        const billNo = buildBillNo(row);
        const paid = parsePaidTotal(row['Moyens de paiements']);
        if (paid > (paidByBill.get(billNo) || 0)) paidByBill.set(billNo, paid);
        if (!metaByBill.has(billNo)) {
            const ticketNo = row['Num ticket'];
            metaByBill.set(billNo, {
                operDate: `${row.Date || ''} ${normalizeHeure(row.Heure)}`.trim(),
                ticketNo: ticketNo === '' || ticketNo == null ? null : String(ticketNo),
                salesChannel: cleanLabel(row['Canal de vente']) || null
            });
        }
    }

    const lineSumByBill = new Map();
    for (const line of iamLines) {
        lineSumByBill.set(line.billNo, (lineSumByBill.get(line.billNo) || 0) + lineAmount(line));
    }

    const extraLines = [];
    for (const [billNo, paid] of paidByBill.entries()) {
        const lineSum = Number((lineSumByBill.get(billNo) || 0).toFixed(2));
        const ticketTotal = Number(Math.max(paid, lineSum).toFixed(2));
        if (ticketTotal <= 0) continue;

        for (const line of iamLines) {
            if (line.billNo === billNo) line.ticketTotal = ticketTotal;
        }

        const extra = Number((ticketTotal - lineSum).toFixed(2));
        if (extra <= 0.009) continue;

        const meta = metaByBill.get(billNo) || {};
        extraLines.push({
            billNo,
            goodsName: 'Frais de livraison',
            numNum: 1,
            numPrice: extra,
            numPriceAdd: 0,
            numBack: 0,
            discount: 100,
            operDate: meta.operDate || '',
            ticketNo: meta.ticketNo,
            salesChannel: meta.salesChannel,
            ticketTotal,
            isDeliveryFee: true
        });
    }

    return iamLines.concat(extraLines);
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

    const ticketNo = row['Num ticket'];
    if (ticketNo !== '' && ticketNo !== null && ticketNo !== undefined) {
        iam.ticketNo = String(ticketNo);
    }

    const salesChannel = cleanLabel(row['Canal de vente']);
    if (salesChannel) {
        iam.salesChannel = salesChannel;
    }

    if (printMemo) {
        iam.printMemo = printMemo;
    }

    return iam;
}

function mapLaCaisseRowsToIam(rows) {
    const ticketTotals = buildTicketVenteTotals(rows);
    const iamLines = rows
        .filter(row => isActiveSaleRow(row, ticketTotals))
        .map(mapLaCaisseRowToIam);
    return appendInvoiceExtras(rows, iamLines);
}

module.exports = {
    cleanLabel,
    buildBillNo,
    getTicketKey,
    isCancelledSaleType,
    isActiveSaleRow,
    parsePaidTotal,
    mapLaCaisseRowToIam,
    mapLaCaisseRowsToIam
};
