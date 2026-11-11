/* Nickname rules. The blocked words are stored in ROT13 so anyone reading the
   source does not get a list of swears. To add one, ROT13 it first. */
(function (root) {
  const CTV = root.CTV = root.CTV || {};
  const rot13 = s => s.replace(/[a-z]/g, c => String.fromCharCode((c.charCodeAt(0) - 97 + 13) % 26 + 97));

  /* Blocked anywhere inside a name. */
  const CONTAINS = ('shpx fuvg ovgpu phag avtt sntt juber fyhg cravf intva chffl cbea anmv uvgyre ergneq gjng jnax ' +
    'onfgneq qbhpur nffubyr qhzonff wnpxnff qvpxurnq pbpxfhpx zbyrfg crqbcuvyr obbo xxx oybjwbo unaqwbo qvyqb ubeal ' +
    'ahqr anxrq spx shx opgu fgsh jgs').split(' ').map(rot13);

  /* Blocked only as the whole name, so "class", "grape" and "peacock" stay legal. */
  const EXACT = ('nff nffrf phz ubr ubrf frk frkl gvg gvgf gvggl snt sntf nahf pbba fcvp encr encrq encvfg qnza nefr ' +
    'pbpx qvpx qvpxf qlxr pyvg crqb fug xvxr puvax ubzb penc cvff arteb gneq').split(' ').map(rot13);

  const leet = (s, one) => s.replace(/[0134578 9]/g, ch => (
    { 0: 'o', 1: one, 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g' }[ch] || ch));

  function variants(name) {
    const low = name.toLowerCase();
    const base = [leet(low, 'i'), leet(low, 'l'), low.replace(/[0-9]/g, '')];
    const out = new Set();
    base.forEach(v => {
      out.add(v);
      out.add(v.replace(/(.)\1{2,}/g, '$1$1'));
      out.add(v.replace(/(.)\1+/g, '$1'));
    });
    return [...out];
  }

  function isBlocked(name) {
    if (/69|420/.test(name)) return true;
    return variants(name).some(v => EXACT.includes(v) || CONTAINS.some(w => v.includes(w)));
  }

  function validateName(raw) {
    const name = String(raw || '').trim();
    if (!name) return { ok: false, msg: 'Enter a nickname.' };
    if (name.length > 12) return { ok: false, msg: '12 characters maximum.' };
    if (!/^[A-Za-z0-9]+$/.test(name)) return { ok: false, msg: 'Letters and numbers only.' };
    if (isBlocked(name)) return { ok: false, msg: 'That name is not allowed. Pick another one.' };
    return { ok: true, name };
  }

  CTV.Filter = { validateName, isBlocked };
})(typeof window !== 'undefined' ? window : globalThis);
