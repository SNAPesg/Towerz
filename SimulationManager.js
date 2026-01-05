import { CONFIG, TYPES, FRAMES } from './Constants.js';

const CELL_SIZE = CONFIG.CELL_SIZE;

class Person {
    constructor(type, assignedRoom, tenantData = null) {
        this.type = type;
        this.assignedRoom = assignedRoom;
        this.tenantData = tenantData; // For residents: {name, schedule, etc.}
        
        // SPAWN POINT:
        // Office workers spawn at Lobby (x=1)
        // Residents spawn at their room (home) or lobby (returning home)
        this.x = (type === 'OFFICE') ? 1 : assignedRoom.x;
        this.y = (type === 'OFFICE') ? CONFIG.LOBBY_FLOOR : assignedRoom.y;
        
        this.destinationX = this.x;
        this.destinationY = this.y;
        this.finalDestinationX = null; // Backup for after elevator

        this.state = 'idle'; 
        this.visible = true;
        this.ridingElevator = null;
        this.waitingForElevator = null;
        this.stress = 0;
        this.dailyRoutineStep = 0; // 0=home, 1=going out, 2=out, 3=returning
    }

    update(grid, systems, frame, engine) {
        if (!this.visible) return;

        // --- STATE 1: RIDING ---
        if (this.state === 'riding' && this.ridingElevator) {
            // Stick to elevator
            this.x = this.ridingElevator.x + 0.5;
            this.y = this.ridingElevator.y;

            const myDestFloor = Math.round(this.destinationY);
            const elevatorFloor = Math.round(this.ridingElevator.y);

            // Exit Check
            if (elevatorFloor === myDestFloor && this.ridingElevator.state === 'OPEN') {
                this.state = 'walking';
                this.ridingElevator = null;
                // Resume walking to horizontal target
                if (this.finalDestinationX !== null) {
                    this.destinationX = this.finalDestinationX;
                    this.finalDestinationX = null;
                }
            }
            return;
        }

        // --- STATE 2: WAITING ---
        if (this.state === 'waiting_elevator') {
            this.stress += 0.05;
            
            if (this.waitingForElevator) {
                // Keep pressing the button
                const myFloor = Math.round(this.y);
                this.waitingForElevator.addRequest(myFloor);

                // Check for Boarding
                const lift = this.waitingForElevator;
                const distY = Math.abs(this.y - lift.y);
                const distX = Math.abs(this.x - lift.x);

                // If elevator is here, open, and close enough
                if (distY < 0.2 && distX < 3.0 && lift.state === 'OPEN') {
                    this.state = 'riding';
                    this.ridingElevator = lift;
                    this.waitingForElevator = null;
                    this.stress = 0;
                    
                    // Press floor button inside car
                    const targetFloor = Math.round(this.destinationY);
                    lift.addRequest(targetFloor);
                }
            }
            
            // Timeout -> Anger
            if (this.stress > CONFIG.WAIT_TOLERANCE_RED) {
                this.state = 'leaving_angry';
                this.destinationX = 0;
                this.destinationY = CONFIG.LOBBY_FLOOR;
                this.waitingForElevator = null;
            }
            return; // Don't walk while waiting
        }

        // --- STATE 3: WALKING / THINKING ---
        const distY = Math.abs(this.destinationY - this.y);
        const distX = Math.abs(this.destinationX - this.x);

        // A. Change Floors?
        if (distY > 0.5 && !this.waitingForElevator) {
            const myFloor = Math.round(this.y);
            const targetFloor = Math.round(this.destinationY);
            
            // Find Elevator
            const lift = systems.findBestElevator(myFloor, targetFloor, this.x);
            if (lift) {
                this.state = 'waiting_elevator';
                this.waitingForElevator = lift;
                this.finalDestinationX = this.destinationX; // Save for later
                this.destinationX = lift.x + 0.5; // Walk to lift
                
                // Press Call Button
                lift.addRequest(myFloor);
            } else {
                // No path - just teleport or disappear (failsafe)
                console.log("No elevator path found");
            }
        }

        // B. Horizontal Movement
        if (distX > 0.1) {
            this.x += Math.sign(this.destinationX - this.x) * 0.15;
        }

        // C. Arrival Check
        if (distX < 0.2 && distY < 0.2) {
            this.handleArrival(engine);
        }
    }

