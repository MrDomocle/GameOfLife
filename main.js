let canvasElement = document.getElementById("screen");
let canvas = canvasElement.getContext("2d");
let body = document.getElementById("body");

const RESIZABLE = false

let MAP_MARGIN_SIDE = 40;
let MAP_MARGIN_BOTTOM = 150;

let CELL_SIZE = 10;
let MAP_SIZE = [Math.floor((window.innerWidth-MAP_MARGIN_SIDE)/CELL_SIZE), Math.floor((window.innerHeight-MAP_MARGIN_BOTTOM)/CELL_SIZE)];
//let MAP_SIZE = [64,64];

canvasElement.width = MAP_SIZE[0]*CELL_SIZE;
canvasElement.height = MAP_SIZE[1]*CELL_SIZE;
canvas.scale(CELL_SIZE,CELL_SIZE);
canvas.fillStyle = "white";

// index in this array is the number of neighbours
// available states: die, survive, reproduce
let rules = ["die", "die", "survive", "reproduce", "die", "die", "die", "die", "die"];
let tickRate = 60;

let tickInterval = 1000/tickRate;
let ticksThisSecond = 0;

let paused = false;
let m1down = false;
let m2down = false;

let mx = 0;
let my = 0;
let mx_last = 0;
let my_last = 0;

let tickTask = setInterval(tick, tickInterval);
let tpsTask = setInterval(showTps, 1000);

let map = Array(MAP_SIZE[0]);
for (i = 0; i < MAP_SIZE[0]; i++) {
    map[i] = Array(MAP_SIZE[1]);
}
let map_prev = Array(MAP_SIZE[0]);
for (i = 0; i < MAP_SIZE[0]; i++) {
    map_prev[i] = Array(MAP_SIZE[1]);
}

clearMap();

function mapToMapPrev() {
    for (x = 0; x < MAP_SIZE[0]; x++) {
        for (y = 0; y < MAP_SIZE[1]; y++) {
            map_prev[x][y] = map[x][y];
        }
    }
}
function mapPrevToMap() {
    for (x = 0; x < MAP_SIZE[0]; x++) {
        for (y = 0; y < MAP_SIZE[1]; y++) {
            map[x][y] = map_prev[x][y];
        }
    }
}

function back_tick() {
    mapPrevToMap();
    redrawMap();
}

function tick() {
    mapToMapPrev();
    for (x = 0; x < MAP_SIZE[0]; x++) {
        for (y = 0; y < MAP_SIZE[1]; y++) {
            map[x][y] = getState(x,y);
        }
    }
    redrawMap();
    ticksThisSecond++;
}

// returns the number of moore neighbours of the cell at x,y
function countNeighbours(x,y) {
    nbs = 0;

    // iterate through neighbourhood
    for (x1 = -1; x1 <= 1; x1++) {
        if (x+x1 < 0 || x+x1 >= MAP_SIZE[0]) { continue };

        for (y1 = -1; y1 <= 1; y1++) {
            if (y+y1 < 0 || y+y1 >= MAP_SIZE[1]) { continue };
            if (!x1 && !y1) { continue };
            if (map_prev[x+x1][y+y1]) { nbs++ };
        }
    }

    return nbs
}

function getState(x,y) {
    nbs = countNeighbours(x,y);
    if (rules[nbs] === "die") {
        return false;
    }
    if (map_prev[x][y]) {
        return true;
    }
    if (rules[nbs] === "reproduce") {
        return true;
    }
    return false;
}

function randomiseMap() {
    for (x = 0; x < MAP_SIZE[0]; x++) {
        for (y = 0; y < MAP_SIZE[1]; y++) {
            ran = Math.random()-0.5;
            if (ran > 0) {
                map[x][y] = true;
            }
            else {
                map[x][y] = false;
            }
        }
    }
    redrawMap();
}

function redrawMap() {
    clearScreen();
    canvas.beginPath();
    for (x = 0; x < MAP_SIZE[0]; x++) {
        for (y = 0; y < MAP_SIZE[1]; y++) {
            if (map[x][y]) {
                canvas.roundRect(x,y, 1,1, 0.2);
            }
        }
    }
    canvas.fill();
}
function clearMap() {
    for (i = 0; i < MAP_SIZE[0]; i++) {
        map[i].fill(false);
    }
    mapToMapPrev();
    clearScreen()
}

function clearScreen() {
    canvas.clearRect(0,0,canvasElement.width,canvasElement.height);
}

// MARK: UI & Debug
function showTps() {
    console.log("TPS: " + ticksThisSecond);
    ticksThisSecond = 0;
}

function handleMDown(event) {
    event.preventDefault();
    m1down = event.button === 0 ? true : m1down;
    m2down = event.button === 2 ? true : m2down;
    if (event.button === 1) {
        console.log(countNeighbours(mx,my) + " neighbours at " + mx + ',' + my);
        console.log(rules[countNeighbours(mx,my)], getState(mx,my));
    }
}
function handleMUp(event) {
    m1down = event.button === 0 ? false : m1down;
    m2down = event.button === 2 ? false : m2down;
}
function handleMLeave(event) {
    m1down = false;
    m2down = false;
}

function getMousePos(event) {
    let rect = canvasElement.getBoundingClientRect();
    mx = Math.floor((event.clientX - rect.left + 1) / CELL_SIZE);
    my = Math.floor((event.clientY - rect.top + 1) / CELL_SIZE);
    if (mx === mx_last && my === my_last) { return };
    if (mx >= MAP_SIZE[0] || my >= MAP_SIZE[1] ) { return };
    if (m1down) { putCellAtMouse(true) };
    if (m2down) { putCellAtMouse(false) };
}

function putCellAtMouse(live) {
    map[mx][my] = live;
    redrawMap();
}

function handleResize() {
    if (!RESIZABLE) { return };
    MAP_SIZE = [Math.floor((window.innerWidth-MAP_MARGIN_SIDE)/CELL_SIZE), Math.floor((window.innerHeight-MAP_MARGIN_BOTTOM)/CELL_SIZE)];

    canvasElement.width = MAP_SIZE[0]*CELL_SIZE;
    canvasElement.height = MAP_SIZE[1]*CELL_SIZE;

    map = Array(MAP_SIZE[0]);
    for (i = 0; i < MAP_SIZE[0]; i++) {
        map[i] = Array(MAP_SIZE[1]);
    }
    map_prev = Array(MAP_SIZE[0]);
    for (i = 0; i < MAP_SIZE[0]; i++) {
        map_prev[i] = Array(MAP_SIZE[1]);
    }
    redrawMap();
}

function toggle_pause() {
    paused = !paused;
    if (paused) {
        clearInterval(tickTask);
        clearInterval(tpsTask);
    } else {
        tickTask = setInterval(tick, tickInterval);
        tpsTask = setInterval(showTps, 1000);
    }
}