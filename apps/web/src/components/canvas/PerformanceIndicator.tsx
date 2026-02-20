/**
 * Performance Indicator - Shows rendering statistics
 * Helps debug performance issues and verify viewport culling is working
 */

'use client';

interface PerformanceIndicatorProps {
  visibleObjects: number;
  totalObjects: number;
  enabled?: boolean;
}

export function PerformanceIndicator({
  visibleObjects,
  totalObjects,
  enabled = false,
}: PerformanceIndicatorProps) {
  if (!enabled) return null;

  const cullingRatio = totalObjects > 0 
    ? Math.round(((totalObjects - visibleObjects) / totalObjects) * 100)
    : 0;

  const getColor = () => {
    if (visibleObjects < 100) return 'text-green-600';
    if (visibleObjects < 300) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="fixed bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-3 text-xs z-30 font-mono">
      <div className="font-semibold mb-1 text-gray-900">⚡ Performance</div>
      <div className="text-gray-600">
        Rendering: <span className={`font-bold ${getColor()}`}>{visibleObjects}</span> / {totalObjects} objects
      </div>
      {cullingRatio > 0 && (
        <div className="text-gray-600">
          Culled: <span className="font-bold text-blue-600">{cullingRatio}%</span>
        </div>
      )}
      <div className="text-gray-500 text-[10px] mt-1">
        {cullingRatio > 50 && '✅ Culling active'}
        {cullingRatio <= 50 && cullingRatio > 0 && '⚠️ Low culling'}
        {cullingRatio === 0 && '❌ No culling'}
      </div>
    </div>
  );
}