    handleArrival(engine) {
        if (this.type === 'OFFICE' && this.destinationX > 1) {
            this.state = 'working';
            this.visible = false;
        } else if (this.type === 'RESIDENT' && this.destinationY === this.assignedRoom.y && this.destinationX === this.assignedRoom.x) {
            // Resident arrived home
            this.state = 'sleeping';
            this.visible = false;
            this.dailyRoutineStep = 0;
            
            // Mark condo as occupied
            const gridX = Math.floor(this.assignedRoom.x);
            const gridY = Math.floor(this.assignedRoom.y);
            if (gridX >= 0 && gridX < CONFIG.GRID_W && gridY >= 0 && gridY < CONFIG.GRID_H) {
                const rootCell = this.findRootCell(engine.gridManager.grid, gridX, gridY);
                if (rootCell) {
                    rootCell.occupied = true;
                    rootCell.tenant = this.tenantData;
                }
            }
        } else if (this.destinationX <= 1 && Math.abs(this.y - CONFIG.LOBBY_FLOOR) < 0.5) {
            // At lobby - despawn if leaving for work
            if (this.state === 'leaving_for_work') {
                this.state = 'gone';
                // Keep condo marked as occupied (resident is just at work)
            } else {
                this.state = 'waiting'; // Just arrived at lobby
            }
        }
    }

    findRootCell(grid, x, y) {
        let cell = grid[y][x];
        if (cell.isRoot) return cell;
        if (cell.owner) {
            return grid[cell.owner.y][cell.owner.x];
        }
        return null;
    }

    setDestination(x, y) {
        this.destinationX = x;
        this.destinationY = y;
        this.state = 'walking';
    }
    
    goHome() {
        this.setDestination(this.assignedRoom.x, this.assignedRoom.y);
        this.state = 'going_home';
    }
    
    leaveForWork() {
        this.state = 'leaving_for_work';
        this.setDestination(0, CONFIG.LOBBY_FLOOR);
    }
    
    goToLeisure(targetRoom) {
        this.state = 'leisure';
        this.setDestination(targetRoom.x, targetRoom.y);
    }
}

export class SimulationManager {
    constructor() {
        this.people = [];
        this.condoResidents = new Map(); // condo root position -> resident person
        this.pendingCondos = new Map(); // condo root position -> days until occupancy
    }

    update(frame, grid, systems, engine) {
        this.checkSchedule(frame, grid, engine);
        this.processPendingCondos(engine);
        this.people = this.people.filter(p => p.state !== 'gone');
        this.people.forEach(p => p.update(grid, systems, frame, engine));
    }

    processPendingCondos(engine) {
        const today = engine.day;
        for (const [posKey, data] of this.pendingCondos.entries()) {
            if (today >= data.moveInDay) {
                // Time to move in!
                const [x, y] = posKey.split(',').map(Number);
                const condoRoot = engine.gridManager.grid[y][x];
                
                if (condoRoot && condoRoot.type === TYPES.CONDO && condoRoot.isRoot && !condoRoot.occupied) {
                    // Create resident
                    const resident = new Person('RESIDENT', {x: x + 0.5, y: y + 0.5}, {
                        name: `Resident_${x}_${y}`,
                        moveInDay: today,
                        schedule: '9to5'
                    });
                    
                    resident.state = 'sleeping';
                    resident.visible = false;
                    this.people.push(resident);
                    
                    // Mark condo as occupied
                    condoRoot.occupied = true;
                    condoRoot.tenant = resident.tenantData;
                    
                    // Store reference
                    this.condoResidents.set(posKey, resident);
                    
                    console.log(`Resident moved into condo at (${x}, ${y})`);
                }
                
                // Remove from pending
                this.pendingCondos.delete(posKey);
            }
        }
    }

