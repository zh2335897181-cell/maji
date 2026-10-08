import { layoutGraph, type MindMapGraph } from '../../lib/mindmap';

const xml = (s: string) => s.replace(/[<>&"']/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[ch]!);
export async function mapPNG(graph: MindMapGraph, collapsedIds: string[], full: boolean): Promise<string> {
  await document.fonts?.ready;
  const layout = layoutGraph(graph, full ? [] : collapsedIds), scale = 2;
  if (layout.width * layout.height * scale * scale > 32000000 || layout.width * scale > 16000 || layout.height * scale > 16000) throw new Error('导图图片过大，请折叠部分分支后导出');
  const root = getComputedStyle(document.documentElement);
  const color = (key: string, fallback: string) => root.getPropertyValue(key).trim() || fallback;
  const ink = color('--text-primary', '#1e272e'), bg = color('--bg-surface', '#fff'), line = color('--line-strong', '#d4dbe1'), accent = color('--accent', '#1f6a80');
  const shapes: string[] = [];
  graph.nodes.forEach(n => {
    const p = layout.positions.get(n.id); if (!p) return;
    const parent = n.parentId ? layout.positions.get(n.parentId) : undefined;
    if (parent) shapes.push(`<path d="M${parent.x + 180} ${parent.y} C${parent.x + 210} ${parent.y},${p.x - 30} ${p.y},${p.x} ${p.y}" fill="none" stroke="${line}" stroke-width="2"/>`);
    shapes.push(`<rect x="${p.x}" y="${p.y - 26}" width="180" height="52" rx="9" fill="${n.id === graph.rootId ? accent : bg}" stroke="${line}"/><text x="${p.x + 12}" y="${p.y + 5}" fill="${n.id === graph.rootId ? '#fff' : ink}" font-size="14" font-family="Microsoft YaHei, sans-serif">${xml(n.title.slice(0, 12))}</text>${n.title.length > 12 ? `<text x="${p.x + 12}" y="${p.y + 20}" fill="${ink}" font-size="10">${xml(n.title.slice(12, 28))}</text>` : ''}`);
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}"><rect width="100%" height="100%" fill="${bg}"/>${shapes.join('')}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image(); await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('导图图像生成失败')); image.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = layout.width * scale; canvas.height = layout.height * scale;
    const context = canvas.getContext('2d'); if (!context) throw new Error('无法生成 PNG'); context.scale(scale, scale); context.drawImage(image, 0, 0); return canvas.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}
