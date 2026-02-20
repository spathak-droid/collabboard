/**
 * AI tools and prompt definitions for the whiteboard AI assistant.
 * Used by the server when processing natural-language commands.
 */

export const AI_SYSTEM_PROMPT = `You are an AI assistant for a collaborative whiteboard application. You help users create, manipulate, and organize objects on their whiteboard by calling the provided tools.

## Object Types

**Text Object Types (Important Distinctions):**
- **Text**: Standalone text without any background or border (type: 'text'). Use createText for plain floating text.
- **Text bubble**: Text inside a bubble/box with border (type: 'textBubble'). Use createTextBubble for text in a container.
- **Sticky note**: Colored card (yellow/pink/blue/green/orange) with text for brainstorming. Use createStickyNote.

**When to use each:**
- User says "text" or "add text" → Use createText (plain floating text)
- User says "text bubble" or "text box" → Use createTextBubble (text with border)
- User says "note" or "sticky note" → Use createStickyNote (colored card)

## Canvas Coordinate System
- Origin (0, 0) is the top-left of the canvas.
- Positive X goes right, positive Y goes down.
- Sticky notes are 200x200 px by default.
- When placing multiple objects, space them with ~220px gaps (200px object + 20px padding).

## Color Palette
Sticky note colors: yellow, pink, blue, green, orange.
Shape colors: use hex strings like "#3B82F6" (blue), "#EF4444" (red), "#10B981" (green), "#A855F7" (purple), "#F97316" (orange), "#6366F1" (indigo), "#EC4899" (pink).

## Layout Guidelines
- For grids: calculate positions as (startX + col * spacingX, startY + row * spacingY).
- Default grid spacing: 220px horizontal, 220px vertical (for sticky notes).
- For templates (SWOT, retro, journey maps): create frames first, then place sticky notes inside them.
- **Smart placement:** When creating objects without specifying x/y coordinates, the system automatically finds free space near existing objects in a spiral pattern (right, down, left, up). Objects will NOT overlap unless coordinates are explicitly specified.
- When creating multiple objects in a template or batch, specify explicit coordinates to ensure proper layout. Let the smart placement handle single object creation.

## Manipulation Rules
- When asked to move objects, use the objectId from the board state.
- When asked to "move all pink sticky notes", find them in the board state and issue moveObject calls for each.
- When asked to delete, remove, or clear objects, use deleteObject with the objectId(s). NEVER use moveObject to move objects off-screen — always delete properly.
- **Resize frame to fit contents:** When the user says "resize to fit contents", "fit to contents", "resize frame to fit", "make frame fit the objects", "extend frame to fit", "make frame bigger to fit", or similar, ALWAYS use the fitFrameToContents tool (pass the frame's objectId). This tool automatically calculates the bounding box of all objects inside the frame and resizes it with proper padding. DO NOT manually calculate dimensions with resizeObject.
- **Selection context:** If the prompt includes "User Selection" with object IDs, the user has those objects selected. Commands like "format them", "space them", "arrange in a grid", "organize these" refer to ONLY those selected objects.
- **Arrange in grid:** When the user says "arrange in grid", "arrange these in a grid", "organize in a grid", or similar, ALWAYS call the arrangeInGrid tool with the selected object IDs. Do NOT use moveObject for grid layout — use arrangeInGrid.
- **Connect objects:** When the user says "connect these", "connect A to B", "draw a line between them", "connect two red triangles", "create shapes with connectors", "X connected by a line", "X connected by lines", or similar:
  1. **If User Selection shows object IDs**: Use those selected IDs directly in createConnector (fromId=first selected, toId=second selected).
  2. **If user describes objects by properties** (e.g., "red triangles", "pink sticky notes"): You can see the board state in the context above - find objects that match the description by examining their type and color/fill properties. Then call createConnector with those specific object IDs. DO NOT make up object IDs - use the actual IDs from the board state.
  3. **If user says "create X shapes with connectors" or "create X shapes connected by lines/a line"**: 
     - ONLY call createShape for each shape in your first response
     - DO NOT call createConnector yet - you don't have the IDs yet
     - The system will automatically give you a follow-up opportunity where you'll see the newly created objects in the board state with their IDs
     - In the follow-up, call createConnector with the actual IDs from the board state
     - Example flow:
       * User: "create 2 stars connected by a line"
       * Step 1 (you): createShape(type: 'star') → createShape(type: 'star')
       * Step 2 (automatic): System shows you board state with the 2 new stars and their IDs
       * Step 3 (you): createConnector(fromId: actual_id_1, toId: actual_id_2)
  4. Connectors automatically attach to anchor points on objects (top, right, bottom, left).
  5. If you see existing connectors in the board state, they show as "from=objectId:anchor to=objectId:anchor".
- **Analysis:** When the user asks "how many", "count", "analyze", "show statistics", "what colors", "what types", or similar analysis questions, ALWAYS call the analyzeObjects tool. If the user has objects selected (see "User Selection" context), pass those selected object IDs in the objectIds parameter. If no objects are selected or the user asks about all objects, omit objectIds or pass an empty array to analyze all objects. The tool automatically converts hex colors to human-readable color names (e.g., blue, red, pink, green) by analyzing RGB values. Extract and answer the specific question asked using the returned color names.

## Response Style - IMPORTANT
- ALWAYS call the appropriate tools to execute the user's request.
- Your text response should be natural and conversational, like a human assistant.
- Briefly describe what you're doing in simple terms (e.g., "I've added a yellow sticky note with your text" or "I moved the pink sticky notes to the right side").
- For complex operations, summarize what you created (e.g., "I've set up a SWOT analysis with 4 sections and a frame").
- **For analysis results:** When the user asks a specific question (e.g., "how many pink sticky notes?"), answer that SPECIFIC question first, then optionally provide additional context. Example: "You have 3 pink sticky notes. In total, there are 12 objects on the board."
- DO NOT repeat the technical action summary in your response - the system will show that separately.
- DO NOT say things like "Created sticky note. Created frame." - that's handled by the action summary.
- DO NOT just repeat the raw analysis output. Extract and present the relevant information conversationally.
- DO NOT use generic phrases like "Done!" or "I executed the requested changes."
- DO NOT use robotic language like "Created sticky note. Created frame."
- DO use natural language like "I've created..." or "I added..." or "Here's your..."
- Keep responses brief (1-2 sentences) but human-sounding.`;

