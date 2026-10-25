const fetch = require('node-fetch');

const CASABLANCA = { latitude: 33.5731, longitude: -7.5898 };
const TIMEZONE = 'Africa/Casablanca';
const RAMADAN_2026 = { start: '2026-02-19', end: '2026-03-19' };
const MIN_TRAINING_DAYS = 21;
const EXTERNAL_CACHE_MS = 24 * 60 * 60 * 1000;
const SPORTSDB_KEY = '123';
const FIXTURE_LEAGUES = [
    { id: '4520', seasons: null },
    { id: '4429', seasons: ['2025', '2026'] },
    { id: '4496', seasons: ['2024', '2025', '2026'] },
    { id: '4562', seasons: ['2025', '2026'] }
];

const TARGETS = ['surPlaceMidi', 'surPlaceSoir', 'livraisonMidi', 'livraisonSoir', 'pizzas'];

let weatherCache = null;
let fixtureCache = null;

function clampNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 10) / 10;
}

function isoAddDays(dateStr, days) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function weekdayIndex(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function isMonday(dateStr) {
    return weekdayIndex(dateStr) === 1;
}

function isRamadan2026(dateStr) {
    return dateStr >= RAMADAN_2026.start && dateStr <= RAMADAN_2026.end;
}

function casablancaToday() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

function nextOpenDay(fromDate) {
    let cursor = isoAddDays(fromDate, 1);
    while (isMonday(cursor)) cursor = isoAddDays(cursor, 1);
    return cursor;
}

function formatFrenchDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    const label = new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC'
    }).format(date);
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function quantile(values, q) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] * (hi - pos) + sorted[hi] * (pos - lo);
}

function median(values) {
    return quantile(values, 0.5);
}

const COUNT_KEYS = ['knownSurPlaceMidi', 'knownSurPlaceSoir', 'knownLivraisonMidi', 'knownLivraisonSoir', 'unknownMidi', 'unknownSoir'];

function normalizeDayCounts(day) {
    const hasBreakdown = COUNT_KEYS.some((key) => day[key] != null);
    if (hasBreakdown) {
        return {
            knownSurPlaceMidi: clampNumber(day.knownSurPlaceMidi),
            knownSurPlaceSoir: clampNumber(day.knownSurPlaceSoir),
            knownLivraisonMidi: clampNumber(day.knownLivraisonMidi),
            knownLivraisonSoir: clampNumber(day.knownLivraisonSoir),
            unknownMidi: clampNumber(day.unknownMidi),
            unknownSoir: clampNumber(day.unknownSoir)
        };
    }
    if (day.labeled) {
        return {
            knownSurPlaceMidi: clampNumber(day.surPlaceMidi),
            knownSurPlaceSoir: clampNumber(day.surPlaceSoir),
            knownLivraisonMidi: clampNumber(day.livraisonMidi),
            knownLivraisonSoir: clampNumber(day.livraisonSoir),
            unknownMidi: 0,
            unknownSoir: 0
        };
    }
    return {
        knownSurPlaceMidi: 0,
        knownSurPlaceSoir: 0,
        knownLivraisonMidi: 0,
        knownLivraisonSoir: 0,
        unknownMidi: clampNumber(day.surPlaceMidi) + clampNumber(day.livraisonMidi),
        unknownSoir: clampNumber(day.surPlaceSoir) + clampNumber(day.livraisonSoir)
    };
}

function knownSlotTotal(row, slot) {
    return row[`knownSurPlace${slot}`] + row[`knownLivraison${slot}`];
}

function knownShare(rows, slot) {
    let livraison = 0;
    let total = 0;
    for (const row of rows) {
        livraison += row[`knownLivraison${slot}`];
        total += knownSlotTotal(row, slot);
    }
    if (total <= 0) return null;
    return livraison / total;
}

