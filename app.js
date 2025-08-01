let corpData = {};
let corpsMeta = {};
let dateList = [];
let currentDateIdx = 0;
let csvRows = [];
let csvHeader = [];
let scoreChart = null;

function parseCSV(csv) {
    let lines = csv.trim().split('\n');
    csvHeader = lines[0].split(',').map(h => h.trim()).filter(h => h.length > 0);
    let tsIdx = csvHeader.indexOf('timestamp');
    csvRows = [];

    // Clear existing data
    corpData = {};

    // Track the latest timestamp for each date
    let latestRowForDate = {};

    for (let i = 1; i < lines.length; i++) {
        let row = lines[i].split(',');
        while (row.length < csvHeader.length) row.push('');
        if (row.length < 2) continue;
        csvRows.push(row);

        let ts = parseInt(row[tsIdx]);
        let date = new Date(ts * 1000);
        let dateStr = date.toISOString().slice(0, 10);

        // Keep track of the latest row for each date
        if (!latestRowForDate[dateStr] || ts > parseInt(latestRowForDate[dateStr][tsIdx])) {
            latestRowForDate[dateStr] = row;
        }
    }

    // Now process only the latest row for each date
    for (let dateStr in latestRowForDate) {
        let row = latestRowForDate[dateStr];
        corpData[dateStr] = [];

        for (let j = 1; j < csvHeader.length; j++) {
            let sn = csvHeader[j];
            let score = parseInt(row[j], 10) || 0;
            corpData[dateStr].push({
                shortname: sn,
                score: score
            });
        }
    }
}
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
function enrichWithMeta() {
    for (let date in corpData) {
        corpData[date].forEach(corp => {
            let meta = corpsMeta[corp.shortname];
            if (!meta) {
                console.log("Missing meta for shortname:", corp.shortname);
            }
            corp.displayName = meta ? meta.name.split(' ')[0] : corp.shortname;
            corp.color = meta ? meta.color : "#888";
            corp.logo = meta && meta.logo_svg ? meta.logo_svg.replace('.png', '.svg') : '';
        });
    }
}

function calculatePlayers(score) {
    const tier5Score = 2826;
    const playersAdjustment = 0.9;
    if (score) {
        return `Estimated Tier 5 players: ${Math.floor((score / tier5Score) * playersAdjustment).toLocaleString()}`;
    }

}

function calculateScoreDifferencesForDate(currentDate) {
    if (!corpData[currentDate]) return {};

    let allDates = Object.keys(corpData).sort();
    let currentDateIdx = allDates.indexOf(currentDate);

    if (currentDateIdx <= 0) return {};

    let previousDate = allDates[currentDateIdx - 1];
    let currentCorps = corpData[currentDate];
    let previousCorps = corpData[previousDate];

    // Find the actual timestamps from CSV data
    let currentRowIdx = csvRows.findIndex(row => {
        let date = new Date(parseInt(row[0]) * 1000);
        return date.toISOString().slice(0, 10) === currentDate;
    });

    let previousRowIdx = csvRows.findIndex(row => {
        let date = new Date(parseInt(row[0]) * 1000);
        return date.toISOString().slice(0, 10) === previousDate;
    });

    let hoursElapsed;
    if (currentRowIdx !== -1 && previousRowIdx !== -1) {
        // Use actual timestamps from CSV
        let currentTime = parseInt(csvRows[currentRowIdx][0]) * 1000;
        let previousTime = parseInt(csvRows[previousRowIdx][0]) * 1000;
        hoursElapsed = (currentTime - previousTime) / (1000 * 60 * 60);
    } else {
        // Fallback to 24-hour calculation if timestamps not found
        let currentTime = new Date(currentDate + "T23:59:59").getTime();
        let previousTime = new Date(previousDate + "T23:59:59").getTime();
        hoursElapsed = (currentTime - previousTime) / (1000 * 60 * 60);
    }

    let differences = {};

    currentCorps.forEach(currentCorp => {
        let previousCorp = previousCorps.find(p => p.shortname === currentCorp.shortname);
        let previousScore = previousCorp ? previousCorp.score : 0;
        let scoreDiff = currentCorp.score - previousScore;
        let scuPerHour = hoursElapsed > 0 ? Math.round(scoreDiff / hoursElapsed) : 0;

        differences[currentCorp.shortname] = {
            diff: scoreDiff,
            perHour: scuPerHour,
            hoursElapsed: Math.round(hoursElapsed * 10) / 10 // For debugging
        };
    });

    return differences;
}
function displayLastUpdated() {
    if (csvRows.length === 0) return;

    // Get the timestamp from the last row (most recent entry)
    const lastRow = csvRows[csvRows.length - 1];
    const lastTimestamp = parseInt(lastRow[0], 10) * 1000;

    if (!isNaN(lastTimestamp)) {
        const lastDate = new Date(lastTimestamp);

        /* https://devhints.io/wip/intl-datetime
        hacky way of displaying yyyy-DD-mm that might go tits up at some point?
        https://medium.com/@bryanfisk.nz/not-being-in-a-french-langauge-country-i-would-use-64c97ea06552*/
        const formatted = new Intl.DateTimeFormat('en-CA', {
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }).format(lastDate);

        $("#last-updated-time").text(formatted);
    } else {
        $("#last-updated-time").text("Unknown");
    }
}

