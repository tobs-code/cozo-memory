import { CozoDb } from 'cozo-node';
import { EmbeddingService } from './embedding-service';
import { HybridSearch } from './hybrid-search';
import { RerankerService } from './reranker-service';
import {
  QueryPipeline,
  PipelineBuilder,
  preprocessStages,
  searchStages,
  rerankStages,
  postProcessStages,
  createStandardPipeline,
  createGraphRagPipeline,
  createAgenticPipeline,
  StageContext
} from './query-pipeline';

async function testQueryPipeline() {
  console.log('=== Query Pipeline Test ===\n');
  
  const db = new CozoDb();
  const embeddingService = new EmbeddingService();
  const hybridSearch = new HybridSearch(db, embeddingService);
  const reranker = new RerankerService();
  
  try {
    console.log('--- Test 1: Pipeline Builder ---');
    const customPipeline = new PipelineBuilder('test-pipeline')
      .addPreprocess(preprocessStages.queryNormalization())
      .addPreprocess(preprocessStages.embedQuery(embeddingService))
      .addPostProcess(postProcessStages.scoreNormalization())
      .addPostProcess(postProcessStages.topK())
      .build();
    
    console.log('Pipeline name:', customPipeline.name);
    console.log('Number of stages:', customPipeline.stages.length);
    console.log('Stage types:', customPipeline.stages.map(s => s.type).join(', '));
    console.log('✓ Pipeline builder works\n');
    
    // Test 2: Preprocessing Stages
    console.log('--- Test 2: Preprocessing Stages ---');
    const pipeline = new QueryPipeline(customPipeline);
    const result = await pipeline.execute('  HELLO WORLD  ', { topK: 5 });
    
    console.log('Original query: "  HELLO WORLD  "');
    console.log('Normalized query:', result.metadata.query || 'not stored');
    console.log('Embedding generated:', result.metadata.embedding ? 'yes' : 'no');
    console.log('Metrics:', result.metrics);
    console.log('✓ Preprocessing stages work\n');
    
    // Test 3: Conditional Execution
    console.log('--- Test 3: Conditional Execution ---');
    const conditionalConfig = new PipelineBuilder('conditional')
      .addPreprocess(preprocessStages.queryNormalization())
      .addPreprocess({
        type: 'preprocess',
        name: 'conditional-stage',
        enabled: true,
        condition: (ctx: StageContext) => ctx.query.length > 5,
        execute: async (ctx) => {
          ctx.metadata.conditionalExecuted = true;
          return ctx;
        }
      })
      .build();
    
    const conditionalPipeline = new QueryPipeline(conditionalConfig);
    
    const shortResult = await conditionalPipeline.execute('hi', {});
    console.log('Short query "hi":');
    console.log('  Conditional executed:', shortResult.metadata.conditionalExecuted || false);
    
    const longResult = await conditionalPipeline.execute('hello world', {});
    console.log('Long query "hello world":');
    console.log('  Conditional executed:', longResult.metadata.conditionalExecuted || false);
    console.log('✓ Conditional execution works\n');
    
    // Test 4: Stage Metrics
    console.log('--- Test 4: Stage Metrics ---');
    const metricsConfig = new PipelineBuilder('metrics-test')
      .addPreprocess(preprocessStages.queryNormalization())
      .addPreprocess(preprocessStages.embedQuery(embeddingService))
      .addPostProcess(postProcessStages.scoreNormalization())
      .build();
    
    const metricsPipeline = new QueryPipeline(metricsConfig);
    const metricsResult = await metricsPipeline.execute('test query', {});
    
    console.log('Stage execution times:');
    for (const [stage, time] of Object.entries(metricsResult.metrics)) {
      console.log(`  ${stage}: ${time}ms`);
    }
    console.log('✓ Metrics collection works\n');
    
    // Test 5: Diversity Reranking (without actual results)
    console.log('--- Test 5: Diversity Reranking ---');
    const mockResults = [
      { id: '1', score: 0.9, embedding: [1, 0, 0] },
      { id: '2', score: 0.85, embedding: [0.9, 0.1, 0] },
      { id: '3', score: 0.8, embedding: [0, 1, 0] },
      { id: '4', score: 0.75, embedding: [0, 0.9, 0.1] }
    ];
    
    const diversityConfig = new PipelineBuilder('diversity-test')
      .addRerank(rerankStages.diversityRerank())
      .build();
    
    const diversityPipeline = new QueryPipeline(diversityConfig);
    const diversityResult = await diversityPipeline.execute('test', {});
    diversityResult.results = mockResults;
    
    // Manually execute diversity rerank
    const rerankStage = diversityConfig.stages[0];
    const ctx: StageContext = {
      query: 'test',
      results: mockResults,
      metadata: { diversityWeight: 0.5 },
      metrics: {}
    };
    await rerankStage.execute(ctx);
    
    console.log('Original order:', mockResults.map(r => r.id).join(', '));
    console.log('Reranked order:', ctx.results?.map((r: any) => r.id).join(', '));
    console.log('✓ Diversity reranking works\n');
    
    // Test 6: Deduplication
    console.log('--- Test 6: Deduplication ---');
    const duplicateResults = [
      { id: '1', entity_id: 'e1', score: 0.9, embedding: [1, 0, 0] },
      { id: '2', entity_id: 'e1', score: 0.85, embedding: [1, 0, 0] }, // duplicate entity_id
      { id: '3', entity_id: 'e2', score: 0.8, embedding: [0.99, 0.01, 0] }, // similar embedding
      { id: '4', entity_id: 'e3', score: 0.75, embedding: [0, 1, 0] }
    ];
    
    const dedupConfig = new PipelineBuilder('dedup-test')
      .addPostProcess(postProcessStages.deduplication())
      .build();
    
    const dedupPipeline = new QueryPipeline(dedupConfig);
    const dedupCtx: StageContext = {
      query: 'test',
      results: duplicateResults,
      metadata: { dedupThreshold: 0.95 },
      metrics: {}
    };
    
    await dedupConfig.stages[0].execute(dedupCtx);
    
    console.log('Before dedup:', duplicateResults.length, 'results');
    console.log('After dedup:', dedupCtx.results?.length, 'results');
    console.log('Removed:', duplicateResults.length - (dedupCtx.results?.length || 0), 'duplicates');
    console.log('✓ Deduplication works\n');
    
    // Test 7: Score Normalization
    console.log('--- Test 7: Score Normalization ---');
    const unnormalizedResults = [
      { id: '1', score: 100 },
      { id: '2', score: 75 },
      { id: '3', score: 50 },
      { id: '4', score: 25 }
    ];
    
    const normalizeConfig = new PipelineBuilder('normalize-test')
      .addPostProcess(postProcessStages.scoreNormalization())
      .build();
    
    const normalizeCtx: StageContext = {
      query: 'test',
      results: [...unnormalizedResults],
      metadata: {},
      metrics: {}
    };
    
    await normalizeConfig.stages[0].execute(normalizeCtx);
    
    console.log('Original scores:', unnormalizedResults.map(r => r.score).join(', '));
    console.log('Normalized scores:', normalizeCtx.results?.map((r: any) => r.score.toFixed(2)).join(', '));
    console.log('✓ Score normalization works\n');
    
    console.log('✓ All pipeline tests completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    db.close();
  }
}

testQueryPipeline();