function applyChannelBackcast(days) {
    const counted = days.map((day) => ({ ...day, ...normalizeDayCounts(day) }));
    const knownTickets = counted.reduce((sum, day) => sum + knownSlotTotal(day, 'Midi') + knownSlotTotal(day, 'Soir'), 0);
    const hasUnknown = counted.some((day) => day.unknownMidi + day.unknownSoir > 0);
    const shares = { Midi: 0, Soir: 0 };
    if (knownTickets < 8 || !hasUnknown) {
        return {
            days: counted.map((day) => ({
                ...day,
                surPlaceMidi: day.knownSurPlaceMidi + day.unknownMidi,
                surPlaceSoir: day.knownSurPlaceSoir + day.unknownSoir,
                livraisonMidi: day.knownLivraisonMidi,
                livraisonSoir: day.knownLivraisonSoir
            })),
            backcastDays: 0,
            knownTickets,
            shareMidi: knownShare(counted, 'Midi') || 0,
            shareSoir: knownShare(counted, 'Soir') || 0
        };
    }

    for (const slot of ['Midi', 'Soir']) {
        const globalShare = knownShare(counted, slot) || 0;
        shares[slot] = [];
        for (let dow = 0; dow < 7; dow += 1) {
            const sameDow = counted.filter((day) => weekdayIndex(day.date) === dow && knownSlotTotal(day, slot) > 0);
            const localShare = knownShare(sameDow, slot);
            const weight = Math.min(1, sameDow.length / 4);
            shares[slot][dow] = localShare == null ? globalShare : (globalShare * (1 - weight)) + (localShare * weight);
        }
    }

    let backcastDays = 0;
    const adjusted = counted.map((day) => {
        const next = { ...day };
        let moved = false;
        for (const slot of ['Midi', 'Soir']) {
            const unknown = day[`unknown${slot}`];
            const share = shares[slot][weekdayIndex(day.date)] || 0;
            const estimated = unknown > 0 ? Math.round(unknown * share) : 0;
            next[`livraison${slot}`] = day[`knownLivraison${slot}`] + estimated;
            next[`surPlace${slot}`] = day[`knownSurPlace${slot}`] + (unknown - estimated);
            if (estimated > 0) moved = true;
        }
        if (moved) backcastDays += 1;
        return next;
    });
    return {
        days: adjusted,
        backcastDays,
        knownTickets,
        shareMidi: knownShare(counted, 'Midi') || 0,
        shareSoir: knownShare(counted, 'Soir') || 0
    };
}

function isRainCode(code) {
    const n = Number(code);
    return (n >= 51 && n <= 67) || (n >= 80 && n <= 82) || n >= 95;
}

