(function () {
    "use strict";

    var ROOT = (function () {
        var s = document.currentScript;
        if (s && s.src) return s.src.replace(/assets\/theme\.js.*$/, "");
        return "/";
    })();


    var NAV = {
        KeyW: "writings.md.html",
        KeyF: "field-notes/field-notes.md.html",
        KeyB: "notes/readings.md.html",
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


    document.addEventListener("keydown", onKeydown);
})();
