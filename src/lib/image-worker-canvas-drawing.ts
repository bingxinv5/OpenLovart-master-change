export function truncateText(ctx: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number) {
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;

  let nextText = text;
  while (nextText.length > 1 && ctx.measureText(`${nextText}…`).width > maxWidth) {
    nextText = nextText.slice(0, -1);
  }
  return `${nextText}…`;
}

export function wrapTextLines(
  ctx: OffscreenCanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [] as string[];

  const lines: string[] = [];
  let current = '';

  for (const char of normalized) {
    const next = `${current}${char}`;
    if (current && ctx.measureText(next).width > maxWidth) {
      lines.push(current);
      current = char.trimStart();
      if (lines.length === maxLines - 1) {
        break;
      }
      continue;
    }
    current = next;
  }

  const consumed = lines.join('').length;
  const remainder = normalized.slice(consumed);
  if (lines.length < maxLines && remainder) {
    lines.push(remainder);
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  if (lines.length === maxLines) {
    const displayedLength = lines.join('').length;
    if (displayedLength < normalized.length) {
      lines[maxLines - 1] = truncateText(ctx, lines[maxLines - 1] + normalized.slice(displayedLength), maxWidth);
    }
  }

  return lines.filter(Boolean);
}

export function drawMultilineText(
  ctx: OffscreenCanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
) {
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
}

export function fitContain(srcWidth: number, srcHeight: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / Math.max(1, srcWidth), maxHeight / Math.max(1, srcHeight));
  return {
    width: Math.max(1, Math.round(srcWidth * scale)),
    height: Math.max(1, Math.round(srcHeight * scale)),
  };
}

export function drawRoundedRect(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const nextRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + nextRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, nextRadius);
  ctx.arcTo(x + width, y + height, x, y + height, nextRadius);
  ctx.arcTo(x, y + height, x, y, nextRadius);
  ctx.arcTo(x, y, x + width, y, nextRadius);
  ctx.closePath();
}