function sanitizeDays(days) {
    if (!Array.isArray(days) || days.length === 0) {
        const error = new Error('Historique des ventes manquant.');
        error.code = 'MISSING_HISTORY';
        throw error;
    }
    const cleaned = [];
    for (const day of days.slice(-400)) {
        const date = String(day?.date || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        const row = { date, labeled: Boolean(day?.labeled) };
        for (const key of TARGETS) row[key] = clampNumber(day[key]);
        for (const key of COUNT_KEYS) {
            if (day?.[key] != null) row[key] = clampNumber(day[key]);
        }
        cleaned.push(row);
    }
    if (cleaned.length === 0) {
        const error = new Error('Historique des ventes invalide.');
        error.code = 'INVALID_HISTORY';
        throw error;
    }
    cleaned.sort((a, b) => a.date.localeCompare(b.date));
    return cleaned;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} pour ${url.split('?')[0]}`);
    }
    return response.json();
}

async function fetchFixturePayloads(urls) {
    const payloads = [];
    const batchSize = 4;
    for (let index = 0; index < urls.length; index += batchSize) {
        if (index) await wait(450);
        const batch = urls.slice(index, index + batchSize);
        const rows = await Promise.all(batch.map(async (url) => {
            try {
                return await fetchJson(url);
            } catch (error) {
                if (!/429/.test(String(error.message))) {
                    console.warn(`[Forecast] Matchs ${url.split('?')[1]}: ${error.message}`);
                    return null;
                }
                await wait(900);
                try {
                    return await fetchJson(url);
                } catch (retryError) {
                    console.warn(`[Forecast] Matchs ${url.split('?')[1]}: ${retryError.message}`);
                    return null;
                }
            }
        }));
        payloads.push(...rows);
    }
    return payloads;
}

function seasonsAround(today) {
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    const start = month >= 7 ? year : year - 1;
    return [`${start - 1}-${start}`, `${start}-${start + 1}`, `${start + 1}-${start + 2}`];
}

function parseKickoffHour(event) {
    const time = String(event.strTime || '');
    if (/^\d{2}:/.test(time)) return Number(time.slice(0, 2));
    return 20;
}

function isChampionsLeague(event) {
    return String(event.idLeague || '') === '4480' || /champions league/i.test(event.strLeague || '');
}

function isRealOrBarcelona(home, away) {
    const text = `${home} ${away}`.toLowerCase();
    return text.includes('real madrid') || text.includes('barcelona');
}

function isClasico(home, away) {
    const text = `${home} ${away}`.toLowerCase();
    if (/women|femen|f[eé]minin/.test(text)) return false;
    return text.includes('real madrid') && /\bbarcelona\b/.test(text);
}

function championsStage(event) {
    const round = String(event.intRound || '');
    if (round === '200') return 'final';
    if (round === '150') return 'semi';
    return '';
}

function isWydadCasa(name) {
    const text = String(name || '');
    return /wydad/i.test(text) && !/f[eè]s/i.test(text);
}

function isRajaCasa(name) {
    return /raja/i.test(String(name || '')) && !/beni mellal/i.test(String(name || ''));
}

function eventLevel(event) {
    const home = event.strHomeTeam || '';
    const away = event.strAwayTeam || '';
    const morocco = /\bmorocco\b|\bmaroc\b/.test(`${home} ${away}`.toLowerCase());
    const champions = isChampionsLeague(event);
    const stage = champions ? championsStage(event) : '';
    const wydadHome = isWydadCasa(home);
    const rajaHome = isRajaCasa(home);
    const derby = (wydadHome && isRajaCasa(away)) || (rajaHome && isWydadCasa(away));
    if (isClasico(home, away)) return 2;
    if (champions && (stage === 'final' || stage === 'semi' || isRealOrBarcelona(home, away))) return 2;
    if (derby || morocco) return 2;
    if (wydadHome || rajaHome) return 1;
    return 0;
}

function matchLabel(event, level) {
    const home = event.strHomeTeam || '';
    const away = event.strAwayTeam || '';
    const names = `${home} ${away}`;
    const stage = isChampionsLeague(event) ? championsStage(event) : '';
    if (isClasico(home, away)) return `Clasico ${home} - ${away}`;
    if (stage === 'final') return `Finale ${home} - ${away}`;
    if (stage === 'semi') return `Demi-finale ${home} - ${away}`;
    if (isChampionsLeague(event) && isRealOrBarcelona(home, away)) return `Ligue des champions ${home} - ${away}`;
    if (level === 2 && /wydad/i.test(names) && /raja/i.test(names)) return `Derby ${home} - ${away}`;
    return `${home} - ${away}`;
}

async function loadFixtures(today) {
    if (fixtureCache && Date.now() - fixtureCache.cachedAt < EXTERNAL_CACHE_MS) {
        return fixtureCache;
    }
    const byDate = new Map();
    const clubSeasons = seasonsAround(today);
    const sportsUrl = (path) => `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/${path}`;
    const urls = [
        sportsUrl('eventsnext.php?id=136402'),
        sportsUrl('eventslast.php?id=136402'),
        sportsUrl('eventsnext.php?id=136404'),
        sportsUrl('eventslast.php?id=136404'),
        sportsUrl('eventsnext.php?id=133738'),
        sportsUrl('eventslast.php?id=133738'),
        sportsUrl('eventsnext.php?id=133739'),
        sportsUrl('eventslast.php?id=133739'),
        sportsUrl('eventspastleague.php?id=4520'),
        sportsUrl('eventsnextleague.php?id=4520'),
        sportsUrl('eventslast.php?id=136139'),
        sportsUrl('eventsnext.php?id=136139')
    ];
    for (const league of FIXTURE_LEAGUES) {
        const seasons = league.seasons || clubSeasons;
        for (const season of seasons) {
            urls.push(sportsUrl(`eventsseason.php?id=${league.id}&s=${encodeURIComponent(season)}`));
        }
    }
    const championsRounds = ['1', '2', '3', '4', '5', '6', '7', '8', '125', '150', '160', '200'];
    for (const season of clubSeasons.slice(0, 2)) {
        for (const round of championsRounds) {
            urls.push(sportsUrl(`eventsround.php?id=4480&r=${round}&s=${encodeURIComponent(season)}`));
        }
    }
    const payloads = await fetchFixturePayloads(urls);
    for (const payload of payloads) {
        const events = payload?.events || payload?.results || [];
        for (const event of events) {
            const date = String(event.dateEvent || '');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
            const level = eventLevel(event);
            if (!level) continue;
            const hour = parseKickoffHour(event);
            const label = matchLabel(event, level);
            const current = byDate.get(date) || [];
            if (!current.some((match) => match.label === label)) {
                current.push({ hour, level, label });
            }
            byDate.set(date, current);
        }
    }
    fixtureCache = { cachedAt: Date.now(), byDate, ok: byDate.size > 0 };
    return fixtureCache;
}

function weatherFlags(precipitation, tempMax, code) {
    const rain = (Number(precipitation) || 0) >= 0.5 || isRainCode(code);
    const hot = !rain && (Number(tempMax) || 0) >= 30;
    return { rain, hot, precipitation: Number(precipitation) || 0, tempMax: Number(tempMax) || null };
}

function readDailyWeather(payload) {
    const daily = payload?.daily || {};
    const dates = daily.time || [];
    const rows = new Map();
    dates.forEach((date, index) => {
        rows.set(date, weatherFlags(
            daily.precipitation_sum?.[index],
            daily.temperature_2m_max?.[index],
            daily.weather_code?.[index]
        ));
    });
    return rows;
}

async function loadWeather(startDate, endDate) {
    const key = `${startDate}|${endDate}`;
    if (weatherCache && weatherCache.key === key && Date.now() - weatherCache.cachedAt < EXTERNAL_CACHE_MS) {
        return weatherCache;
    }
    const archiveEnd = isoAddDays(casablancaToday(), -1);
    const params = `latitude=${CASABLANCA.latitude}&longitude=${CASABLANCA.longitude}&daily=precipitation_sum,temperature_2m_max,weather_code&timezone=${encodeURIComponent(TIMEZONE)}`;
    const rows = new Map();
    if (startDate <= archiveEnd) {
        try {
            const archive = await fetchJson(
                `https://archive-api.open-meteo.com/v1/archive?${params}&start_date=${startDate}&end_date=${archiveEnd < endDate ? archiveEnd : endDate}`
            );
            for (const [date, flags] of readDailyWeather(archive)) rows.set(date, flags);
        } catch (error) {
            console.warn(`[Forecast] Historique météo indisponible: ${error.message}`);
        }
    }
    const forecast = await fetchJson(`https://api.open-meteo.com/v1/forecast?${params}&forecast_days=3`);
    for (const [date, flags] of readDailyWeather(forecast)) rows.set(date, flags);
    weatherCache = { key, cachedAt: Date.now(), rows, ok: true };
    return weatherCache;
}

