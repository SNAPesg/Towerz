import { CONFIG, TYPES, ROOM_PROPS } from './Constants.js';
import { SPRITE_DATA, PALETTE } from './Assets.js';

export class GridManager {
    constructor() {
        this.grid = Array(CONFIG.GRID_H).fill().map(() => 
            Array(CONFIG.GRID_W).fill().map(() => ({
                type: TYPES.EMPTY,
                isRoot: false,
                owner: null,
                stress: 0,
                dirt: 0,
                occupied: false,        // NEW: For condos/hotels
                tenant: null            // NEW: Resident data
            }))
        );

        this.engine = null; 
        
        // Debug vars
        this.debugX = -1;
        this.debugY = -1;
        
        // Starting lobby
        const startX = Math.floor(CONFIG.GRID_W / 2) - 2;
        if (startX >= 0) {
            this.placeItem(startX, CONFIG.LOBBY_FLOOR, TYPES.LOBBY);
        }
        
        this.sprites = this.parseAndCacheSprites();
        
        this.typeToSpriteName = {
            [TYPES.OFFICE]: 'OFFICE',
            [TYPES.CONDO]: 'CONDO',
            [TYPES.HOTEL]: 'HOTEL',
            [TYPES.FOOD]: 'FOOD',
            [TYPES.CINEMA]: 'CINEMA',
            [TYPES.PARKING]: 'PARKING',
            [TYPES.STAIRS]: 'STAIRS',
            [TYPES.ELEVATOR]: 'ELEVATOR',
            [TYPES.LOBBY]: 'LOBBY'
        };
    }

    // --- DRAWING LOGIC ---

    draw(ctx, currentFrame, totalFrames, activeEngine = null) {
        const engineToUse = activeEngine || this.engine;
        this.drawBackground(ctx, currentFrame, totalFrames, engineToUse);
        this.drawForeground(ctx, engineToUse);
    }

    drawBackground(ctx, currentFrame, totalFrames, engine) {
        const cellSize = CONFIG.CELL_SIZE;
        const width = CONFIG.GRID_W * cellSize;
        const lobbyY = CONFIG.LOBBY_FLOOR * cellSize;
        const height = CONFIG.GRID_H * cellSize;

        // Sky
        const progress = currentFrame / totalFrames;
        let skyColor = progress < 0.25 ? '#000033' : progress < 0.5 ? '#FF8C00' : progress < 0.75 ? '#87CEEB' : '#4B0082';
        ctx.fillStyle = skyColor;
        ctx.fillRect(0, 0, width, lobbyY);
        
        // Lobby Floor
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, lobbyY, width, cellSize);
        
        // Dirt
        ctx.fillStyle = '#3E2723'; 
        ctx.fillRect(0, lobbyY + cellSize, width, height - (lobbyY + cellSize));

