// Module-level nodeTypes map for the read-only lot execution canvas -- same stable-identity
// rationale as ../nodeTypes.ts (an inline object literal would make React Flow remount every
// node on every render). Deliberately a SEPARATE map/component set from ../nodeTypes.ts: those
// editor node components render draft config (badges like "optional"/"credits stock") and are
// wired into workflowEditorStore; these render live run status instead and take their data
// straight from the LotWorkflowGraph API response. Editor components are untouched.
import { ExecutionProductionStepNode } from './nodes/ExecutionProductionStepNode';
import { ExecutionApprovalNode } from './nodes/ExecutionApprovalNode';
import { ExecutionQualityCheckNode } from './nodes/ExecutionQualityCheckNode';
import { ExecutionConditionalBranchNode } from './nodes/ExecutionConditionalBranchNode';
import { ExecutionLotFanoutNode } from './nodes/ExecutionLotFanoutNode';

export const executionNodeTypes = {
  production_step: ExecutionProductionStepNode,
  approval: ExecutionApprovalNode,
  quality_check: ExecutionQualityCheckNode,
  conditional_branch: ExecutionConditionalBranchNode,
  lot_fanout: ExecutionLotFanoutNode,
};
