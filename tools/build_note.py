"""Build notes/<name>.md.html from a plain-Markdown draft, optionally watching for changes.

The draft's first non-empty line is the title; everything after it is the body.

    python3 tools/build_note.py notes/<name>.md             # build once
    python3 tools/build_note.py notes/<name>.md --watch     # rebuild on every save
"""

import datetime
import html
import pathlib
import re
import sys
import time

TEMPLATE = """<meta charset="utf-8">
<link rel="stylesheet" href="../assets/theme.css">
<script src="../assets/theme.js"></script>
<script src="../assets/sidenotes.js"></script>

<style>
.md h1:before, .md h2:before, .md h3:before, .md h4:before, .md h5:before, .md h6:before {{ content: none; }}

.note-title {{
    font-size: 2em;
    font-weight: normal;
    margin-bottom: 0.3em;
    text-align: center;
}}

.note-date {{
    text-align: center;
    color: var(--muted);
    font-size: 0.9em;
    margin-bottom: 3em;
}}

.note-content {{
    color: var(--text);
}}

.note-content p {{
    margin-bottom: 1.5em;
}}
</style>

{nav}{toc}<article>

<div class="note-title">{title}</div>
{date}

<div class="note-content">

{body}

</div>

</article>

<script>
window.markdeepOptions = {{
    tocStyle: 'none'
}};
</script>

<!-- Markdeep: -->
<style class="fallback">body{{visibility:hidden;white-space:pre;font-family:monospace}}</style>
<script src="markdeep.min.js" charset="utf-8"></script>
<script src="https://morgan3d.github.io/markdeep/latest/markdeep.min.js" charset="utf-8"></script>
<script>window.alreadyProcessedMarkdeep||(document.body.style.visibility="visible")</script>
"""


NAV_LINKS = [("about", "index.html"), ("writings", "writings.md.html"),
             ("readings", "notes/readings.md.html"),
             ("links", "notes/links.md.html")]


def site_nav(current: str) -> str:
    """Top navigation bar for a page one directory below the site root."""
    links = "".join(f'<a href="../{href}"' + (' aria-current="page"' if name == current else "") + f">{name}</a>"
                    for name, href in NAV_LINKS)
    return f'<nav class="site-nav" aria-label="Site">{links}</nav>\n\n'


NAV = {"field-notes": site_nav("field-notes")}
NAV_DEFAULT = site_nav("writings")


HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")


def drop_empty_headings(lines):
    """Remove headings with nothing under them before the next heading of the same or higher level."""
    fenced, level = False, []
    for line in lines:
        if line.lstrip().startswith(("```", "~~~")):
            fenced = not fenced
        match = None if fenced else HEADING.match(line)
        level.append(len(match.group(1)) if match else 0)
    keep, seen = [True] * len(lines), [False] * 7
    for i in range(len(lines) - 1, -1, -1):
        if level[i]:
            keep[i] = seen[level[i]]
            seen = [k < level[i] and (seen[k] or keep[i]) for k in range(7)]
        elif lines[i].strip():
            seen = [True] * 7
    return [line for line, k in zip(lines, keep) if k]


def sections(lines):
    """Give each #, ## and ### heading an id anchor, returning the new lines and the Sections nav."""
    out, links, seen, fenced = [], [], set(), False
    for line in drop_empty_headings(lines):
        if line.lstrip().startswith(("```", "~~~")):
            fenced = not fenced
        match = None if fenced else HEADING.match(line)
        if not match or len(match.group(1)) > 3:
            out.append(line)
            continue
        hashes, text = match.groups()
        slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "section"
        while slug in seen:
            slug += "-"
        seen.add(slug)
        out.append(f'{hashes} <a class="anchor" id="{slug}"></a>{text}')
        links.append(f'<a class="toc-h{len(hashes)}" href="#{slug}"><span class="tick"></span>'
                     f'<span class="label">{html.escape(text)}</span></a>')
    if len(links) < 2:
        return out, ""
    nav = '<nav class="toc" aria-label="Sections"><div class="toc-title">Sections</div>' + "".join(links) + "</nav>\n\n"
    return out, nav


def build(src: pathlib.Path) -> pathlib.Path:
    """Render ``src`` into a sibling ``.md.html`` page and return its path."""
    lines = src.read_text(encoding="utf-8").strip().splitlines()
    title = lines[0].strip().lstrip("#").strip() if lines else "Untitled"
    body_lines, toc = sections(lines[1:])
    body = "\n".join(body_lines).strip()
    date = "" if src.parent.name == "field-notes" else (
        f'<div class="note-date">{datetime.date.fromtimestamp(src.stat().st_mtime):%B %-d, %Y}</div>')
    out = src.with_suffix(".md.html")
    out.write_text(TEMPLATE.format(title=html.escape(title), date=date, body=body, toc=toc, nav=NAV.get(src.parent.name, NAV_DEFAULT)), encoding="utf-8")
    return out


def main() -> None:
    src = pathlib.Path(sys.argv[1])
    watch = "--watch" in sys.argv[2:]
    last = None
    while True:
        mtime = src.stat().st_mtime
        if mtime != last:
            last = mtime
            print(f"{time.strftime('%H:%M:%S')} built {build(src)}", flush=True)
        if not watch:
            return
        time.sleep(0.5)


if __name__ == "__main__":
    main()
