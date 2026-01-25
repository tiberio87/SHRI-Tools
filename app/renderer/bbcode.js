function escapeHtml(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .trim();
}

export function renderBbcodePreview(raw) {
  if (!raw) {
    return '<em>Nessun contenuto.</em>';
  }
  const trimmed = String(raw).trim();
  const outerMatch = trimmed.match(/^\[code]\s*([\s\S]*)\s*\[\/code]$/i);
  let input = outerMatch ? outerMatch[1] : trimmed;
  if (!outerMatch && /\[\/?code]/i.test(input)) {
    input = input.replace(/\[\/?code]/gi, '');
  }
  const codeBlocks = [];
  let output = escapeHtml(input);
  output = output.replace(/\[code]([\s\S]*?)\[\/code]/gi, (_match, inner) => {
    const index = codeBlocks.length;
    codeBlocks.push(inner);
    return `__CODE_BLOCK_${index}__`;
  });
  output = output.replace(/\[url=([^\]]+)]([\s\S]*?)\[\/url]/gi, (_match, url, label) => {
    const safeUrl = escapeAttr(url);
    return `<a href="#" data-external="${safeUrl}">${label}</a>`;
  });
  output = output.replace(/\[img(?:=([^\]]+))?]([\s\S]*?)\[\/img]/gi, (_match, size, url) => {
    const safeUrl = escapeAttr(url);
    const width = Number.parseInt(String(size || '').trim(), 10);
    const style = Number.isFinite(width) ? ` style="width:${width}px"` : '';
    return `<img src="${safeUrl}" alt=""${style}>`;
  });
  output = output.replace(/\[center]/gi, '<div class="bbcode-center">');
  output = output.replace(/\[\/center]/gi, '</div>');
  output = output.replace(/\[right]/gi, '<div style="text-align:right">');
  output = output.replace(/\[\/right]/gi, '</div>');
  output = output.replace(/\[b]/gi, '<strong>').replace(/\[\/b]/gi, '</strong>');
  output = output.replace(/\[i]/gi, '<em>').replace(/\[\/i]/gi, '</em>');
  output = output.replace(/\[u]/gi, '<span class="bbcode-underline">').replace(/\[\/u]/gi, '</span>');
  output = output.replace(/\[color=([^\]]+)]/gi, (_match, color) => `<span style="color:${escapeAttr(color)}">`);
  output = output.replace(/\[\/color]/gi, '</span>');
  output = output.replace(/\[size=([^\]]+)]/gi, (_match, size) => `<span style="font-size:${escapeAttr(size)}px">`);
  output = output.replace(/\[\/size]/gi, '</span>');
  output = output.replace(/\r?\n/g, '<br>');
  output = output.replace(/__CODE_BLOCK_(\d+)__/g, (_match, index) => {
    const content = codeBlocks[Number(index)] || '';
    return `<pre class="bbcode-code">${content}</pre>`;
  });
  return output;
}
