/**
 * Toolbar Component for canvas tools - Left sidebar layout
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '@/lib/store/canvas';
import NearMeIcon from '@mui/icons-material/NearMe';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import InsertPageBreakOutlinedIcon from '@mui/icons-material/InsertPageBreakOutlined';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';
import ChangeHistoryOutlinedIcon from '@mui/icons-material/ChangeHistoryOutlined';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import Grid3x3Icon from '@mui/icons-material/Grid3x3';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CropFreeIcon from '@mui/icons-material/CropFree';
import PanToolIcon from '@mui/icons-material/PanTool';

interface ToolbarProps {
  onDelete?: () => void;
  onDuplicate?: () => void;
  selectedCount?: number;
}

export const Toolbar = ({ onDelete, onDuplicate, selectedCount = 0 }: ToolbarProps) => {
  const { activeTool, setActiveTool, gridMode, setGridMode, snapToGrid, setSnapToGrid } = useCanvasStore();
  const [hoveredTooltip, setHoveredTooltip] = useState<string | null>(null);
  const [isShapesMenuOpen, setIsShapesMenuOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isTextMenuOpen, setIsTextMenuOpen] = useState(false);
  const shapesMenuRef = useRef<HTMLDivElement | null>(null);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);
  const textMenuRef = useRef<HTMLDivElement | null>(null);

  const tools = [
    {
      id: 'select' as const,
      label: 'Select',
      icon: <NearMeIcon sx={{ fontSize: 20 }} />,
    },
    {
      id: 'move' as const,
      label: 'Move',
      icon: <PanToolIcon sx={{ fontSize: 20 }} />,
    },
    {
      id: 'sticky' as const,
      label: 'Sticky Note',
      icon: <StickyNote2OutlinedIcon sx={{ fontSize: 20 }} />,
    },
    {
      id: 'text' as const,
      label: 'Text',
      icon: <TextFieldsIcon sx={{ fontSize: 20 }} />,
    },
    {
      id: 'frame' as const,
      label: 'Frame',
      icon: <CropFreeIcon sx={{ fontSize: 20 }} />,
    },
  ];

  const shapeTools = [
    {
      id: 'rect' as const,
      label: 'Rectangle',
      icon: <CropSquareIcon sx={{ fontSize: 16 }} />,
    },
    {
      id: 'circle' as const,
      label: 'Circle',
      icon: <CircleOutlinedIcon sx={{ fontSize: 16 }} />,
    },
    {
      id: 'triangle' as const,
      label: 'Triangle',
      icon: <ChangeHistoryOutlinedIcon sx={{ fontSize: 16 }} />,
    },
    {
      id: 'star' as const,
      label: 'Star',
      icon: <StarOutlineIcon sx={{ fontSize: 16 }} />,
    },
    {
      id: 'line' as const,
      label: 'Line',
      icon: <ShowChartIcon sx={{ fontSize: 16 }} />,
    },
  ];

  // Close menus when clicking outside
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (shapesMenuRef.current && !shapesMenuRef.current.contains(event.target as Node)) {
        setIsShapesMenuOpen(false);
      }
      if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) {
        setIsViewMenuOpen(false);
      }
      if (textMenuRef.current && !textMenuRef.current.contains(event.target as Node)) {
        setIsTextMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const renderToolButton = (
    id: string,
    label: string,
    icon: React.ReactNode,
    onClick?: () => void,
    isActive?: boolean
  ) => (
    <button
      key={id}
      data-tool={id}
      onClick={onClick || (() => setActiveTool(id as any))}
      onMouseEnter={() => setHoveredTooltip(label)}
      onMouseLeave={() => setHoveredTooltip(null)}
      aria-pressed={isActive !== undefined ? isActive : activeTool === id}
      className={`group relative flex h-9 w-9 items-center justify-center rounded-lg transition-all ${
        (isActive !== undefined ? isActive : activeTool === id)
          ? 'bg-slate-200 text-slate-900'
          : 'text-slate-700 hover:bg-slate-100'
      }`}
      title={label}
    >
      {icon}
      {hoveredTooltip === label && (
        <div className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg z-50">
          {label}
        </div>
      )}
    </button>
  );

  const renderSwitch = (isOn: boolean) => (
    <span
      className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
        isOn ? 'bg-slate-900' : 'bg-slate-300'
      }`}
      aria-hidden="true"
    >
      <span
        className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
          isOn ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </span>
  );
  
  return (
    <div className="fixed left-4 top-1/2 z-30 -translate-y-1/2">
      <div className="flex w-[48px] flex-col items-center gap-1 rounded-[12px] bg-white p-1.5 shadow-[6px_0_20px_rgba(0,0,0,0.15),0_4px_12px_rgba(0,0,0,0.1),0_12px_32px_rgba(0,0,0,0.08)]">
        {/* View options button */}
        <div ref={viewMenuRef} className="relative">
          {renderToolButton(
            'view',
            'View options',
            <Grid3x3Icon sx={{ fontSize: 20 }} />,
            () => setIsViewMenuOpen(!isViewMenuOpen),
            isViewMenuOpen
          )}
          
          {/* View options dropdown menu */}
          {isViewMenuOpen && (
            <div className="absolute left-full top-0 ml-2 w-48 rounded-lg bg-white p-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.12),0_12px_48px_rgba(0,0,0,0.08)] border border-slate-200">
              <div className="mb-1.5 px-1 text-[10px] font-semibold text-slate-500">VIEW</div>
              <div className="rounded-md bg-slate-50 p-1.5 mb-1.5">
                <div className="mb-1 px-1.5 text-[10px] font-semibold text-slate-500">GRID</div>
                <button
                  onClick={() => setGridMode('none')}
                  className={`flex w-full items-center justify-between rounded-md px-1.5 py-1.5 text-xs transition-colors ${
                    gridMode === 'none' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-700 hover:bg-white/50'
                  }`}
                >
                  <span>None</span>
                  <span className={`h-3 w-3 rounded-full border-2 ${gridMode === 'none' ? 'border-slate-900 bg-slate-900' : 'border-slate-300'}`} />
                </button>
                <button
                  onClick={() => setGridMode('line')}
                  className={`flex w-full items-center justify-between rounded-md px-1.5 py-1.5 text-xs transition-colors ${
                    gridMode === 'line' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-700 hover:bg-white/50'
                  }`}
                >
                  <span>Line grid</span>
                  <span className={`h-3 w-3 rounded-full border-2 ${gridMode === 'line' ? 'border-slate-900 bg-slate-900' : 'border-slate-300'}`} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="my-0.5 h-px w-6 bg-slate-200" />

        {tools.filter(tool => tool.id !== 'text').map((tool) => renderToolButton(tool.id, tool.label, tool.icon))}
        
        {/* Text button with dropdown menu */}
        <div ref={textMenuRef} className="relative">
          {renderToolButton(
            'text',
            'Text',
            <TextFieldsIcon sx={{ fontSize: 20 }} />,
            () => setIsTextMenuOpen(!isTextMenuOpen),
            isTextMenuOpen || activeTool === 'text' || activeTool === 'textBubble'
          )}
          
          {/* Text dropdown menu */}
          {isTextMenuOpen && (
            <div className="absolute left-full top-0 ml-2 w-40 rounded-lg bg-white p-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.12),0_12px_48px_rgba(0,0,0,0.08)] border border-slate-200">
              <div className="mb-1 px-1.5 text-[10px] font-semibold text-slate-500">Text</div>
              <div className="space-y-0.5">
                <button
                  onClick={() => {
                    setActiveTool('text' as any);
                    setIsTextMenuOpen(false);
                  }}
                  onMouseEnter={() => setHoveredTooltip('Text')}
                  onMouseLeave={() => setHoveredTooltip(null)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                    activeTool === 'text'
                      ? 'bg-slate-200 text-slate-900'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <TextFieldsIcon sx={{ fontSize: 16 }} />
                  <span>Text</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTool('textBubble' as any);
                    setIsTextMenuOpen(false);
                  }}
                  onMouseEnter={() => setHoveredTooltip('Text Bubble')}
                  onMouseLeave={() => setHoveredTooltip(null)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                    activeTool === 'textBubble'
                      ? 'bg-slate-200 text-slate-900'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <TextFieldsIcon sx={{ fontSize: 16 }} />
                  <span>Text Bubble</span>
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* Shapes button with dropdown menu */}
        <div ref={shapesMenuRef} className="relative">
          {renderToolButton(
            'shapes',
            'Shapes',
            <CategoryOutlinedIcon sx={{ fontSize: 20 }} />,
            () => setIsShapesMenuOpen(!isShapesMenuOpen)
          )}
          
          {/* Shapes dropdown menu */}
          {isShapesMenuOpen && (
            <div className="absolute left-full top-0 ml-2 w-40 rounded-lg bg-white p-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.12),0_12px_48px_rgba(0,0,0,0.08)] border border-slate-200">
              <div className="mb-1 px-1.5 text-[10px] font-semibold text-slate-500">Shapes</div>
              <div className="space-y-0.5">
                {shapeTools.map((shape) => (
                  <button
                    key={shape.id}
                    onClick={() => {
                      setActiveTool(shape.id as any);
                      setIsShapesMenuOpen(false);
                    }}
                    onMouseEnter={() => setHoveredTooltip(shape.label)}
                    onMouseLeave={() => setHoveredTooltip(null)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                      activeTool === shape.id
                        ? 'bg-slate-200 text-slate-900'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {shape.icon}
                    <span>{shape.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Divider */}
        <div className="my-0.5 h-px w-6 bg-slate-200" />
        
        {/* AI/AutoAwesome button at the bottom */}
        {/* AI Assistant button - replaced with floating AIAssistant component */}
        {/* <button
          onClick={() => {}}
          onMouseEnter={() => setHoveredTooltip('AI Assistant')}
          onMouseLeave={() => setHoveredTooltip(null)}
          className="ai-awesome-button group relative flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-white transition-all hover:bg-slate-800"
          title="AI Assistant"
        >
          <AutoAwesomeIcon sx={{ fontSize: 24 }} />
          {hoveredTooltip === 'AI Assistant' && (
            <div className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              AI Assistant
            </div>
          )}
        </button> */}
      </div>
      
      <style jsx>{`
        .ai-awesome-button {
          position: relative;
          animation: aiGlow 2.5s ease-in-out infinite;
        }
        
        .ai-awesome-button:hover {
          animation: aiGlowFast 1.2s ease-in-out infinite;
        }
        
        .ai-awesome-button::before {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: 0.5rem;
          background: linear-gradient(45deg, #3b82f6, #8b5cf6, #ec4899, #3b82f6);
          background-size: 300% 300%;
          opacity: 0;
          z-index: -1;
          animation: gradientRotate 3s ease infinite, pulseGlow 2.5s ease-in-out infinite;
        }
        
        .ai-awesome-button:hover::before {
          animation: gradientRotate 2s ease infinite, pulseGlowFast 1.2s ease-in-out infinite;
        }
        
        @keyframes aiGlow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(59, 130, 246, 0.4),
                        0 0 40px rgba(139, 92, 246, 0.2);
          }
          50% {
            box-shadow: 0 0 30px rgba(59, 130, 246, 0.6),
                        0 0 60px rgba(139, 92, 246, 0.3);
          }
        }
        
        @keyframes aiGlowFast {
          0%, 100% {
            box-shadow: 0 0 25px rgba(59, 130, 246, 0.5),
                        0 0 50px rgba(139, 92, 246, 0.3);
          }
          50% {
            box-shadow: 0 0 35px rgba(59, 130, 246, 0.7),
                        0 0 70px rgba(139, 92, 246, 0.4);
          }
        }
        
        @keyframes gradientRotate {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        
        @keyframes pulseGlow {
          0%, 100% {
            opacity: 0.3;
          }
          50% {
            opacity: 0.6;
          }
        }
        
        @keyframes pulseGlowFast {
          0%, 100% {
            opacity: 0.4;
          }
          50% {
            opacity: 0.7;
          }
        }
      `}</style>
    </div>
  );
};