        // Grid Lines
        ctx.strokeStyle = '#606060';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= CONFIG.GRID_W; x++) {
            ctx.moveTo(x * cellSize, lobbyY);
            ctx.lineTo(x * cellSize, lobbyY + cellSize);
        }
        ctx.stroke();

        // Mouse Highlight
        if (CONFIG.DEBUG_MODE && engine) {
            const mx = engine.mouseX;
            const my = engine.mouseY;
            if (mx >= 0 && mx < CONFIG.GRID_W && my >= 0 && my < CONFIG.GRID_H) {
                ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
                ctx.fillRect(mx * cellSize, my * cellSize, cellSize, cellSize);
            }
        }

        // Draw Rooms (Background sprites)
        for (let y = 0; y < CONFIG.GRID_H; y++) {
            for (let x = 0; x < CONFIG.GRID_W; x++) {
                const cell = this.grid[y][x];
                if (cell.type !== TYPES.EMPTY && cell.type !== TYPES.TAKEN && cell.isRoot) {
                    this.drawSprite(ctx, cell.type, x * cellSize, y * cellSize);
                    
                    // Draw occupancy indicator for condos
                    if (cell.type === TYPES.CONDO && cell.occupied) {
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                        ctx.fillRect(x * cellSize + 2, y * cellSize + 2, cellSize - 4, cellSize - 4);
                        
                        // Draw a small resident icon
                        ctx.fillStyle = '#E91E63';
                        ctx.fillRect(x * cellSize + 10, y * cellSize + 10, 4, 8);
                    }
                }
            }
        }
    }

    drawForeground(ctx, engine) {
        const cellSize = CONFIG.CELL_SIZE;
        for (let y = 0; y < CONFIG.GRID_H; y++) {
            for (let x = 0; x < CONFIG.GRID_W; x++) {
                const cell = this.grid[y][x];
                if (cell.type === TYPES.ELEVATOR && cell.isRoot) {
                    this.drawElevatorDoors(ctx, x * cellSize, y * cellSize, engine);
                }
            }
        }
    }

    drawElevatorDoors(ctx, x, y, engine) {
        const cellSize = CONFIG.CELL_SIZE;
        const width = 2 * cellSize;
        const height = cellSize;
        const gridX = Math.round(x / cellSize);
        const gridY = Math.round(y / cellSize);

        // --- 1. NEIGHBOR CHECK ---
        const hasAbove = (gridY > 0) && (this.grid[gridY - 1][gridX].type === TYPES.ELEVATOR);
        const hasBelow = (gridY < CONFIG.GRID_H - 1) && (this.grid[gridY + 1][gridX].type === TYPES.ELEVATOR);

        // --- 2. ENGINE SAFETY CHECK ---
        if (!engine || !engine.systemsManager) {
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);
            return;
        }

        // --- 3. CAR CHECK ---
        const floorY = y / cellSize;
        const carHere = engine.systemsManager.allCars.find(car => 
            Math.abs(car.x * cellSize - x) < 2 && 
            Math.abs(car.y - floorY) < 0.25 &&
            ['OPEN', 'OPENING', 'CLOSING'].includes(car.state)
        );

        // --- 4. DRAWING ---
        const topPad = hasAbove ? 0 : 2;
        const botPad = hasBelow ? 0 : 2;
        const drawH = height - topPad - botPad;

        if (carHere) {
            // == OPEN DOORS ==
            const gap = 12; 
            ctx.fillStyle = '#666'; // Door color
            // Left Panel
            ctx.fillRect(x + 2, y + topPad, (width / 2) - gap - 2, drawH);
            // Right Panel
            ctx.fillRect(x + (width / 2) + gap, y + topPad, (width / 2) - gap - 2, drawH);
        } else {
            // == CLOSED DOORS ==
            // Draw the center line to represent closed doors
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + width / 2, y + topPad);
            ctx.lineTo(x + width / 2, y + height - botPad);
            ctx.stroke();
        }

        // == SHAFT WALLS (SIDES) ==
        ctx.strokeStyle = '#888'; 
        ctx.lineWidth = 1;
        
        // Left Wall
        ctx.beginPath();
        ctx.moveTo(x + 2, y + topPad);
        ctx.lineTo(x + 2, y + height - botPad);
        ctx.stroke();

        // Right Wall
        ctx.beginPath();
        ctx.moveTo(x + width - 2, y + topPad);
        ctx.lineTo(x + width - 2, y + height - botPad);
        ctx.stroke();

        // == CAPS ==
        if (!hasAbove) ctx.strokeRect(x + 2, y + 2, width - 4, 1);
        if (!hasBelow) ctx.strokeRect(x + 2, y + height - 2, width - 4, 1);
    }

    placeItem(x, y, type) {
        const props = ROOM_PROPS[type];
        if (!props || x < 0 || x + props.w > CONFIG.GRID_W || y < 0 || y >= CONFIG.GRID_H) return false;
        
        for(let i = 0; i < props.w; i++) {
            if (this.grid[y][x + i].type !== TYPES.EMPTY) return false;
        }
        
        for(let i = 0; i < props.w; i++) {
            this.grid[y][x + i] = {
                type: (i === 0) ? type : TYPES.TAKEN,
                isRoot: (i === 0),
                owner: (i === 0) ? null : {x, y},
                stress: 0,
                dirt: 0,
                occupied: false,        // NEW
                tenant: null           // NEW
            };
        }
        
        // Special handling for CONDO placement
        if (type === TYPES.CONDO && this.engine) {
            this.engine.simulationManager.addCondo(x, y, this.engine);
        }
        
        return true;
    }

    parseAndCacheSprites() {
        const cached = {};
        for (const [key, csvData] of Object.entries(SPRITE_DATA)) {
            if (!csvData || csvData.length < 10) continue;
            try {
                const rows = csvData.trim().split('\n');
                const pixels = rows.map(row => row.split(',').map(c => c.trim()));
                const h = pixels.length;
                const w = pixels[0].length;
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                const imgData = ctx.createImageData(w, h);
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const color = PALETTE[pixels[y][x]];
                        const idx = (y * w + x) * 4;
                        if (color) {
                            const hex = parseInt(color.slice(1), 16);
                            imgData.data[idx] = (hex >> 16) & 255;
                            imgData.data[idx+1] = (hex >> 8) & 255;
                            imgData.data[idx+2] = hex & 255;
                            imgData.data[idx+3] = 255;
                        }
                    }
                }
                ctx.putImageData(imgData, 0, 0);
                cached[key] = canvas;
            } catch(e) {}
        }
        return cached;
    }
    
    drawSprite(ctx, type, x, y) {
        const spriteName = this.typeToSpriteName[type];
        const sprite = this.sprites[spriteName];
        if (sprite) {
            ctx.drawImage(sprite, 0, 0, sprite.width, sprite.height, x, y, ROOM_PROPS[type].w * CONFIG.CELL_SIZE, CONFIG.CELL_SIZE);
        } else {
            const width = ROOM_PROPS[type].w * CONFIG.CELL_SIZE;
            ctx.fillStyle = '#999';
            ctx.fillRect(x+1, y+1, width-2, CONFIG.CELL_SIZE-2);
            ctx.strokeStyle = '#333';
            ctx.strokeRect(x, y, width, CONFIG.CELL_SIZE);
            ctx.fillStyle = 'black';
            ctx.font = '10px Arial';
            ctx.fillText(ROOM_PROPS[type].label.substring(0,5), x+2, y+15);
        }
    }
}

