import { GridManager } from './GridManager.js';
import { SimulationManager } from './SimulationManager.js';
import { SystemsManager } from './SystemsManager.js';
import { CONFIG, TYPES, ROOM_PROPS, beep } from './Constants.js';

export class Engine {
    constructor() {
        // Get DOM elements
        this.canvas = document.getElementById('simCanvas');
        this.viewport = document.getElementById('game-viewport');
        this.ctx = this.canvas.getContext('2d');
        
        // IMPORTANT: Disable image smoothing for crisp pixel art
        this.ctx.imageSmoothingEnabled = false;
        
        // Set canvas to full tower size
        this.canvas.width = CONFIG.GRID_W * CONFIG.CELL_SIZE;
        this.canvas.height = CONFIG.GRID_H * CONFIG.CELL_SIZE;
        
        // Set viewport to scrollable area
        this.viewport.style.width = '100%';
        this.viewport.style.height = '100%';
        
        // Input State
        this.mouseX = 0;
        this.mouseY = 0;
        this.selectedTool = TYPES.OFFICE;
        this.isPaused = false;
        
        // --- SPEED CONTROL ---
        this.gameSpeed = 0.3; // 0.3 = Slow/Readable, 1.0 = Fast, 2.0 = Turbo
        this.updateAccumulator = 0; // Allows for fractional speeds (slow motion)
        
        // Simulation State
        this.money = CONFIG.STARTING_MONEY;
        this.day = 1;
        this.currentFrame = 75; 
        this.rating = 1;
        this.dailyIncome = 0;
        
        // Sub-systems
        this.gridManager = new GridManager();
        this.systemsManager = new SystemsManager();
        this.simulationManager = new SimulationManager();
        
        // Initial Scan
        this.systemsManager.scanGrid(this.gridManager.grid);
        
        // Store engine reference
        this.gridManager.engine = this;
        
        // Setup UI and Input
        this.setupInput();
        this.setupToolbar();
        this.setupTimeControls();
        this.centerViewportOnLobby();
        
        // Draw initial frame
        this.drawInitialFrame();
        
        // Start game loop
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    drawInitialFrame() {
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.gridManager.drawBackground(this.ctx, this.currentFrame, CONFIG.FRAMES_PER_DAY, this);
        this.systemsManager.draw(this.ctx);
        this.simulationManager.draw(this.ctx);
        this.gridManager.drawForeground(this.ctx, this);
        this.updateGUI();
    }

    centerViewportOnLobby() {
        const lobbyY = CONFIG.LOBBY_FLOOR * CONFIG.CELL_SIZE;
        this.viewport.scrollTop = lobbyY - (this.viewport.clientHeight / 2);
    }

    setupInput() {
        this.canvas.addEventListener('mousemove', (e) => {
            this.mouseX = Math.floor(e.offsetX / CONFIG.CELL_SIZE);
            this.mouseY = Math.floor(e.offsetY / CONFIG.CELL_SIZE);
        });

        this.canvas.addEventListener('mousedown', (e) => {
            this.mouseX = Math.floor(e.offsetX / CONFIG.CELL_SIZE);
            this.mouseY = Math.floor(e.offsetY / CONFIG.CELL_SIZE);
            this.handleInteraction();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === ' ') {
                e.preventDefault();
                this.togglePause();
            }
            if (e.key === '1') this.selectTool(TYPES.OFFICE);
            if (e.key === '2') this.selectTool(TYPES.CONDO);
            if (e.key === '3') this.selectTool(TYPES.HOTEL);
            if (e.key === '4') this.selectTool(TYPES.STAIRS);
            if (e.key === '5') this.selectTool(TYPES.ELEVATOR);
            if (e.key === '6') this.selectTool(TYPES.FOOD);
            if (e.key === '7') this.selectTool(TYPES.RETAIL);
            if (e.key === '8') this.selectTool(TYPES.CINEMA);
            if (e.key === '9') this.selectTool(TYPES.PARKING);
            if (e.key === '0') this.selectTool(TYPES.SKY_LOBBY);
        });
    }

    setupToolbar() {
        const buttons = document.querySelectorAll('.tool-button');
        buttons.forEach(button => {
            button.addEventListener('click', () => {
                const toolType = TYPES[button.dataset.tool];
                this.selectTool(toolType);
            });
        });
    }

    selectTool(toolType) {
        this.selectedTool = toolType;
        const buttons = document.querySelectorAll('.tool-button');
        buttons.forEach(button => {
            if (TYPES[button.dataset.tool] === toolType) {
                button.classList.add('selected');
            } else {
                button.classList.remove('selected');
            }
        });
    }

    setupTimeControls() {
        const pauseBtn = document.getElementById('pause-btn');
        const playBtn = document.getElementById('play-btn');
        const fastBtn = document.getElementById('fast-btn');

        pauseBtn.addEventListener('click', () => {
            this.isPaused = true;
            this.gameSpeed = 0;
            this.updateTimeControlButtons();
        });

        playBtn.addEventListener('click', () => {
            this.isPaused = false;
            this.gameSpeed = 0.3; // SLOW MODE (Default Play)
            this.updateTimeControlButtons();
        });

        fastBtn.addEventListener('click', () => {
            this.isPaused = false;
            this.gameSpeed = 1.0; // NORMAL MODE (Fast)
            this.updateTimeControlButtons();
        });
    }

