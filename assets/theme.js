(function () {
    const STORAGE_KEY = "theme-preference";
    const OPTIONS = ["white", "dark"];
    const DEFAULT_CHOICE = "white";
    const MODE_META = {
        white: { symbol: "☀", title: "White mode" },
        dark: { symbol: "☽", title: "Black mode" },
    };

    let selectedChoice = DEFAULT_CHOICE;

    function sanitizeChoice(value) {
        return OPTIONS.includes(value) ? value : DEFAULT_CHOICE;
    }

    function nextChoice(value) {
        const i = OPTIONS.indexOf(value);
        return OPTIONS[(i === -1 ? 0 : i + 1) % OPTIONS.length];
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

    function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
    }

    function updateControlButton() {
        const button = document.querySelector(".theme-cycle");
        if (!button) return;
        const mode = MODE_META[selectedChoice] || MODE_META[DEFAULT_CHOICE];
        button.textContent = mode.symbol;
        button.title = mode.title;
        button.setAttribute("aria-label", mode.title);
    }

    function refreshTheme() {
        applyTheme(selectedChoice);
        updateControlButton();
    }

    function createControl() {
        if (document.querySelector(".theme-control")) return;
        const container = document.createElement("div");
        container.className = "theme-control";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "theme-cycle";
        button.addEventListener("click", () => {
            selectedChoice = nextChoice(selectedChoice);
            saveChoice(selectedChoice);
            refreshTheme();
        });
        container.appendChild(button);
        document.body.appendChild(container);
    }

    function init() {
        selectedChoice = readStoredChoice();
        applyTheme(selectedChoice);
        refreshTheme();

        if (document.readyState === "loading") {
            document.addEventListener(
                "DOMContentLoaded",
                () => { createControl(); updateControlButton(); },
                { once: true },
            );
        } else {
            createControl();
            updateControlButton();
        }
    }

    init();
})();