function sanitizeCampaigns(raw) {
    if (!Array.isArray(raw)) return [];
    const campaigns = [];
    for (const item of raw.slice(0, 200)) {
        const type = item?.type === 'collab' ? 'collab' : (item?.type === 'video' ? 'video' : '');
        const start = String(item?.start || '');
        const end = String(item?.end || start);
        if (!type || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) continue;
        const role = item?.role === 'shoot' || item?.role === 'publish' ? item.role : '';
        campaigns.push({ type, start, end, role });
    }
    return campaigns;
}

function campaignOnDate(campaigns, date, type) {
    return campaigns.some((campaign) => campaign.type === type && campaign.start <= date && date <= campaign.end);
}

function marketingLevel(row) {
    return (row?.marketingVideo ? 1 : 0) + (row?.marketingCollab ? 2 : 0);
}

function matchSlot(matches, slot) {
    const relevant = (matches || []).filter((match) => (slot === 'midi' ? match.hour < 17 : match.hour >= 17));
    if (!relevant.length) return 0;
    return Math.max(...relevant.map((match) => match.level));
}

function enrichDays(days, weatherByDate, fixturesByDate, campaigns = []) {
    return days.map((day) => {
        const weather = weatherByDate.get(day.date) || { rain: false, hot: false, precipitation: 0, tempMax: null };
        const matches = fixturesByDate.get(day.date) || [];
        return {
            ...day,
            dow: weekdayIndex(day.date),
            rain: weather.rain,
            hot: weather.hot,
            matchMidi: matchSlot(matches, 'midi'),
            matchSoir: matchSlot(matches, 'soir'),
            marketingVideo: campaignOnDate(campaigns, day.date, 'video'),
            marketingCollab: campaignOnDate(campaigns, day.date, 'collab')
        };
    });
}

