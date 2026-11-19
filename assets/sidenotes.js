(function () {
    "use strict";

    var MIN_MEASURE = 480;
    var GAP = 12;

    var article, notes = [];

    function collect() {
        article = document.querySelector("article");
        if (!article) return false;

        var bodies = {};
        var originals = article.querySelectorAll("div.endnote");
        Array.prototype.forEach.call(originals, function (div) {
            var anchor = div.querySelector("a.target[name^='endnote-']");
            if (!anchor) return;
            var clone = div.cloneNode(true);
            var a = clone.querySelector("a.target");
            if (a) a.parentNode.removeChild(a);
            var sup = clone.querySelector("sup");
            if (sup) sup.parentNode.removeChild(sup);
            bodies[anchor.getAttribute("name")] = {
                html: clone.innerHTML.trim(),
                original: div
            };
        });

        var refs = article.querySelectorAll("sup > a[href^='#endnote-']");
        if (!refs.length) return false;

        Array.prototype.forEach.call(refs, function (ref) {
            var note = bodies[ref.getAttribute("href").slice(1)];
            if (!note) return;

            var aside = document.createElement("aside");
            aside.className = "sidenote";
            aside.innerHTML = "<sup>" + ref.textContent + "</sup>" + note.html;
            article.appendChild(aside);

            note.original.classList.add("is-relocated");

            function on() { aside.classList.add("is-active"); }
            function off() { aside.classList.remove("is-active"); }
            ref.addEventListener("mouseenter", on);
            ref.addEventListener("mouseleave", off);
            aside.addEventListener("mouseenter", on);
            aside.addEventListener("mouseleave", off);
            aside.addEventListener("click", function (e) {
                if (e.target.closest("a, button")) return;
                aside.classList.toggle("is-collapsed");
                layout();
            });

            notes.push({ ref: ref, aside: aside, original: note.original });
        });

        return notes.length > 0;
    }

    function layout() {
        if (!article || !notes.length) return;

        var root = getComputedStyle(document.documentElement);
        var pad = parseFloat(root.getPropertyValue("--pad"));
        var gutter = parseFloat(root.getPropertyValue("--gutter"));
        var side = parseFloat(root.getPropertyValue("--sidenote-w"));
        var room = document.documentElement.clientWidth - 2 * pad - gutter - side;
        var measure = Math.min(parseFloat(root.getPropertyValue("--measure")), room);

        if (measure < MIN_MEASURE) {
            article.classList.remove("has-sidenotes");
            article.style.removeProperty("--measure");
            article.style.removeProperty("--page");
            notes.forEach(function (n) {
                n.original.classList.remove("is-relocated");
                n.aside.style.top = "";
            });
            return;
        }

        article.style.setProperty("--measure", measure + "px");
        article.style.setProperty("--page", measure + gutter + side + 2 * pad + "px");
        article.classList.add("has-sidenotes");
        notes.forEach(function (n) { n.original.classList.add("is-relocated"); });

        var base = article.getBoundingClientRect().top + window.pageYOffset;
        var cursor = 0;

        notes.forEach(function (n) {
            var wanted = n.ref.getBoundingClientRect().top + window.pageYOffset - base;
            var top = Math.max(wanted, cursor);
            n.aside.style.top = top + "px";
            cursor = top + n.aside.offsetHeight + GAP;
        });
    }

    var timer;
    function relayout() {
        clearTimeout(timer);
        timer = setTimeout(layout, 120);
    }

    function start() {
        if (!collect()) return;
        layout();
        window.addEventListener("resize", relayout);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
        window.addEventListener("load", relayout);
        afterMath(layout);
        if (window.ResizeObserver) {
            var observer = new ResizeObserver(relayout);
            observer.observe(article);
            notes.forEach(function (n) { observer.observe(n.aside); });
        }
    }

    function afterMath(fn) {
        var tries = 0;
        (function wait() {
            var startup = window.MathJax && window.MathJax.startup;
            if (startup && startup.promise) startup.promise.then(fn);
            else if (++tries < 100) setTimeout(wait, 100);
        })();
    }

    function whenReady(fn) {
        if (document.querySelector("div.md")) return fn();
        var tries = 0;
        var poll = setInterval(function () {
            if (document.querySelector("div.md") || ++tries > 100) {
                clearInterval(poll);
                fn();
            }
        }, 50);
    }

    whenReady(start);
})();
