# -*- coding: utf-8 -*-
import json, re, collections
SITE = r'C:\Users\laptop\Documents\đề án\adaptivemath-main'
src = open(SITE + r'\data\questions.js', encoding='utf-8-sig').read()
assert src.startswith('window.AM_QUESTION_BANK'), src[:40]
data = json.loads(src[src.index('{'):src.rindex('}') + 1])
qs = data['questions']
print('total:', data['totalCount'], len(qs))
assert data['totalCount'] == len(qs)

topics_src = open(SITE + r'\js\core\topics.js', encoding='utf-8').read()
topic_ids = set(re.findall(r"\['([0-9]-KNTT-[^']+)'", topics_src))
print('topics in topics.js:', len(topic_ids))

ids = set()
errs = collections.Counter()
for q in qs:
    if q['id'] in ids:
        errs['dup id: ' + q['id']] += 1
    ids.add(q['id'])
    if q['topicId'] not in topic_ids:
        errs['unknown topic ' + q['topicId']] += 1
    if q['type'] == 'mcq':
        if sum(1 for o in q['options'] if o['isCorrect']) != 1:
            errs['mcq bad correct'] += 1
        if not all(o['content'].strip() for o in q['options']):
            errs['mcq empty option'] += 1
    elif q['type'] == 'tf':
        if not (2 <= len(q['statements']) <= 5):
            errs['tf count'] += 1
    elif q['type'] == 'shortans':
        if not q.get('correctAnswer'):
            errs['shortans empty'] += 1
    else:
        errs['odd type ' + q['type']] += 1
    if not q['prompt'].strip():
        errs['empty prompt'] += 1
    for field in [q['prompt'], q.get('solution') or '']:
        if '\\begin{itemchoice}' in field or '\\itemch' in field:
            errs['leftover itemchoice'] += 1
        if 'tikzpicture' in field:
            errs['leftover tikz'] += 1
print('errors:', dict(errs) or 'NONE')

# odd $ count check (unbalanced math) per question
unb = 0
for q in qs:
    blob = q['prompt'] + (q.get('solution') or '')
    for o in q.get('options', []):
        blob += o['content']
    for s in q.get('statements', []):
        blob += s['content']
    # count unescaped $
    n = len(re.findall(r'(?<!\\)\$', blob.replace('\\\\', '')))
    if n % 2 == 1:
        unb += 1
print('questions with odd $ count:', unb)

# per-type counts
print(collections.Counter(q['type'] for q in qs))
print(collections.Counter(q['level'] for q in qs))
print(collections.Counter(q['source'] for q in qs if '::x-' in q['id']))
