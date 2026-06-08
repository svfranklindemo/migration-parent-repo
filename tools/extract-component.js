/**
 * Component Extractor — paste this into Chrome DevTools Console.
 * 
 * Usage:
 * 1. Select the component wrapper in the Elements tab
 * 2. Paste this entire script into the Console and press Enter
 * 3. A .html file will auto-download with the component's HTML + CSS
 */
(() => {
  const el = $0;
  if (!el) { console.error('No element selected. Select one in the Elements tab first.'); return; }

  const componentName = prompt('Component name (used for filename):', el.className?.split(' ')[0] || 'component');
  if (!componentName) return;

  // Collect all elements (root + descendants)
  const allEls = [el, ...el.querySelectorAll('*')];

  // --- Extract matched CSS rules ---
  const collectedRules = new Map(); // ruleText -> true (dedup)
  const sheets = [...document.styleSheets];

  sheets.forEach((sheet) => {
    let rules;
    try { rules = [...sheet.cssRules]; } catch { return; } // skip cross-origin sheets
    rules.forEach((rule) => {
      if (rule instanceof CSSStyleRule) {
        try {
          if (allEls.some((e) => e.matches(rule.selectorText))) {
            collectedRules.set(rule.cssText, true);
          }
        } catch { /* invalid selector */ }
      } else if (rule instanceof CSSMediaRule) {
        const matching = [...rule.cssRules].filter((r) => {
          if (!(r instanceof CSSStyleRule)) return false;
          try { return allEls.some((e) => e.matches(r.selectorText)); } catch { return false; }
        });
        if (matching.length) {
          collectedRules.set(`@media ${rule.conditionText} {\n${matching.map((r) => '  ' + r.cssText).join('\n')}\n}`, true);
        }
      } else if (rule instanceof CSSKeyframesRule) {
        collectedRules.set(rule.cssText, true);
      }
    });
  });

  // --- Also capture inline styles ---
  const inlineStyles = [];
  allEls.forEach((e) => {
    if (e.getAttribute('style')) {
      inlineStyles.push(`/* inline: ${e.tagName.toLowerCase()}.${[...e.classList].join('.')} */\n/* ${e.getAttribute('style')} */`);
    }
  });

  // --- Build CSS string ---
  const css = [...collectedRules.keys()].join('\n\n') + (inlineStyles.length ? '\n\n/* === Inline Styles === */\n' + inlineStyles.join('\n') : '');

  // --- Get HTML (outer) ---
  const html = el.outerHTML;

  // --- Compose the file ---
  const file = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${componentName}</title>
  <style>
${css}
  </style>
</head>
<body>
${html}
</body>
</html>`;

  // --- Download ---
  const blob = new Blob([file], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${componentName}.html`;
  a.click();
  URL.revokeObjectURL(url);

  console.log(`✅ Extracted "${componentName}" — ${allEls.length} elements, ${collectedRules.size} CSS rules`);
})();
