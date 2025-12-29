/**
 * Datasets
 *
 * Test case collections for evaluation.
 */

// Static datasets (defined in code)
export { behavioralDataset, getBehavioralCasesByTag, type BehavioralTestCase } from './behavioral'
export { qualityDataset, getQualityCasesByCategory, getQualityCasesByTag, type QualityTestCase } from './quality'

// Trace conversion utilities (for production data)
export { tracesToDataset, filterValidTraces, sampleTraces, type TraceFilterOptions } from './traces'
