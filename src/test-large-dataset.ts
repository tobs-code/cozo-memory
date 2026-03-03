/**
 * Large Dataset Performance Test
 * 
 * Tests system performance with realistic data volumes
 */

import { EmbeddingService } from './embedding-service';
import { HybridSearch } from './hybrid-search';
import { perfMonitor } from './performance-monitor';
import { logger, LogLevel } from './logger';
import { v4 as uuidv4 } from 'uuid';

// Set log level to INFO for cleaner output
logger.setLevel(LogLevel.INFO);

interface TestConfig {
  numEntities: number;
  numObservationsPerEntity: number;
  numRelationships: number;
  searchQueries: number;
}

const CONFIGS: Record<string, TestConfig> = {
  small: {
    numEntities: 50,  // Reduced to keep total observations under 100
    numObservationsPerEntity: 1,
    numRelationships: 75,
    searchQueries: 20
  },
  medium: {
    numEntities: 200,
    numObservationsPerEntity: 2,
    numRelationships: 400,
    searchQueries: 50
  },
  large: {
    numEntities: 500,
    numObservationsPerEntity: 3,
    numRelationships: 1000,
    searchQueries: 100
  }
};

// Sample data generators
const ENTITY_TYPES = ['Person', 'Project', 'Technology', 'Document', 'Task'];
const RELATION_TYPES = ['works_on', 'uses', 'depends_on', 'created_by', 'related_to'];

function generateEntityName(type: string, index: number): string {
  const names = {
    Person: ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry'],
    Project: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'],
    Technology: ['TypeScript', 'React', 'Node.js', 'Python', 'Go', 'Rust', 'Java', 'C++'],
    Document: ['Spec', 'Guide', 'Manual', 'Report', 'Analysis', 'Design', 'Plan', 'Review'],
    Task: ['Implement', 'Test', 'Deploy', 'Review', 'Refactor', 'Document', 'Optimize', 'Debug']
  };
  
  const nameList = names[type as keyof typeof names] || ['Item'];
  const baseName = nameList[index % nameList.length];
  return `${baseName} ${Math.floor(index / nameList.length) + 1}`;
}

function generateObservation(entityName: string, type: string, index: number): string {
  const templates = [
    `${entityName} is a ${type.toLowerCase()} that focuses on innovation and quality.`,
    `Key characteristics of ${entityName} include reliability and performance.`,
    `${entityName} has been actively developed and maintained since 2020.`,
    `The primary goal of ${entityName} is to deliver exceptional results.`,
    `${entityName} integrates seamlessly with modern development workflows.`
  ];
  
  return templates[index % templates.length];
}

