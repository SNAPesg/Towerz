// Constants.js - Fixed version
export const CONFIG = {
    STARTING_MONEY: 2000000,
    GRID_W: 40, 
    GRID_H: 50, 
    CELL_SIZE: 48, 
    LOBBY_FLOOR: 25, 
    OFFICE_RENT: 300,
    HOTEL_RENT: 500,
    CONDO_SALE: 150000,
    PARKING_INCOME: 50,
    FOOD_INCOME: 200,
    CINEMA_INCOME: 300,
    RETAIL_INCOME: 150,
    METRO_INCOME: 5,
    FRAMES_PER_DAY: 300,
    WAIT_TOLERANCE_PINK: 80, 
    WAIT_TOLERANCE_RED: 120, 
    DIRT_THRESHOLD: 100,
    DEBUG_MODE: true
};

export const TYPES = {
    EMPTY: 0, 
    LOBBY: 1, 
    OFFICE: 2, 
    CONDO: 3, 
    HOTEL: 4,
    FOOD: 5, 
    PARKING: 6, 
    STAIRS: 7, 
    ELEVATOR: 8,
    CLEANING_SERVICE: 9, 
    ELEVATOR_EXPRESS: 10, 
    CINEMA: 11,      
    CATHEDRAL: 12, 
    SECURITY: 13, 
    METRO: 14, 
    SKY_LOBBY: 15,
    MEDICAL: 16, 
    RECYCLING: 17, 
    RETAIL: 18, 
    ELEVATOR_SERVICE: 19, 
    TAKEN: 99
};

export const ROOM_PROPS = {
    [TYPES.OFFICE]:   { w: 2, cost: 500,  label: 'Office' },
    [TYPES.CONDO]:    { w: 2, cost: 1000,  label: 'Condo' },
    [TYPES.HOTEL]:    { w: 2, cost: 800,  label: 'Hotel' },
    [TYPES.FOOD]:     { w: 3, cost: 600, label: 'Food Court' },
    [TYPES.RETAIL]:   { w: 2, cost: 400,  label: 'Shop' },
    [TYPES.LOBBY]:    { w: 1, cost: 2000,   label: 'Lobby' },
    [TYPES.STAIRS]:   { w: 2, cost: 200,   label: 'Stairs' },
    [TYPES.ELEVATOR]: { w: 2, cost: 1500, label: 'Elevator' },
    [TYPES.SKY_LOBBY]:{ w: 4, cost: 5000, label: 'Sky Lobby' },
    [TYPES.CINEMA]:   { w: 3, cost: 2000, label: 'Cinema' },
    [TYPES.PARKING]:  { w: 3, cost: 300,  label: 'Parking' },
    [TYPES.CLEANING_SERVICE]: { w: 2, cost: 50000, label: 'Housekeeping' }
};

export const FRAMES = {
    DAWN: 60,
    HOTEL_CHECKOUT: 78,
    RESIDENT_LEAVE: 85,
    RUSH_MORNING: 112, 
    LUNCH_START: 150,
    WORK_END: 212,
    RESIDENT_RETURN: 212, 
    RETAIL_CLOSE: 262
};

export const beep = (freq = 440, duration = 100) => {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + duration / 1000);
        osc.stop(ctx.currentTime + duration / 1000);
    } catch(e) {
        console.log('Audio not available');
    }
};

// Debug log
console.log('Constants.js loaded - Room Types:', Object.keys(TYPES).length, 'Room Props:', Object.keys(ROOM_PROPS).length);
