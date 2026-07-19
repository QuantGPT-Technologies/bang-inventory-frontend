// Module-level nodeTypes map -- stable identity across renders (see spike-reactflow/node-types.tsx
// for the rationale: an inline object here would cause React Flow to remount every node on
// every render). All five WorkflowNodeType values are registered.
import { ProductionStepNode } from './nodes/ProductionStepNode';
import { ApprovalNode } from './nodes/ApprovalNode';
import { QualityCheckNode } from './nodes/QualityCheckNode';
import { ConditionalBranchNode } from './nodes/ConditionalBranchNode';
import { LotFanoutNode } from './nodes/LotFanoutNode';

export const nodeTypes = {
  production_step: ProductionStepNode,
  approval: ApprovalNode,
  quality_check: QualityCheckNode,
  conditional_branch: ConditionalBranchNode,
  lot_fanout: LotFanoutNode,
};
