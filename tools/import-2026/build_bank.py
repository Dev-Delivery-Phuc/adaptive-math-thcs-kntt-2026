# -*- coding: utf-8 -*-
"""Build data/questions.js: existing bank + curated questions from the new
LaTeX archives (DaKiemTraToan10, HoanThanh_Lop11, DuLieuLop12, ToanThucTe)."""
import json, os, re, collections, datetime

BASE = os.path.dirname(os.path.abspath(__file__))
SITE = r'C:\Users\laptop\Documents\đề án\adaptivemath-main'

# ---------------------------------------------------------------- mapping ----
# (grade, subj, chap, bai) -> KNTT topic id.  Codes follow the CTST/community
# chapter numbering; verified against content samples.
M = {}
def m(prefix, bai, topic):
    g, subj, chap = int(prefix[0]), prefix[1], int(prefix[2])
    M[(g, subj, chap, bai)] = topic

# --- grade 10
m('0D1', 1, '0-KNTT-C1B1-X'); m('0D1', 2, '0-KNTT-C1B2-X'); m('0D1', 3, '0-KNTT-C1B2-X')
m('0D2', 1, '0-KNTT-C2B3-X'); m('0D2', 2, '0-KNTT-C2B4-X')
m('0D3', 1, '0-KNTT-C6B15-X'); m('0D3', 2, '0-KNTT-C6B16-X')
m('0D6', 1, '0-KNTT-C5B12-X'); m('0D6', 2, '0-KNTT-C5B13-X')
m('0D6', 3, '0-KNTT-C5B13-X'); m('0D6', 4, '0-KNTT-C5B14-X')
m('0D7', 1, '0-KNTT-C6B17-X'); m('0D7', 2, '0-KNTT-C6B17-X'); m('0D7', 3, '0-KNTT-C6B18-X')
m('0D8', 1, '0-KNTT-C8B23-X'); m('0D8', 2, '0-KNTT-C8B24-X'); m('0D8', 3, '0-KNTT-C8B25-X')
m('0D0', 1, '0-KNTT-C9B26-X'); m('0D0', 2, '0-KNTT-C9B27-X')
m('0H4', 1, '0-KNTT-C3B5-X'); m('0H4', 2, '0-KNTT-C3B6-X'); m('0H4', 3, '0-KNTT-C3B6-X')
m('0H5', 1, '0-KNTT-C4B7-X'); m('0H5', 2, '0-KNTT-C4B8-X')
m('0H5', 3, '0-KNTT-C4B9-X'); m('0H5', 4, '0-KNTT-C4B11-X')
m('0H9', 1, '0-KNTT-C4B10-X'); m('0H9', 2, '0-KNTT-C4B10-X')
m('0H9', 3, '0-KNTT-C7B19-X'); m('0H9', 4, '0-KNTT-C7B21-X'); m('0H9', 5, '0-KNTT-C7B22-X')
# --- grade 11
m('1D1', 1, '1-KNTT-C1B1-X'); m('1D1', 2, '1-KNTT-C1B1-X'); m('1D1', 3, '1-KNTT-C1B2-X')
m('1D1', 4, '1-KNTT-C1B3-X'); m('1D1', 5, '1-KNTT-C1B4-X'); m('1D1', 6, '1-KNTT-C1B3-X')
m('1D2', 1, '1-KNTT-C2B5-X'); m('1D2', 2, '1-KNTT-C2B6-X'); m('1D2', 3, '1-KNTT-C2B7-X')
m('1D3', 1, '1-KNTT-C5B15-X'); m('1D3', 2, '1-KNTT-C5B16-X'); m('1D3', 3, '1-KNTT-C5B17-X')
m('1D5', 1, '1-KNTT-C3B8-X'); m('1D5', 2, '1-KNTT-C3B9-X')
m('1D6', 1, '1-KNTT-C6B18-X'); m('1D6', 2, '1-KNTT-C6B19-X')
m('1D6', 3, '1-KNTT-C6B20-X'); m('1D6', 4, '1-KNTT-C6B21-X'); m('1D6', 5, '1-KNTT-C6B21-X')
m('1D7', 1, '1-KNTT-C9B31-X'); m('1D7', 2, '1-KNTT-C9B32-X'); m('1D7', 3, '1-KNTT-C9B33-X')
m('1D9', 1, '1-KNTT-C8B28-X'); m('1D9', 2, '1-KNTT-C8B29-X')
m('1H4', 1, '1-KNTT-C4B10-X'); m('1H4', 2, '1-KNTT-C4B11-X'); m('1H4', 3, '1-KNTT-C4B12-X')
m('1H4', 4, '1-KNTT-C4B13-X'); m('1H4', 5, '1-KNTT-C4B14-X'); m('1H4', 6, '1-KNTT-C4B10-X')
m('1H8', 1, '1-KNTT-C7B22-X'); m('1H8', 2, '1-KNTT-C7B23-X'); m('1H8', 3, '1-KNTT-C7B25-X')
m('1H8', 4, '1-KNTT-C7B24-X'); m('1H8', 5, '1-KNTT-C7B26-X')
m('1H8', 6, '1-KNTT-C7B24-X'); m('1H8', 7, '1-KNTT-C7B27-X')
# --- grade 12
m('2D1', 1, '2-KNTT-C1B1-X'); m('2D1', 2, '2-KNTT-C1B1-X'); m('2D1', 3, '2-KNTT-C1B2-X')
m('2D1', 4, '2-KNTT-C1B3-X'); m('2D1', 5, '2-KNTT-C1B4-X')
m('2D3', 1, '2-KNTT-C3B9-X'); m('2D3', 2, '2-KNTT-C3B10-X')
m('2D4', 1, '2-KNTT-C4B11-X'); m('2D4', 2, '2-KNTT-C4B12-X'); m('2D4', 3, '2-KNTT-C4B13-X')
m('2D6', 1, '2-KNTT-C6B18-X'); m('2D6', 2, '2-KNTT-C6B19-X')
m('2H2', 1, '2-KNTT-C2B6-X'); m('2H2', 2, '2-KNTT-C2B7-X')
m('2H5', 1, '2-KNTT-C5B14-X'); m('2H5', 2, '2-KNTT-C5B15-X'); m('2H5', 3, '2-KNTT-C5B17-X')

