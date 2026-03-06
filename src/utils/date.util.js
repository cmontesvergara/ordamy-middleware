/**
 * Timezone-aware Date Utility
 * Generates exact UTC boundaries for a specific local timezone.
 */

/**
 * Calculates the absolute UTC start and end bounds of a day for a given timezone.
 * @param {string|null} dateString YYYY-MM-DD or falsy for "today in timezone"
 * @param {string} timeZone IANA Timezone string (e.g. 'America/Bogota')
 * @returns {object} { dateUsed: 'YYYY-MM-DD', startOfDay: Date, endOfDay: Date }
 */
function getDayBounds(dateString, timeZone) {
    const tz = timeZone || 'UTC';

    let targetDateString = dateString;
    if (!targetDateString) {
        // Find today's literal YYYY-MM-DD in the target timezone
        const now = new Date();
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(now);
        const y = parts.find(p => p.type === 'year').value;
        const m = parts.find(p => p.type === 'month').value;
        const d = parts.find(p => p.type === 'day').value;
        targetDateString = `${y}-${m}-${d}`;
    }

    // Find the timezone offset for that day
    const dObj = new Date(targetDateString);
    const tzParts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'longOffset'
    }).formatToParts(dObj);

    const tzNamePart = tzParts.find(p => p.type === 'timeZoneName');
    let offset = 'Z';
    if (tzNamePart && tzNamePart.value.startsWith('GMT')) {
        offset = tzNamePart.value.replace('GMT', ''); // e.g. "-05:00"
        if (offset === '') offset = 'Z';
    }

    const startIso = `${targetDateString}T00:00:00.000${offset}`;
    const endIso = `${targetDateString}T23:59:59.999${offset}`;

    return {
        dateUsed: targetDateString,
        startOfDay: new Date(startIso),
        endOfDay: new Date(endIso)
    };
}

/**
 * Calculates the absolute UTC start and end bounds of a month for a given timezone.
 * @param {number|string|null} year YYYY or falsy for current year
 * @param {number|string|null} month 1-12 or falsy for current month
 * @param {string} timeZone IANA Timezone string (e.g. 'America/Bogota')
 * @returns {object} { yearAndMonth: 'YYYY-MM', startOfMonth: Date, endOfMonth: Date }
 */
function getMonthBounds(year, month, timeZone) {
    const tz = timeZone || 'UTC';

    let targetYear = year ? parseInt(year) : null;
    let targetMonth = month ? parseInt(month) : null;

    if (!targetYear || !targetMonth) {
        const now = new Date();
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz, year: 'numeric', month: '2-digit'
        }).formatToParts(now);

        if (!targetYear) {
            targetYear = parseInt(parts.find(p => p.type === 'year').value);
        }
        if (!targetMonth) {
            targetMonth = parseInt(parts.find(p => p.type === 'month').value);
        }
    }

    const formattedMonth = String(targetMonth).padStart(2, '0');
    const targetStartString = `${targetYear}-${formattedMonth}-01`;

    const nextMonth = targetMonth === 12 ? 1 : targetMonth + 1;
    const nextMonthYear = targetMonth === 12 ? targetYear + 1 : targetYear;
    const lastDay = new Date(nextMonthYear, nextMonth - 1, 0).getDate();
    const formattedLastDay = String(lastDay).padStart(2, '0');
    const targetEndString = `${targetYear}-${formattedMonth}-${formattedLastDay}`;

    const tzParts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'longOffset'
    }).formatToParts(new Date(targetStartString));

    const tzNamePart = tzParts.find(p => p.type === 'timeZoneName');
    let offset = 'Z';
    if (tzNamePart && tzNamePart.value.startsWith('GMT')) {
        offset = tzNamePart.value.replace('GMT', '');
        if (offset === '') offset = 'Z';
    }

    const startIso = `${targetStartString}T00:00:00.000${offset}`;

    // Check end string daylight saving crossing just in case
    const endTzParts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'longOffset'
    }).formatToParts(new Date(targetEndString));

    const endTzNamePart = endTzParts.find(p => p.type === 'timeZoneName');
    let endOffset = 'Z';
    if (endTzNamePart && endTzNamePart.value.startsWith('GMT')) {
        endOffset = endTzNamePart.value.replace('GMT', '');
        if (endOffset === '') endOffset = 'Z';
    }

    const endIso = `${targetEndString}T23:59:59.999${endOffset}`;

    return {
        yearAndMonth: `${targetYear}-${formattedMonth}`,
        startOfMonth: new Date(startIso),
        endOfMonth: new Date(endIso)
    };
}

module.exports = {
    getDayBounds,
    getMonthBounds
};