function slotLevel(row, target) {
    if (target === 'pizzas') return Math.max(row.matchMidi || 0, row.matchSoir || 0);
    if (target.endsWith('Midi')) return row.matchMidi || 0;
    return row.matchSoir || 0;
}

function conditionalDelta(rows, target, predicate) {
    const yes = rows.filter(predicate);
    const no = rows.filter((row) => !predicate(row));
    if (yes.length < 2 || no.length < 2) return 0;
    const delta = median(yes.map((row) => row[target])) - median(no.map((row) => row[target]));
    const weight = Math.min(1, yes.length / 6);
    return delta * weight;
}

function measureMarketing(training, predicate) {
    const days = training.filter(predicate).length;
    if (days < 2) return { days, tickets: 0, pizzas: 0, measured: false };
    const tickets = ['surPlaceMidi', 'surPlaceSoir', 'livraisonMidi', 'livraisonSoir']
        .reduce((sum, target) => sum + conditionalDelta(training, target, predicate), 0);
    return {
        days,
        tickets: Math.round(tickets),
        pizzas: Math.round(conditionalDelta(training, 'pizzas', predicate)),
        measured: true
    };
}

function marketingPredicate(tomorrow) {
    if (tomorrow.marketingVideo && tomorrow.marketingCollab) {
        return (row) => row.marketingVideo && row.marketingCollab;
    }
    if (tomorrow.marketingVideo) return (row) => row.marketingVideo;
    if (tomorrow.marketingCollab) return (row) => row.marketingCollab;
    return null;
}

