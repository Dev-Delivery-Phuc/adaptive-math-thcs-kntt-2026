# -*- coding: utf-8 -*-
"""Parse the LaTeX question banks into JSON records."""
import re, os, collections, json, sys

BASE = os.path.dirname(os.path.abspath(__file__))
EX = os.path.join(BASE, 'extract')

# ---------------------------------------------------------------- whitelist --
# Macros seen in the clean corpora (lop10/lop12/thucte/kntt) are legitimate;
# everything else that looks like \xxxx lowercase in lop11 is watermark noise.
macro_pat = re.compile(r'\\([a-zA-Z]+)')

def collect_whitelist():
    wl = collections.Counter()
    for root, dirs, files in os.walk(EX):
        if os.sep + 'lop11' + os.sep in root + os.sep:
            continue
        for f in files:
            if f.endswith('.tex'):
                txt = open(os.path.join(root, f), encoding='utf-8', errors='replace').read()
                for m in macro_pat.finditer(txt):
                    wl[m.group(1)] += 1
    return set(wl)

EXTRA_OK = set('''sin cos tan cot log ln exp lim max min sup inf arg det dim ker gcd Pr deg hom sec csc
frac dfrac tfrac sqrt cdot cdots ldots dots vdots ddots times div pm mp leq geq neq equiv approx sim simeq
subset supset subseteq supseteq cup cap setminus emptyset varnothing in notin ni forall exists nexists
infty partial nabla angle triangle perp parallel cong propto Rightarrow Leftarrow Leftrightarrow leftarrow
rightarrow leftrightarrow mapsto longrightarrow Longrightarrow Longleftrightarrow uparrow downarrow
alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho
varrho sigma varsigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon
Phi Psi Omega mathbb mathcal mathrm mathbf mathit mathsf mathtt text textbf textit underline overline
overrightarrow overleftarrow widehat widetilde hat tilde bar vec dot ddot left right big Big bigg Bigg
begin end item label ref cite footnote textwidth linewidth hline cline multicolumn multirow
quad qquad hspace vspace centering center itemize enumerate limits nolimits displaystyle
choice choiceTF True False loigiai shortans immini ex bt heva hoac vv R Q Z N C
lq rq textquoteleft textquoteright dai emph mbox fbox boxed overbrace underbrace binom
Leftrightarrow Longleftarrow searrow nearrow swarrow nwarrow circ bullet ast star oplus ominus otimes
langle rangle lfloor rfloor lceil rceil vert Vert colon because therefore measuredangle
sum prod int oint iint iiint bigcup bigcap bigvee bigwedge nmid mid nparallel varparallel
overset underset stackrel xrightarrow xleftarrow substack pmod bmod mod
tikzpicture draw path node coordinate fill filldraw clip scope foreach def edef pgfmathsetmacro
tkzTabInit tkzTabLine tkzTabVar tkzTabIma tkzTabVal shadedraw pattern
arraycolsep tabcolsep renewcommand newcommand ensuremath allowbreak
mathscr mathfrak mathop leqslant geqslant arcsin arccos arctan sinh cosh tanh coth
operatorname lVert rVert nsubseteq subsetneq iint Updownarrow Downarrow Uparrow
'''.split())

# ------------------------------------------------------------------- helpers --
def read_balanced(s, i):
    """s[i] == '{' -> (content, index_after_closing)"""
    assert s[i] == '{', (i, s[max(0,i-30):i+10])
    depth = 0
    j = i
    while j < len(s):
        c = s[j]
        if c == '\\':
            j += 2
            continue
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return s[i+1:j], j+1
        j += 1
    raise ValueError('unbalanced')

def skip_ws(s, i):
    while i < len(s) and s[i] in ' \t\r\n':
        i += 1
    return i

def strip_comments(s):
    # remove % comments (not \%)
    out = []
    for line in s.split('\n'):
        j = 0
        while True:
            k = line.find('%', j)
            if k == -1:
                out.append(line)
                break
            # count preceding backslashes
            b = 0
            t = k - 1
            while t >= 0 and line[t] == '\\':
                b += 1; t -= 1
            if b % 2 == 1:
                j = k + 1
                continue
            out.append(line[:k])
            break
    return '\n'.join(out)

WHITELIST = collect_whitelist() | EXTRA_OK

junk_re = re.compile(r'\\([a-zA-Z]+)([ \t]*)')
def strip_junk(s):
    def repl(m):
        name = m.group(1)
        if name in WHITELIST or len(name) > 8:
            # long names are never watermark noise — the junk is 3-6 letters
            return m.group(0)
        # unknown macro: drop it (watermark noise)
        return ' '
    return junk_re.sub(repl, s)

env_re = re.compile(r'\\begin\{(ex|bt)\}(%?\s*)')
code_re = re.compile(r'^\s*%\s*\[([^\]]{1,40})\]')

