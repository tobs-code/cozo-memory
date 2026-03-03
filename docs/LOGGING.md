# Logging System

CozoDB Memory uses a centralized logging system with configurable log levels.

## Log Levels

- `ERROR` (0): Critical errors that require immediate attention
- `WARN` (1): Warning messages for potential issues
- `INFO` (2): General informational messages (default)
- `DEBUG` (3): Detailed debugging information
- `TRACE` (4): Very detailed trace information

## Configuration

Set the log level via environment variable:

```bash
# Production (minimal logging)
LOG_LEVEL=ERROR npm start

# Development (detailed logging)
LOG_LEVEL=DEBUG npm start

# Troubleshooting (maximum detail)
LOG_LEVEL=TRACE npm start
```

## Usage in Code

```typescript
import { logger } from './logger';

// Error logging
logger.error('ComponentName', 'Error message', errorObject);

// Warning
logger.warn('ComponentName', 'Warning message', details);

// Info (default level)
logger.info('ComponentName', 'Info message', data);

// Debug
logger.debug('ComponentName', 'Debug message', debugData);

// Trace
logger.trace('ComponentName', 'Trace message', traceData);
```

## Component Names

Use consistent component names across the codebase:

- `MemoryService` - Entity/observation CRUD operations
- `HybridSearch` - Search strategies
- `DynamicFusion` - Multi-path fusion search
- `AdaptiveRetrieval` - Adaptive retrieval strategies
- `EmbeddingService` - Vector generation
- `DatabaseService` - CozoDB operations
- `InferenceEngine` - Knowledge discovery
- `PerformanceMonitor` - Performance tracking

## Performance Monitoring

The system includes built-in performance monitoring:

```typescript
import { perfMonitor } from './performance-monitor';

// Start timing
const endTimer = perfMonitor.startTimer('operation_name');

try {
  // Your operation
  await someOperation();
  endTimer(); // Record success
} catch (error) {
  perfMonitor.recordMetric('operation_name', 0, true); // Record error
  throw error;
}

// Get metrics
const metrics = perfMonitor.getMetrics('operation_name');
console.log(`Avg time: ${metrics.avgTime}ms, P95: ${metrics.p95}ms`);

// Log summary
perfMonitor.logSummary();
```

## Best Practices

1. **Use appropriate log levels**:
   - ERROR: Database failures, critical bugs
   - WARN: Deprecated features, fallback behavior
   - INFO: Operation start/completion, important state changes
   - DEBUG: Detailed operation flow, parameter values
   - TRACE: Very detailed internal state

2. **Include context**: Always include relevant data with log messages

3. **Avoid logging in hot paths**: Don't log in tight loops or high-frequency operations

4. **Use performance monitoring**: Track operation latencies for optimization

5. **Production settings**: Use `LOG_LEVEL=INFO` or `LOG_LEVEL=WARN` in production