    togglePause() {
        if (this.isPaused) {
            this.isPaused = false;
            this.gameSpeed = 0.3;
        } else {
            this.isPaused = true;
            this.gameSpeed = 0;
        }
        this.updateTimeControlButtons();
    }

    updateTimeControlButtons() {
        const pauseBtn = document.getElementById('pause-btn');
        const playBtn = document.getElementById('play-btn');
        const fastBtn = document.getElementById('fast-btn');

        pauseBtn.classList.remove('active');
        playBtn.classList.remove('active');
        fastBtn.classList.remove('active');

        if (this.isPaused) {
            pauseBtn.classList.add('active');
        } else if (this.gameSpeed <= 0.5) {
            playBtn.classList.add('active');
        } else {
            fastBtn.classList.add('active');
        }
    }

    handleInteraction() {
        if (this.mouseX < 0 || this.mouseX >= CONFIG.GRID_W || 
            this.mouseY < 0 || this.mouseY >= CONFIG.GRID_H) return;
        
        const cost = ROOM_PROPS[this.selectedTool]?.cost || 0;
        
        if (this.money >= cost) {
            const success = this.gridManager.placeItem(this.mouseX, this.mouseY, this.selectedTool);
            if (success) {
                this.money -= cost;
                
                if (this.selectedTool === TYPES.CONDO) this.money += CONFIG.CONDO_SALE;
                if (this.selectedTool === TYPES.ELEVATOR) this.systemsManager.scanGrid(this.gridManager.grid); 
                
                beep(600, 50);
            } else {
                beep(200, 100); 
            }
        }
    }

    isWeekend() {
        return (this.day % 7) === 0 || (this.day % 7) === 6;
    }

    formatTime(frame) {
        const totalMinutes = (frame / CONFIG.FRAMES_PER_DAY) * 1440; 
        const hours = Math.floor(totalMinutes / 60);
        const minutes = Math.floor(totalMinutes % 60);
        const period = hours < 12 ? 'AM' : 'PM';
        const displayHours = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
        return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
    }

    loop() {
        if (!this.isPaused) {
            // --- NEW: TIME ACCUMULATOR LOGIC ---
            // This allows for speeds less than 1 (Slow Motion)
            this.updateAccumulator += this.gameSpeed;
            
            // While we have a full frame's worth of updates saved up...
            while (this.updateAccumulator >= 1) {
                this.updateAccumulator -= 1; // Consume 1 update
                
                // 1. Advance Time
                this.currentFrame++;
                if (this.currentFrame >= CONFIG.FRAMES_PER_DAY) {
                    this.currentFrame = 0;
                    this.day++;
                    this.handleEndOfDay();
                }

                // 2. Run Systems (Elevators)
                this.systemsManager.update(this.gridManager.grid, this.simulationManager.people);

                // 3. Run Simulation (People)
                this.simulationManager.update(this.currentFrame, this.gridManager.grid, this.systemsManager, this);
            }
        }

        // Draw every frame regardless of simulation speed
        this.gridManager.drawBackground(this.ctx, this.currentFrame, CONFIG.FRAMES_PER_DAY, this);
        this.systemsManager.draw(this.ctx);
        this.simulationManager.draw(this.ctx);
        this.gridManager.drawForeground(this.ctx, this);
        
        this.updateGUI();
        requestAnimationFrame(this.loop);
    }

    handleEndOfDay() {
        let dailyIncome = 0;
        for(let y = 0; y < CONFIG.GRID_H; y++) {
            for(let x = 0; x < CONFIG.GRID_W; x++) {
                const cell = this.gridManager.grid[y][x];
                if (cell.isRoot) {
                    if (cell.type === TYPES.OFFICE) dailyIncome += CONFIG.OFFICE_RENT;
                    if (cell.type === TYPES.HOTEL) dailyIncome += CONFIG.HOTEL_RENT;
                    if (cell.type === TYPES.FOOD) dailyIncome += CONFIG.FOOD_INCOME;
                    if (cell.type === TYPES.CINEMA) dailyIncome += CONFIG.CINEMA_INCOME;
                    if (cell.type === TYPES.PARKING) dailyIncome += CONFIG.PARKING_INCOME;
                    if (cell.type === TYPES.RETAIL) dailyIncome += CONFIG.RETAIL_INCOME;
                }
            }
        }
        this.money += dailyIncome;
        this.dailyIncome = dailyIncome;
    }

    updateGUI() {
        document.getElementById('money-display').textContent = `$${this.money.toLocaleString()}`;
        document.getElementById('income-display').textContent = `$${this.dailyIncome.toLocaleString()}`;
        document.getElementById('pop-display').textContent = this.simulationManager.people.length;
        document.getElementById('day-display').textContent = this.day;
        document.getElementById('time-display').textContent = this.formatTime(this.currentFrame);
        const stars = '★'.repeat(this.rating) + '☆'.repeat(5 - this.rating);
        document.getElementById('rating-display').textContent = stars;
    }
}
