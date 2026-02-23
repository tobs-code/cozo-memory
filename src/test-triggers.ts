
import { MemoryServer } from './index';

async function testTriggers() {
  console.log('--- Testing CozoDB Triggers ---');
  const server = new MemoryServer();
  await server.initPromise;
  
  try {
    // 1. Test Self-Loop Trigger
    console.log('\nTesting self-loop trigger...');
    const selfLoopRes = await server.createRelation({
      from_id: 'entity_1',
      to_id: 'entity_1', // Self-loop
      relation_type: 'self_reference'
    });
    
    if (selfLoopRes && (selfLoopRes as any).error) {
      console.log('✅ Success: Self-loop trigger blocked the operation:', (selfLoopRes as any).error);
    } else {
      console.error('❌ Error: Self-loop trigger failed (allowed self-loop)');
    }

    // 2. Test Metadata Conflict Trigger
    console.log('\nTesting metadata conflict trigger...');
    const conflictRes = await server.createEntity({
      name: 'Conflict Entity ' + Math.random(),
      type: 'Test',
      metadata: {
        status: 'active',
        archived: true // Should conflict with status: 'active'
      }
    });

    if (conflictRes && (conflictRes as any).error) {
      console.log('✅ Success: Metadata conflict trigger blocked the operation:', (conflictRes as any).error);
    } else {
      console.error('❌ Error: Metadata conflict trigger failed (allowed conflicting metadata)');
    }

    // 3. Test Valid Entity
    console.log('\nTesting valid entity...');
    try {
      const valid = await server.createEntity({
        name: 'Valid Entity',
        type: 'Test',
        metadata: {
          status: 'active',
          archived: false
        }
      });
      console.log('✅ Success: Valid entity created');
    } catch (e: any) {
      console.error('❌ Error: Valid entity was blocked:', e.message);
    }

  } finally {
    // Clean up or close if needed
    process.exit(0);
  }
}

testTriggers().catch(console.error);
