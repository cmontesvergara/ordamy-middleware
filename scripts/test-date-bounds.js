function getDayBounds(dateString, timeZone) {
    const tz = timeZone || 'UTC';

    // If no dateString, what is "today" in the target timezone?
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
        offset = tzNamePart.value.replace('GMT', '');
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

console.log(getDayBounds("2026-03-05", "America/Bogota"));
console.log(getDayBounds(null, "America/Bogota"));

function getMonthBounds(year, month, timeZone) {
    const tz = timeZone || 'UTC';

    const targetYear = year || new Date().getFullYear();
    const targetMonth = month || new Date().getMonth() + 1; // 1-12

    const formattedMonth = String(targetMonth).padStart(2, '0');
    // Start of month is always 01
    const targetStartString = `${targetYear}-${formattedMonth}-01`;

    // Find last day of month
    // In UTC, new Date(y, m, 0) gives last day of previous month
    const nextMonth = targetMonth === 12 ? 1 : targetMonth + 1;
    const nextMonthYear = targetMonth === 12 ? targetYear + 1 : targetYear;
    // We can just construct it:
    const lastDay = new Date(nextMonthYear, nextMonth - 1, 0).getDate();
    const targetEndString = `${targetYear}-${formattedMonth}-${lastDay}`;

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
    const endIso = `${targetEndString}T23:59:59.999${offset}`;

    return {
        yearAndMonth: `${targetYear}-${formattedMonth}`,
        startOfMonth: new Date(startIso),
        endOfMonth: new Date(endIso)
    };
}

console.log(getMonthBounds(2026, 3, "America/Bogota"));
