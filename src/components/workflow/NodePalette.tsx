'use client';
import { WorkflowNodeType } from '@/lib/types';
import { useWorkflowEditorStore, selectIsReadOnly } from '@/store/workflowEditorStore';
import { NODE_TYPE_COLORS, NODE_TYPE_ICONS, NODE_TYPE_LABELS } from './workflowNodeMeta';

// production_step/approval/quality_check/conditional_branch remain valid for both entity types
// (e.g. a batch template could legitimately have an approval gate before blending) -- only
// lot_fanout is entity-restricted, appended below when the loaded template is batch-typed.
const BASE_NODE_TYPES: WorkflowNodeType[] = ['production_step', 'approval', 'quality_check', 'conditional_branch'];

function onDragStart(event: React.DragEvent, nodeType: WorkflowNodeType) {
  event.dataTransfer.setData('application/reactflow', nodeType);
  event.dataTransfer.effectAllowed = 'move';
}

export function NodePalette() {
  const isReadOnly = useWorkflowEditorStore(selectIsReadOnly);
  const entityType = useWorkflowEditorStore((s) => s.entityType);
  // lot_fanout ("Split into Lots") only makes sense on a batch-entity-type template -- the
  // backend doesn't reject it inside a lot template server-side, so the palette is the primary
  // safeguard against authoring it where it can't run.
  const nodeTypesForEntity: WorkflowNodeType[] =
    entityType === 'batch' ? [...BASE_NODE_TYPES, 'lot_fanout'] : BASE_NODE_TYPES;

  return (
    <aside className="w-56 flex-shrink-0 border-r border-[var(--border-light)] bg-[var(--paper)] overflow-y-auto p-3">
      <h3
        className="text-xs font-semibold text-[var(--ink-light)] uppercase tracking-wide mb-2"
        style={{ fontFamily: 'Playfair Display, serif' }}
      >
        Node Types
      </h3>
      {isReadOnly && (
        <p className="text-xs text-[var(--ink-muted)] mb-2">Published -- read only.</p>
      )}
      <div className="flex flex-col gap-2">
        {nodeTypesForEntity.map((nodeType) => {
          const Icon = NODE_TYPE_ICONS[nodeType];
          const color = NODE_TYPE_COLORS[nodeType];
          return (
            <div
              key={nodeType}
              draggable={!isReadOnly}
              aria-disabled={isReadOnly}
              title={isReadOnly ? 'Published version is read-only' : undefined}
              onDragStart={(e) => (isReadOnly ? e.preventDefault() : onDragStart(e, nodeType))}
              className={
                isReadOnly
                  ? 'flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-[var(--border-light)] opacity-50 cursor-not-allowed'
                  : 'flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--paper)] cursor-grab active:cursor-grabbing hover:bg-[var(--paper-dark)] transition-colors'
              }
            >
              <Icon size={15} style={{ color }} className="flex-shrink-0" />
              <span className="text-sm text-[var(--ink)]">{NODE_TYPE_LABELS[nodeType]}</span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