function predictTarget(training, target, tomorrow) {
    const sameDow = training.filter((row) => row.dow === tomorrow.dow);
    const ordinary = sameDow.filter((row) => marketingLevel(row) === 0);
    const poolSource = ordinary.length >= 4 ? ordinary : sameDow;
    const calm = poolSource.filter((row) => !row.rain && !row.hot && slotLevel(row, target) === 0 && marketingLevel(row) === 0);
    const normalTraining = training.filter((row) => marketingLevel(row) === 0);
    const pool = calm.length >= 4 ? calm : (poolSource.length >= 4 ? poolSource : (normalTraining.length >= 4 ? normalTraining : training));
    const baseline = median(pool.map((row) => row[target]));
    let adjustment = 0;
    const level = slotLevel(tomorrow, target);
    const compareSet = sameDow.length >= 4 ? sameDow : training;
    if (tomorrow.rain) adjustment += conditionalDelta(compareSet, target, (row) => row.rain);
    else if (tomorrow.hot) adjustment += conditionalDelta(compareSet, target, (row) => row.hot && !row.rain);
    if (level >= 2) {
        adjustment += conditionalDelta(compareSet, target, (row) => slotLevel(row, target) >= 2);
    } else if (level === 1) {
        adjustment += conditionalDelta(compareSet, target, (row) => slotLevel(row, target) === 1);
    }
    const marketingMatch = marketingPredicate(tomorrow);
    if (marketingMatch) {
        const exactDays = compareSet.filter(marketingMatch).length;
        if (exactDays >= 2) adjustment += conditionalDelta(compareSet, target, marketingMatch);
        else adjustment += conditionalDelta(compareSet, target, (row) => marketingLevel(row) > 0);
    }
    const pred = Math.max(0, baseline + adjustment);
    const spread = pool.map((row) => row[target]);
    const half = Math.max(target === 'pizzas' ? 1 : 1, (quantile(spread, 0.75) - quantile(spread, 0.25)) / 2);
    const value = Math.round(pred);
    return {
        value,
        low: Math.max(0, Math.min(value, Math.round(pred - half))),
        high: Math.max(value, Math.round(pred + half))
    };
}

function describeMatch(matches) {
    if (!matches.length) return null;
    const main = [...matches].sort((a, b) => b.level - a.level || a.hour - b.hour)[0];
    const hour = String(main.hour).padStart(2, '0');
    return { label: main.label, hour: main.hour, level: main.level, text: `${main.label} ${hour}h` };
}

function marketingBadges(date, dayContext, campaigns) {
    const marketing = [];
    if (dayContext.marketingVideo) marketing.push({ key: 'video', label: 'Vidéo sponsorisée' });
    const collabHits = campaigns.filter((campaign) => campaign.type === 'collab' && campaign.start <= date && date <= campaign.end);
    if (collabHits.some((campaign) => campaign.role === 'shoot')) marketing.push({ key: 'collab', role: 'shoot', label: 'Tournage' });
    if (collabHits.some((campaign) => campaign.role === 'publish')) marketing.push({ key: 'collab', role: 'publish', label: 'Publication' });
    if (!collabHits.some((campaign) => campaign.role) && dayContext.marketingCollab) marketing.push({ key: 'collab', label: 'Collaboration' });
    return marketing;
}

function forecastOneDay(date, horizon, training, context) {
    const closed = isMonday(date);
    const summary = {
        date,
        horizon,
        label: formatFrenchDate(date),
        closed
    };
    if (closed) return summary;
    const weather = context.weatherByDate.get(date) || { rain: false, hot: false, precipitation: 0, tempMax: null };
    const matches = context.fixturesByDate.get(date) || [];
    const campaigns = context.campaigns || [];
    const dayContext = {
        date,
        dow: weekdayIndex(date),
        rain: weather.rain,
        hot: weather.hot,
        matchMidi: matchSlot(matches, 'midi'),
        matchSoir: matchSlot(matches, 'soir'),
        marketingVideo: campaignOnDate(campaigns, date, 'video'),
        marketingCollab: campaignOnDate(campaigns, date, 'collab')
    };
    const slots = {};
    for (const target of TARGETS) slots[target] = predictTarget(training, target, dayContext);
    return {
        ...summary,
        weather: {
            rain: weather.rain,
            hot: weather.hot,
            tempMax: weather.tempMax,
            precipitation: weather.precipitation
        },
        match: describeMatch(matches),
        marketing: marketingBadges(date, dayContext, campaigns),
        surPlace: { midi: slots.surPlaceMidi, soir: slots.surPlaceSoir },
        livraison: { midi: slots.livraisonMidi, soir: slots.livraisonSoir },
        production: slots.pizzas
    };
}

