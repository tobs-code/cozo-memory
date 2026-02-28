#!/usr/bin/env node
/**
 * Pure CLI for CozoDB Memory
 * Usage: cozo-memory <command> [options]
 */

import { Command } from 'commander';
import { CLICommands } from './cli-commands.js';
import chalk from 'chalk';
import * as fs from 'fs';

const program = new Command();
const cli = new CLICommands();

// Helper to format output
function formatOutput(data: any, format: 'json' | 'pretty' = 'pretty'): void {
  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(chalk.cyan(JSON.stringify(data, null, 2)));
  }
}

// Helper to handle errors
function handleError(error: any): void {
  console.error(chalk.red('Error:'), error.message || error);
  process.exit(1);
}

program
  .name('cozo-memory')
  .description('CLI for CozoDB Memory - Local-first persistent memory for AI agents')
  .version('1.0.6');

// Entity commands
const entity = program.command('entity').description('Entity operations');

entity
  .command('create')
  .description('Create a new entity')
  .requiredOption('-n, --name <name>', 'Entity name')
  .requiredOption('-t, --type <type>', 'Entity type')
  .option('-m, --metadata <json>', 'Metadata as JSON string')
  .option('-f, --format <format>', 'Output format (json|pretty)', 'pretty')
  .action(async (options) => {
    try {
      await cli.init();
      const metadata = options.metadata ? JSON.parse(options.metadata) : undefined;
      const result = await cli.createEntity(options.name, options.type, metadata);
      formatOutput(result, options.format);
      await cli.close();
    } catch (error) {
      handleError(error);
    }
  });

entity
  .command('get')
  .description('Get entity details')
  .requiredOption('-i, --id <id>', 'Entity ID')
  .option('-f, --format <format>', 'Output format (json|pretty)', 'pretty')
  .action(async (options) => {
    try {
      await cli.init();
      const result = await cli.getEntity(options.id);
      formatOutput(result, options.format);
      await cli.close();
    } catch (error) {
      handleError(error);
    }
  });

entity
  .command('delete')
  .description('Delete an entity')
  .requiredOption('-i, --id <id>', 'Entity ID')
  .option('-f, --format <format>', 'Output format (json|pretty)', 'pretty')
  .action(async (options) => {
    try {
      await cli.init();
      const result = await cli.deleteEntity(options.id);
      formatOutput(result, options.format);
      await cli.close();
    } catch (error) {
      handleError(error);
    }
  });

// Observation commands
const observation = program.command('observation').alias('obs').description('Observation operations');

observation
  .command('add')
  .description('Add observation to entity')
  .requiredOption('-i, --entity-id <id>', 'Entity ID')
  .requiredOption('-t, --text <text>', 'Observation text')
  .option('-m, --metadata <json>', 'Metadata as JSON string')
  .option('-f, --format <format>', 'Output format (json|pretty)', 'pretty')
  .action(async (options) => {
    try {
      await cli.init();
      const metadata = options.metadata ? JSON.parse(options.metadata) : undefined;
      const result = await cli.addObservation(options.entityId, options.text, metadata);
      formatOutput(result, options.format);
      await cli.close();
    } catch (error) {
      handleError(error);
    }
  });

// Relation commands
const relation = program.command('relation').alias('rel').description('Relation operations');

relation
  .command('create')
  .description('Create relation between entities')
  .requiredOption('--from <id>', 'From entity ID')
  .requiredOption('--to <id>', 'To entity ID')
  .requiredOption('--type <type>', 'Relation type')
  .option('-s, --strength <number>', 'Relation strength (0-1)', parseFloat)
  .option('-m, --metadata <json>', 'Metadata as JSON string')
  .option('-f, --format <format>', 'Output format (json|pretty)', 'pretty')
  .action(async (options) => {
    try {
      await cli.init();
      const metadata = options.metadata ? JSON.parse(options.metadata) : undefined;
      const result = await cli.createRelation(
        options.from,
        options.to,
        options.type,
        options.strength,
        metadata
      );
      formatOutput(result, options.format);
      await cli.close();
    } catch (error) {
      handleError(error);
    }
  });

// Search commands
const search = program.command('search').description('Search operations');

search
  .command('query')
  .description('Search memory')
  .requiredOption('-q, --query <query>', 'Search query')
  .option('-l, --limit <number>', 'Result limit', parseInt, 10)
  .option('-t, --types <types>', 'Entity types (comma-separated)')
  .option('--no-entities', 'Exclude entities')
  .option('--no-observations', 'Exclude observations')
  .option('-f, --format <format>', 'Output format (json|pretty)', 'pretty')
  .action(async (options) => {
    try {
      await cli.init();
      const entityTypes = options.types ? options.types.split(',') : undefined;
      const result = await cli.search(
        options.query,
        options.limit,
        entityTypes,
        options.entities,
        options.observations
      );
      formatOutput(result, options.format);
      await cli.close();
    } catch (error) {
      handleError(error);
    }
  });

search
  .command('context')
  .description('Get contextual information')
  .requiredOption('-q, --query <query>', 'Context query')
  .option('-w, --window <number>', 'Context window', parseInt)
  .option('-h, --hours <number>', 'Time range in hours', parseInt)
  .option('-f, --format <format>', 'Output format (json|pretty)', 'pretty')
  .action(async (options) => {
    try {
      await cli.init();
      const result = await cli.context(options.query, options.window, options.hours);
      formatOutput(result, options.format);
      await cli.close();
    } catch (error) {
      handleError(error);
    }
  });

// Graph commands
const graph = program.command('graph').description('Graph operations');

