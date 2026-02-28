// Core types for CozoDB Memory MCP Server

export interface DualTimestamp {
  timestamp: number;      // Unix microseconds (CozoDB format)
  iso: string;           // ISO 8601 string (human-readable)
}

export interface Entity {
  id: string;
  name: string;
  type: string;
  embedding: number[];
  name_embedding: number[];
  metadata: Record<string, any>;
  created_at: number;
  created_at_iso?: string;  // Optional ISO format for backward compatibility
}

export interface Observation {
  id: string;
  entity_id: string;
  text: string;
  embedding: number[];
  metadata: Record<string, any>;
  created_at: number;
  created_at_iso?: string;  // Optional ISO format for backward compatibility
}

export interface Relationship {
  from_id: string;
  to_id: string;
  relation_type: string;
  strength: number;
  metadata: Record<string, any>;
  created_at: number;
  created_at_iso?: string;  // Optional ISO format for backward compatibility
}

export interface SearchResult {
  entity: Entity;
  score: number;
  source: 'vector' | 'keyword' | 'graph' | 'community' | 'inference';
  reason?: string;
}

export interface CacheEntry {
  query: string;
  results: SearchResult[];
  timestamp: number;
  embedding: number[];
}

export interface InferenceRule {
  name: string;
  datalog: string;
  created_at: number;
}

export interface Snapshot {
  snapshot_id: string;
  entity_count: number;
  observation_count: number;
  relationship_count: number;
  metadata: Record<string, any>;
  created_at: number;
}

// MCP Tool parameters
export interface MutateParams {
  action: string;
  [key: string]: any;
}

export interface QueryParams {
  action: string;
  [key: string]: any;
}

export interface AnalyzeParams {
  action: string;
  [key: string]: any;
}

export interface ManageParams {
  action: string;
  [key: string]: any;
}