function renderCorps(date) {
    let corps = corpData[date] || [];
    corps = corps.slice().sort((a, b) => b.score - a.score);
    let maxScore = corps.length ? corps[0].score : 1;
    let scoreDiffs = calculateScoreDifferencesForDate(date);
    let totalScore = corps.reduce((sum, c) => sum + c.score, 0);
    $("#total-score-value").text(totalScore.toLocaleString());

    $("#corps").empty();
    corps.forEach((corp, idx) => {
        let percent = Math.round((corp.score / maxScore) * 100);
        let isTop = idx === 0 && corp.score === maxScore && maxScore > 0;
        let diffData = scoreDiffs[corp.shortname] || { diff: 0, perHour: 0 };
        let diff = diffData.diff;
        let perHour = diffData.perHour;

        let diffText = diff > 0 ? `+${diff.toLocaleString()}` : diff < 0 ? diff.toLocaleString() : '0';
        let perHourText = perHour > 0 ? `${perHour.toLocaleString()}` : perHour < 0 ? perHour.toLocaleString() : '0';
        let diffClass = diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'neutral';

        let gapText = '';
        if (idx > 0) {
            let gap = corps[idx - 1].score - corp.score;
            gapText = `<span class="score-gap negative tooltip">(-${gap.toLocaleString()}) <span class="tooltip-text">Difference from next highest corp</span></span>`;
        }

        let card = $(`
<div class="corp-card${isTop ? ' top-corp' : ''}" style="--corp-color: ${corp.color};">
    <div class="corp-logo">
       <img src="${escapeHtml(corp.logo || '')}" alt="${escapeHtml(corp.displayName)}" width="48" height="48" />
    </div>
    <div class="corp-info">
        <div class="corp-name">
            ${escapeHtml(corp.displayName)}
            ${gapText}
        </div>
        <div class="score-bar-bg">
            <div class="score-bar-fill" style="width:0%;background:${corp.color || '#888'}"></div>
            <div class="score-text-overlay">
                ${corp.score.toLocaleString()} SCU
            </div>
        </div>
        <div class="score-details">
            <span class="score-diff score-meta-tag ${diffClass}">${diffText}</span>
            <span class="score-per-hour score-meta-tag ${diffClass}">${perHourText}/hr</span>
            
        </div><div class="score-details score-players score-meta-tag">${calculatePlayers(corp.score)}</div>
    </div>
</div>
`);
        $("#corps").append(card);
        setTimeout(() => {
            card.find('.score-bar-fill').css('width', percent + '%');
        }, 50);
    });
}

function showDate(idx) {
    if (dateList.length === 0) return;
    currentDateIdx = Math.max(0, Math.min(idx, dateList.length - 1));
    let date = dateList[currentDateIdx];
    $("#date-label").text(date);
    renderCorps(date);
    $("#prev-date").prop("disabled", currentDateIdx === 0);
    $("#next-date").prop("disabled", currentDateIdx === dateList.length - 1);
}

