/**
 * Shared helpers + the single global namespace.
 *
 * The whole app is loaded as classic <script> tags rather than ES modules so
 * that opening index.html straight from disk works: browsers refuse to load
 * `type="module"` scripts over the file:// protocol. Everything therefore
 * hangs off one global, `AM`.
 */
window.AM = window.AM || {};

(function (AM) {
  'use strict';

  // -------------------------------------------------------------------------
  // DOM
  // -------------------------------------------------------------------------

  /** Build an element: el('div', {class:'x', onclick: fn}, child, child…) */
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        if (value === null || value === undefined || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'style' && typeof value === 'object') {
          Object.assign(node.style, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === true) {
          node.setAttribute(key, '');
        } else {
          node.setAttribute(key, String(value));
        }
      }
    }
    appendChildren(node, children);
    return node;
  }

  function appendChildren(node, children) {
    for (const child of children) {
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) appendChildren(node, child);
      else if (child instanceof Node) node.appendChild(child);
      else node.appendChild(document.createTextNode(String(child)));
    }
  }

  /** Replace every child of `parent` with `children`. */
  function mount(parent, ...children) {
    parent.innerHTML = '';
    appendChildren(parent, children);
    return parent;
  }

  const qs = (sel, root) => (root || document).querySelector(sel);
  const qsa = (sel, root) =>
    Array.prototype.slice.call((root || document).querySelectorAll(sel));

  /** Conditional class names: cn('a', cond && 'b') */
  function cn(...parts) {
    return parts.filter(Boolean).join(' ');
  }

  function escapeHtml(src) {
    return String(src)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function icon(name, cls) {
    return el('span', { class: cn('material-symbols-outlined', cls) }, name);
  }

  // -------------------------------------------------------------------------
  // Numbers & dates
  // -------------------------------------------------------------------------

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  const pct = (x, digits) =>
    (Number.isFinite(x) ? (x * 100).toFixed(digits === undefined ? 0 : digits) : '0') + '%';

  function mean(list) {
    if (!list.length) return 0;
    return list.reduce((a, b) => a + b, 0) / list.length;
  }

  /** Today as YYYY-MM-DD in Vietnam time (UTC+7) — matches the React build. */
  function todayVNStr() {
    const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return vn.toISOString().slice(0, 10);
  }

  function todayVNDate() {
    return new Date(todayVNStr() + 'T00:00:00');
  }

  function addDays(base, n) {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
  }

  /**
   * A Date's *calendar* day as YYYY-MM-DD, using the device's local clock.
   *
   * Deliberately NOT `toISOString().slice(0, 10)`: that prints the UTC day, so
   * a local-midnight Date on a UTC+7 device came out as the previous day. That
   * one line put every learning-path day one day early and made the practice
   * streak impossible to keep (yesterday was computed as two days ago).
   */
  function dateStr(d) {
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  /** Shift a YYYY-MM-DD string by n days without going through UTC. */
  function addDaysStr(iso, n) {
    return dateStr(addDays(new Date(iso + 'T00:00:00'), n));
  }

  function formatDateVN(iso) {
    if (!iso) return '—';
    const d = new Date(iso.length > 10 ? iso : iso + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  /**
   * Parse a Vietnamese-style date string ("dd/mm/yyyy", also accepts "-" or
   * "." separators and 1-digit day/month) into ISO "YYYY-MM-DD".
   * Returns null when the text is not a real calendar date.
   */
  function parseDateVN(text) {
    if (!text) return null;
    const m = /^\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\s*$/.exec(String(text));
    if (!m) return null;
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (month < 1 || month > 12 || day < 1) return null;
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day > daysInMonth) return null;
    return (
      String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
    );
  }

  /** Whole days from today (Vietnam time) to an ISO date; negative if in the past. */
  function daysFromTodayVN(iso) {
    const target = new Date(iso + 'T00:00:00');
    if (Number.isNaN(target.getTime())) return NaN;
    return Math.round((target.getTime() - todayVNDate().getTime()) / 86400000);
  }

  function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '0s';
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m > 0 ? m + 'p ' + s + 's' : s + 's';
  }

  function formatClock(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const m = Math.floor(s / 60);
    return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  /**
   * Firestore Timestamp | epoch millis | null → Date | null.
   *
   * Lives here rather than beside the Firestore code because three unrelated
   * screens need it and none of them should have to depend on a Firebase
   * module just to read a date.
   */
  function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    if (typeof value === 'number') return new Date(value);
    return null;
  }

  /**
   * "vừa xong" / "5 phút trước" / "3 ngày trước", falling back to a date.
   *
   * Used by every roster screen — the admin list and the teacher's class view —
   * where an absolute timestamp answers the wrong question. A teacher scanning
   * for who has gone quiet wants elapsed time, not a calendar date.
   */
  function relativeTime(date, emptyLabel) {
    if (!date) return emptyLabel || 'chưa hoạt động';
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'vừa xong';
    if (mins < 60) return mins + ' phút trước';
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + ' giờ trước';
    const days = Math.floor(hours / 24);
    if (days < 30) return days + ' ngày trước';
    return date.toLocaleDateString('vi-VN');
  }

  // -------------------------------------------------------------------------
  // Seeded RNG — mulberry32 + FNV-1a, ported verbatim from lib/cat.ts
  // -------------------------------------------------------------------------

  function hashStringToU32(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Fisher-Yates, in place. */
  function shuffleInPlace(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function shuffled(arr, rng) {
    return shuffleInPlace(arr.slice(), rng);
  }

  function uid(prefix) {
    return (
      (prefix || 'id') +
      '-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function groupBy(items, keyFn) {
    const map = new Map();
    for (const item of items) {
      const k = keyFn(item);
      const bucket = map.get(k) || [];
      bucket.push(item);
      map.set(k, bucket);
    }
    return map;
  }

  AM.util = {
    el: el,
    mount: mount,
    qs: qs,
    qsa: qsa,
    cn: cn,
    icon: icon,
    escapeHtml: escapeHtml,
    clamp: clamp,
    pct: pct,
    mean: mean,
    todayVNStr: todayVNStr,
    todayVNDate: todayVNDate,
    addDays: addDays,
    dateStr: dateStr,
    addDaysStr: addDaysStr,
    formatDateVN: formatDateVN,
    parseDateVN: parseDateVN,
    daysFromTodayVN: daysFromTodayVN,
    formatDuration: formatDuration,
    formatClock: formatClock,
    toDate: toDate,
    relativeTime: relativeTime,
    hashStringToU32: hashStringToU32,
    mulberry32: mulberry32,
    shuffleInPlace: shuffleInPlace,
    shuffled: shuffled,
    uid: uid,
    groupBy: groupBy,
  };
})(window.AM);