def extract_envs(txt, envname):
    """Yield (code, body) for each \begin{env}...\end{env}."""
    res = []
    begin = '\\begin{%s}' % envname
    end = '\\end{%s}' % envname
    i = 0
    while True:
        i = txt.find(begin, i)
        if i == -1:
            break
        j = txt.find(end, i)
        if j == -1:
            break
        body = txt[i+len(begin):j]
        # code comment right after \begin{ex}
        m = re.match(r'\s*%\[([^\]]{1,40})\]', body)
        code = m.group(1).strip() if m else None
        res.append((code, body))
        i = j + len(end)
    return res

def parse_choice_groups(s, i):
    """Parse consecutive {...} groups starting at/after i; returns (groups, end)."""
    groups = []
    while True:
        i = skip_ws(s, i)
        if i < len(s) and s[i] == '[':
            # optional arg like [2]
            k = s.find(']', i)
            if k == -1: break
            i = k + 1
            continue
        if i < len(s) and s[i] == '{':
            g, i = read_balanced(s, i)
            groups.append(g)
            continue
        break
    return groups, i

CMD_SPLIT = re.compile(r'\\(choiceTFt|choiceTF|choice|shortans|loigiai)\b')

def clean_text(s):
    s = s.strip()
    # collapse whitespace but keep \\ line breaks
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'\n[ \t]*', '\n', s)
    s = re.sub(r'\n{2,}', '\n', s)
    s = s.replace('\n', ' ')
    s = re.sub(r'\s{2,}', ' ', s)
    return s.strip()

def parse_body(body, is_lop11):
    """Return dict with prompt/type/options/statements/answer/solution/flags."""
    body = strip_comments(body)
    if is_lop11:
        body = strip_junk(body)

    flags = {
        'tikz': 'tikzpicture' in body or 'includegraphics' in body,
        'immini': 'immini' in body,
        'table': ('begin{tabular' in body) or ('begin{longtable' in body) or ('tkzTab' in body),
    }

    # find command positions
    q = {'solution': None, 'type': None, 'options': None,
         'statements': None, 'answer': None}
    m = CMD_SPLIT.search(body)
    prompt = body[:m.start()] if m else body
    rest_cmds = []
    pos = m.start() if m else len(body)
    while m:
        cmd = m.group(1)
        i = m.end()
        if cmd in ('choice', 'choiceTF', 'choiceTFt'):
            groups, i = parse_choice_groups(body, i)
            rest_cmds.append((cmd, groups))
        else:
            i = skip_ws(body, i)
            if i < len(body) and body[i] == '[':
                k = body.find(']', i)
                i = k + 1 if k != -1 else i
                i = skip_ws(body, i)
            if i < len(body) and body[i] == '{':
                g, i = read_balanced(body, i)
            else:
                g = ''
            rest_cmds.append((cmd, g))
        m = CMD_SPLIT.search(body, i)
        if m and m.start() < i:
            break
    for cmd, val in rest_cmds:
        if cmd == 'choice':
            q['type'] = 'mcq'
            q['options'] = val
        elif cmd in ('choiceTF', 'choiceTFt'):
            q['type'] = 'tf'
            q['statements'] = val
        elif cmd == 'shortans':
            q['type'] = 'shortans'
            q['answer'] = val
        elif cmd == 'loigiai':
            q['solution'] = val
    if q['type'] is None:
        q['type'] = 'essay'
    q['prompt'] = clean_text(prompt)
    if q['solution']:
        q['solution'] = clean_text(q['solution'])
    q['flags'] = flags
    return q

CODE_RE = re.compile(r'^([0-9])([DH])([0-9])([NHVCTB])([0-9]{1,2})-([0-9]{1,2})$')

def parse_code(code):
    if not code:
        return None
    m = CODE_RE.match(code.strip())
    if not m:
        return None
    g, subj, chap, lvl, bai, dang = m.groups()
    if lvl == 'B':   # some files use 0D1B1-2 (no level)
        lvl = None
    return {'grade': int(g), 'subj': subj, 'chap': int(chap),
            'level': lvl, 'bai': int(bai), 'dang': int(dang)}

def main():
    records = []
    for root, dirs, files in os.walk(EX):
        for f in sorted(files):
            if not f.endswith('.tex'):
                continue
            fp = os.path.join(root, f)
            rel = os.path.relpath(fp, EX).replace('\\', '/')
            if rel.startswith('kntt/'):
                continue  # already in the site's bank
            is_lop11 = rel.startswith('lop11/')
            txt = open(fp, encoding='utf-8', errors='replace').read()
            for envname in ('ex', 'bt'):
                for code, body in extract_envs(txt, envname):
                    try:
                        q = parse_body(body, is_lop11)
                    except Exception as e:
                        continue
                    q['code'] = code
                    q['meta'] = parse_code(code)
                    q['file'] = rel
                    q['env'] = envname
                    records.append(q)
    with open(os.path.join(BASE, 'parsed.json'), 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False)
    # summary
    cnt = collections.Counter()
    for r in records:
        m = r['meta']
        key = ('%d%s%d-b%d' % (m['grade'], m['subj'], m['chap'], m['bai'])) if m else 'nocode'
        cnt[(key, r['type'])] += 1
    for k in sorted(cnt):
        print(k, cnt[k])
    print('total', len(records))

if __name__ == '__main__':
    main()