    checkSchedule(frame, grid, engine) {
        // OFFICE WORKERS
        if (frame === FRAMES.RUSH_MORNING && !engine.isWeekend()) {
            const offices = this.getRooms(grid, TYPES.OFFICE);
            offices.forEach(room => {
                if (Math.random() < 0.5) { // 50% chance per office
                    const p = new Person('OFFICE', room);
                    p.setDestination(room.x, room.y);
                    this.people.push(p);
                }
            });
        }
        
        if (frame === FRAMES.WORK_END) {
            this.people.forEach(p => {
                if (p.type === 'OFFICE') {
                    p.visible = true;
                    p.goHome();
                }
            });
        }
        
        // CONDO RESIDENTS
        // Morning: Leave for work (frame 85)
        if (frame === FRAMES.RESIDENT_LEAVE && !engine.isWeekend()) {
            this.condoResidents.forEach(resident => {
                if (resident.state === 'sleeping' || resident.state === 'idle') {
                    resident.visible = true;
                    resident.leaveForWork();
                }
            });
        }
        
        // Evening: Return from work (frame 212)
        if (frame === FRAMES.RESIDENT_RETURN && !engine.isWeekend()) {
            // Spawn residents at lobby to go home
            this.condoResidents.forEach(resident => {
                if (resident.state === 'gone' || resident.state === 'waiting') {
                    resident.x = 1; // Lobby spawn
                    resident.y = CONFIG.LOBBY_FLOOR;
                    resident.visible = true;
                    resident.goHome();
                }
            });
        }
        
        // WEEKEND LEISURE ACTIVITIES
        if (engine.isWeekend() && frame >= 100 && frame <= 200) {
            // Random chance for residents to go out during weekend daytime
            this.condoResidents.forEach(resident => {
                if (resident.state === 'sleeping' && Math.random() < 0.01) { // 1% chance per frame
                    // Choose a leisure destination
                    const leisureTypes = [TYPES.FOOD, TYPES.CINEMA, TYPES.RETAIL];
                    const randomType = leisureTypes[Math.floor(Math.random() * leisureTypes.length)];
                    const leisureRooms = this.getRooms(grid, randomType);
                    
                    if (leisureRooms.length > 0) {
                        const randomRoom = leisureRooms[Math.floor(Math.random() * leisureRooms.length)];
                        resident.visible = true;
                        resident.goToLeisure(randomRoom);
                        
                        // After some time, return home
                        setTimeout(() => {
                            if (resident.state !== 'gone') {
                                resident.goHome();
                            }
                        }, 30000 / engine.gameSpeed); // 30 seconds game time
                    }
                }
            });
        }
    }

    addCondo(gridX, gridY, engine) {
        const posKey = `${gridX},${gridY}`;
        
        // 80% chance of getting a resident
        if (Math.random() < 0.8) {
            // Move in after 1-2 game days
            const moveInDay = engine.day + 1 + Math.floor(Math.random() * 2);
            this.pendingCondos.set(posKey, { moveInDay });
            console.log(`Condo at (${gridX}, ${gridY}) will be occupied on day ${moveInDay}`);
        } else {
            console.log(`Condo at (${gridX}, ${gridY}) remains vacant`);
        }
    }

    getRooms(grid, type) {
        const rooms = [];
        for(let y=0; y<CONFIG.GRID_H; y++) {
            for(let x=0; x<CONFIG.GRID_W; x++) {
                if (grid[y][x].type === type && grid[y][x].isRoot) {
                    rooms.push({x: x + 0.5, y: y + 0.5});
                }
            }
        }
        return rooms;
    }

    draw(ctx) {
        this.people.forEach(p => {
            if (!p.visible) return;
            const px = p.x * CELL_SIZE;
            const py = p.y * CELL_SIZE;

            // Simple Person Graphic
            if (p.type === 'OFFICE') {
                ctx.fillStyle = '#1E88E5'; // Blue workers
                ctx.fillRect(px, py - 12, 6, 12);
            } else if (p.type === 'RESIDENT') {
                ctx.fillStyle = '#E91E63'; // Pink residents
                ctx.fillRect(px, py - 12, 6, 12);
                
                // Add a small home icon when going home
                if (p.state === 'going_home') {
                    ctx.fillStyle = 'green';
                    ctx.fillRect(px + 7, py - 16, 4, 4);
                }
            }
            
            // Waiting Indicator
            if (p.state === 'waiting_elevator') {
                ctx.fillStyle = 'red';
                ctx.fillRect(px + 1, py - 16, 4, 4);
            }
            
            // Stress indicator
            if (p.stress > CONFIG.WAIT_TOLERANCE_PINK) {
                ctx.fillStyle = p.stress > CONFIG.WAIT_TOLERANCE_RED ? 'red' : 'orange';
                ctx.fillRect(px + 2, py - 20, 2, 2);
            }
        });
    }
}

