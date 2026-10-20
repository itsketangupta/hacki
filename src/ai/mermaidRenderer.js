export async function renderMermaid(source) {
  const code = String(source || '').trim();
  if (!code || code.length > 6000) throw new Error('Diagram source must be between 1 and 6000 characters.');
  const encoded = Buffer.from(JSON.stringify({ code }), 'utf8').toString('base64url');
  const response = await fetch(`https://mermaid.ink/img/${encoded}?type=png`, {
    headers: { Accept: 'image/png' },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`Diagram renderer returned HTTP ${response.status}`);
  const image = Buffer.from(await response.arrayBuffer());
  if (image.length > 8_000_000) throw new Error('Rendered diagram is too large to upload.');
  return image;
}
