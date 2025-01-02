let canvasElement = document.getElementById("screen");
let canvas = canvasElement.getContext("2d");
let body = document.getElementById("body");

let cell_size_default = 8;
let cell_size_warn = 2;
let cell_size = cell_size_default;
let MAP_SIZE = [Math.round((canvasElement.clientWidth-40)/cell_size), Math.round((canvasElement.clientHeight-40)/cell_size)];
let old_map_size = MAP_SIZE.map((x) => x);

canvasElement.width = MAP_SIZE[0]*cell_size;
canvasElement.height = MAP_SIZE[1]*cell_size;
canvas.scale(cell_size,cell_size);
canvas.fillStyle = "white";

// index in rule arrays is the number of neighbours
let born = [false, false, false, true, false, false, false, false, false];
let survive = [false, false, true, true, false, false, false, false, false];
let densityDefault = 0.5;
let density = densityDefault;

let tickRateDefault = 20;
let tickRate = tickRateDefault;
let frameRate = 60;

let tickInterval = 1000/tickRate;
let ticksThisSecond = 0;
let frameInterval = 1000/frameRate;

// map will be split into THREADS_* parts along each coordinate
const THREADS_X = 4;
const THREADS_Y = 4;
const THREADS = THREADS_X*THREADS_Y;

let doThreads = false;
let tickWorkers = Array(THREADS);
let workerMaps = Array(THREADS);
let activeWorkers = 0;

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
randomiseMap();

//tick();

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

function randomiseMap() {
    //forcePause();
    for (x = 0; x < MAP_SIZE[0]; x++) {
        for (y = 0; y < MAP_SIZE[1]; y++) {
            if (Math.random() < density) {
                map[x][y] = true;
            }
            else {
                map[x][y] = false;
            }
        }
    }
    //if (!paused) { forcePlay() };
}

// MARK: tick coordination
function tick() {
    mapToMapPrev();
    if (doThreads) {
        // start workers
        for (i = 0; i < THREADS; i++) {
            tickWorkers[i] = new Worker("script/tick-worker.js");
            // get map offsets of this worker
            let xCoord = i % THREADS_X;
            let yCoord = Math.floor(i / THREADS_X);
            let xThreadSize = Math.floor(MAP_SIZE[0] / THREADS_X);
            let yThreadSize = Math.floor(MAP_SIZE[1] / THREADS_Y);
            
            let xStart = xCoord * xThreadSize;
            let yStart = yCoord * yThreadSize;

            let xEnd;
            let yEnd;
            // make sure all cells have a worker assigned
            if (xCoord+1 < THREADS_X) {
                xEnd = (xCoord+1) * xThreadSize;
            } else {
                xEnd = MAP_SIZE[0];
            }
            if (yCoord+1 < THREADS_Y) {
                yEnd = (yCoord+1) * yThreadSize;
            } else {
                yEnd = MAP_SIZE[1];
            }

            let map_prev_quadrant = Array(xEnd-xStart);
            for (x = xStart; x < xEnd; x++) {
                map_prev_quadrant[x-xStart] = Array(yEnd-yStart);
                for (y = yStart; y < yEnd; y++) {
                    map_prev_quadrant[x-xStart][y-yStart] = map_prev[x][y];
                }
            }

            tickWorkers[i].postMessage(
                {
                    type: "init",

                    id: i,
                    
                    map_prev: map_prev_quadrant,
                    MAP_SIZE: MAP_SIZE,
                    born: born,
                    survive: survive,

                    xStart: xStart,
                    yStart: yStart,
                    xEnd: xEnd,
                    yEnd: yEnd
                }
            );
            tickWorkers[i].onmessage = (e) => { handleWorkerMessage(e) };
            activeWorkers++;
        }

    } else { localtick(); }
}
function concatWorkerMaps() {
    for (x = 0; x < THREADS_X; x++) {
        for (y = 0; y < THREADS_Y; y++) {
            let i = x*THREADS_X + y;
            xOfs = x*Math.floor(MAP_SIZE[0]/THREADS_X);
            yOfs = y*Math.floor(MAP_SIZE[1]/THREADS_Y);
            for (x = 0; x < workerMaps[i].length-2; x++) {
                for (y = 0; y < workerMaps[i][0].length-2; y++) {
                    map[x+xOfs][y+yOfs] = workerMaps[i][x][y];
                }
            }
        }
    }
    console.log("done");
}
function handleWorkerMessage(e) {
    console.log(e.data);
    if (e.data.type == "done") {
        activeWorkers--;
        console.log("worker",e.data.id,"done");
        workerMaps[e.data.id] = e.data.map;
        if (activeWorkers == 0) {
            for (i = 0; i < THREADS; i++) {
                tickWorkers[i].terminate();
            }
            concatWorkerMaps();
        }
    }
    
}
// MARK: local tick
// wrapper to handle out of bounds coordinates
function getState(x,y) {
    let rx = x;
    let ry = y;
    if (rx < MAP_SIZE[0] && ry < MAP_SIZE[1] && rx >= 0 && ry >= 0) {
        return map_prev[rx][ry];
    }
    return false;
}
// returns the number of moore neighbours of the cell at x,y
function countNeighbours(x,y) {
    nbs = 0;

    nbs += (getState(x-1,y-1)) ? 1 : 0;
    nbs += (getState(x,y-1)) ? 1 : 0;
    nbs += (getState(x+1,y-1)) ? 1 : 0;

    nbs += (getState(x-1,y)) ? 1 : 0;

    nbs += (getState(x+1,y)) ? 1 : 0;

    nbs += (getState(x-1,y+1)) ? 1 : 0;
    nbs += (getState(x,y+1)) ? 1 : 0;
    nbs += (getState(x+1,y+1)) ? 1 : 0;

    return nbs
}
function updateState(x,y) {
    nbs = countNeighbours(x,y);
    if (map_prev[x][y]) {
        // if alive, check survival
        if (survive[nbs]) {
            return true;
        } else {
            return false;
        }
    } else if (born[nbs]) {
        // else, check born
        return true;
    }
    // otherwise, cell remains dead
    return false;
}