export const AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'createStickyNote',
      description: 'Create a sticky note (colored card: yellow/pink/blue/green/orange) on the whiteboard. Use for brainstorming items, ideas, labels, or any text-based card.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text content of the sticky note' },
          x: { type: 'number', description: 'X position on canvas in pixels. If omitted, auto-placed.' },
          y: { type: 'number', description: 'Y position on canvas in pixels. If omitted, auto-placed.' },
          color: { type: 'string', enum: ['yellow', 'pink', 'blue', 'green', 'orange'], description: 'Sticky note color. Defaults to yellow.' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createText',
      description: 'Create plain floating text without background or border. Use for labels, titles, or standalone text.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text content' },
          x: { type: 'number', description: 'X position on canvas in pixels. If omitted, auto-placed.' },
          y: { type: 'number', description: 'Y position on canvas in pixels. If omitted, auto-placed.' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createTextBubble',
      description: 'Create a text bubble (text inside a box with border, different from plain text and sticky note). Use for text that needs a container.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text content of the text bubble' },
          x: { type: 'number', description: 'X position on canvas in pixels. If omitted, auto-placed.' },
          y: { type: 'number', description: 'Y position on canvas in pixels. If omitted, auto-placed.' },
          width: { type: 'number', description: 'Width in pixels (default 200)' },
          height: { type: 'number', description: 'Height in pixels (default 100)' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createShape',
      description: 'Create a geometric shape (rectangle, circle, triangle, or star) on the whiteboard.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['rect', 'circle', 'triangle', 'star'], description: 'Shape type' },
          x: { type: 'number', description: 'X position on canvas in pixels' },
          y: { type: 'number', description: 'Y position on canvas in pixels' },
          width: { type: 'number', description: 'Width in pixels (default 150)' },
          height: { type: 'number', description: 'Height in pixels (default 150)' },
          color: { type: 'string', description: 'Fill color as hex string (e.g. "#3B82F6") or color name' },
        },
        required: ['type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createFrame',
      description: 'Create a frame (grouping container) on the whiteboard. Frames visually group objects and have a title label.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Frame title / label' },
          x: { type: 'number', description: 'X position on canvas in pixels' },
          y: { type: 'number', description: 'Y position on canvas in pixels' },
          width: { type: 'number', description: 'Width in pixels (default 400)' },
          height: { type: 'number', description: 'Height in pixels (default 400)' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createConnector',
      description: 'Create a line/connector between two existing objects on the whiteboard. Use the actual object IDs from the board state.',
      parameters: {
        type: 'object',
        properties: {
          fromId: { type: 'string', description: 'ID of the source object (must exist in board state)' },
          toId: { type: 'string', description: 'ID of the target object (must exist in board state)' },
          style: { type: 'string', enum: ['straight', 'curved'], description: 'Connector style (default straight)' },
        },
        required: ['fromId', 'toId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'moveObject',
      description: 'Move an existing object to a new position on the whiteboard.',
      parameters: {
        type: 'object',
        properties: {
          objectId: { type: 'string', description: 'ID of the object to move' },
          x: { type: 'number', description: 'New X position in pixels' },
          y: { type: 'number', description: 'New Y position in pixels' },
        },
        required: ['objectId', 'x', 'y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resizeObject',
      description: 'Resize an existing object on the whiteboard.',
      parameters: {
        type: 'object',
        properties: {
          objectId: { type: 'string', description: 'ID of the object to resize' },
          width: { type: 'number', description: 'New width in pixels' },
          height: { type: 'number', description: 'New height in pixels' },
        },
        required: ['objectId', 'width', 'height'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateText',
      description: 'Update the text content of an existing sticky note, text element, text bubble, or frame name.',
      parameters: {
        type: 'object',
        properties: {
          objectId: { type: 'string', description: 'ID of the object to update' },
          newText: { type: 'string', description: 'New text content (or frame name for frames)' },
        },
        required: ['objectId', 'newText'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'changeColor',
      description: 'Change the color of an existing object. For sticky notes use color names (yellow, pink, blue, green, orange). For shapes use hex colors.',
      parameters: {
        type: 'object',
        properties: {
          objectId: { type: 'string', description: 'ID of the object to recolor' },
          color: { type: 'string', description: 'New color — a name for sticky notes, or a hex string for shapes' },
        },
        required: ['objectId', 'color'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deleteObject',
      description: 'Permanently remove one or more objects from the whiteboard. Use when the user asks to delete, remove, or clear objects. Pass the object IDs to delete.',
      parameters: {
        type: 'object',
        properties: {
          objectIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of object IDs to delete from the canvas',
          },
        },
        required: ['objectIds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getBoardState',
      description: 'Retrieve the current state of all objects on the whiteboard. Use this when you need to know what already exists before making changes.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'arrangeInGrid',
      description: 'Arrange the selected objects into an evenly spaced grid. Use when the user says "arrange in grid", "arrange these in a grid", "organize in a grid", etc. The layout engine will compute positions deterministically.',
      parameters: {
        type: 'object',
        properties: {
          objectIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of object IDs to arrange (the selected objects)',
          },
        },
        required: ['objectIds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyzeObjects',
      description: 'Analyze and count objects by type and color. Use when the user asks "how many", "count", "analyze", "show me statistics", etc. Returns a summary with detailed breakdown using human-readable color names (e.g., "2 pink sticky notes, 3 blue circles"). Colors are automatically converted from hex to natural language.',
      parameters: {
        type: 'object',
        properties: {
          objectIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of object IDs to analyze. If empty or omitted, analyzes all objects on the board.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fitFrameToContents',
      description: 'Automatically resize a frame to fit all objects contained within it, with proper padding. Use when the user says "resize to fit contents", "fit to contents", "resize frame to fit", "make frame fit the objects", "extend frame to fit", or similar. This tool automatically calculates the bounding box of all objects inside the frame and resizes it with 40px padding.',
      parameters: {
        type: 'object',
        properties: {
          frameId: {
            type: 'string',
            description: 'ID of the frame to resize',
          },
          padding: {
            type: 'number',
            description: 'Padding in pixels around the contents (default 40)',
          },
        },
        required: ['frameId'],
      },
    },
  },
];

/**
 * Convert hex color to RGB components.
 */
function hexToRgb(hex) {
  const cleanHex = hex.replace(/^#/, '');
  
  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);
    return { r, g, b };
  }
  
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    return { r, g, b };
  }
  
  return null;
}

/**
 * Analyze RGB values to determine human-readable color name.
 * Uses HSL color space for more accurate color categorization.
 */
function rgbToColorName(r, g, b) {
  // Normalize RGB to 0-1 range
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;
  
  // Calculate lightness (0-1)
  const lightness = (max + min) / 2;
  
  // Calculate saturation (0-1)
  let saturation = 0;
  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
  }
  
  // Grayscale colors (low saturation)
  if (saturation < 0.15) {
    if (lightness < 0.2) return 'black';
    if (lightness < 0.5) return 'gray';
    if (lightness < 0.9) return 'light gray';
    return 'white';
  }
  
  // Calculate hue (0-360 degrees)
  let hue = 0;
  if (delta !== 0) {
    if (max === rNorm) {
      hue = 60 * (((gNorm - bNorm) / delta) % 6);
    } else if (max === gNorm) {
      hue = 60 * ((bNorm - rNorm) / delta + 2);
    } else {
      hue = 60 * ((rNorm - gNorm) / delta + 4);
    }
    if (hue < 0) hue += 360;
  }
  
  // Categorize by hue ranges
  // Red: 0-15, 345-360
  if (hue < 15 || hue >= 345) {
    if (lightness > 0.7 && saturation < 0.7) return 'pink';
    return 'red';
  }
  
  // Orange: 15-45
  if (hue >= 15 && hue < 45) {
    if (lightness < 0.4) return 'brown';
    return 'orange';
  }
  
  // Yellow: 45-65
  if (hue >= 45 && hue < 65) {
    return 'yellow';
  }
  
  // Yellow-green / Lime: 65-80
  if (hue >= 65 && hue < 80) {
    return 'lime';
  }
  
  // Green: 80-165
  if (hue >= 80 && hue < 165) {
    return 'green';
  }
  
  // Cyan: 165-200
  if (hue >= 165 && hue < 200) {
    return 'cyan';
  }
  
  // Blue: 200-260
  if (hue >= 200 && hue < 260) {
    return 'blue';
  }
  
  // Purple/Magenta: 260-330
  if (hue >= 260 && hue < 330) {
    if (lightness > 0.6) return 'pink';
    if (hue < 290) return 'purple';
    return 'magenta';
  }
  
  // Pink/Magenta: 330-345
  if (hue >= 330 && hue < 345) {
    return 'pink';
  }
  
  return 'gray';
}

/**
 * Convert hex color to human-readable color name.
 */
function hexToColorName(hex) {
  if (!hex || typeof hex !== 'string') return 'unknown';
  const rgb = hexToRgb(hex);
  if (!rgb) return 'unknown';
  return rgbToColorName(rgb.r, rgb.g, rgb.b);
}

/**
 * Build the context string for the AI prompt (board state + selection).
 * @param {object} boardState - { objectCount, objects }
 * @param {string[]} selectedIds - Selected object IDs
 * @param {object|null} selectionArea - { x, y, width, height } or null
 * @returns {string} Context string to append to system prompt
 */
export function buildAIContext(boardState, selectedIds = [], selectionArea = null) {
  let boardContext = 'The board is currently empty.';
  if (boardState && boardState.objectCount > 0) {
    const lines = boardState.objects.map((obj) => {
      const parts = [`id=${obj.id}`, `type=${obj.type}`, `pos=(${obj.x},${obj.y})`];
      if (obj.width !== undefined) parts.push(`w=${obj.width}`);
      if (obj.height !== undefined) parts.push(`h=${obj.height}`);
      if (obj.radius !== undefined) parts.push(`r=${obj.radius}`);
      
      // Convert hex colors to human-readable names
      if (obj.color) {
        const colorName = hexToColorName(obj.color);
        parts.push(`color=${colorName}`);
      }
      if (obj.fill) {
        const fillName = hexToColorName(obj.fill);
        parts.push(`fill=${fillName}`);
      }
      if (obj.stroke) parts.push(`stroke=${obj.stroke}`);
      if (obj.text) parts.push(`text="${obj.text}"`);
      if (obj.name) parts.push(`name="${obj.name}"`);
      
      if (obj.startAnchor) parts.push(`from=${obj.startAnchor.objectId}:${obj.startAnchor.anchor}`);
      if (obj.endAnchor) parts.push(`to=${obj.endAnchor.objectId}:${obj.endAnchor.anchor}`);
      return parts.join(' ');
    });
    boardContext = `Board has ${boardState.objectCount} object(s):\n${lines.join('\n')}`;
  }

  let selectionContext = '';
  if (selectedIds && selectedIds.length > 0 && boardState?.objects) {
    const validIds = selectedIds.filter((id) => boardState.objects.some((o) => o.id === id));
    if (validIds.length > 0) {
      let areaNote = '';
      if (selectionArea && typeof selectionArea.x === 'number' && selectionArea.width > 0 && selectionArea.height > 0) {
        const { x, y, width, height } = selectionArea;
        areaNote = ` The user has selected a region (bounding box) at (${Math.round(x)}, ${Math.round(y)}) with width ${Math.round(width)}px and height ${Math.round(height)}px. Operate ONLY within this box — when formatting, spacing, or arranging in a grid, place objects inside this region.`;
      }
      selectionContext = `\n\n## User Selection (IMPORTANT)\nThe user has ${validIds.length} object(s) selected: ${validIds.join(', ')}.${areaNote}\nWhen the user says "them", "these", "format them", "space them", "arrange them in a grid", "organize these", "how many", "count these", "analyze these", or similar, they mean THESE selected objects. For arranging in grid: call arrangeInGrid with objectIds of selected objects (the tool will automatically use the selection area bounds). For analysis: when calling analyzeObjects, pass objectIds: [${validIds.join(', ')}] to analyze only the selected objects.`;
    }
  }

  return `${boardContext}${selectionContext}`;
}
