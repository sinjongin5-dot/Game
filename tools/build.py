#!/usr/bin/env python3
"""Rebuild gearheart_stage_03_1.html from the files in src/.

Each src/<name>.js replaces the text between /*@NAME_BEGIN*/ and /*@NAME_END*/
markers inside the game file (the game stays a single self-contained HTML).
"""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html_path = root / 'gearheart_stage_03_1.html'
html = html_path.read_text(encoding='utf8')
for src in sorted((root / 'src').glob('*.js')):
    tag = src.stem.upper()
    pat = re.compile(r'(/\*@%s_BEGIN\*/\n).*?(/\*@%s_END\*/)' % (tag, tag), re.S)
    if not pat.search(html):
        print('skip (no markers):', src.name); continue
    body = src.read_text(encoding='utf8')
    if not body.endswith('\n'): body += '\n'
    html = pat.sub(lambda m: m.group(1) + body + m.group(2), html, count=1)
    print('injected', src.name, len(body), 'bytes')
html_path.write_text(html, encoding='utf8')
