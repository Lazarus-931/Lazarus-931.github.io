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

    function solarAltitudeDegrees(lat, lon, date) {
        const rad = Math.PI / 180;
        const dayStart = Date.UTC(date.getUTCFullYear(), 0, 0);
        const dayNumber = Math.floor((date.getTime() - dayStart) / 86400000);
        const utcHour =
            date.getUTCHours() +
            date.getUTCMinutes() / 60 +
            date.getUTCSeconds() / 3600;

        const gamma =
            ((2 * Math.PI) / 365) * (dayNumber - 1 + (utcHour - 12) / 24);
        const declination =
            0.006918 -
            0.399912 * Math.cos(gamma) +
            0.070257 * Math.sin(gamma) -
            0.006758 * Math.cos(2 * gamma) +
            0.000907 * Math.sin(2 * gamma) -
            0.002697 * Math.cos(3 * gamma) +
            0.00148 * Math.sin(3 * gamma);
        const equationOfTime =
            229.18 *
            (0.000075 +
                0.001868 * Math.cos(gamma) -
                0.032077 * Math.sin(gamma) -
                0.014615 * Math.cos(2 * gamma) -
                0.040849 * Math.sin(2 * gamma));

        const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
        const trueSolarMinutes =
            (minutes + equationOfTime + 4 * lon + 1440) % 1440;
        const hourAngle = trueSolarMinutes / 4 - 180;

        const latRad = lat * rad;
        const hourAngleRad = hourAngle * rad;
        const cosZenith =
            Math.sin(latRad) * Math.sin(declination) +
            Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngleRad);

        const zenith = Math.acos(clamp(cosZenith, -1, 1));
        return 90 - zenith / rad;
    }

    function estimateElevationWithoutLocation(now) {
        const minutes = now.getHours() * 60 + now.getMinutes();
        const phase = (minutes / (24 * 60)) * 2 * Math.PI - Math.PI / 2;
        return 55 * Math.sin(phase);
    }

    function lerp(a, b, t) {
        return Math.round(a + (b - a) * t);
    }

    function elevationToKelvin(elevation) {
        const daylightProgress = clamp((elevation + 6) / 66, 0, 1);
        return lerp(1800, 6500, daylightProgress);
    }

    function kelvinToRgb(kelvin) {
        const temp = clamp(kelvin, 1000, 40000) / 100;
        let red;
        let green;
        let blue;

        if (temp <= 66) {
            red = 255;
            green = 99.4708025861 * Math.log(temp) - 161.1195681661;
            if (temp <= 19) {
                blue = 0;
            } else {
                blue = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
            }
        } else {
            red = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
            green = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
            blue = 255;
        }

        return [
            clamp(Math.round(red), 0, 255),
            clamp(Math.round(green), 0, 255),
            clamp(Math.round(blue), 0, 255),
        ];
    }

    function skyColorFromElevation(elevation) {
        const kelvin = elevationToKelvin(elevation);
        const kelvinRgb = kelvinToRgb(kelvin);
        if (elevation >= 0) {
            return kelvinRgb;
        }

        const nightDepth = clamp(-elevation / 24, 0, 1);
        return mixRgb(kelvinRgb, [12, 18, 44], 0.88 * nightDepth);
    }

    function skyGradientFromColor(baseRgb, elevation) {
        let top = mixRgb(baseRgb, [255, 255, 255], 0.2);
        let bottom = mixRgb(baseRgb, [0, 0, 0], 0.24);

        if (elevation < -2) {
            top = mixRgb(top, [26, 32, 62], 0.38);
            bottom = mixRgb(bottom, [6, 8, 20], 0.55);
        }

        return (
            "linear-gradient(180deg, " +
            rgbTupleToString(top) +
            " 0%, " +
            rgbTupleToString(baseRgb) +
            " 54%, " +
            rgbTupleToString(bottom) +
            " 100%)"
        );
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

    function applyLocalColor(rgb, elevation) {
        const root = document.documentElement;
        const palette = softTextPalette(rgb);
        const text = rgbTupleToString(palette.text);
        root.style.setProperty("--bg", skyGradientFromColor(rgb, elevation));
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
        const now = new Date();

        try {
            const liveLocation = await fetchLiveLocation();
            lastKnownLocation = liveLocation;
            lastFetchWasLive = true;
        } catch (_error) {
            lastFetchWasLive = false;
        }

        if (!lastKnownLocation) {
            const fallbackElevation = estimateElevationWithoutLocation(now);
            const fallbackColor = skyColorFromElevation(fallbackElevation);
            applyLocalColor(fallbackColor, fallbackElevation);
            updateControlButton();
            return;
        }

        const elevation = solarAltitudeDegrees(
            lastKnownLocation.lat,
            lastKnownLocation.lon,
            now,
        );
        const skyColor = skyColorFromElevation(elevation);
        applyLocalColor(skyColor, elevation);
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
