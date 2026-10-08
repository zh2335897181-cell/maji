import { getDb } from './connection';
import { createId } from '../../../src/lib/text';
import { validateDraft, validateView, type MindMap, type MindMapDraft, type MindMapView } from '../../../src/lib/mindmap';

export function listMindMaps(): MindMap[] {
  const rows = getDb().prepare('SELECT document FROM mind_maps ORDER BY updated_at DESC').all() as { document: string }[];
  return rows.map(row => JSON.parse(row.document) as MindMap);
}
export function saveMindMap(input: MindMapDraft, id?: string, expectedRevision?: number): MindMap {
  const draft = validateDraft(input), now = new Date().toISOString(), db = getDb();
  return db.transaction(() => {
    const row = id ? db.prepare('SELECT document, revision FROM mind_maps WHERE id = ?').get(id) as { document: string; revision: number } | undefined : undefined;
    if (id && (!row || row.revision !== expectedRevision)) throw new Error('导图已被修改或删除，请另存草稿后重新打开');
    const previous = row ? JSON.parse(row.document) as MindMap : undefined;
    const map: MindMap = { ...draft, id: id ?? createId('map'), revision: (row?.revision ?? 0) + 1, createdAt: previous?.createdAt ?? now, updatedAt: now };
    db.prepare('INSERT INTO mind_maps (id, title, document, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, document=excluded.document, revision=excluded.revision, updated_at=excluded.updated_at').run(map.id, map.title, JSON.stringify(map), map.revision, map.createdAt, now);
    return map;
  })();
}
export function removeMindMap(id: string): void { getDb().prepare('DELETE FROM mind_maps WHERE id = ?').run(id); }
export function getMindMapView(id: string): MindMapView | null {
  const row = getDb().prepare('SELECT state FROM mind_map_views WHERE map_id = ?').get(id) as { state: string } | undefined;
  return row ? validateView(JSON.parse(row.state)) : null;
}
export function saveMindMapView(id: string, value: MindMapView): void {
  const view = validateView(value);
  getDb().prepare('INSERT INTO mind_map_views (map_id, state) VALUES (?, ?) ON CONFLICT(map_id) DO UPDATE SET state=excluded.state').run(id, JSON.stringify(view));
}
