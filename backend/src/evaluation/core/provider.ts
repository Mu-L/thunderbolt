/**
 * Provider Interface
 *
 * Defines the contract for evaluation providers (LangSmith, PromptLayer, Console, etc.)
 *
 * Providers are responsible for:
 * - Initializing connections to external services
 * - Creating reporters for tracking evaluation progress
 * - Optionally syncing datasets and creating experiments
 * - Optionally fetching production traces for offline evaluation
 * - Optionally running evaluations with provider-specific features
 */

import type { Dataset, Trace, TraceSampleOptions, SuiteResult } from './types'
import type { Reporter } from './reporter'
import type { Evaluator } from './evaluator'
import type { Executor } from './executor'

/**
 * Reference to a dataset stored in a provider
 */
export type DatasetRef = {
  id: string
  name: string
  provider: string
}

/**
 * Reference to an experiment/evaluation run in a provider
 */
export type ExperimentRef = {
  id: string
  name: string
  provider: string
  datasetRef?: DatasetRef
  url?: string
}

/**
 * Result from fetching traces
 */
export type TraceFetchResult = {
  traces: Trace[]
  /** Total available (may be more than returned) */
  total: number
  /** Cursor for pagination */
  nextCursor?: string
}

/**
 * Configuration for running an evaluation
 */
export type EvaluationConfig<TInput = unknown, TOutput = unknown, TExpected = unknown> = {
  /** Suite name for organizing results */
  suiteName: string
  /** Dataset to evaluate */
  dataset: Dataset<TInput, TExpected>
  /** Executor to run tests */
  executor: Executor<TInput, TOutput>
  /** Evaluators to score outputs */
  evaluators: Evaluator<TInput, TOutput, TExpected>[]
  /** Model being evaluated */
  model: string
  /** Backend URL for API calls */
  backendUrl: string
  /** Show verbose output */
  verbose?: boolean
  /** Maximum concurrent executions */
  maxConcurrency?: number
}

/**
 * Provider interface
 *
 * Required methods:
 * - `initialize()`: Set up connections, verify credentials
 * - `dispose()`: Clean up resources
 * - `createReporter()`: Create a reporter for tracking results
 *
 * Optional methods (implement based on provider capabilities):
 * - `syncDataset()`: Upload test cases to provider
 * - `getDataset()`: Retrieve dataset reference
 * - `createExperiment()`: Create a new experiment run
 * - `fetchTraces()`: Fetch production traces for offline evaluation
 */
export type Provider = {
  /** Provider identifier (e.g., 'langsmith', 'console') */
  readonly name: string

  /** Whether this provider supports trace fetching */
  readonly supportsTraces?: boolean

  /** Initialize the provider (connect to service, verify credentials) */
  initialize(): Promise<void>

  /** Clean up resources (close connections) */
  dispose(): Promise<void>

  /** Create a reporter for tracking evaluation results */
  createReporter(experimentRef?: ExperimentRef): Reporter

  /** Sync a dataset to the provider (optional) */
  syncDataset?(dataset: Dataset): Promise<DatasetRef>

  /** Get a dataset reference by name (optional) */
  getDataset?(name: string): Promise<DatasetRef | null>

  /** Create an experiment/evaluation run (optional) */
  createExperiment?(name: string, datasetRef?: DatasetRef): Promise<ExperimentRef>

  /**
   * Fetch production traces for offline evaluation (optional)
   *
   * Only providers with observability features can implement this.
   * Console provider does NOT support this.
   */
  fetchTraces?(options: TraceSampleOptions): Promise<TraceFetchResult>

  /**
   * Run evaluation with provider-specific features (optional)
   *
   * Providers like LangSmith can implement this to use their native
   * evaluation APIs (e.g., `evaluate()` from langsmith/evaluation)
   * which provide automatic syncing, experiment tracking, etc.
   *
   * If not implemented, the CLI falls back to the generic `runSuite`.
   */
  runEvaluation?<TInput, TOutput, TExpected>(
    config: EvaluationConfig<TInput, TOutput, TExpected>,
  ): Promise<SuiteResult<TInput, TOutput>>

  /**
   * Run trace evaluation by attaching feedback to existing production runs (optional)
   *
   * This is different from `runEvaluation` which creates new experiment runs.
   * Trace evaluation evaluates existing production traces and attaches
   * feedback scores directly to the original runs in the observability data.
   *
   * This follows LangSmith's "online evaluation" pattern where you use
   * `createFeedback()` to annotate existing runs rather than creating new ones.
   *
   * Only providers with observability features (supportsTraces=true) should implement this.
   */
  runTraceEvaluation?<TOutput, TExpected>(
    config: TraceEvaluationConfig<TOutput, TExpected>,
  ): Promise<TraceEvaluationResult>
}

/**
 * Configuration for trace evaluation
 */
export type TraceEvaluationConfig<TOutput = unknown, TExpected = unknown> = {
  /** Name for this evaluation run */
  name: string
  /** Traces to evaluate */
  traces: Trace[]
  /** Evaluators to score outputs */
  evaluators: Evaluator<unknown, TOutput, TExpected>[]
  /** Show verbose output */
  verbose?: boolean
}

/**
 * Result from trace evaluation
 */
export type TraceEvaluationResult = {
  /** Total traces evaluated */
  total: number
  /** Traces that passed all evaluators */
  passed: number
  /** Traces that failed */
  failed: number
  /** Traces with errors */
  errored: number
  /** Average score across all evaluators */
  avgScore: number
  /** Scores by evaluator */
  scoresByEvaluator: Record<string, number>
  /** Individual trace results */
  results: Array<{
    traceId: string
    scores: Record<string, number>
    passed: boolean
    error?: string
  }>
}
