/**
 * Performance Monitoring System
 * 
 * Tracks operation latencies, throughput, and resource usage
 */

import { logger } from './logger';

export interface PerformanceMetrics {
  operation: string;
  count: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  p50: number;
  p95: number;
  p99: number;
  errors: number;
  lastExecuted: number;
}

export class PerformanceMonitor {
  private metrics: Map<string, {
    times: number[];
    errors: number;
    lastExecuted: number;
  }>;
  private maxSamples: number;

  constructor(maxSamples: number = 1000) {
    this.metrics = new Map();
    this.maxSamples = maxSamples;
  }

  /**
   * Start timing an operation
   */
  startTimer(operation: string): () => void {
    const startTime = Date.now();
    
    return () => {
      const duration = Date.now() - startTime;
      this.recordMetric(operation, duration);
    };
  }

  /**
   * Record a metric manually
   */
  recordMetric(operation: string, duration: number, isError: boolean = false) {
    let metric = this.metrics.get(operation);
    
    if (!metric) {
      metric = {
        times: [],
        errors: 0,
        lastExecuted: Date.now()
      };
      this.metrics.set(operation, metric);
    }

    metric.times.push(duration);
    metric.lastExecuted = Date.now();
    
    if (isError) {
      metric.errors++;
    }

    // Keep only last N samples
    if (metric.times.length > this.maxSamples) {
      metric.times.shift();
    }
  }

  /**
   * Get metrics for a specific operation
   */
  getMetrics(operation: string): PerformanceMetrics | null {
    const metric = this.metrics.get(operation);
    if (!metric || metric.times.length === 0) {
      return null;
    }

    const sorted = [...metric.times].sort((a, b) => a - b);
    const count = sorted.length;
    const totalTime = sorted.reduce((sum, t) => sum + t, 0);

    return {
      operation,
      count,
      totalTime,
      avgTime: totalTime / count,
      minTime: sorted[0],
      maxTime: sorted[count - 1],
      p50: sorted[Math.floor(count * 0.5)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
      errors: metric.errors,
      lastExecuted: metric.lastExecuted
    };
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): PerformanceMetrics[] {
    const results: PerformanceMetrics[] = [];
    
    for (const operation of this.metrics.keys()) {
      const metric = this.getMetrics(operation);
      if (metric) {
        results.push(metric);
      }
    }

    return results.sort((a, b) => b.count - a.count);
  }

  /**
   * Log performance summary
   */
  logSummary() {
    const metrics = this.getAllMetrics();
    
    logger.info('PerformanceMonitor', '=== Performance Summary ===');
    
    for (const m of metrics) {
      logger.info('PerformanceMonitor', 
        `${m.operation}: ${m.count} calls, avg=${m.avgTime.toFixed(2)}ms, ` +
        `p95=${m.p95.toFixed(2)}ms, errors=${m.errors}`
      );
    }
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear();
  }
}

// Singleton instance
export const perfMonitor = new PerformanceMonitor();
