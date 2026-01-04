import { CONFIG, TYPES, FRAMES } from './Constants.js';

const CELL_SIZE = CONFIG.CELL_SIZE;

class Person {
    constructor(type, assignedRoom) {
        this.type = type;
        this.assignedRoom = assignedRoom;
        
        // SPAWN POINT:
        // Office workers spawn at Lobby (x=1)
        // Residents spawn at their room
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
    }

    update(grid, systems, frame) {
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
            this.handleArrival();
        }
    }

    handleArrival() {
        if (this.type === 'OFFICE' && this.destinationX > 1) {
            this.state = 'working';
            this.visible = false;
        } else if (this.destinationX <= 1 && Math.abs(this.y - CONFIG.LOBBY_FLOOR) < 0.5) {
            this.state = 'gone'; // Despawn
        } else if (this.type === 'RESIDENT') {
            this.state = 'sleeping';
            this.visible = false;
        }
    }

    setDestination(x, y) {
        this.destinationX = x;
        this.destinationY = y;
        this.state = 'walking';
    }
    
    goHome() {
        this.setDestination(0, CONFIG.LOBBY_FLOOR);
    }
}

export class SimulationManager {
    constructor() {
        this.people = [];
    }

    update(frame, grid, systems, engine) {
        this.checkSchedule(frame, grid, engine);
        this.people = this.people.filter(p => p.state !== 'gone');
        this.people.forEach(p => p.update(grid, systems, frame));
    }

    checkSchedule(frame, grid, engine) {
        // FORCE SPAWN FOR TESTING (High Chance)
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
                p.visible = true;
                p.goHome();
            });
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
            ctx.fillStyle = (p.type === 'OFFICE') ? '#1E88E5' : '#E91E63'; // Blue workers, Pink residents
            ctx.fillRect(px, py - 12, 6, 12);
            
            // Waiting Indicator
            if (p.state === 'waiting_elevator') {
                ctx.fillStyle = 'red';
                ctx.fillRect(px + 1, py - 16, 4, 4);
            }
        });
    }
}