SOURCE_BY_ARCHIVE = {
    'lop10': 'Ngân hàng đề kiểm tra Toán 10',
    'lop11': 'Ngân hàng câu hỏi Toán 11',
    'lop12': 'Ngân hàng câu hỏi Toán 12',
    'thucte': 'Toán thực tế 2026',
}

# --------------------------------------------------------------- cleanup -----
STRIP_ENVS = ['itemchoice', 'enumerate', 'itemize', 'tasks', 'multicols',
              'center', 'flushright', 'flushleft', 'note', 'enumEX', 'spacing']
ALLOWED_ENVS = {'tabular', 'longtable', 'array', 'cases', 'aligned', 'alignedat',
                'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix',
                'smallmatrix', 'gathered', 'split', 'rcases'}
BAD_TEXT_MACROS = re.compile(
    r'\\(draw|node|path|fill|shade|clip|pic|tcbox|khung|def|pgfmath|foreach|'
    r'tkzTab|includegraphics|coordinate|documentclass|usepackage|input|newcommand)\b')
FIG_WORDS = re.compile(
    r'hình vẽ|hình bên|như hình|hình dưới đây|hình sau|hình minh ho|xem hình|'
    r'đồ thị bên|(trong|ở) hình|hình trên|hình đã cho|biểu đồ (bên|dưới|sau|trên)|'
    r'bảng biến thiên', re.I)

