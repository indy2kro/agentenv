/**
 * Base Adapter Interface
 * Defines the common interface for all agent adapters
 */

export interface AdapterConfig {
  enabled: boolean;
  baseDir: string;
  rtkEnabled?: boolean;
}

export interface AdapterResult {
  success: boolean;
  message: string;
  filesCreated: string[];
  filesModified: string[];
  errors: string[];
}

export interface HookConfig {
  name: string;
  type: 'pre' | 'post' | 'session' | 'tool';
  command: string;
  description: string;
}

export abstract class BaseAdapter {
  protected config: AdapterConfig;

  constructor(config: AdapterConfig) {
    this.config = config;
  }

  /**
   * Initialize the adapter
   */
  abstract initialize(): Promise<AdapterResult>;

  /**
   * Configure hooks for the agent
   */
  abstract configureHooks(): Promise<AdapterResult>;

  /**
   * Get the agent name
   */
  abstract getName(): string;

  /**
   * Check if the agent is installed
   */
  abstract isInstalled(): boolean;

  /**
   * Get the agent's configuration directory
   */
  abstract getConfigDir(): string;

  /**
   * Clean up any generated files
   */
  abstract cleanup(): Promise<AdapterResult>;

  /**
   * Get agent-specific environment variables
   */
  getEnvVars(): Record<string, string> {
    return {};
  }
}
