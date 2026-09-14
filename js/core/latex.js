/**
 * Mixed Vietnamese text + LaTeX renderer.
 *
 * Ported from src/lib/latex.ts + src/components/diagnostic/LatexRenderer.tsx.
 * The pipeline order matters and is unchanged:
 *
 *   1. \begin{tabular} → HTML <table>, rendering the math inside its cells
 *      first (otherwise the outer tokenizer slices <td> tags in half on `$`).
 *   2. Mask whole tables behind private-use sentinels.
 *   3. Tokenize into text / inline-math / display-math and hand math to KaTeX.
 *   4. Unmask tables, then swap [TIKZ:hash] placeholders for a label.
 *
 * If KaTeX failed to load (offline, CDN blocked), math falls back to the raw
 * LaTeX in a <code> tag rather than breaking the page.
 */
(function (AM) {
  'use strict';

  const escapeHtml = AM.util.escapeHtml;

  const hasKatex = () => typeof window.katex !== 'undefined';

  // -------------------------------------------------------------------------
  // Macros fed to KaTeX (lib/latex.ts KATEX_MACROS)
  // -------------------------------------------------------------------------

  const KATEX_MACROS = {
    '\\vv': '\\overrightarrow',
    '\\heva': '\\left\\{\\begin{aligned}#1\\end{aligned}\\right.',
    '\\hoac': '\\left[\\begin{aligned}#1\\end{aligned}\\right.',
    '\\varparallel': '\\parallel',
    '\\R': '\\mathbb{R}',
    '\\Q': '\\mathbb{Q}',
    '\\Z': '\\mathbb{Z}',
    '\\N': '\\mathbb{N}',
    '\\C': '\\mathbb{C}',
  };

  // -------------------------------------------------------------------------
  // Vietnamese words inside math mode
  // -------------------------------------------------------------------------

  const LETTER = /[a-zA-ZÀ-ỹ]/;

  /**
   * Wrap runs of Vietnamese words in `\text{…}` so KaTeX renders them upright
   * instead of as italic chains of single-letter variables. Short labels like
   * `_{CĐ}` are deliberately left alone so identifiers keep math styling.
   */
  function wrapVietnameseInMath(tex) {
    let out = '';
    let i = 0;
    while (i < tex.length) {
      const ch = tex[i];

      // Preserve a macro name: '\' followed by letters.
      if (ch === '\\' && LETTER.test(tex[i + 1] || '')) {
        let j = i + 1;
        while (j < tex.length && LETTER.test(tex[j])) j++;
        out += tex.slice(i, j);
        i = j;
        continue;
      }

      if (LETTER.test(ch)) {
        let j = i;
        while (j < tex.length) {
          if (LETTER.test(tex[j])) {
            j++;
            continue;
          }
          // Allow one internal space so "đơn vị" stays a single run.
          if (tex[j] === ' ' && j + 1 < tex.length && LETTER.test(tex[j + 1])) {
            j++;
            continue;
          }
          break;
        }
        const run = tex.slice(i, j);
        const diacritics = (run.match(/[À-ỹ]/g) || []).length;
        const letters = run.replace(/\s+/g, '').length;
        const shouldWrap = diacritics >= 2 || (diacritics >= 1 && letters >= 3);
        out += shouldWrap ? '\\text{' + run + '}' : run;
        i = j;
        continue;
      }

      out += ch;
      i++;
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Math compilation
  // -------------------------------------------------------------------------

  function renderMath(tex, displayMode) {
    const safeTex = wrapVietnameseInMath(tex);
    if (!hasKatex()) {
      return '<code class="tex-error">' + escapeHtml(tex) + '</code>';
    }
    try {
      return window.katex.renderToString(safeTex, {
        displayMode: displayMode,
        throwOnError: false,
        strict: 'ignore',
        macros: Object.assign({}, KATEX_MACROS),
        trust: false,
        output: 'htmlAndMathml',
        errorColor: '#dc2626',
      });
    } catch (err) {
      return '<code class="tex-error">' + escapeHtml(tex) + '</code>';
    }
  }

  // -------------------------------------------------------------------------
  // Tokenizer
  // -------------------------------------------------------------------------

  /**
   * A char is escaped only when preceded by an ODD number of backslashes:
   *   `\$`   → escaped        `\\$`  → NOT escaped (that `\\` is a line break)
   * The naive `src[i-1] !== '\\'` check swallowed half the corpus's math.
   */
  function isEscaped(src, i) {
    let backslashes = 0;
    let k = i - 1;
    while (k >= 0 && src[k] === '\\') {
      backslashes++;
      k--;
    }
    return backslashes % 2 === 1;
  }

  function tokenize(src) {
    const segments = [];
    let i = 0;
    let textBuf = '';

    const flushText = function () {
      if (textBuf) {
        segments.push({ type: 'text', value: textBuf });
        textBuf = '';
      }
    };

    while (i < src.length) {
      if (src.startsWith('$$', i)) {
        const end = src.indexOf('$$', i + 2);
        if (end === -1) {
          textBuf += src.slice(i);
          break;
        }
        flushText();
        segments.push({ type: 'display', value: src.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
      if (src.startsWith('\\[', i)) {
        const end = src.indexOf('\\]', i + 2);
        if (end === -1) {
          textBuf += src.slice(i);
          break;
        }
        flushText();
        segments.push({ type: 'display', value: src.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
      if (src.startsWith('\\(', i)) {
        const end = src.indexOf('\\)', i + 2);
        if (end === -1) {
          textBuf += src.slice(i);
          break;
        }
        flushText();
        segments.push({ type: 'inline', value: src.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
      if (src[i] === '$' && !isEscaped(src, i)) {
        let end = -1;
        let cursor = i + 1;
        while (cursor < src.length) {
          if (src[cursor] === '$' && !isEscaped(src, cursor)) {
            end = cursor;
            break;
          }
          cursor++;
        }
        if (end === -1) {
          textBuf += src.slice(i);
          break;
        }
        flushText();
        segments.push({ type: 'inline', value: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
      textBuf += src[i];
      i++;
    }

    flushText();
    return segments;
  }

  // -------------------------------------------------------------------------
  // Tables
  // -------------------------------------------------------------------------

  /** \begin{tabular}{…} … \end{tabular} → an HTML table. */
  function convertTabularToHtml(raw) {
    const tabularRe =
      /\\begin\{(tabular|longtable)\}\{[^}]*\}([\s\S]*?)\\end\{\1\}/g;
    return raw.replace(tabularRe, function (_full, _env, content) {
      const rows = content
        .replace(/\\hline/g, '')
        .replace(/\\cline\{[^}]*\}/g, '')
        .split(/\\\\/)
        .map((r) => r.trim())
        .filter((r) => r.length > 0);

      const rowsHtml = rows
        .map(function (row) {
          const cellsHtml = row
            .split('&')
            .map((c) => c.trim())
            .map(function (cellRaw) {
              const multi = /^\\multicolumn\{(\d+)\}\{[^}]*\}\{([\s\S]*)\}$/.exec(cellRaw);
              if (multi) {
                return (
                  '<td class="kntt-td" colspan="' + multi[1] + '">' +
                  multi[2].trim() +
                  '</td>'
                );
              }
              const multirow = /^\\multirow\{(\d+)\}\{[^}]*\}\{([\s\S]*)\}$/.exec(cellRaw);
              if (multirow) {
                return (
                  '<td class="kntt-td" rowspan="' + multirow[1] + '">' +
                  multirow[2].trim() +
                  '</td>'
                );
              }
              return '<td class="kntt-td">' + cellRaw + '</td>';
            })
            .join('');
          return '<tr>' + cellsHtml + '</tr>';
        })
        .join('');

      return '<table class="kntt-table">' + rowsHtml + '</table>';
    });
  }

  /** Render `$…$` inside table cells before the outer tokenizer runs. */
  function renderMathInsideTables(src) {
    return src.replace(
      /<(td|th)([^>]*)>([\s\S]*?)<\/\1>/g,
      function (_m, tag, attrs, inner) {
        const rendered = inner.replace(/\$([^$]+)\$/g, function (_mm, tex) {
          return renderMath(tex, false);
        });
        return '<' + tag + attrs + '>' + rendered + '</' + tag + '>';
      },
    );
  }

  function maskTables(src) {
    const tables = [];
    const masked = src.replace(/<table[\s\S]*?<\/table>/g, function (match) {
      const token = '\uE000TABLE' + tables.length + '\uE001';
      tables.push(match);
      return token;
    });
    return { masked: masked, tables: tables };
  }

  // -------------------------------------------------------------------------
  // Text-mode cleanup
  // -------------------------------------------------------------------------

  /**
   * A few macros leak into text mode in the corpus (authors write
   * `$P$, $Q$, \ldots`). Map the common ones to Unicode and drop the
   * layout-only ones, which have no visible HTML form.
   */
  function resolveTextModeMacros(src) {
    let out = src;
    out = out.replace(/\\(?:ldots|dots)\b/g, '…');
    out = out.replace(/\\cdots\b/g, '⋯');
    out = out.replace(/\\to\b/g, '→');
    out = out.replace(
      /\\(?:centerline|centering|hfill|hspace|vspace|noindent|indent|footnotesize|small|large|Large|bfseries|itshape|bf|it|em|break|linebreak|newline|allowdisplaybreaks)\b\s*/g,
      '',
    );
    out = out.replace(/\\quad\b/g, '  ');
    out = out.replace(/\\qquad\b/g, '    ');
    return out;
  }

  /** Escape stray angle brackets while leaving our own injected tags intact. */
  function preserveInjectedHtml(src) {
    const injectedTag =
      /(<\/?(?:table|thead|tbody|tr|td|th|span|img|ul|ol|li|strong|em|u|br)[^>]*\/?>)/g;
    return src
      .split(injectedTag)
      .map(function (chunk, i) {
        return i % 2 === 1 ? chunk : escapeHtml(chunk);
      })
      .join('');
  }

  /**
   * TikZ figures.
   *
   * The React build looked each hash up in a manifest and emitted an <img>
   * pointing at public/tikz/<hash>.svg — files produced by an offline LaTeX
   * render step. This build has no such step, so every figure renders as an
   * honest label instead of a broken image.
   */
  function replaceTikzPlaceholders(raw) {
    return raw.replace(/\[TIKZ:([a-f0-9]{12})\]/g, function () {
      return '<span class="kntt-tikz-pill">📐 Hình vẽ (xem trong SGK)</span>';
    });
  }

  // -------------------------------------------------------------------------
  // Public
  // -------------------------------------------------------------------------

  /** Full pipeline: LaTeX-ish source → HTML string. */
  function toHtml(content) {
    if (!content) return '';

    const withTables = convertTabularToHtml(String(content));
    const withTablesRendered = renderMathInsideTables(withTables);
    const masked = maskTables(withTablesRendered);

    const rendered = tokenize(masked.masked)
      .map(function (seg) {
        if (seg.type === 'text') {
          return preserveInjectedHtml(resolveTextModeMacros(seg.value)).replace(
            /\\\\/g,
            '<br/>',
          );
        }
        return renderMath(seg.value, seg.type === 'display');
      })
      .join('');

    const withTablesBack = rendered.replace(
      /\uE000TABLE(\d+)\uE001/g,
      function (_m, i) {
        return masked.tables[Number(i)] || '';
      },
    );

    return replaceTikzPlaceholders(withTablesBack);
  }

  /**
   * Same pipeline, returned as a DOM node ready to append.
   *
   * `tagName` defaults to <div>, but answer options live inside a <button>,
   * where only phrasing content is valid HTML — those pass 'span'.
   */
  function render(content, className, tagName) {
    const node = document.createElement(tagName || 'div');
    node.className = className || 'qprompt';
    node.innerHTML = toHtml(content);
    return node;
  }

  /** Strip LaTeX down to rough plain text — used for titles and previews. */
  function toPlainText(raw) {
    if (!raw) return '';
    return String(raw)
      .replace(/\$\$?([^$]*)\$\$?/g, '$1')
      .replace(/\\[a-zA-Z]+\s*/g, ' ')
      .replace(/[{}]/g, '')
      .replace(/\[TIKZ:[a-f0-9]{12}\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function truncate(text, max) {
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut) + '…';
  }

  AM.latex = {
    toHtml: toHtml,
    render: render,
    toPlainText: toPlainText,
    truncate: truncate,
    hasKatex: hasKatex,
    KATEX_MACROS: KATEX_MACROS,
  };
})(window.AM);
