(function () {
    const STORAGE_KEY = "theme-preference";
    const OPTIONS = ["white", "dark", "local"];
    const DEFAULT_CHOICE = "white";
    const UPDATE_MS = 30 * 1000;
    const BIN_ID = "69a627daae596e708f593766";
    const MODE_META = {
        white: { symbol: "\u2600", title: "White mode" },
        dark: { symbol: "\u263D", title: "Black mode" },
        local: { symbol: "\u2316", title: "Location hue mode" },
    };

    let selectedChoice = DEFAULT_CHOICE;
    let refreshTimer = null;
    let lastKnownLocation = null;
    let lastFetchWasLive = false;

    function sanitizeChoice(value) {
        return OPTIONS.includes(value) ? value : DEFAULT_CHOICE;
    }

    function nextChoice(value) {
        const currentIndex = OPTIONS.indexOf(value);
        if (currentIndex === -1) {
            return DEFAULT_CHOICE;
        }
        return OPTIONS[(currentIndex + 1) % OPTIONS.length];
    }

    function readStoredChoice() {
        try {
            return sanitizeChoice(localStorage.getItem(STORAGE_KEY));
        } catch (_error) {
            return DEFAULT_CHOICE;
        }
    }

    function saveChoice(choice) {
        try {
            localStorage.setItem(STORAGE_KEY, choice);
        } catch (_error) {
            // Ignore storage failures (private mode / blocked storage).
        }
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function normalizeAngle(degrees) {
        return ((degrees % 360) + 360) % 360;
    }

    function sinDegrees(degrees) {
        return Math.sin((degrees * Math.PI) / 180);
    }

    function cosDegrees(degrees) {
        return Math.cos((degrees * Math.PI) / 180);
    }

    function tanDegrees(degrees) {
        return Math.tan((degrees * Math.PI) / 180);
    }

    function acosDegrees(value) {
        return (Math.acos(value) * 180) / Math.PI;
    }

    function atanDegrees(value) {
        return (Math.atan(value) * 180) / Math.PI;
    }

    function dayOfYear(date) {
        const year = date.getUTCFullYear();
        const month = date.getUTCMonth();
        const day = date.getUTCDate();
        const start = Date.UTC(year, 0, 0);
        const current = Date.UTC(year, month, day);
        return Math.floor((current - start) / 86400000);
    }

    function computeSunEvent(date, lat, lon, isSunrise) {
        const zenith = 90.833;
        const n = dayOfYear(date);
        const lngHour = lon / 15;
        const t = n + ((isSunrise ? 6 : 18) - lngHour) / 24;
        const m = 0.9856 * t - 3.289;
        let l =
            m + 1.916 * sinDegrees(m) + 0.02 * sinDegrees(2 * m) + 282.634;
        l = normalizeAngle(l);

        let ra = atanDegrees(0.91764 * tanDegrees(l));
        ra = normalizeAngle(ra);

        const lQuadrant = Math.floor(l / 90) * 90;
        const raQuadrant = Math.floor(ra / 90) * 90;
        ra = (ra + (lQuadrant - raQuadrant)) / 15;

        const sinDec = 0.39782 * sinDegrees(l);
        const cosDec = Math.cos(Math.asin(sinDec));
        const cosH =
            (cosDegrees(zenith) - sinDec * sinDegrees(lat)) /
            (cosDec * cosDegrees(lat));

        if (cosH > 1 || cosH < -1) {
            return null;
        }

        let h = isSunrise ? 360 - acosDegrees(cosH) : acosDegrees(cosH);
        h /= 15;

        const localMeanTime = h + ra - 0.06571 * t - 6.622;
        let universalTime = localMeanTime - lngHour;
        universalTime = ((universalTime % 24) + 24) % 24;

        const utcMidnight = Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
        );
        return new Date(utcMidnight + universalTime * 3600000);
    }

    function getSunTimes(lat, lon, now) {
        return {
            sunrise: computeSunEvent(now, lat, lon, true),
            sunset: computeSunEvent(now, lat, lon, false),
        };
    }

    function lerp(a, b, t) {
        return Math.round(a + (b - a) * t);
    }

    function interpolateColor(colors, t) {
        const safeT = clamp(t, 0, 1);
        const scaled = safeT * (colors.length - 1);
        const index = Math.floor(scaled);
        const blend = scaled - index;
        const a = colors[Math.min(index, colors.length - 1)];
        const b = colors[Math.min(index + 1, colors.length - 1)];

        return [
            lerp(a[0], b[0], blend),
            lerp(a[1], b[1], blend),
            lerp(a[2], b[2], blend),
        ];
    }

    function getSkyColor(sunrise, sunset, now) {
        const stops = [
            [10, 10, 46],
            [20, 24, 82],
            [255, 107, 53],
            [255, 209, 102],
            [135, 206, 235],
            [120, 190, 230],
            [135, 206, 235],
            [255, 209, 102],
            [255, 107, 53],
            [20, 24, 82],
            [10, 10, 46],
        ];

        if (
            !sunrise ||
            !sunset ||
            Number.isNaN(sunrise.getTime()) ||
            Number.isNaN(sunset.getTime())
        ) {
            const dayProgress =
                (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
            return interpolateColor(stops, dayProgress);
        }

        const rise = new Date(sunrise);
        const set = new Date(sunset);
        const totalDay = set - rise;
        const elapsed = now - rise;
        const progress = totalDay > 0 ? clamp(elapsed / totalDay, 0, 1) : 0.5;

        if (now < rise || now > set) {
            const midnight = new Date(now);
            midnight.setHours(0, 0, 0, 0);
            const nightProgress = (now - midnight) / (24 * 60 * 60 * 1000);
            return nightProgress < 0.5
                ? interpolateColor(stops, nightProgress * 0.2)
                : interpolateColor(stops, 0.8 + nightProgress * 0.2);
        }

        return interpolateColor(stops, 0.2 + progress * 0.6);
    }

    function rgbTupleToString(rgb) {
        return "rgb(" + rgb[0] + ", " + rgb[1] + ", " + rgb[2] + ")";
    }

    function mixRgb(a, b, t) {
        return [
            lerp(a[0], b[0], t),
            lerp(a[1], b[1], t),
            lerp(a[2], b[2], t),
        ];
    }

    function softTextPalette(bgRgb) {
        const luminance =
            0.2126 * bgRgb[0] + 0.7152 * bgRgb[1] + 0.0722 * bgRgb[2];
        if (luminance > 150) {
            const text = mixRgb(bgRgb, [18, 22, 30], 0.82);
            return {
                text,
                muted: mixRgb(text, bgRgb, 0.35),
                border: mixRgb(text, bgRgb, 0.42),
                tooltipBg: mixRgb(bgRgb, [255, 255, 255], 0.08),
                colorScheme: "light",
            };
        }

        const text = mixRgb(bgRgb, [245, 248, 252], 0.84);
        return {
            text,
            muted: mixRgb(text, bgRgb, 0.3),
            border: mixRgb(text, bgRgb, 0.4),
            tooltipBg: mixRgb(bgRgb, [0, 0, 0], 0.18),
            colorScheme: "dark",
        };
    }

    function applyLocalColor(rgb) {
        const root = document.documentElement;
        const palette = softTextPalette(rgb);
        const bg = rgbTupleToString(rgb);
        const text = rgbTupleToString(palette.text);
        root.style.setProperty("--bg", bg);
        root.style.setProperty("--text", text);
        root.style.setProperty("--muted", rgbTupleToString(palette.muted));
        root.style.setProperty("--border", rgbTupleToString(palette.border));
        root.style.setProperty("--tooltip-bg", rgbTupleToString(palette.tooltipBg));
        root.style.setProperty("--tooltip-text", text);
        root.style.setProperty("color-scheme", palette.colorScheme);
    }

    function clearLocalColor() {
        const root = document.documentElement;
        root.style.removeProperty("--bg");
        root.style.removeProperty("--text");
        root.style.removeProperty("--muted");
        root.style.removeProperty("--border");
        root.style.removeProperty("--tooltip-bg");
        root.style.removeProperty("--tooltip-text");
        root.style.removeProperty("color-scheme");
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        if (theme !== "local") {
            clearLocalColor();
        }
    }

    function binEndpoint() {
        return "https://api.jsonbin.io/v3/b/" + BIN_ID + "/latest";
    }

    function parseLocationPayload(payload) {
        const record =
            payload && typeof payload === "object" && payload.record
                ? payload.record
                : payload;
        if (!record || typeof record !== "object") {
            return null;
        }

        const lat = Number(record.lat ?? record.latitude);
        const lon = Number(record.lon ?? record.longitude ?? record.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return null;
        }

        const city =
            typeof record.city === "string" && record.city.trim().length > 0
                ? record.city.trim()
                : lat.toFixed(3) + ", " + lon.toFixed(3);

        return { lat, lon, city };
    }

    async function fetchLiveLocation() {
        const response = await fetch(binEndpoint(), { cache: "no-store" });
        if (!response.ok) {
            throw new Error("Location fetch failed: " + response.status);
        }

        const payload = await response.json();
        const location = parseLocationPayload(payload);
        if (!location) {
            throw new Error("Location payload missing lat/lon");
        }
        return location;
    }

    function updateControlButton() {
        const button = document.querySelector(".theme-cycle");
        if (!button) {
            return;
        }

        const mode = MODE_META[selectedChoice] || MODE_META[DEFAULT_CHOICE];
        let title = mode.title;

        if (selectedChoice === "local") {
            if (!lastKnownLocation) {
                title += " (location unavailable)";
            } else {
                title +=
                    " - " +
                    lastKnownLocation.city +
                    " (" +
                    (lastFetchWasLive ? "live" : "cached") +
                    ")";
            }
        }

        button.textContent = mode.symbol;
        button.title = title;
        button.setAttribute("aria-label", title);
    }

    async function refreshLocalTheme() {
        applyTheme("local");

        try {
            const liveLocation = await fetchLiveLocation();
            lastKnownLocation = liveLocation;
            lastFetchWasLive = true;
        } catch (_error) {
            lastFetchWasLive = false;
        }

        if (!lastKnownLocation) {
            const fallbackColor = getSkyColor(null, null, new Date());
            applyLocalColor(fallbackColor);
            updateControlButton();
            return;
        }

        const now = new Date();
        const sunTimes = getSunTimes(
            lastKnownLocation.lat,
            lastKnownLocation.lon,
            now,
        );
        const skyColor = getSkyColor(sunTimes.sunrise, sunTimes.sunset, now);
        applyLocalColor(skyColor);
        updateControlButton();
    }

    async function refreshTheme() {
        const choice = selectedChoice;
        if (choice === "local") {
            await refreshLocalTheme();
            return;
        }

        applyTheme(choice);
        updateControlButton();
    }

    function startRefreshTimer() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
        }
        refreshTimer = setInterval(refreshTheme, UPDATE_MS);
    }

    function createControl() {
        if (document.querySelector(".theme-control")) {
            return;
        }

        const container = document.createElement("div");
        container.className = "theme-control";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "theme-cycle";
        button.addEventListener("click", () => {
            selectedChoice = nextChoice(selectedChoice);
            saveChoice(selectedChoice);
            refreshTheme();
            updateControlButton();
        });
        container.appendChild(button);

        document.body.appendChild(container);
    }

    function init() {
        selectedChoice = readStoredChoice();
        applyTheme(selectedChoice);
        refreshTheme();
        startRefreshTimer();

        if (document.readyState === "loading") {
            document.addEventListener(
                "DOMContentLoaded",
                () => {
                    createControl();
                    updateControlButton();
                },
                { once: true },
            );
        } else {
            createControl();
            updateControlButton();
        }
    }

    init();
})();
