import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { DockerService, ServiceStatus, NetworkMode } from '../types';
import { ServiceCard } from './ServiceCard';

interface SortableServiceCardProps {
  service: DockerService;
  status?: ServiceStatus;
  networkMode: NetworkMode;
  isHomeWifiDetected: boolean;
  openInNewTab: boolean;
  onEdit: (service: DockerService) => void;
  isReorderMode: boolean;
}

export const SortableServiceCard: React.FC<SortableServiceCardProps> = ({
  service,
  status,
  networkMode,
  isHomeWifiDetected,
  openInNewTab,
  onEdit,
  isReorderMode,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: service.id,
    disabled: !isReorderMode,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 40 : 'auto',
    opacity: isDragging ? 0.6 : 1,
    touchAction: isReorderMode ? 'none' : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex flex-col items-center select-none ${
        isReorderMode ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      {...(isReorderMode ? attributes : {})}
      {...(isReorderMode ? listeners : {})}
    >
      {isReorderMode && (
        <div
          className="absolute -top-1 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-500/50 pointer-events-none animate-pulse"
          title="Drag to reorder"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
      )}

      <ServiceCard
        service={service}
        status={status}
        networkMode={networkMode}
        isHomeWifiDetected={isHomeWifiDetected}
        openInNewTab={openInNewTab}
        onEdit={onEdit}
        isReorderMode={isReorderMode}
      />
    </div>
  );
};
