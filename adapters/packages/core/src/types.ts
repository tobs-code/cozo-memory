/**
 * Core types for Cozo Memory adapters
 */

export interface Entity {
  id: string;
  name: string;
  type: string;
  metadata?: Record<string, any>;
  created_at?: string;
  observations?: Observation[];
  relationships?: Relationship[];
}

export interface Observation {
  id: string;
  entity_id: string;
  text: string;
  metadata?: Record<string, any>;
  created_at?: string;
  session_id?: string;
  task_id?: string;
}

export interface Relationship {
  from_id: string;
  to_id: string;
  relation_type: string;
  strength?: number;
  metadata?: Record<string, any>;
}

export interface SearchResult {
  entities?: Entity[];
  observations?: Observation[];
  score?: number;
}

export interface SearchOptions {
  limit?: number;
  entity_types?: string[];
  include_entities?: boolean;
  include_observations?: boolean;
  rerank?: boolean;
}

export interface GraphRAGOptions {
  max_depth?: number;
  limit?: number;
  rerank?: boolean;
}

export interface SessionInfo {
  id: string;
  name?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface TaskInfo {
  id: string;
  name: string;
  session_id?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}