function back_tick() {
    mapPrevToMap();
    redrawMap();
}

function localtick() {
    for (x = 0; x < MAP_SIZE[0]; x++) {
        for (y = 0; y < MAP_SIZE[1]; y++) {
            map[x][y] = updateState(x,y);
        }
    }
    redrawMap();
    ticksThisSecond++;
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
        console.log(survive[countNeighbours(mx,my)], born[countNeighbours(mx,my)], getState(mx,my));
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
    mx = Math.floor((event.clientX - rect.left - 20) / cell_size);
    my = Math.floor((event.clientY - rect.top - 20) / cell_size);
    //if (mx === mx_last && my === my_last) { return };
    if (mx >= MAP_SIZE[0] || my >= MAP_SIZE[1] ) { return };
    if (m1down) { putCellAtMouse(true) };
    if (m2down) { putCellAtMouse(false) };
}

function putCellAtMouse(state) {
    map[mx][my] = state;
    redrawMap();
}

// MARK: Sliders
function updateTickrate(val) {
    // snap to default
    if (Math.abs(tickRateDefault-val) < 2) {
        val = tickRateDefault;
        tickRate = tickRateDefault;
        document.getElementById("tickRateText").innerHTML = tickRateDefault + " (default)";
    } else {
        tickRate = val;
        document.getElementById("tickRateText").innerHTML = tickRate;
    }
    
    tickInterval = 1000/tickRate;
    if (!paused) {
        clearInterval(tickTask);
        tickTask = setInterval(tick, tickInterval);
    }
}
function updateCellSize(val) {
    if (val == cell_size_default) {
        document.getElementById("cellSizeText").innerHTML = val + " (default)";
    } else {
        document.getElementById("cellSizeText").innerHTML = val;
    }
}
function applyCellSize(val) {
    // warn about lag
    if (val <= cell_size_warn) {
        if (!(confirm("Warning! Cell size " + cell_size_warn + " and less can cause serious lag! Continue?"))) {
            val = cell_size;
            return;
        }
    }
    cell_size = val;
    handleResize();
}
function updateDensity(val) {
    // snap to default
    if (Math.abs(densityDefault-val) < 0.05) {
        val = densityDefault;
        density = densityDefault;
        document.getElementById("densityText").innerHTML = density + " (default)";
    } else {
        density = val;
        document.getElementById("densityText").innerHTML = density;
    }
}

// MARK: Resize
function handleResize() {
    clearInterval(drawTask);
    old_map_size = [MAP_SIZE[0], MAP_SIZE[1]];
    MAP_SIZE = [Math.round((canvasElement.clientWidth-40)/cell_size), Math.round((canvasElement.clientHeight-40)/cell_size)];

    // reset canvas params
    canvasElement.width = MAP_SIZE[0]*cell_size;
    canvasElement.height = MAP_SIZE[1]*cell_size;
    canvas.scale(cell_size,cell_size);
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

function forcePause() {
    document.getElementById("pause_btn").innerHTML = "<span class=\"material-symbols-outlined\">play_arrow</span>";
    document.getElementById("tps_text").innerHTML = "tps: (paused)";
    clearInterval(tickTask);
    clearInterval(tpsTask);
}
function forcePlay() {
    document.getElementById("pause_btn").innerHTML = "<span class=\"material-symbols-outlined\">pause</span>";
    document.getElementById("tps_text").innerHTML = "tps: " + ticksThisSecond;
    tickTask = setInterval(tick, tickInterval);
    tpsTask = setInterval(showTps, 1000);
}

function toggle_pause() {
    paused = !paused;
    if (paused) {
        forcePause();
    } else {
        forcePlay();
    }
}