def sub_balanced(s, cmd, opentag, closetag):
    """Replace \cmd{...} with opentag...closetag, handling nested braces."""
    out = []
    i = 0
    pat = '\\' + cmd
    while True:
        k = s.find(pat + '{', i)
        # ensure not a longer macro name
        if k == -1:
            out.append(s[i:])
            break
        out.append(s[i:k])
        j = k + len(pat)
        depth = 0
        start = j
        while j < len(s):
            if s[j] == '\\':
                j += 2
                continue
            if s[j] == '{':
                depth += 1
            elif s[j] == '}':
                depth -= 1
                if depth == 0:
                    break
            j += 1
        inner = s[start + 1:j]
        out.append(opentag + inner + closetag)
        i = j + 1
    return ''.join(out)

ITEM_LABELS = ['a)', 'b)', 'c)', 'd)', 'e)', 'f)', 'g)', 'h)', 'i)', 'j)', 'k)', 'l)']

def clean_text_segment(s):
    for env in STRIP_ENVS:
        s = re.sub(r'\\begin\{' + env + r'\}(\[[^\]]*\])?(\{[^}]*\})?', ' ', s)
        s = re.sub(r'\\end\{' + env + r'\}', ' ', s)
    # \itemch -> a) b) c) ... ; \item -> bullet
    cnt = {'i': 0}
    def itemch_repl(mm):
        lab = ITEM_LABELS[cnt['i']] if cnt['i'] < len(ITEM_LABELS) else '•'
        cnt['i'] += 1
        return '\\\\ ' + lab + ' '
    s = re.sub(r'\\itemch\b', itemch_repl, s)
    s = re.sub(r'\\item\b(\[[^\]]*\])?', r'\\\\ • ', s)
    s = sub_balanced(s, 'textbf', '<strong>', '</strong>')
    s = sub_balanced(s, 'textit', '<em>', '</em>')
    s = sub_balanced(s, 'emph', '<em>', '</em>')
    s = sub_balanced(s, 'underline', '<u>', '</u>')
    s = sub_balanced(s, 'textrm', '', '')
    s = sub_balanced(s, 'mbox', '', '')
    s = sub_balanced(s, 'circled', '', ') ')
    s = re.sub(r'\\color\{[^}]*\}', '', s)
    s = s.replace('\\lq\\lq', '“').replace('\\rq\\rq', '”')
    s = s.replace('\\lq', '‘').replace('\\rq', '’')
    s = re.sub(r'\\(allowdisplaybreaks|arraybackslash|centering|centerline|break\b|'
               r'hfill|noindent|indent|bfseries|itshape|smallskip|medskip|bigskip|'
               r'vfill|newpage|pagebreak|clearpage|footnotesize|small\b|large\b|Large\b|'
               r'displaystyle|limits|raggedright|onehalfspacing|singlespacing)', ' ', s)
    s = re.sub(r'\\(hspace|vspace|hskip|vskip|rule)\*?\{[^}]*\}(\{[^}]*\})?', ' ', s)
    s = re.sub(r'\\par\b', '\\\\\\\\', s)
    s = re.sub(r'\\quad\b', ' ', s)
    s = re.sub(r'\\qquad\b', ' ', s)
    s = s.replace('~', ' ')
    s = s.replace('\\%', '%')
    s = re.sub(r'\\,', ' ', s)
    s = re.sub(r'\\;', ' ', s)
    s = re.sub(r'\\!', '', s)
    return s

def simplify_tabular_colspecs(s):
    """The site's renderer parses `\\begin{tabular}{spec}` with a brace-free
    regex, so specs like `{|>{\\centering}m{4cm}|}` break it. The spec is
    discarded anyway — replace it with `{c}`."""
    out = []
    i = 0
    pat = re.compile(r'\\begin\{(tabular|longtable)\}(\[[^\]]*\])?')
    while True:
        mm = pat.search(s, i)
        if not mm:
            out.append(s[i:])
            break
        out.append(s[i:mm.start()])
        out.append('\\begin{%s}' % mm.group(1))
        j = mm.end()
        while j < len(s) and s[j] in ' \t\r\n':
            j += 1
        if j < len(s) and s[j] == '{':
            depth = 0
            k = j
            while k < len(s):
                if s[k] == '\\':
                    k += 2
                    continue
                if s[k] == '{':
                    depth += 1
                elif s[k] == '}':
                    depth -= 1
                    if depth == 0:
                        break
                k += 1
            out.append('{c}')
            i = k + 1
        else:
            i = j
    return ''.join(out)


