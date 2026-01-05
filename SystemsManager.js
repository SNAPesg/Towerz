import { CONFIG, TYPES } from './Constants.js';

class ElevatorBank {
    constructor(id) {
        this.id = id;
        this.cars = []; 
    }

    addCar(car) {
        this.cars.push(car);
        car.bank = this;
    }

    isAdjacent(car) {
        for (const existing of this.cars) {
            if (Math.abs(existing.x - car.x) <= 2) return true;
        }
        return false;
    }
}

class ElevatorCar {
    constructor(x, y, id, minY, maxY) {
        this.id = id;
        this.x = x;
        this.y = y; // Current Float Y
        this.minY = minY;
        this.maxY = maxY;
        
        this.targetY = null;
        this.state = 'IDLE'; // IDLE, MOVING, OPENING, OPEN, CLOSING
        this.direction = 0;  // 0, 1 (Down), -1 (Up)
        
        // The Queue: A Set ensures unique floor requests
        this.stops = new Set(); 
        
        this.timer = 0;
        this.doorTime = 60; 
    }

    update(people) {
        // --- 1. LOGIC PHASE ---
        switch (this.state) {
            case 'IDLE':
                if (this.stops.size > 0) {
                    this.decideNextTarget();
                    if (this.targetY !== null) {
                        this.state = 'MOVING';
                    }
                }
                break;

            case 'MOVING':
                this.handleMovement();
                break;

            case 'OPENING':
                this.timer--;
                if (this.timer <= 0) {
                    this.state = 'OPEN';
                    this.timer = this.doorTime;
                    
                    // Clear the stop for this floor
                    const currentFloor = Math.round(this.y);
                    this.stops.delete(currentFloor);
                }
                break;

            case 'OPEN':
                this.timer--;
                // Wait longer if people are currently boarding (simple proximity check)
                // This prevents doors slamming on people
                if (this.timer <= 0) {
                    this.state = 'CLOSING';
                    this.timer = 30;
                }
                break;

            case 'CLOSING':
                this.timer--;
                if (this.timer <= 0) {
                    if (this.stops.size > 0) {
                        this.decideNextTarget();
                        this.state = 'MOVING';
                    } else {
                        this.state = 'IDLE';
                        this.direction = 0;
                    }
                }
                break;
        }
    }

    handleMovement() {
        if (this.targetY === null) return;

        const currentFloor = Math.round(this.y);
        const dist = this.targetY - this.y;
        const speed = 0.15; // Speed of elevator

        // 1. Check if we should stop AT THIS FLOOR on the way?
        // (Drive-by pickup logic)
        if (Math.abs(this.y - currentFloor) < speed && this.stops.has(currentFloor)) {
            this.y = currentFloor; // Snap to floor
            this.state = 'OPENING';
            this.timer = 20;
            return;
        }

        // 2. Move
        if (Math.abs(dist) < speed) {
            // Arrived at target
            this.y = this.targetY;
            this.state = 'OPENING';
            this.timer = 20;
        } else {
            this.y += Math.sign(dist) * speed;
            this.direction = Math.sign(dist); // -1 UP, 1 DOWN (Y axis is inverted in Canvas)
        }
    }

    decideNextTarget() {
        if (this.stops.size === 0) {
            this.targetY = null;
            return;
        }

        const current = Math.round(this.y);
        const requests = Array.from(this.stops).sort((a, b) => a - b);

        // SCAN ALGORITHM:
        // If moving UP (negative Y), prefer floors above current
        // If moving DOWN (positive Y), prefer floors below current
        
        let nextFloor = null;

        if (this.direction === -1) { // Going UP
            // Find lowest floor number that is smaller than current (Visual Up)
            const above = requests.filter(r => r < current);
            if (above.length > 0) nextFloor = Math.max(...above); // Closest one above
            else nextFloor = Math.max(...requests); // Turn around, go to bottom-most request
        } 
        else if (this.direction === 1) { // Going DOWN
            const below = requests.filter(r => r > current);
            if (below.length > 0) nextFloor = Math.min(...below); // Closest one below
            else nextFloor = Math.min(...requests); // Turn around, go to top-most request
        }
        else {
            // If IDLE, just go to nearest
            nextFloor = requests.reduce((prev, curr) => 
                Math.abs(curr - current) < Math.abs(prev - current) ? curr : prev
            );
        }

        this.targetY = nextFloor;
        // Set direction based on new target
        this.direction = Math.sign(this.targetY - this.y);
    }