async function createTestData(
  db: any,
  embeddingService: EmbeddingService,
  config: TestConfig
): Promise<{ entityIds: string[]; duration: number }> {
  const startTime = Date.now();
  const entityIds: string[] = [];
  
  logger.info('TestLargeDataset', `Creating ${config.numEntities} entities...`);
  
  // Pre-generate embeddings for entity types to speed up creation
  const typeEmbeddings = new Map<string, { content: number[], name: number[] }>();
  for (const type of ENTITY_TYPES) {
    const contentEmbed = await embeddingService.embed(`${type} entity`);
    const nameEmbed = await embeddingService.embed(type);
    typeEmbeddings.set(type, { content: contentEmbed, name: nameEmbed });
  }
  
  // Create entities directly in CozoDB
  for (let i = 0; i < config.numEntities; i++) {
    const type = ENTITY_TYPES[i % ENTITY_TYPES.length];
    const name = generateEntityName(type, i);
    const id = uuidv4();
    
    const endTimer = perfMonitor.startTimer('create_entity');
    try {
      // Reuse type embeddings for speed
      const embeddings = typeEmbeddings.get(type)!;
      
      // Insert into CozoDB
      await db.run(`
        ?[id, name, type, content_embedding, name_embedding, metadata, created_at] <- [
          [$id, $name, $type, $content_embedding, $name_embedding, $metadata, $created_at]
        ]
        :put entity { id => name, type, content_embedding, name_embedding, metadata, created_at }
      `, {
        id,
        name,
        type,
        content_embedding: embeddings.content,
        name_embedding: embeddings.name,
        metadata: { index: i, category: type.toLowerCase(), created_at: Date.now() },
        created_at: [Date.now() * 1000, true]
      });
      
      entityIds.push(id);
      endTimer();
    } catch (error) {
      perfMonitor.recordMetric('create_entity', 0, true);
      logger.error('TestLargeDataset', `Failed to create entity ${name}:`, error);
    }
    
    if ((i + 1) % 50 === 0) {
      logger.info('TestLargeDataset', `Created ${i + 1}/${config.numEntities} entities`);
    }
  }
  
  logger.info('TestLargeDataset', `Creating observations...`);
  
  // Pre-generate a few observation embeddings to reuse (for speed)
  const observationTemplates = [
    'This entity focuses on innovation and quality.',
    'Key characteristics include reliability and performance.',
    'Has been actively developed since 2020.',
    'Primary goal is to deliver exceptional results.',
    'Integrates seamlessly with modern workflows.'
  ];
  
  logger.info('TestLargeDataset', `Pre-generating ${observationTemplates.length} observation embeddings...`);
  const templateEmbeddings = await Promise.all(
    observationTemplates.map(t => embeddingService.embed(t))
  );
  
  // Create observations in batches for better performance
  let obsCount = 0;
  const totalObservations = entityIds.length * config.numObservationsPerEntity;
  let lastLogTime = Date.now();
  const BATCH_SIZE = 50; // Insert 50 observations at once
  
  const observationBatch: any[] = [];
  
  for (const entityId of entityIds) {
    for (let j = 0; j < config.numObservationsPerEntity; j++) {
      // Reuse pre-generated embeddings for speed
      const templateIdx = j % templateEmbeddings.length;
      const text = observationTemplates[templateIdx];
      const embedding = templateEmbeddings[templateIdx];
      
      observationBatch.push({
        id: uuidv4(),
        entity_id: entityId,
        text,
        embedding,
        metadata: { confidence: 0.8 + Math.random() * 0.2 },
        session_id: '',
        task_id: '',
        created_at: [Date.now() * 1000, true]
      });
      
      // Insert batch when it reaches BATCH_SIZE
      if (observationBatch.length >= BATCH_SIZE) {
        const endTimer = perfMonitor.startTimer('add_observation');
        try {
          // Build batch insert query - remove hyphens from UUIDs for variable names
          const rows = observationBatch.map(obs => {
            const cleanId = obs.id.replace(/-/g, '_');
            return `[$id_${cleanId}, $entity_id_${cleanId}, $text_${cleanId}, $embedding_${cleanId}, $metadata_${cleanId}, $session_id_${cleanId}, $task_id_${cleanId}, $created_at_${cleanId}]`;
          }).join(',\n            ');
          
          const params: any = {};
          for (const obs of observationBatch) {
            const cleanId = obs.id.replace(/-/g, '_');
            params[`id_${cleanId}`] = obs.id;
            params[`entity_id_${cleanId}`] = obs.entity_id;
            params[`text_${cleanId}`] = obs.text;
            params[`embedding_${cleanId}`] = obs.embedding;
            params[`metadata_${cleanId}`] = obs.metadata;
            params[`session_id_${cleanId}`] = obs.session_id;
            params[`task_id_${cleanId}`] = obs.task_id;
            params[`created_at_${cleanId}`] = obs.created_at;
          }
          
          await db.run(`
            ?[id, entity_id, text, embedding, metadata, session_id, task_id, created_at] <- [
              ${rows}
            ]
            :put observation { id => entity_id, text, embedding, metadata, session_id, task_id, created_at }
          `, params);
          
          obsCount += observationBatch.length;
          endTimer();
          observationBatch.length = 0; // Clear batch
        } catch (error) {
          perfMonitor.recordMetric('add_observation', 0, true);
          logger.error('TestLargeDataset', `Failed to create observation batch at ${obsCount}:`, error);
          observationBatch.length = 0; // Clear batch on error
        }
        
        // Log progress
        const now = Date.now();
        if (obsCount % 50 === 0 || (now - lastLogTime) > 10000) {
          logger.info('TestLargeDataset', `Created ${obsCount}/${totalObservations} observations (${((obsCount/totalObservations)*100).toFixed(1)}%)`);
          lastLogTime = now;
        }
      }
    }
  }
  
  // Insert remaining observations
  if (observationBatch.length > 0) {
    const endTimer = perfMonitor.startTimer('add_observation');
    try {
      const rows = observationBatch.map(obs => {
        const cleanId = obs.id.replace(/-/g, '_');
        return `[$id_${cleanId}, $entity_id_${cleanId}, $text_${cleanId}, $embedding_${cleanId}, $metadata_${cleanId}, $session_id_${cleanId}, $task_id_${cleanId}, $created_at_${cleanId}]`;
      }).join(',\n            ');
      
      const params: any = {};
      for (const obs of observationBatch) {
        const cleanId = obs.id.replace(/-/g, '_');
        params[`id_${cleanId}`] = obs.id;
        params[`entity_id_${cleanId}`] = obs.entity_id;
        params[`text_${cleanId}`] = obs.text;
        params[`embedding_${cleanId}`] = obs.embedding;
        params[`metadata_${cleanId}`] = obs.metadata;
        params[`session_id_${cleanId}`] = obs.session_id;
        params[`task_id_${cleanId}`] = obs.task_id;
        params[`created_at_${cleanId}`] = obs.created_at;
      }
      
      await db.run(`
        ?[id, entity_id, text, embedding, metadata, session_id, task_id, created_at] <- [
          ${rows}
        ]
        :put observation { id => entity_id, text, embedding, metadata, session_id, task_id, created_at }
      `, params);
      
      obsCount += observationBatch.length;
      endTimer();
    } catch (error) {
      perfMonitor.recordMetric('add_observation', 0, true);
      logger.error('TestLargeDataset', `Failed to create final observation batch:`, error);
    }
    
    logger.info('TestLargeDataset', `Created ${obsCount}/${totalObservations} observations (100.0%)`);
  }
  
  logger.info('TestLargeDataset', `Creating ${config.numRelationships} relationships...`);
  
  // Create relationships
  for (let i = 0; i < config.numRelationships; i++) {
    const fromId = entityIds[Math.floor(Math.random() * entityIds.length)];
    let toId = entityIds[Math.floor(Math.random() * entityIds.length)];
    
    // Avoid self-references
    while (toId === fromId) {
      toId = entityIds[Math.floor(Math.random() * entityIds.length)];
    }
    
    const relationType = RELATION_TYPES[i % RELATION_TYPES.length];
    
    const endTimer = perfMonitor.startTimer('create_relation');
    try {
      await db.run(`
        ?[from_id, to_id, relation_type, strength, metadata, created_at] <- [
          [$from_id, $to_id, $relation_type, $strength, $metadata, $created_at]
        ]
        :put relationship { from_id, to_id, relation_type => strength, metadata, created_at }
      `, {
        from_id: fromId,
        to_id: toId,
        relation_type: relationType,
        strength: 0.5 + Math.random() * 0.5,
        metadata: {},
        created_at: [Date.now() * 1000, true]
      });
      endTimer();
    } catch (error) {
      perfMonitor.recordMetric('create_relation', 0, true);
    }
    
    if ((i + 1) % 500 === 0) {
      logger.info('TestLargeDataset', `Created ${i + 1}/${config.numRelationships} relationships`);
    }
  }
  
  const duration = Date.now() - startTime;
  logger.info('TestLargeDataset', `Data creation completed in ${(duration / 1000).toFixed(2)}s`);
  
  return { entityIds, duration };
}

