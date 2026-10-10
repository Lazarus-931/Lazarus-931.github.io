(function () {
    "use strict";

    var ROOT = (function () {
        var s = document.currentScript;
        if (s && s.src) return s.src.replace(/assets\/theme\.js.*$/, "");
        return "/";
    })();


    var STAR_AREA = 9000;

    function mulberry32(seed) {
        return function () {
            seed |= 0;
            seed = (seed + 0x6d2b79f5) | 0;
            var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    var canvas, ctx;

    function makeCanvas() {
        canvas = document.createElement("canvas");
        canvas.setAttribute("aria-hidden", "true");
        var s = canvas.style;
        s.position = "fixed";
        s.top = "0";
        s.left = "0";
        s.width = "100%";
        s.height = "100%";
        s.zIndex = "-1";
        s.pointerEvents = "none";
        s.display = "block";
        document.documentElement.appendChild(canvas);
        ctx = canvas.getContext("2d");
    }

    function drawStars() {
        if (!ctx) return;

        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = window.innerWidth;
        var h = window.innerHeight;

        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        var rand = mulberry32(0x5eed1);
        var count = Math.round((w * h) / STAR_AREA);

        for (var i = 0; i < count; i++) {
            var x = rand() * w;
            var y = rand() * h;

            var size = rand();
            var r = 0.35 + size * size * size * 1.15;
            var alpha = 0.22 + size * size * 0.62;

            var tint = rand();
            var rgb = tint > 0.93 ? "190,205,225" : tint < 0.05 ? "225,210,190" : "216,216,214";

            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(" + rgb + "," + alpha.toFixed(3) + ")";
            ctx.fill();
        }
    }

    var resizeTimer;
    function onResize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(drawStars, 150);
    }


    var NAV = {
        KeyB: "blog.md.html",
        KeyR: "notes/readings.md.html",
        KeyL: "notes/links.md.html",
        KeyH: "index.html"
    };

    function isTyping(t) {
        return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    }

    function onKeydown(e) {
        if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.shiftKey || e.key === "Shift") return;
        if (!NAV[e.code]) return;
        e.preventDefault();
        window.location.href = ROOT + NAV[e.code];
    }


    makeCanvas();
    drawStars();
    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKeydown);
})();