    addRequest(floor) {
        this.stops.add(floor);
    }
    
    canStopAt(floor) {
        return floor >= this.minY && floor <= this.maxY;
    }
}

export class SystemsManager {
    constructor() {
        this.banks = []; 
        this.allCars = [];
    }

    scanGrid(grid) {
        this.banks = [];
        this.allCars = [];
        const columns = {};

        // Group elevators by column
        for (let y = 0; y < CONFIG.GRID_H; y++) {
            for (let x = 0; x < CONFIG.GRID_W; x++) {
                const cell = grid[y][x];
                if (cell.isRoot && cell.type === TYPES.ELEVATOR) {
                    if (!columns[x]) columns[x] = [];
                    columns[x].push(y);
                }
            }
        }

        // Build shafts
        Object.keys(columns).forEach(xKey => {
            const x = parseInt(xKey);
            const floors = columns[x].sort((a, b) => a - b);
            let startY = floors[0];
            let prevY = floors[0];

            for (let i = 1; i <= floors.length; i++) {
                const currentY = floors[i];
                if (currentY !== prevY + 1) {
                    this.createElevatorShaft(x, startY, prevY);
                    startY = currentY;
                }
                prevY = currentY;
            }
            this.createElevatorShaft(x, startY, prevY);
        });
        console.log(`Systems Scanned: ${this.allCars.length} elevators.`);
    }

    createElevatorShaft(x, minY, maxY) {
        const car = new ElevatorCar(x, maxY, `Car_${x}`, minY, maxY);
        this.registerElevator(car);
        this.allCars.push(car);
    }

    registerElevator(car) {
        let added = false;
        for (const bank of this.banks) {
            if (bank.isAdjacent(car)) {
                bank.addCar(car);
                added = true;
                break;
            }
        }
        if (!added) {
            const newBank = new ElevatorBank(`Bank_${this.banks.length}`);
            newBank.addCar(car);
            this.banks.push(newBank);
        }
    }

    update(grid, people) {
        this.allCars.forEach(car => car.update(people));
    }

    draw(ctx) {
        const cellSize = CONFIG.CELL_SIZE;
        this.allCars.forEach(car => {
            const drawX = car.x * cellSize;
            const drawY = car.y * cellSize;

            // Cable
            ctx.strokeStyle = '#222';
            ctx.beginPath();
            ctx.moveTo(drawX + cellSize, car.minY * cellSize);
            ctx.lineTo(drawX + cellSize, drawY);
            ctx.stroke();

            // Car Body
            ctx.fillStyle = '#C0C0C0';
            ctx.fillRect(drawX + 4, drawY + 4, (cellSize * 2) - 8, cellSize - 8);

            // Interior (Light on when open)
            if (car.state === 'OPEN' || car.state === 'OPENING') {
                ctx.fillStyle = '#FFF176'; // Yellow light
                ctx.fillRect(drawX + 8, drawY + 6, (cellSize * 2) - 16, cellSize - 12);
            } else {
                ctx.fillStyle = '#37474F'; // Dark when closed
                ctx.fillRect(drawX + 8, drawY + 6, (cellSize * 2) - 16, cellSize - 12);
            }

            // Outline
            ctx.strokeStyle = '#000';
            ctx.strokeRect(drawX + 4, drawY + 4, (cellSize * 2) - 8, cellSize - 8);
        });
    }

    findBestElevator(fromY, toY, fromX) {
        // Find any elevator that covers both start and end floors
        const validCars = this.allCars.filter(c => c.canStopAt(fromY) && c.canStopAt(toY));
        if (validCars.length === 0) return null;
        
        // Sort by X distance to person
        return validCars.sort((a,b) => Math.abs(a.x - fromX) - Math.abs(b.x - fromX))[0];
    }
}
