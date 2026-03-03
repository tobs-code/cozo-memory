/**
 * Migration Script: Replace console.error with logger
 * 
 * This script helps migrate from console.error to the centralized logger
 */

import * as fs from 'fs';
import * as path from 'path';

const filesToMigrate = [
  'src/memory-service.ts',
  'src/db-service.ts',
  'src/embedding-service.ts',
  'src/inference-engine.ts',
  'src/dynamic-fusion.ts',
  'src/adaptive-retrieval.ts',
  'src/adaptive-query-fusion.ts',
  'src/reranker-service.ts',
  'src/export-import-service.ts',
  'src/janitor-service.ts'
];

// Mapping of console.error patterns to logger calls
const migrations = [
  {
    pattern: /console\.error\(\s*\[([^\]]+)\]\s+([^,]+),/g,
    replacement: "logger.error('$1', $2,"
  },
  {
    pattern: /console\.error\(\s*\[([^\]]+)\]\s+([^)]+)\)/g,
    replacement: "logger.error('$1', $2)"
  },
  {
    pattern: /console\.warn\(\s*\[([^\]]+)\]\s+([^)]+)\)/g,
    replacement: "logger.warn('$1', $2)"
  }
];

function migrateFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${filePath} - file not found`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // Check if logger is already imported
  if (!content.includes("import { logger }")) {
    // Find the last import statement
    const importRegex = /^import .+ from .+;$/gm;
    const imports = content.match(importRegex);
    
    if (imports && imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      const lastImportIndex = content.lastIndexOf(lastImport);
      
      content = content.slice(0, lastImportIndex + lastImport.length) +
                "\nimport { logger } from './logger';" +
                content.slice(lastImportIndex + lastImport.length);
      modified = true;
    }
  }

  // Apply migrations
  for (const migration of migrations) {
    if (migration.pattern.test(content)) {
      content = content.replace(migration.pattern, migration.replacement);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✓ Migrated ${filePath}`);
  } else {
    console.log(`- No changes needed for ${filePath}`);
  }
}

console.log('Starting logging migration...\n');

for (const file of filesToMigrate) {
  migrateFile(file);
}

console.log('\nMigration complete!');
console.log('\nNext steps:');
console.log('1. Review the changes');
console.log('2. Run: npm run build');
console.log('3. Test with: LOG_LEVEL=DEBUG npm start');