def clean_field(s):
    if s is None:
        return None
    s = simplify_tabular_colspecs(s)
    s = re.sub(r'\\newline\b', ' ', s)
    s = re.sub(r'\\(rowcolor|cellcolor|columncolor)\{[^}]*\}', '', s)
    # KaTeX has no *{n}{col} column-spec shorthand — expand it
    s = re.sub(r'\*\{(\d+)\}\{([clr|])\}', lambda mm: mm.group(2) * int(mm.group(1)), s)
    # `\\[6pt]` is a line break with spacing, not display math
    s = re.sub(r'\\\\\[\s*-?[0-9.]+\s*(pt|mm|cm|em|ex|in)\s*\]', r'\\\\', s)
    # display math \[...\] must be treated as math, not text — fold it into $…$
    s = re.sub(r'(?<!\\)\\\[', '$', s)
    s = re.sub(r'(?<!\\)\\\]', '$', s)
    # process only text segments (outside $...$)
    parts = s.split('$')
    for i in range(0, len(parts), 2):
        parts[i] = clean_text_segment(parts[i])
    s = '$'.join(parts)
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'(\\\\\s*)+', r'\\\\', s)  # collapse repeated line breaks
    s = s.strip()
    s = re.sub(r'^(\\\\)+', '', s).strip()
    s = re.sub(r'(\\\\)+$', '', s).strip()
    return s

def strip_true(s):
    s2 = s.lstrip()
    if s2.startswith('\\True'):
        return True, s2[5:].strip()
    return False, s.strip()

def math_balanced(s):
    """Every $...$ segment must have balanced braces and \\left/\\right."""
    if s is None:
        return True
    parts = s.split('$')
    for i in range(1, len(parts), 2):
        seg = parts[i]
        if seg.count('{') != seg.count('}'):
            return False
        if len(re.findall(r'\\left\b', seg)) != len(re.findall(r'\\right\b', seg)):
            return False
    return len(parts) % 2 == 1  # even count of $ delimiters


def field_ok(s):
    """Reject leftovers the renderer can't display."""
    if s is None:
        return True
    if not math_balanced(s):
        return False
    for mm in re.finditer(r'\\begin\{([a-zA-Z*]+)\}', s):
        if mm.group(1) not in ALLOWED_ENVS:
            return False
    if BAD_TEXT_MACROS.search(s):
        return False
    if '\uFFFD' in s:
        return False
    return True

def norm_key(s):
    s = re.sub(r'\s+', '', s or '')
    return s[:220]

NUM_RE = re.compile(r'^-?\d+([.,]\d+)?%?$')
def norm_answer(a):
    if a is None:
        return None
    a = a.strip()
    a = re.sub(r'^\$|\$$', '', a).strip()
    a = a.replace('{,}', ',').replace('\\,', '')
    a = a.replace(' ', '')
    a = a.rstrip('.').strip() if a.endswith('.') and NUM_RE.match(a.rstrip('.')) else a
    if a.startswith('a=') or a.startswith('x='):
        a = a[2:]
    a = a.rstrip('.')
    if not NUM_RE.match(a):
        return None
    return a

B_BY_LEVEL = {'N': -1.5, 'H': -0.5, 'V': 0.5, 'C': 1.0}
C_BY_TYPE = {'mcq': 0.25, 'tf': 0.0625, 'shortans': 0}

