let canvasElement = document.getElementById("screen");
let canvas = canvasElement.getContext("2d");
let body = document.getElementById("body");

let CELL_SIZE = 8;
let MAP_SIZE = [Math.round((canvasElement.clientWidth-40)/CELL_SIZE), Math.round((canvasElement.clientHeight-40)/CELL_SIZE)];
let old_map_size = MAP_SIZE.map((x) => x);

canvasElement.width = MAP_SIZE[0]*CELL_SIZE;
canvasElement.height = MAP_SIZE[1]*CELL_SIZE;
canvas.scale(CELL_SIZE,CELL_SIZE);
canvas.fillStyle = "white";

// index in rule arrays is the number of neighbours
let born = [false, false, false, true, false, false, false, false, false];
let live = [false, false, true, true, false, false, false, false, false];

let tickRate = 9999;
let frameRate = 60;

let tickInterval = 1000/tickRate;
let ticksThisSecond = 0;
let frameInterval = 1000/frameRate;

let paused = false;
let m1down = false;
let m2down = false;
let suppressResizeLog = false;

let mx = 0;
let my = 0;
let mx_last = 0;
let my_last = 0;

let tickTask = setInterval(tick, tickInterval);
let drawTask = setInterval(redrawMap, frameInterval);
let tpsTask = setInterval(showTps, 1000);

window.addEventListener("resize", handleResize);

let map;
let map_prev;

initMap();
clearMap();

// MARK: Map shenanigans
function initMap() {
    map = Array(MAP_SIZE[0]);
    for (i = 0; i < MAP_SIZE[0]; i++) {
        map[i] = Array(MAP_SIZE[1]);
    }
    map_prev = map.map((x) => x);
}

function mapToMapPrev() {
    for (i = 0; i < MAP_SIZE[0]; i++) {
        map_prev[i] = map[i].map((x) => x);
    }
    
}
function mapPrevToMap() {
    for (i = 0; i < MAP_SIZE[0]; i++) {
        map[i] = map_prev[i].map((x) => x);
    }
}

// MARK: Ticks
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
    if (map_prev[x][y]) {
        // if alive, check if population supports living
        if (live[nbs]) {
            return true;
        } else {
            return false;
        }
    } else if (born[nbs]) {
        // else, check if cell can be born
        return true;
    }
    // otherwise, cell remains dead
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
}

// MARK: Drawing
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
    document.getElementById("tps_text").innerHTML = "tps: " + ticksThisSecond;
    ticksThisSecond = 0;
}

function handleMDown(event) {
    event.preventDefault();
    m1down = event.button === 0 ? true : m1down;
    m2down = event.button === 2 ? true : m2down;

    if (!(mx >= MAP_SIZE[0] || my >= MAP_SIZE[1] )) {
        if (m1down) { putCellAtMouse(true) };
        if (m2down) { putCellAtMouse(false) };
    }

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
    mx = Math.floor((event.clientX - rect.left - 20) / CELL_SIZE);
    my = Math.floor((event.clientY - rect.top - 20) / CELL_SIZE);
    //if (mx === mx_last && my === my_last) { return };
    if (mx >= MAP_SIZE[0] || my >= MAP_SIZE[1] ) { return };
    if (m1down) { putCellAtMouse(true) };
    if (m2down) { putCellAtMouse(false) };
}

function putCellAtMouse(state) {
    map[mx][my] = state;
    redrawMap();
}

// MARK: Resize
function handleResize() {
    clearInterval(drawTask);
    old_map_size = [MAP_SIZE[0], MAP_SIZE[1]];
    MAP_SIZE = [Math.round((canvasElement.clientWidth-40)/CELL_SIZE), Math.round((canvasElement.clientHeight-40)/CELL_SIZE)];

    // reset canvas params
    canvasElement.width = MAP_SIZE[0]*CELL_SIZE;
    canvasElement.height = MAP_SIZE[1]*CELL_SIZE;
    canvas.scale(CELL_SIZE,CELL_SIZE);
    canvas.fillStyle = "white";
    
    // apply to map array
    resizeMap();
    drawTask = setInterval(redrawMap, frameInterval);
}
// explands / shrinks the map
function resizeMap() {
    if (old_map_size[0] == MAP_SIZE[0] && old_map_size[1] == MAP_SIZE[1]) { return };
    // Expand
    if (old_map_size[0] < MAP_SIZE[0]) {
        // expand x direction
        for (x = old_map_size[0]; x < MAP_SIZE[0]; x++) {
            map.push(Array(MAP_SIZE[1]));
            map[x].fill(false);
        }
    }

    if (old_map_size[1] < MAP_SIZE[1]) {
        // expand y direction
        for (x = 0; x < MAP_SIZE[0]; x++) {
            for (y = old_map_size[1]; y < MAP_SIZE[1]; y++) {
                map[x].push(false);
            }
        }
    }  
    // Shrink
    if (old_map_size[0] > MAP_SIZE[0]) {
        // shrink x direction
        for (x = MAP_SIZE[0]; x > old_map_size[0]; x--) {
            map.pop()
        }
    }

    if (old_map_size[1] > MAP_SIZE[1]) {
        // shrink y direction
        for (x = 0; x < MAP_SIZE[0]; x++) {
            for (y = MAP_SIZE[1]; y > old_map_size[1]; y--) {
                map[x].pop();
            }
        }
    }
    
    map_prev = map.map((x) => x);
    
    // log change
    if (!suppressResizeLog) {
        console.log("Resize: ", old_map_size, "to", MAP_SIZE);
        suppressResizeLog = true;
        setTimeout(() => {suppressResizeLog = false}, 500);
    }
    
}

function toggle_pause() {
    paused = !paused;
    if (paused) {
        document.getElementById("pause_btn").innerHTML = "<span class=\"material-symbols-outlined\">play_arrow</span>";
        document.getElementById("tps_text").innerHTML = "tps: (paused)";
        clearInterval(tickTask);
        clearInterval(tpsTask);
    } else {
        document.getElementById("pause_btn").innerHTML = "<span class=\"material-symbols-outlined\">pause</span>";
        document.getElementById("tps_text").innerHTML = "tps: " + ticksThisSecond;
        tickTask = setInterval(tick, tickInterval);
        tpsTask = setInterval(showTps, 1000);
    }
}