graph
  .command('explore')
  .description('Explore graph from entity')
  .requiredOption('-s, --start <id>', 'Start entity ID')
  .option('-e, --end <id>', 'End entity ID (for path finding)')
  .option('-h, --hops <number>', 'Max hops', parseInt, 3)
  .option('-t, --types <types>', 'Relation types (comma-separated)')
  .option('-f, --format <format>', 'Output format (json|pretty)', 'pretty')
  .action(async (options) => {
    try {
      await cli.init();
      const relationTypes = options.types ? options.types.split(',') : undefined;
      const result = await cli.explore(
        options.start,
        options.end,
        options.hops,
        relationTypes
      );
      formatOutput(result, options.format);
      await cli.close();
    } catch (error) {
      handleError(error);
    }
  });

graph
  .command('pagerank')
  .description('Calculate PageRank')
  .option('-f, --format <format>', 'Output format (json|pretty)', 'pretty')
  .action(async (options) => {
    try {
      await cli.init();
      const result = await cli.pagerank();
      formatOutput(result, options.format);
      await cli.close();
    } catch (error) {
      handleError(error);
    }
  });

graph
  .command('communities')
  .description('Detect communities')
  .option('-f, --format <format>', 'Output format (json|pretty)', 'pretty')
  .action(async (options) => {
    try {
      await cli.init();
      const result = await cli.communities();
      formatOutput(result, options.format);
      await cli.close();
    } catch (error) {
      handleError(error);
    }
  });

// System commands
const system = program.command('system').alias('sys').description('System operations');

system
  .command('health')
  .description('Check system health')
  .option('-f, --format <format>', 'Output format (json|pretty)', 'pretty')
  .action(async (options) => {
    try {
      await cli.init();
      const result = await cli.health();
      formatOutput(result, options.format);
      await cli.close();
    } catch (error) {
      handleError(error);
    }
  });

system
  .command('metrics')
  .description('Get system metrics')
  .option('-f, --format <format>', 'Output format (json|pretty)', 'pretty')
  .action(async (options) => {
    try {
      await cli.init();
      const result = await cli.metrics();
      formatOutput(result, options.format);
      await cli.close();
    } catch (error) {
      handleError(error);
    }
  });

// Export/Import commands
const exportCmd = program.command('export').description('Export memory');

exportCmd
  .command('json')
  .description('Export as JSON')
  .option('-o, --output <file>', 'Output file')
  .option('--include-metadata', 'Include metadata')
  .option('--include-relationships', 'Include relationships')
  .option('--include-observations', 'Include observations')
  .action(async (options) => {
    try {
      await cli.init();
      const result = await cli.exportMemory('json', {
        includeMetadata: options.includeMetadata,
        includeRelationships: options.includeRelationships,
        includeObservations: options.includeObservations
      });
      
      const jsonData = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
      
      if (options.output) {
        fs.writeFileSync(options.output, jsonData);
        console.log(chalk.green(`✓ Exported to ${options.output}`));
      } else {
        console.log(jsonData);
      }
      await cli.close();
    } catch (error) {
      handleError(error);
    }
  });

exportCmd
  .command('markdown')
  .description('Export as Markdown')
  .option('-o, --output <file>', 'Output file')
  .action(async (options) => {
    try {
      await cli.init();
      const result = await cli.exportMemory('markdown');
      
      if (options.output) {
        fs.writeFileSync(options.output, result.data);
        console.log(chalk.green(`✓ Exported to ${options.output}`));
      } else {
        console.log(result.data);
      }
      await cli.close();
    } catch (error) {
      handleError(error);
    }
  });

exportCmd
  .command('obsidian')
  .description('Export as Obsidian ZIP')
  .requiredOption('-o, --output <file>', 'Output ZIP file')
  .action(async (options) => {
    try {
      await cli.init();
      const result = await cli.exportMemory('obsidian');
      
      // Obsidian export returns zipBuffer, not data
      const buffer = result.zipBuffer || result.data;
      if (!buffer) {
        throw new Error('No buffer returned from export');
      }
      
      fs.writeFileSync(options.output, buffer);
      console.log(chalk.green(`✓ Exported to ${options.output}`));
      await cli.close();
    } catch (error) {
      handleError(error);
    }
  });

const importCmd = program.command('import').description('Import memory');

importCmd
  .command('file')
  .description('Import from file')
  .requiredOption('-i, --input <file>', 'Input file')
  .requiredOption('-f, --format <format>', 'Source format (cozo|mem0|memgpt|markdown)')
  .option('-s, --strategy <strategy>', 'Merge strategy (skip|overwrite|merge)', 'skip')
  .action(async (options) => {
    try {
      await cli.init();
      const data = fs.readFileSync(options.input, 'utf-8');
      const result = await cli.importMemory(data, options.format, {
        mergeStrategy: options.strategy
      });
      formatOutput(result, 'pretty');
      await cli.close();
    } catch (error) {
      handleError(error);
    }
  });

// Ingest commands
const ingest = program.command('ingest').description('Ingest files');

ingest
  .command('file')
  .description('Ingest file into entity')
  .requiredOption('-i, --entity-id <id>', 'Entity ID')
  .requiredOption('-p, --path <path>', 'File path')
  .requiredOption('-f, --format <format>', 'File format (markdown|json|pdf)')
  .option('-c, --chunking <type>', 'Chunking type (none|paragraphs)', 'paragraphs')
  .option('-m, --max <number>', 'Max observations', parseInt)
  .option('--no-deduplicate', 'Disable deduplication')
  .action(async (options) => {
    try {
      await cli.init();
      const result = await cli.ingestFile(
        options.entityId,
        options.format,
        options.path,
        undefined,
        {
          chunking: options.chunking,
          maxObservations: options.max,
          deduplicate: options.deduplicate
        }
      );
      formatOutput(result, 'pretty');
      await cli.close();
    } catch (error) {
      handleError(error);
    }
  });

program.parse();
