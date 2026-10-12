const fetch = require('node-fetch');

const CASABLANCA = { latitude: 33.5731, longitude: -7.5898 };
const TIMEZONE = 'Africa/Casablanca';
const RAMADAN_2026 = { start: '2026-02-19', end: '2026-03-19' };
const MIN_TRAINING_DAYS = 21;
const EXTERNAL_CACHE_MS = 24 * 60 * 60 * 1000;
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
        const row = { date };
        for (const key of TARGETS) row[key] = clampNumber(day[key]);
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

async function fetchJson(url) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} pour ${url.split('?')[0]}`);
    }
    return response.json();
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

function eventLevel(home, away) {
    const text = `${home} ${away}`.toLowerCase();
    const wydad = text.includes('wydad');
    const raja = text.includes('raja');
    const morocco = /\bmorocco\b|\bmaroc\b/.test(text);
    if (!wydad && !raja && !morocco) return 0;
    if ((wydad && raja) || morocco) return 2;
    return 1;
}

async function loadFixtures(today) {
    if (fixtureCache && Date.now() - fixtureCache.cachedAt < EXTERNAL_CACHE_MS) {
        return fixtureCache;
    }
    const byDate = new Map();
    const clubSeasons = seasonsAround(today);
    const urls = [];
    for (const league of FIXTURE_LEAGUES) {
        const seasons = league.seasons || clubSeasons;
        for (const season of seasons) {
            urls.push(`https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=${league.id}&s=${encodeURIComponent(season)}`);
        }
    }
    urls.push(
        'https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=4520',
        'https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=4520',
        'https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=136139',
        'https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=136139'
    );
    const payloads = await Promise.all(urls.map(async (url) => {
        try {
            return await fetchJson(url);
        } catch (error) {
            console.warn(`[Forecast] Matchs ${url.split('?')[1]}: ${error.message}`);
            return null;
        }
    }));
    for (const payload of payloads) {
        const events = payload?.events || payload?.results || [];
        for (const event of events) {
            const date = String(event.dateEvent || '');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
            const home = event.strHomeTeam || '';
            const away = event.strAwayTeam || '';
            const level = eventLevel(home, away);
            if (!level) continue;
            const hour = parseKickoffHour(event);
            const label = level === 2 && /wydad/i.test(home + away) && /raja/i.test(home + away)
                ? `Derby ${home} - ${away}`
                : `${home} - ${away}`;
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

function matchSlot(matches, slot) {
    const relevant = (matches || []).filter((match) => (slot === 'midi' ? match.hour < 17 : match.hour >= 17));
    if (!relevant.length) return 0;
    return Math.max(...relevant.map((match) => match.level));
}

function enrichDays(days, weatherByDate, fixturesByDate) {
    return days.map((day) => {
        const weather = weatherByDate.get(day.date) || { rain: false, hot: false, precipitation: 0, tempMax: null };
        const matches = fixturesByDate.get(day.date) || [];
        return {
            ...day,
            dow: weekdayIndex(day.date),
            rain: weather.rain,
            hot: weather.hot,
            matchMidi: matchSlot(matches, 'midi'),
            matchSoir: matchSlot(matches, 'soir')
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

function predictTarget(training, target, tomorrow) {
    const sameDow = training.filter((row) => row.dow === tomorrow.dow);
    const calm = sameDow.filter((row) => !row.rain && !row.hot && slotLevel(row, target) === 0);
    const pool = calm.length >= 4 ? calm : (sameDow.length >= 4 ? sameDow : training);
    const baseline = median(pool.map((row) => row[target]));
    let adjustment = 0;
    const level = slotLevel(tomorrow, target);
    if (tomorrow.rain) adjustment += conditionalDelta(sameDow.length >= 4 ? sameDow : training, target, (row) => row.rain);
    else if (tomorrow.hot) adjustment += conditionalDelta(sameDow.length >= 4 ? sameDow : training, target, (row) => row.hot && !row.rain);
    if (level >= 2) {
        adjustment += conditionalDelta(sameDow.length >= 4 ? sameDow : training, target, (row) => slotLevel(row, target) >= 2);
    } else if (level === 1) {
        adjustment += conditionalDelta(sameDow.length >= 4 ? sameDow : training, target, (row) => slotLevel(row, target) === 1);
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

function buildForecast(days, context) {
    const today = context.today;
    const targetDate = nextOpenDay(today);
    const training = context.enriched.filter((row) => !isMonday(row.date) && !isRamadan2026(row.date) && row.date < today);
    if (training.length < MIN_TRAINING_DAYS) {
        const error = new Error(`Pas assez d'historique exploitable (${training.length} jours). Il en faut au moins ${MIN_TRAINING_DAYS}, hors lundis et hors Ramadan.`);
        error.code = 'NOT_ENOUGH_HISTORY';
        throw error;
    }
    const weather = context.weatherByDate.get(targetDate) || { rain: false, hot: false, precipitation: 0, tempMax: null };
    const matches = context.fixturesByDate.get(targetDate) || [];
    const tomorrow = {
        date: targetDate,
        dow: weekdayIndex(targetDate),
        rain: weather.rain,
        hot: weather.hot,
        matchMidi: matchSlot(matches, 'midi'),
        matchSoir: matchSlot(matches, 'soir')
    };
    const slots = {};
    for (const target of TARGETS) slots[target] = predictTarget(training, target, tomorrow);
    return {
        targetDate,
        label: formatFrenchDate(targetDate),
        closedTomorrow: isMonday(isoAddDays(today, 1)),
        weather: {
            rain: weather.rain,
            hot: weather.hot,
            tempMax: weather.tempMax,
            precipitation: weather.precipitation
        },
        match: describeMatch(matches),
        surPlace: { midi: slots.surPlaceMidi, soir: slots.surPlaceSoir },
        livraison: { midi: slots.livraisonMidi, soir: slots.livraisonSoir },
        production: slots.pizzas,
        trainedDays: training.length,
        footballOk: context.footballOk,
        weatherOk: context.weatherOk
    };
}

async function runForecast(rawDays) {
    const days = sanitizeDays(rawDays);
    const today = casablancaToday();
    const startDate = days[0].date < isoAddDays(today, -370) ? isoAddDays(today, -370) : days[0].date;
    let weatherOk = true;
    let footballOk = true;
    let weatherByDate = new Map();
    let fixturesByDate = new Map();
    try {
        const weather = await loadWeather(startDate, nextOpenDay(today));
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
    const enriched = enrichDays(days, weatherByDate, fixturesByDate);
    return buildForecast(days, {
        today,
        enriched,
        weatherByDate,
        fixturesByDate,
        footballOk,
        weatherOk
    });
}

module.exports = {
    runForecast,
    buildForecast,
    sanitizeDays,
    enrichDays,
    nextOpenDay,
    isMonday,
    isRamadan2026,
    casablancaToday
};