async function runSearchTests(
  hybridSearch: HybridSearch,
  config: TestConfig
): Promise<void> {
  logger.info('TestLargeDataset', `Running ${config.searchQueries} search queries...`);
  
  const queries = [
    'project management',
    'software development',
    'team collaboration',
    'technical documentation',
    'code review process',
    'deployment pipeline',
    'testing strategy',
    'performance optimization'
  ];
  
  for (let i = 0; i < config.searchQueries; i++) {
    const query = queries[i % queries.length];
    
    const endTimer = perfMonitor.startTimer('hybrid_search');
    try {
      await hybridSearch.search({ query, limit: 10 });
      endTimer();
    } catch (error) {
      perfMonitor.recordMetric('hybrid_search', 0, true);
      logger.error('TestLargeDataset', `Search failed for query "${query}":`, error);
    }
    
    if ((i + 1) % 20 === 0) {
      logger.info('TestLargeDataset', `Completed ${i + 1}/${config.searchQueries} searches`);
    }
  }
}

async function runTest(configName: string, cleanStart: boolean = false) {
  const config = CONFIGS[configName];
  if (!config) {
    logger.error('TestLargeDataset', `Unknown config: ${configName}`);
    return;
  }
  
  logger.info('TestLargeDataset', `\n=== Starting ${configName.toUpperCase()} dataset test ===`);
  logger.info('TestLargeDataset', `Config: ${JSON.stringify(config, null, 2)}`);
  
  // Use the real CozoDB setup like in index.ts
  const { CozoDb } = await import('cozo-node');
  const dbPath = `test_large_${configName}.cozo.db`;
  
  // Delete old database only if cleanStart flag is set
  const fs = await import('fs');
  if (cleanStart && fs.existsSync(dbPath)) {
    logger.info('TestLargeDataset', `Removing old database: ${dbPath}`);
    fs.unlinkSync(dbPath);
  } else if (fs.existsSync(dbPath)) {
    logger.info('TestLargeDataset', `Using existing database: ${dbPath}`);
  }
  
  const db = new CozoDb('sqlite', dbPath);
  
  const embeddingService = new EmbeddingService();
  const hybridSearch = new HybridSearch(db, embeddingService);
  
  // Initialize schema like the real server does
  try {
    // Create entity table
    await db.run(`
      :create entity {
        id: String,
        =>
        name: String,
        type: String,
        content_embedding: <F32; 1024>,
        name_embedding: <F32; 1024>,
        metadata: Json,
        created_at: Validity
      }
    `);
    
    // Create content HNSW index
    await db.run(`
      ::hnsw create entity:semantic {
        dim: 1024,
        m: 50,
        dtype: F32,
        ef_construction: 200,
        fields: [content_embedding],
        distance: Cosine,
        extend_candidates: true,
        keep_pruned_connections: true
      }
    `);
    
    // Create name HNSW index
    await db.run(`
      ::hnsw create entity:name_semantic {
        dim: 1024,
        m: 50,
        dtype: F32,
        ef_construction: 200,
        fields: [name_embedding],
        distance: Cosine,
        extend_candidates: true,
        keep_pruned_connections: true
      }
    `);
    
    // Create FTS index for entity names
    await db.run(`
      ::fts create entity:fts {
        extractor: name,
        tokenizer: Simple,
        filters: [Lowercase, Stemmer('english'), Stopwords('en')]
      }
    `);
    
    // Create observation table
    await db.run(`
      :create observation {
        id: String,
        =>
        entity_id: String,
        text: String,
        embedding: <F32; 1024>,
        metadata: Json,
        session_id: String,
        task_id: String,
        created_at: Validity
      }
    `);
    
    // Create observation HNSW index
    await db.run(`
      ::hnsw create observation:semantic {
        dim: 1024,
        m: 50,
        dtype: F32,
        ef_construction: 200,
        fields: [embedding],
        distance: Cosine,
        extend_candidates: true,
        keep_pruned_connections: true
      }
    `);
    
    // Create FTS index for observation text
    await db.run(`
      ::fts create observation:fts {
        extractor: text,
        tokenizer: Simple,
        filters: [Lowercase, Stemmer('english'), Stopwords('en')]
      }
    `);
    
    // Create relationship table
    await db.run(`
      :create relationship {
        from_id: String,
        to_id: String,
        relation_type: String,
        =>
        strength: Float,
        metadata: Json,
        created_at: Validity
      }
    `);
    
    // Create search cache table
    await db.run(`
      :create search_cache {
        query_hash: String,
        =>
        query_text: String,
        results: Json,
        options: Json,
        embedding: <F32; 1024>,
        created_at: Int
      }
    `);
    
    // Create search cache HNSW index
    await db.run(`
      ::hnsw create search_cache:semantic {
        dim: 1024,
        m: 16,
        dtype: F32,
        ef_construction: 200,
        fields: [embedding],
        distance: Cosine
      }
    `);
    
    // Create entity_rank table (for PageRank scores)
    await db.run(`
      :create entity_rank {
        entity_id: String
        =>
        pagerank: Float
      }
    `);
    
    logger.info('TestLargeDataset', 'Database schema initialized with all indexes');
  } catch (error: any) {
    if (!error.message?.includes('already exists')) {
      logger.error('TestLargeDataset', 'Schema initialization failed:', error);
      throw error;
    }
    logger.info('TestLargeDataset', 'Schema already exists, continuing...');
  }
  
  try {
    // Check if database already has data - simple approach
    let existingEntityCount = 0;
    try {
      const statsQuery = await db.run(`?[id] := *entity{id} :limit 1`);
      existingEntityCount = statsQuery.rows.length > 0 ? 1 : 0;
      
      if (existingEntityCount > 0) {
        // Get actual count
        const countQuery = await db.run(`?[count(id)] := *entity{id}`);
        existingEntityCount = countQuery.rows[0]?.[0] || 0;
      }
    } catch (e) {
      // Table doesn't exist yet, that's fine
      existingEntityCount = 0;
    }
    
    if (existingEntityCount > 0 && !cleanStart) {
      logger.info('TestLargeDataset', `Database already contains ${existingEntityCount} entities, skipping data creation`);
      logger.info('TestLargeDataset', `Use --clean flag to recreate database from scratch`);
    } else {
      // Create test data
      const { entityIds, duration: createDuration } = await createTestData(db, embeddingService, config);
      
      const totalOps = config.numEntities + 
                       (config.numEntities * config.numObservationsPerEntity) +
                       config.numRelationships;
      const totalTime = createDuration / 1000;
      const throughput = totalOps / totalTime;
      
      logger.info('TestLargeDataset', `\nData creation stats:`);
      logger.info('TestLargeDataset', `Total operations: ${totalOps}`);
      logger.info('TestLargeDataset', `Total time: ${totalTime.toFixed(2)}s`);
      logger.info('TestLargeDataset', `Throughput: ${throughput.toFixed(2)} ops/sec`);
    }
    
    // Run search tests
    await runSearchTests(hybridSearch, config);
    
    // Print performance summary
    logger.info('TestLargeDataset', '\n=== Performance Summary ===');
    perfMonitor.logSummary();
    
  } catch (error) {
    logger.error('TestLargeDataset', 'Test failed:', error);
  } finally {
    db.close();
  }
}

// Run tests
async function main() {
  const configName = process.argv[2] || 'small';
  const cleanStart = process.argv.includes('--clean');
  
  if (cleanStart) {
    logger.info('TestLargeDataset', 'Clean start mode: will delete existing database');
  }
  
  await runTest(configName, cleanStart);
  
  logger.info('TestLargeDataset', '\n=== Test completed ===');
  logger.info('TestLargeDataset', `\nUsage: npx ts-node src/test-large-dataset.ts [small|medium|large] [--clean]`);
  logger.info('TestLargeDataset', `  --clean: Delete existing database before test`);
}

main().catch(console.error);
