/**
 * Core Evaluation Framework
 *
 * Provider-agnostic types and interfaces.
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
  // Scores & Results
  EvalScore,
  TestResult,
  SuiteResult,
  // Test Cases & Datasets
  DataSource,
  TestCase,
  Dataset,
  // Execution
  ExecutorConfig,
  Message,
  ToolCall,
  ToolInvocation,
  // Traces (for offline evaluation)
  Trace,
  TraceSampleOptions,
} from './types'

export type {
  // Evaluators
  EvalContext,
  EvaluatorType,
  Evaluator,
  HeuristicEvaluatorConfig,
  LLMJudgeEvaluatorConfig,
} from './evaluator'

export type {
  // Executors
  ExecutionResult,
  Executor,
  ExecutorDefinition,
} from './executor'

export type {
  // Reporters
  SuiteInfo,
  Reporter,
} from './reporter'

export type {
  // Providers
  DatasetRef,
  ExperimentRef,
  TraceFetchResult,
  EvaluationConfig,
  TraceEvaluationConfig,
  TraceEvaluationResult,
  Provider,
} from './provider'

export type {
  // Runner
  SuiteConfig,
  RunOptions,
} from './runner'

// =============================================================================
// FUNCTIONS
// =============================================================================

// Evaluator helpers
export {
  defineHeuristicEvaluator,
  defineLLMJudgeEvaluator,
  getJudgeModel,
  SCORE_CHOICES,
  passScore,
  failScore,
  partialScore,
} from './evaluator'

// Executor helpers
export { defineExecutor } from './executor'

// Reporter helpers
export { composeReporters } from './reporter'

// Suite helpers
export { defineSuite, runSuite } from './runner'
