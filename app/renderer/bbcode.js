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

const COLOR_CLASS_MAP = {
  e8024b: 'bbcode-color-e8024b',
  ffffff: 'bbcode-color-ffffff',
  da8d49: 'bbcode-color-da8d49',
  '0592a3': 'bbcode-color-0592a3',
};

const SIZE_CLASS_MAP = {
  11: 'bbcode-size-11',
  13: 'bbcode-size-13',
  16: 'bbcode-size-16',
};

const IMAGE_WIDTH_CLASS_MAP = {
  250: 'bbcode-img-250',
};

function resolveColorClass(rawColor) {
  const token = String(rawColor || '').trim().toLowerCase().replace(/^#/, '');
  return COLOR_CLASS_MAP[token] || '';
}

function resolveSizeClass(rawSize) {
  const sizeValue = Number.parseInt(String(rawSize || '').trim(), 10);
  return SIZE_CLASS_MAP[sizeValue] || '';
}

function resolveImageWidthClass(rawSize) {
  const sizeValue = Number.parseInt(String(rawSize || '').trim(), 10);
  return IMAGE_WIDTH_CLASS_MAP[sizeValue] || '';
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
    const widthClass = resolveImageWidthClass(size);
    const classAttr = widthClass ? ` class="${widthClass}"` : '';
    return `<img src="${safeUrl}" alt=""${classAttr}>`;
  });
  output = output.replace(/\[center]/gi, '<div class="bbcode-center">');
  output = output.replace(/\[\/center]/gi, '</div>');
  output = output.replace(/\[right]/gi, '<div class="bbcode-right">');
  output = output.replace(/\[\/right]/gi, '</div>');
  output = output.replace(/\[b]/gi, '<strong>').replace(/\[\/b]/gi, '</strong>');
  output = output.replace(/\[i]/gi, '<em>').replace(/\[\/i]/gi, '</em>');
  output = output.replace(/\[u]/gi, '<span class="bbcode-underline">').replace(/\[\/u]/gi, '</span>');
  output = output.replace(/\[color=([^\]]+)]/gi, (_match, color) => {
    const colorClass = resolveColorClass(color);
    return colorClass ? `<span class="${colorClass}">` : '<span>';
  });
  output = output.replace(/\[\/color]/gi, '</span>');
  output = output.replace(/\[size=([^\]]+)]/gi, (_match, size) => {
    const sizeClass = resolveSizeClass(size);
    return sizeClass ? `<span class="${sizeClass}">` : '<span>';
  });
  output = output.replace(/\[\/size]/gi, '</span>');
  output = output.replace(/\r?\n/g, '<br>');
  output = output.replace(/__CODE_BLOCK_(\d+)__/g, (_match, index) => {
    const content = codeBlocks[Number(index)] || '';
    return `<pre class="bbcode-code">${content}</pre>`;
  });
  return output;
}
