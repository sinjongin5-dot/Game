// 크로스링크 — 공용 코어 (네임스페이스, 결정론적 RNG, 유틸)
// 브라우저(<script>)와 Node(require) 양쪽에서 동작한다.
(function (root) {
  const X = (root.XG = root.XG || {});

  // 결정론적 RNG (mulberry32). 상태가 정수 하나라 직렬화/네트워크 동기화가 쉽다.
  X.rngNext = function (holder) {
    let t = (holder.seed = (holder.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  X.hash = function (str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  X.clone = (o) => JSON.parse(JSON.stringify(o));
  X.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  X.shuffle = function (arr, holder) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(X.rngNext(holder) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  // 한국어 조사 처리: josa('리피', '이/가') -> '리피가'
  X.josa = function (word, pair) {
    const [a, b] = pair.split('/');
    const ch = word.charCodeAt(word.length - 1);
    if (ch < 0xac00 || ch > 0xd7a3) return word + (/[0-9]$/.test(word) ? ('013678'.includes(word.slice(-1)) ? a : b) : b);
    const jong = (ch - 0xac00) % 28;
    if (pair === '으로/로') return word + (jong === 0 || jong === 8 ? b : a);
    return word + (jong ? a : b);
  };

  if (typeof module !== 'undefined') module.exports = X;
})(typeof globalThis !== 'undefined' ? globalThis : this);