def build_new_questions():
    recs = json.load(open(os.path.join(BASE, 'parsed.json'), encoding='utf-8'))
    out = []
    seen = set()
    stats = collections.Counter()
    for r in recs:
        meta = r['meta']
        if not meta or r['type'] == 'essay':
            stats['skip:essay/nocode'] += 1
            continue
        if r['flags']['tikz'] or r['flags']['immini']:
            stats['skip:figure'] += 1
            continue
        key = (meta['grade'], meta['subj'], meta['chap'], meta['bai'])
        topic = M.get(key)
        if not topic:
            stats['skip:unmapped'] += 1
            continue

        prompt = clean_field(r['prompt'])
        solution = clean_field(r.get('solution'))
        if solution and not field_ok(solution):
            solution = None  # a broken solution shouldn't sink the question
        if not prompt or len(prompt) < 15:
            stats['skip:emptyprompt'] += 1
            continue
        if FIG_WORDS.search(prompt):
            stats['skip:figref'] += 1
            continue
        if 'tkzTab' in (r.get('prompt') or '') or 'tkzTab' in (r.get('solution') or ''):
            stats['skip:tkztab'] += 1
            continue

        q = {
            'topicId': topic,
            'grade': 10 + meta['grade'],
            'status': 'ok',
            'prompt': prompt,
            'source': SOURCE_BY_ARCHIVE[r['file'].split('/')[0]],
            'tikzSources': [], 'tikzHashes': [],
            'hasTable': 'tabular' in prompt or 'longtable' in prompt,
            'hasImmini': False,
            'solution': solution or None,
            'type': r['type'],
        }
        lvl = meta['level'] or 'H'
        if lvl == 'T':
            lvl = 'H'
        q['level'] = 'V' if lvl == 'C' else lvl
        q['irt'] = {'a': 1.2, 'b': B_BY_LEVEL.get(lvl, -0.5), 'c': C_BY_TYPE[r['type']]}

        bad = False
        if r['type'] == 'mcq':
            opts = r.get('options') or []
            if not (3 <= len(opts) <= 5):
                stats['skip:optcount'] += 1
                continue
            options = []
            ncorrect = 0
            for i, o in enumerate(opts):
                is_true, content = strip_true(o)
                content = clean_field(content)
                if not content or not field_ok(content) or FIG_WORDS.search(content):
                    bad = True
                    break
                ncorrect += 1 if is_true else 0
                options.append({'label': 'ABCDE'[i], 'content': content,
                                'isCorrect': is_true})
            if bad or ncorrect != 1:
                stats['skip:badopts'] += 1
                continue
            q['options'] = options
        elif r['type'] == 'tf':
            stms = r.get('statements') or []
            if not (2 <= len(stms) <= 5):
                stats['skip:stmcount'] += 1
                continue
            statements = []
            for i, o in enumerate(stms):
                is_true, content = strip_true(o)
                content = clean_field(content)
                if not content or not field_ok(content) or FIG_WORDS.search(content):
                    bad = True
                    break
                statements.append({'label': 'abcde'[i], 'content': content,
                                   'isTrue': is_true})
            if bad:
                stats['skip:badstm'] += 1
                continue
            q['statements'] = statements
        else:  # shortans
            ans = norm_answer(r.get('answer'))
            if ans is None:
                stats['skip:ansfmt'] += 1
                continue
            q['correctAnswer'] = ans

        if not field_ok(prompt) or not field_ok(solution):
            stats['skip:leftover'] += 1
            continue
        if len(prompt) > 2200 or (solution and len(solution) > 4000):
            stats['skip:toolong'] += 1
            continue

        k = norm_key(prompt) + '|' + norm_key(
            (q.get('options') or [{}])[0].get('content', '') if r['type'] == 'mcq'
            else (q.get('statements') or [{}])[0].get('content', '') if r['type'] == 'tf'
            else q.get('correctAnswer', ''))
        if k in seen:
            stats['skip:dup'] += 1
            continue
        seen.add(k)
        q['_arch'] = r['file'].split('/')[0]
        out.append(q)
        stats['kept:' + r['type']] += 1
    return out, stats