function predictedPizzaCount(day) {
    if (!day || day.closed || !day.production) return 0;
    return day.production.value || 0;
}

function buildPizzaSeries(training, context, startDate, endDate) {
    const pizzasByDate = {};
    for (let date = startDate; date <= endDate; date = isoAddDays(date, 1)) {
        pizzasByDate[date] = isMonday(date) ? 0 : predictedPizzaCount(forecastOneDay(date, 'serie', training, context));
    }
    return pizzasByDate;
}

function buildForecast(days, context) {
    const today = context.today;
    const training = context.enriched.filter((row) => !isMonday(row.date) && !isRamadan2026(row.date) && row.date < today);
    if (training.length < MIN_TRAINING_DAYS) {
        const error = new Error(`Pas assez d'historique exploitable (${training.length} jours). Il en faut au moins ${MIN_TRAINING_DAYS}, hors lundis et hors Ramadan.`);
        error.code = 'NOT_ENOUGH_HISTORY';
        throw error;
    }
    const forecastDays = [
        forecastOneDay(today, 'J', training, context),
        forecastOneDay(isoAddDays(today, 1), 'J+1', training, context)
    ];
    const historyStart = context.historyStart && context.historyStart < today ? context.historyStart : isoAddDays(today, -28);
    return {
        days: forecastDays,
        pizzasByDate: buildPizzaSeries(training, context, historyStart, isoAddDays(today, 16)),
        trainedDays: training.length,
        marketingImpact: {
            video: measureMarketing(training, (row) => row.marketingVideo),
            collab: measureMarketing(training, (row) => row.marketingCollab)
        },
        marketingDays: training.filter((row) => marketingLevel(row) > 0).length,
        backcastDays: context.backcastDays || 0,
        knownTickets: context.knownTickets || 0,
        shareMidi: context.shareMidi || 0,
        shareSoir: context.shareSoir || 0,
        footballOk: context.footballOk,
        weatherOk: context.weatherOk
    };
}

async function runForecast(rawDays, rawCampaigns) {
    const sanitized = sanitizeDays(rawDays);
    const backcast = applyChannelBackcast(sanitized);
    const days = backcast.days;
    const campaigns = sanitizeCampaigns(rawCampaigns);
    const today = casablancaToday();
    const startDate = days[0].date < isoAddDays(today, -370) ? isoAddDays(today, -370) : days[0].date;
    let weatherOk = true;
    let footballOk = true;
    let weatherByDate = new Map();
    let fixturesByDate = new Map();
    try {
        const weather = await loadWeather(startDate, isoAddDays(today, 1));
        weatherByDate = weather.rows;
    } catch (error) {
        weatherOk = false;
        console.warn(`[Forecast] Météo indisponible: ${error.message}`);
    }
    try {
        const fixtures = await loadFixtures(today);
        fixturesByDate = fixtures.byDate;
        footballOk = fixtures.ok && fixtures.byDate.size > 0;
    } catch (error) {
        footballOk = false;
        console.warn(`[Forecast] Matchs indisponibles: ${error.message}`);
    }
    const enriched = enrichDays(days, weatherByDate, fixturesByDate, campaigns);
    return buildForecast(days, {
        today,
        historyStart: days[0]?.date,
        enriched,
        campaigns,
        weatherByDate,
        fixturesByDate,
        footballOk,
        weatherOk,
        backcastDays: backcast.backcastDays,
        knownTickets: backcast.knownTickets,
        shareMidi: backcast.shareMidi,
        shareSoir: backcast.shareSoir
    });
}

module.exports = {
    runForecast,
    applyChannelBackcast,
    sanitizeCampaigns,
    buildForecast,
    sanitizeDays,
    enrichDays,
    nextOpenDay,
    isMonday,
    isRamadan2026,
    casablancaToday
};