function setupPagination() {
    dateList = Object.keys(corpData).sort().reverse();
    showDate(0);
    $("#prev-date").off("click").on("click", function () {
        if (currentDateIdx > 0) showDate(currentDateIdx - 1);
    });
    $("#next-date").off("click").on("click", function () {
        if (currentDateIdx < dateList.length - 1) showDate(currentDateIdx + 1);
    });
}

function renderHistoryTable() {
    let lastRows = csvRows.slice(-10).reverse();
    let ths = csvHeader.map(h => {
        if (h === "timestamp") return `<th>Date/Time</th>`;
        let color = corpsMeta[h]?.color || "#888";
        return `<th style="background: ${hexToRgba(color, 0.20)}">${corpsMeta[h]?.name || h}</th>`;
    });
    let html = `<table class="data-table"><thead><tr>${ths.join('')}</tr></thead><tbody>`;
    lastRows.forEach(row => {
        html += "<tr>";
        for (let j = 0; j < csvHeader.length; j++) {
            if (csvHeader[j] === "timestamp") {
                let ts = parseInt(row[j], 10) * 1000;
                let formatted = "";
                if (!isNaN(ts)) {
                    const dtf = new Intl.DateTimeFormat(undefined, {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false
                    });
                    const parts = dtf.formatToParts(ts).reduce((acc, part) => {
                        acc[part.type] = part.value;
                        return acc;
                    }, {});
                    formatted = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
                }
                html += `<td>${formatted}</td>`;
            } else {
                let color = corpsMeta[csvHeader[j]]?.color || "#888";
                html += `<td style="background: ${hexToRgba(color, 0.20)}">${row[j] ? parseInt(row[j], 10).toLocaleString() : "0"}</td>`;
            }
        }
        html += "</tr>";
    });
    html += "</tbody></table>";
    $("#history-table").html(html);
}

function cleanerSCULabel(value) {
    if (value === 0) return "0 SCU";

    const absValue = Math.abs(value);

    if (absValue >= 1_000_000_000) {
        const billions = value / 1_000_000_000;
        return billions % 1 === 0 ?
            `${billions.toFixed(0)}B SCU` :
            `${billions.toFixed(1)}B SCU`;
    } else if (absValue >= 1_000_000) {
        const millions = value / 1_000_000;
        return millions % 1 === 0 ?
            `${millions.toFixed(0)}M SCU` :
            `${millions.toFixed(1)}M SCU`;
    } else if (absValue >= 1_000) {
        return value.toLocaleString() + " SCU";
    } else {
        return value + " SCU";
    }
}

function createEventAnnotations(events) {
    /* https://www.chartjs.org/chartjs-plugin-annotation/latest/guide/types/line.html */
    const annotations = {};
    const rootStyle = getComputedStyle(document.documentElement);
    const eventColors = {
        maintenance: { label: 'rgba(255, 0, 0, 0.1)', line: 'rgba(255, 0, 0, 0.5)' },
        update: { label: 'rgba(0, 162, 255, 0.18)', line: 'rgba(0, 162, 255, 0.5)' },
        hotfix: { label: 'rgba(255, 191, 0, 0.18)', line: 'rgba(255, 191, 0, 0.5)' }
    };


    events.forEach(event => {
        // Check if event has both start and end dates
        if (event.endDate && event.date !== event.endDate) {
            // Create a box annotation for duration events
            annotations[event.id] = {
                type: 'box',
                xMin: event.date,
                xMax: event.endDate,
                backgroundColor: eventColors[event.type]?.label || 'rgba(128, 128, 128, 0.18)',
                borderColor: eventColors[event.type]?.line || '#888',
                borderWidth: 0,
                borderDash: [5, 5],
                label: {
                    display: true,
                    content: event.title,
                    position: 'center',
                    backgroundColor: eventColors[event.type]?.label || '#888',
                    color: 'white',
                    font: { size: 14 }
                }
            };
        } else {
            // Create a line annotation for single point events
            annotations[event.id] = {
                type: 'line',
                xMin: event.date,
                xMax: event.date,
                borderWidth: 1,
                borderDash: [5, 5],
                borderColor: eventColors[event.type]?.line || '#888',
                label: {
                    display: true,
                    content: event.title,
                    position: 'start',
                    backgroundColor: eventColors[event.type]?.label || '#888',
                    color: 'white',
                    font: { size: 14 }
                }
            };
        }
    });

    return annotations;
}

