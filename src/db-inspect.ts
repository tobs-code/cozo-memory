import { MemoryServer } from './index';

async function targetedInspect() {
    const s = new MemoryServer();
    await s.initPromise;

    const entRes = await (s as any).db.run('?[id, name] := *entity{id, name, @ "NOW"}, name == "HeavyEntity"');
    if (entRes.rows.length === 0) {
        console.log("HeavyEntity not found.");
        process.exit(0);
    }
    const eid = entRes.rows[0][0];
    console.log(`Analyzing HeavyEntity (${eid}):`);

    // 1. Current observations
    const current = await (s as any).db.run('?[id, text, meta] := *observation{entity_id: $eid, id, text, metadata: meta, @ "NOW"}', { eid });
    console.log(`Current Count: ${current.rows.length}`);
    current.rows.forEach((r: any) => console.log(`- [${r[0]}] ${r[1]} (Meta: ${JSON.stringify(r[2])})`));

    // 2. All history (to see if things were invalidated)
    const history = await (s as any).db.run('?[id, text, cat] := *observation{entity_id: $eid, id, text, created_at: cat}');
    console.log(`\nHistory Count: ${history.rows.length}`);
    // Just a few history samples
    history.rows.slice(0, 10).forEach((r: any) => console.log(`- [${r[0]}] ${r[1]} @ ${JSON.stringify(r[2])}`));

    process.exit(0);
}

targetedInspect();