CAPS = {'mcq': 45, 'tf': 25, 'shortans': 25}

def select(questions, existing_prompt_keys):
    """Cap per (topic, type); balance levels; prefer solved + real-world."""
    buckets = collections.defaultdict(list)
    for q in questions:
        k = norm_key(q['prompt'])
        if k in existing_prompt_keys:
            continue
        buckets[(q['topicId'], q['type'])].append(q)

    def score(q):
        s = 0
        if q['solution']:
            s += 4
        if q['_arch'] == 'thucte':
            s += 3
        n = len(q['prompt'])
        if 40 <= n <= 900:
            s += 2
        return -s  # ascending sort

    chosen = []
    for (topic, typ), qs in sorted(buckets.items()):
        cap = CAPS[typ]
        by_level = collections.defaultdict(list)
        for q in sorted(qs, key=lambda q: (score(q), norm_key(q['prompt']))):
            by_level[q['level']].append(q)
        picked = []
        order = ['N', 'H', 'V']
        while len(picked) < cap:
            progressed = False
            for lv in order:
                if by_level[lv] and len(picked) < cap:
                    picked.append(by_level[lv].pop(0))
                    progressed = True
            if not progressed:
                break
        chosen.extend(picked)
    return chosen

def main():
    src = open(os.path.join(SITE, 'data', 'questions.js'), encoding='utf-8-sig').read()
    old = json.loads(src[src.index('{'):src.rindex('}') + 1])
    # keep only the original KNTT-built records; '::x-' ids are ours from a
    # previous run of this script and must not survive a rebuild
    old['questions'] = [q for q in old['questions'] if '::x-' not in q['id']]
    existing_keys = {norm_key(q['prompt']) for q in old['questions']}

    new_all, stats = build_new_questions()
    print('--- filter stats ---')
    for k in sorted(stats):
        print(' ', k, stats[k])
    picked = select(new_all, existing_keys)

    # assign stable ids: per-topic sequence
    seq = collections.Counter()
    for q in picked:
        t = q['topicId']
        q['id'] = '%s::x-%d' % (t, seq[t])
        seq[t] += 1
        del q['_arch']

    # order keys like the existing records
    def ordered(q):
        keys = ['id', 'topicId', 'grade', 'level', 'status', 'prompt', 'source',
                'irt', 'tikzSources', 'tikzHashes', 'hasTable', 'hasImmini',
                'solution', 'type', 'options', 'statements', 'correctAnswer']
        return {k: q[k] for k in keys if k in q}

    all_q = old['questions'] + [ordered(q) for q in picked]
    bank = {
        'builtAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z'),
        'totalCount': len(all_q),
        'questions': all_q,
        'theory': old.get('theory', []),
    }

    lines = ['\ufeffwindow.AM_QUESTION_BANK = {']
    lines.append('  "builtAt": %s,' % json.dumps(bank['builtAt']))
    lines.append('  "totalCount": %d,' % bank['totalCount'])
    lines.append('  "questions": [')
    qjson = [json.dumps(q, ensure_ascii=False) for q in all_q]
    lines.append(',\n'.join('    ' + s for s in qjson))
    lines.append('  ],')
    lines.append('  "theory": ' + json.dumps(bank['theory'], ensure_ascii=False))
    lines.append('};\n')
    out = '\n'.join(lines)
    with open(os.path.join(SITE, 'data', 'questions.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)

    print('--- result ---')
    print('old:', len(old['questions']), ' new picked:', len(picked),
          ' total:', len(all_q))
    per_topic = collections.Counter(q['topicId'] for q in all_q)
    per_grade = collections.Counter(q['grade'] for q in all_q)
    print('per grade:', dict(per_grade))
    print('topics covered:', len(per_topic))
    for t in sorted(per_topic):
        print('  %-22s %d' % (t, per_topic[t]))
    print('file size (MB):', round(len(out.encode("utf-8")) / 1e6, 2))

if __name__ == '__main__':
    main()