function renderChart() {
    /**
     * Chart.js docs - https://www.chartjs.org/docs/latest/
     */

    const ctx = document.getElementById('scoreChart').getContext('2d');
    const datasets = [];
    const corpShortnames = csvHeader.slice(1);


    corpShortnames.forEach(shortname => {
        const meta = corpsMeta[shortname];
        if (!meta) return;
        const data = csvRows.map(row => {
            const colIndex = csvHeader.indexOf(shortname);
            const timestamp = parseInt(row[0], 10) * 1000;
            const score = parseInt(row[colIndex], 10) || 0;
            return {
                x: timestamp,
                y: score
            };
        });

        datasets.push({
            label: meta.name,
            data: data,
            borderColor: meta.color,
            backgroundColor: meta.color + '20',
            tension: 0.1,
            pointRadius: 2,
            pointHoverRadius: 5,
            borderWidth: 2
        });
    });

    if (scoreChart) {
        scoreChart.destroy();
    }

    scoreChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: '#e9e9e9',
                        usePointStyle: true
                    }
                },
                annotation: {
                    annotations: createEventAnnotations(gameEvents)
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        displayFormats: {
                            day: 'MMM d',
                            hour: 'MMM d',
                            minute: 'MMM d'
                        },
                        unit: 'day'
                    },
                    ticks: { color: '#e9e9e9' },
                    grid: { color: '#444' }
                },
                y: {
                    ticks: {
                        color: '#e9e9e9',
                        callback: function (value) {
                            return cleanerSCULabel(value);
                        }
                    },
                    grid: { color: '#444' }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

function hexToRgba(hex, alpha) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
    let num = parseInt(hex, 16);
    let r = (num >> 16) & 255;
    let g = (num >> 8) & 255;
    let b = num & 255;
    return `rgba(${r},${g},${b},${alpha})`;
}

let isWidescreenMode = false;

function toggleWidescreenMode() {
    isWidescreenMode = !isWidescreenMode;
    const container = $('.container');
    const toggleBtn = $('#widescreen-btn');

    if (isWidescreenMode) {
        container.addClass('widescreen-mode');
        toggleBtn.addClass('active');
        toggleBtn.find('.toggle-text').text('Normal Mode');
        if (!$('.widescreen-content').length) {
            // Only wrap corps and chart
            $('#corps').add('.chart-container').wrapAll('<div class="widescreen-content"></div>');
        }
        container.removeClass('regular-content');
    } else {
        container.removeClass('widescreen-mode');
        container.addClass('regular-content');
        toggleBtn.removeClass('active');
        toggleBtn.find('.toggle-text').text('Widescreen Mode');
        if ($('.widescreen-content').length) {
            $('.widescreen-content').children().unwrap();
        }
    }

    // Store prefs
    localStorage.setItem('widescreenMode', isWidescreenMode);
}

// Load it all up
$(function () {
    const container = $('.container');

    Promise.all([
        $.getJSON('./corps.json'),
        $.getJSON('./events.json').catch(() => []) // Return empty array if events.json fails
    ]).then(([corps, events]) => {
        corpsMeta = corps;
        gameEvents = events;

        $.get('./data.csv?v=' + Date.now(), function (csv) {
            parseCSV(csv);
            enrichWithMeta();
            setupPagination();
            renderHistoryTable();
            renderChart();
            displayLastUpdated();
        });
        container.addClass('regular-content');
        const savedMode = localStorage.getItem('widescreenMode');
        if (savedMode === 'true' && window.innerWidth >= 1920) {
            toggleWidescreenMode();
        }
        $('#widescreen-btn').on('click', toggleWidescreenMode);
        $(window).on('resize', function () {
            if (window.innerWidth < 1280 && isWidescreenMode) {
                toggleWidescreenMode();
            }
        });
    });


    $(document).on("click", ".accordion-header", function () {
        let accordion = $(this).closest('.accordion');
        accordion.toggleClass("open");
        let isOpen = accordion.hasClass("open");
        let text = $(this).text().includes("Data Entries") ? "Last 10 Data Entries" : "Known Bugs";
        $(this).html(`${text} ${isOpen ? "▲" : "▼"}`);
    });
});