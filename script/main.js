let canvasElement = document.getElementById("screen");
let canvas = canvasElement.getContext("2d");
let body = document.getElementById("body");
let helpOverlay = document.getElementById("help-overlay");
expdate = new Date();
expdate.setDate(Date.now()+(2*24*60*60*1000));
let cookieContents = {firstTime:"true"};

let cell_size_default = 8;
let cell_size_warn = 2;
let cell_size = cell_size_default;
let MAP_SIZE = [Math.round((canvasElement.clientWidth-40)/cell_size), Math.round((canvasElement.clientHeight-40)/cell_size)];
let old_map_size = [MAP_SIZE[0], MAP_SIZE[1]];

let cellFillStyle = "white";
let rulerStrokeStyle = "#4044bb";
let rulerStrokeWidth = 1.5;
let rulerFontStyle1 = "bold ";
let rulerFontStyle2 = "px Courier New";
let rulerFontMarginX = 0.5;
let rulerFontMarginY = 0.5;
let rulerFontSize = 18;
let rulerFontColour = "#4044bb";
let rulerBgColour = "rgba(184, 185, 218, 0.9)";

canvasElement.width = MAP_SIZE[0]*cell_size;
canvasElement.height = MAP_SIZE[1]*cell_size;
canvas.scale(cell_size,cell_size);
canvas.fillStyle = cellFillStyle;
canvas.strokeStyle = rulerStrokeStyle;
canvas.lineWidth = rulerStrokeWidth/cell_size;
canvas.font = rulerFontStyle1 + rulerFontSize/cell_size + rulerFontStyle2;

// index in rule arrays is the number of neighbours
let born = [false, false, false, true, false, false, false, false, false];
let survive = [false, false, true, true, false, false, false, false, false];
let densityDefault = 0.25;
let density = densityDefault;

let bornIcon = "potted_plant";
let surviveIcon = "recycling";
let neutralIcon = "remove";

let popNow = 0;
let bornNow = 0;
let popBuffer = 0;
let bornBuffer = 0;

let tickRateDefault = 20;
let tickRate = tickRateDefault;
let frameRate = 50;

let tickInterval = 1000/tickRate;
let ticksThisSecond = 0;
let drawsThisSecond = 0;
let draws = 0;
let tps = 0;
let frameInterval = 1000/frameRate;
let dataInterval = 1000/60;

// map will be split into THREADS_* parts along each coordinate
const THREADS_X = 2;
const THREADS_Y = 2;
const THREADS = THREADS_X*THREADS_Y;

let xThreadSize = Math.floor(MAP_SIZE[0] / THREADS_X);
let yThreadSize = Math.floor(MAP_SIZE[1] / THREADS_Y);

let doThreads = false;
let tickWorkers = Array(THREADS);
let workerMapArrs = Array(THREADS);
let activeWorkers = 0;
let isWorking = false;
let isDrawing = false;
let isReadyToDraw = false;
let isDrawQueued = false;
let isFirstMultiTick = true;

let paused = false;
let helpActive = false;
let toastActive = false;
let toastExtend = false;
let m1down = false;
let m2down = false;
let shiftdown = false;
let lockDirection = "-"; // can be "-", "r"(recording direction), "ns" or "we"
let suppressResizeLog = false;

let tooltipLine1 = "";
let tooltipLine2 = "";

let mx = 0;
let my = 0;
let mx_last = 0;
let my_last = 0;

let rulerActive = false;
let mx_anchor = 0;
let my_anchor = 0;
let dx = 0;
let dy = 0;

let tickTask = setInterval(tick, tickInterval);
let startDrawTask = setInterval(signalRedrawMap, frameInterval);
let dataTask = setInterval(showData, dataInterval);
let tpsTask = setInterval(recordTps, 1000);
let drawCountTask = setInterval(recordDraws, 1000);

window.addEventListener("resize", handleResize);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("paste", handlePaste);

let map;
let map_prev;
let map_last_draw;

// debugging only
let perfTimes = new Array();
function printPerfTimes() {
    let total = 0;
    let min = perfTimes[0];
    let max = perfTimes[0];
    perfTimes.forEach( (t) => {
        if (t < min) { min = t };
        if (t > max) { max = t };
        total += t;
    });
    console.log("avg: "+total/perfTimes.length+"; min: "+min+"; max: "+max);
    perfTimes = new Array();
}

class MapMatrix {
    array;
    constructor(x, y) {
        this.xSize = x;
        this.ySize = y;
        this.array = new Int8Array(x*y).fill(0);
    }

    getState(x, y) {
        if (x < this.xSize && y < this.ySize && x >= 0 && y >= 0) {
            return this.array[x*this.ySize+y]==1
        } else {
            return false;
        }
    }
    getStateRaw(x, y) {
        if (x < this.xSize && y < this.ySize && x >= 0 && y >= 0) {
            return this.array[x*this.ySize+y]
        } else {
            return 0;
        }
    }
    setState(x, y, state) {
        this.array[x*this.ySize+y] = state ? 1 : 0;
    }
    setStateSafe(x, y, state) {
        if (x < this.xSize && y < this.ySize && x >= 0 && y >= 0) {
            this.array[x*this.ySize+y] = state ? 1 : 0;
        }
    }
    setStateRaw(x, y, state) {
        this.array[x*this.ySize+y] = state;
    }

    getNeighbours(x, y) {
        let nbs = 0;

        nbs += this.getStateRaw(x-1,y-1);
        nbs += this.getStateRaw(x-1,y);
        nbs += this.getStateRaw(x-1,y+1);

        nbs += this.getStateRaw(x,y-1);
        
        nbs += this.getStateRaw(x,y+1);

        nbs += this.getStateRaw(x+1,y-1);
        nbs += this.getStateRaw(x+1,y);
        nbs += this.getStateRaw(x+1,y+1);
    
        return nbs
    }
    // takes a bool array (can be jagged) and its top-left offset
    // can be set to not overwrite live cells with dead according to pattern
    insertBlock(block, xStart, yStart, overwrite) {        
        for (let y = 0; y < block.length; y++) {
            for (let x = 0; x < block[y].length; x++) {
                if (!overwrite) {
                    if (block[y][x]) {
                        this.setStateSafe(xStart + x, yStart + y, true);
                    }
                } else {
                    this.setStateSafe(xStart + x, yStart + y, block[y][x]);
                }
            }
        }
    }
    
    
    resize(newX, newY) {
        if (newX == this.xSize && newY == this.ySize) { return };
        // make new-sized array
        let newArr = new Int8Array(newX*newY).fill(0);
        // copy old values
        for (x = 0; x < newX; x++) {
            for (y = 0; y < newY; y++) {
                newArr[x*newY+y] = this.array[x*this.ySize+y];
            }
        }
        // replace old array
        this.array = newArr;
        this.xSize = newX;
        this.ySize = newY;

        // log change
        if (!suppressResizeLog) {
            console.log("Resize: ", old_map_size, "to", MAP_SIZE);
            suppressResizeLog = true;
            setTimeout(() => {suppressResizeLog = false}, 500);
        }
    }
    clear() {
        this.array = new Int8Array(this.xSize*this.ySize).fill(0);
    }
}

initMap();
clearMap();
randomiseMap();

// MARK: Map shenanigans


function initMap() {
    map = new MapMatrix(MAP_SIZE[0], MAP_SIZE[1]);
    map_prev = new MapMatrix(MAP_SIZE[0], MAP_SIZE[1]);
    map_last_draw = new MapMatrix(MAP_SIZE[0], MAP_SIZE[1]);
}
function initWorkerMaps() {
    for (i = 0; i < THREADS; i++) {
        workerMapArrs[i] = new Int8Array(MAP_SIZE[0]*MAP_SIZE[1]);
        workerMapArrs[i].set(map_prev.array);
    }
}

function mapToMapPrev() {
    map_prev.array.set(map.array);
}
function mapPrevToMap() {
    map.array.set(map_prev.array);
}
function mapToMapLastDraw() {
    map_last_draw.array.set(map.array);
}

function randomiseMap() {
    for (x = 0; x < MAP_SIZE[0]; x++) {
        for (y = 0; y < MAP_SIZE[1]; y++) {
            if (Math.random() < density) {
                map.setState(x,y, true);
            } else {
                map.setState(x,y, false);
            }
        }
    }
}

function getWorkerOffsets(i) {
    // get map offsets of this worker
    let xCoord = i % THREADS_X;
    let yCoord = Math.floor(i / THREADS_X);
    
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
    return {
        xStart: xStart,
        yStart: yStart,
        xEnd: xEnd,
        yEnd: yEnd
    };
}
function initWorkers() {
    initWorkerMaps();
    for (i = 0; i < THREADS; i++) {
        tickWorkers[i] = new Worker("script/tick-worker.js");
        // get map offsets of this worker
        offsets = getWorkerOffsets(i);
        
        tickWorkers[i].postMessage(
            {
                type: "init",

                id: i,
                
                map_prev_arr: workerMapArrs[i].buffer,
                MAP_SIZE: MAP_SIZE,
                born: born,
                survive: survive,

                xStart: offsets.xStart,
                yStart: offsets.yStart,
                xEnd: offsets.xEnd,
                yEnd: offsets.yEnd
            }
        );
        tickWorkers[i].onmessage = (e) => { handleWorkerMessage(e) };
    }
}
function startWorkers() {
    for (i = 0; i < THREADS; i++) {
        if (!isFirstMultiTick) {
            tickWorkers[i].postMessage({ type: "tick", map: workerMapArrs[i].buffer }, [workerMapArrs[i].buffer]);
        } else {
            tickWorkers[i].postMessage({ type: "first-tick" });
        }
    }
    isFirstMultiTick = false;
}
function killWorkers() {
    for (i = 0; i < THREADS; i++) {
        tickWorkers[i].terminate();
    }
    activeWorkers = 0;
    isFirstMultiTick = true;
}
// MARK: tick coordination
function tick() {
    bornBuffer = 0;
    popBuffer = 0;
    mapToMapPrev();
    if (doThreads) {
        if (activeWorkers != 0) { return };
        // make sure all workers have correct map_prev
        initWorkerMaps();
        // start workers
        startWorkers();
        activeWorkers = THREADS;

    } else { localtick(); }
    ticksThisSecond++;
    redrawMap();
}
function concatworkerMapArrs() {
    for (i = 0; i < THREADS; i++) {
        let offsets = getWorkerOffsets(i);
        for (x = offsets.xStart; x < offsets.xEnd; x++) {
            let ix = x*MAP_SIZE[1];
            for (y = offsets.yStart; y < offsets.yEnd; y++) {
                map.array[ix+y] =  workerMapArrs[i][ix+y];
            }
        }
    }
}
function handleWorkerMessage(e) {
    if (e.data.type == "done") {
        activeWorkers--;
        workerMapArrs[e.data.id] = new Int8Array(e.data.map);
        popBuffer += e.data.popNow;
        bornBuffer += e.data.bornNow;
        if (activeWorkers == 0) {
            popNow = popBuffer;
            bornNow = bornBuffer;
            popBuffer = 0;
            bornBuffer = 0;
            concatworkerMapArrs();
        }
    }
    
}
// MARK: game logic
function updateState(x,y) {
    nbs = map_prev.getNeighbours(x,y);
    if (map_prev.getState(x,y)) {
        // if alive, check survival
        if (survive[nbs]) {
            popBuffer++;
            return true;
        } else {
            return false;
        }
    } else if (born[nbs]) {
        // else, check born
        bornBuffer++;
        popBuffer++;
        return true;
    }
    // otherwise, cell remains dead
    return false;
}

function back_tick() {
    mapPrevToMap();
}

function localtick() {
    if (isWorking) { return }
    isWorking = true;
    for (x = 0; x < MAP_SIZE[0]; x++) {
        for (y = 0; y < MAP_SIZE[1]; y++) {
            map.setState(x,y, updateState(x,y));
        }
    }
    isWorking = false;
    popNow = popBuffer;
    bornNow = bornBuffer;
    popBuffer = 0;
    bornBuffer = 0;
}

// MARK: Drawing
function redrawMap() {
    if (isDrawing || !isReadyToDraw) {
        isDrawQueued = true;
        return;
    }
    isDrawing = true;
    isReadyToDraw = false;
    isDrawQueued = false;

    // draw GoL
    canvas.beginPath();
    for (x = 0; x < MAP_SIZE[0]; x++) {
        for (y = 0; y < MAP_SIZE[1]; y++) {
            // check that cell actually changed since last time and needs to be drawn

            // add newborn cells
            if (map.getState(x,y) && !map_last_draw.getState(x,y)) {
                canvas.roundRect(x,y, 1,1, 0.2);
            }
            // remove dead cells
            else if (!map.getState(x,y) && map_last_draw.getState(x,y)) {
                canvas.clearRect(x,y,1,1);
            }
        }
    }
    canvas.fill();

    // draw ruler
    if (rulerActive) {
        canvas.beginPath();
        canvas.moveTo(mx_anchor+0.5, my_anchor+0.5);
        canvas.lineTo(mx+0.5,my+0.5);
        canvas.stroke();
        
        let str = Math.sqrt(dx**2+dy**2).toFixed(1);
        let textMetric = canvas.measureText(str);
        let xm = (mx_anchor+mx-textMetric.width/2)/2;
        let ym = (my_anchor+my-textMetric.fontBoundingBoxDescent/2)/2;
        
        canvas.beginPath();
        canvas.fillStyle = rulerBgColour;
        
        let textRect = [xm-rulerFontMarginX, ym-textMetric.fontBoundingBoxAscent-rulerFontMarginY, textMetric.width+2*rulerFontMarginX, textMetric.fontBoundingBoxDescent*4+rulerFontMarginY];
        canvas.roundRect(textRect[0], textRect[1], textRect[2], textRect[3], 0.4);
        canvas.fill();

        canvas.beginPath();
        canvas.fillStyle = rulerFontColour;
        canvas.fillText(str, xm, ym);
        canvas.fillStyle = cellFillStyle;
    }
    mapToMapLastDraw();
    isDrawing = false;
    drawsThisSecond++;
}
function clearMap() {
    map.clear();
    mapToMapPrev();
    clearScreen()
}
function signalRedrawMap() {
    isReadyToDraw = true;
    if (isDrawQueued) { redrawMap() };
}

function clearScreen() {
    canvas.clearRect(0,0,canvasElement.width,canvasElement.height);
}

// MARK: ### UI & Debug
function showData() {
    let str = "";
    updateRuler();
    str += "p: " + popNow;
    str += "; b: " + bornNow;

    str += "; x: " + mx;
    str += "; y: " + my;
    // also put coordinates in tooltip
    tooltipLine1 = "x:"+mx+" y:"+my;
    canvasElement.title = tooltipLine1+"\n"+tooltipLine2;

    str += "; draws: " + draws;

    str += "; tps: " + tps;

    document.getElementById("data_text").innerHTML = str;
}
function recordTps() {
    tps = (!paused) ? ticksThisSecond : "(paused)";
    ticksThisSecond = 0;
}
function recordDraws() {
    draws = drawsThisSecond;
    drawsThisSecond = 0;
}
// Fade toast in, then out. If called repeatedly,
// text changes and toast period extends.
function toast(text) {
    toastEl = document.getElementById("toast");
    toastEl.style.display = "block";
    toastEl.innerHTML = text;
    toastExtend = true;
    if (toastActive) { return };
    toastActive = true;
    let time = 200;
    let hold_time = 1000;
    let opacity_step = 50/time;
    let opacity = 0;
    toastEl.style.opacity = opacity;
    // fade in
    let interval1 = setInterval(() => {
        opacity += opacity_step;
        if (opacity < 1) {
            toastEl.style.opacity = opacity;
        } else {
            toastEl.style.opacity = 1;
            opacity = 1;
            clearInterval(interval1);
            
            if (toastExtend) {
                toastExtend = false;
            }
            let interval2 = setInterval(() => {
                if (toastExtend) {
                    toastExtend = false;
                } else {
                    let interval3 = setInterval(() => {
                        opacity -= opacity_step;
                        if (opacity > 0) {
                            toastEl.style.opacity = opacity;
                        } else {
                            toastEl.style.opacity = 0;
                            toastEl.style.display = "none";
                            toastActive = false;
                            
                            clearInterval(interval2);
                            clearInterval(interval3);
                        }
                    }, 50);
                }
            }, hold_time);
        }
    }, 50);
}

// MARK: Mouse
function handleMDown(event) {
    event.preventDefault();
    m1down = event.button === 0 ? true : m1down;
    m2down = event.button === 2 ? true : m2down;

    if (!(mx >= MAP_SIZE[0] || my >= MAP_SIZE[1] )) {
        if (m1down) { putCellAtMouse(true) };
        if (m2down) { putCellAtMouse(false) };
        if (shiftdown) { lockDraw() };
    }

    if (event.button === 1) {
        console.log(map.getNeighbours(mx,my) + " neighbours at " + mx + ',' + my);
        console.log(survive[map.getNeighbours(mx,my)], born[map.getNeighbours(mx,my)], map.getState(mx,my));
    }
}
function handleMUp(event) {
    m1down = event.button === 0 ? false : m1down;
    m2down = event.button === 2 ? false : m2down;
    unlockDraw();
}
function handleMLeave(event) {
    m1down = false;
    m2down = false;
    unlockDraw();
}

function getMousePos(event) {
    let rect = canvasElement.getBoundingClientRect();
    mx_last = mx;
    my_last = my;
    mx = Math.floor((event.clientX - rect.left - 20) / cell_size);
    my = Math.floor((event.clientY - rect.top - 20) / cell_size);
    switch (lockDirection) {
        case "ns":
            mx = mx_last;
            break;
        case "we":
            my = my_last;
            break;
        case "r":
            recordLockDraw();
            break;
    }
    if (m1down) { putCellAtMouse(true) };
    if (m2down) { putCellAtMouse(false) };
}
// MARK: Direction
function lockDraw() {
    lockDirection = "r";
}
function unlockDraw() {
    lockDirection = "-";
}
function recordLockDraw() {
    if (!m1down) { return };
    if (mx == mx_last && my == my_last) { return };
    if (mx == mx_last) {
        lockDirection = "ns";
    }
    if (my == my_last) {
        lockDirection = "we";
    }
}

// MARK: Ruler
// Called whenever ruler key pressed
function recordAnchor() {
    mx_anchor = mx;
    my_anchor = my;
}
function updateRuler() {
    if (!rulerActive) { return };
    dx = mx-mx_anchor;
    dy = my-my_anchor;
    tooltipLine2 = "dx:"+dx+" dy:"+dy;
}

function putCellAtMouse(state) {
    if (mx >= MAP_SIZE[0] || my >= MAP_SIZE[1] ) { return };
    if (mx < 0 || my < 0 ) { return };
    map.setState(mx,my, state);
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

// MARK: Rules
function updateBorn(n) {
    let currIcon = document.getElementById(n+"nbb").children[0].innerHTML;
    if (currIcon == neutralIcon) {
        document.getElementById(n+"nbb").children[0].innerHTML = bornIcon;
        born[n] = true;
    } else if (currIcon == bornIcon) {
        document.getElementById(n+"nbb").children[0].innerHTML = neutralIcon;
        born[n] = false;
    }

    updateRulestring()
}
function updateSurvive(n) {
    let currIcon = document.getElementById(n+"nbs").children[0].innerHTML;
    console.log(currIcon);
    if (currIcon == neutralIcon) {
        document.getElementById(n+"nbs").children[0].innerHTML = surviveIcon;
        survive[n] = true;
    } else if (currIcon == surviveIcon) {
        document.getElementById(n+"nbs").children[0].innerHTML = neutralIcon;
        survive[n] = false;
    }

    updateRulestring()
}
function updateRulestring() {
    let bStr = "B";
    let sStr = "S";
    for (i = 0; i < 9; i++) {
        if (born[i]) { bStr += i };
        if (survive[i]) { sStr += i };
    }
    let str = bStr+"/"+sStr;
    document.getElementById("rulestring-field").value = str;
    document.getElementById("rulestring-field").blur();
}
function updateRuleButtons() {
    for (i = 0; i < 9; i++) {
        if (born[i]) {
            document.getElementById(i+"nbb").children[0].innerHTML = bornIcon;
        } else {
            document.getElementById(i+"nbb").children[0].innerHTML = neutralIcon;
        }

        if (survive[i]) {
            document.getElementById(i+"nbs").children[0].innerHTML = surviveIcon;
        } else {
            document.getElementById(i+"nbs").children[0].innerHTML = neutralIcon;
        }
    }
}

function loadSampleRule(id) {
    let rule = document.getElementById(id).innerHTML
    parseRulestring(rule);
    updateRulestring();
    toast("Rules are now "+rule);
}

// MARK: Pattern library

function copyLibPattern(id) {
    pattern = document.getElementById(id).innerHTML;
    navigator.clipboard.writeText(pattern);
    toast("Successfully copied "+id);
}

// MARK: Parsers

// Rulestring parser
// Supported notations:
// * Bxx/Sxx in any case, order and optional divider
// * S/B (only numbers, any divider)
function parseRulestring(str) {
    let mode = "s";
    let numbers = "012345678";
    let isLabelless = numbers.includes(str.charAt(0));

    born = Array(8).fill(false);
    survive = Array(8).fill(false);

    for (i = 0; i < str.length; i++) {
        c = str.charAt(i);

        if (numbers.includes(c)) {
            if (mode == "b") {
                born[parseInt(c)] = true;
            } else if (mode == "s") {
                survive[parseInt(c)] = true;
            }
        } else if (c.toLowerCase() == "b") {
            mode = "b";
        } else if (c.toLowerCase() == "s") {
            mode = "s";
        } else if (isLabelless) {
            mode = "b"
        }
    }
    console.log("NEW RULES: "+str);
    updateRuleButtons();
    updateRulestring();
}

// Pattern parser
function getPatternType(str) {
    let c0 = str.charAt(0);
    if (c0 == "!" || c0 == ".") { return "plaintext" };
    if (c0 == "#" || c0 == "x") { return "rle" };
    return "unknown"
}
function insertPattern(str) {
    let type = getPatternType(str);
    console.log(type);
    let block;
    if (type == "plaintext") {
        block = parsePlaintext(str);
    } else if (type == "rle") {
        block = parseRle(str);
    } else {
        console.log("Not a recognised pattern");
        return;
    }
    map.insertBlock(block, mx, my, true);
    redrawMap();
}

function parsePlaintext(str) {
    let block = Array();
    let workStr = str.split("\n");
    let patStart = 0;

    let xMax = 0;
    let yMax = 0;
    // 1st pass: count comment offset and maximum X length
    for (line = 0; line < workStr.length; line++) {
        // ignore comments and count how many lines of them there are
        if (workStr[line].charAt(0) == "!") {
            patStart++;
            continue;
        }
        if (workStr[line].length > xMax) { xMax = workStr[line].length };
    }
    yMax = workStr.length-patStart;

    // 2nd pass: constuct array
    for (y = 0; y < yMax; y++) {
        block.push(Array());
        for (x = 0; x < xMax; x++) {
            block[y].push(workStr[y+patStart].charAt(x) == "O");
        }
    }

    return block;
}
// MARK: rle
function parseRleMeta(str) {
    
    let numbers = "0123456789";
    let xMax;
    let yMax;

    let nowParsing = "";
    let currNum = "";
    let rulestring = "";
    
    for (c = 0; c < str.length; c++) {
        let char = str.charAt(c);
        // parse dimensions
        if (char == "x") {
            nowParsing = "x";
            currNum = "";
        }
        if (char == "y") {
            nowParsing = "y";
            currNum = "";
        }
        if (numbers.includes(char)) {
            currNum += char;
            if (nowParsing == "x") { xMax = parseInt(currNum) };
            if (nowParsing == "y") { yMax = parseInt(currNum) };
        }

        // parse rules
        if (char == "e") { // last character of "rule" in "rule = Bxx/Sxx"
            nowParsing = "wait rule";
            continue;
        }
        if (nowParsing == "wait rule") {
            if (char == "B" || numbers.includes(char)) {
                rulestring += char;
                nowParsing = "rule";
                continue;
            }
        }
        if (nowParsing == "rule") {
            rulestring += char;
        }
    }
    return [xMax, yMax, rulestring];
}
function parseRle(str) {
    let block = Array();
    let workStr = str.split("\n");
    let patStart = 0;
    let numbers = "0123456789";
    
    // RLE parser working vars
    let runLength = 1;
    let mapX = 0;
    let mapY = 0;
    let parsingRunLength = "";
    let gotMeta = false;

    let xMax;
    let yMax;

    for (line = 0; line < workStr.length; line++) {
        // ignore comments and count how many lines of them there are
        if (workStr[line].charAt(0) == "#") {
            continue;
        }

        // parse size and rule on the first line after comments
        if (!gotMeta) {
            let boundingBox = parseRleMeta(workStr[line]);
            gotMeta = true;
            xMax = boundingBox[0];
            yMax = boundingBox[1];
            // rulestring
            if (boundingBox[2] != "") {
                parseRulestring(boundingBox[2]);
            }
            block.push(Array());
            continue;
        }

        // parse actual pattern
        for (c = 0; c < workStr[line].length; c++) {
            char = workStr[line].charAt(c);
            if (char == "b") { // fill dead cell
                parsingRunLength = "";
                for (i = 0; i < runLength; i++) {
                    block[mapY].push(false);
                }
                runLength = 1;
            } else if (char == "o") { // fill live cell
                parsingRunLength = "";
                for (i = 0; i < runLength; i++) {
                    block[mapY].push(true);
                }
                runLength = 1;
            } else if (numbers.includes(char)) { // parse run length
                parsingRunLength += char;
                runLength = parseInt(parsingRunLength);
            } else if (char == "$") { // EOL
                // skip runLength lines
                for (i = 0; i < runLength; i++) {
                    for (j = block[mapY].length; j < xMax; j++) {
                        block[mapY].push(false);
                    }
                    // increment line counter and add new line to block
                    mapY++;
                    block.push(Array());
                }
                parsingRunLength = "";
                runLength = 1;
            } else if (char == "!") { // EOF
                for (i = block[mapY].length; i < xMax; i++) { // end line
                    block[mapY].push(false);
                }
                mapY++;
                parsingRunLength = "";
                runLength = 1;
                break;
            }
        }
    }
    return block;
}

// MARK: Resize
function handleResize() {
    clearInterval(startDrawTask);
    old_map_size = [MAP_SIZE[0], MAP_SIZE[1]];
    MAP_SIZE = [Math.round((canvasElement.clientWidth-40)/cell_size), Math.round((canvasElement.clientHeight-40)/cell_size)];

    // reset canvas params
    canvasElement.width = MAP_SIZE[0]*cell_size;
    canvasElement.height = MAP_SIZE[1]*cell_size;
    canvas.scale(cell_size,cell_size);
    canvas.fillStyle = cellFillStyle;
    canvas.strokeStyle = rulerStrokeStyle;
    canvas.lineWidth = rulerStrokeWidth/cell_size;
    canvas.font = rulerFontStyle1 + rulerFontSize/cell_size + rulerFontStyle2;
    
    // apply to map
    map.resize(MAP_SIZE[0], MAP_SIZE[1]);
    map_prev.resize(MAP_SIZE[0], MAP_SIZE[1]);
    map_last_draw = new MapMatrix(MAP_SIZE[0], MAP_SIZE[1]);
    redrawMap();

    if (doThreads) {
        killWorkers();
        initWorkers();
    }
    startDrawTask = setInterval(signalRedrawMap, frameInterval);
}

// MARK: Keys
function handleKeyUp(e) {
    if (e.key == " " || e.key == "k") {
        e.preventDefault();
        togglePause();
    }
    if (!e.shiftKey) {
        unlockDraw();
        shiftdown = false;
    }
    if (!e.ctrlKey) {
        ctrlDown = false;
    }
}
function handleKeyDown(e) {
    if (e.key == "l") {
        tick();
    }
    if (e.key == "j") {
        back_tick();
    }
    if (e.shiftKey && !e.repeat) {
        lockDraw();
        shiftdown = true;
    }
    if (e.key == "c" && !e.repeat) {
        rulerActive = !rulerActive;
        // clear ruler tooltip if ruler turned off
        if (!rulerActive) {
             tooltipLine2 = "";
        } else {
            recordAnchor();
        }
    }
}
function handlePaste(e) {
    let str = e.clipboardData.getData("text");
    console.log("PASTING PATTERN");
    console.log(str);
    insertPattern(str);
}

// Only called from console, very broken and unsupported
function toggleThreading() {
    doThreads = !doThreads;
    if (doThreads) {
        initWorkers();
        console.log("Threading ON");
    } else {
        killWorkers();
        console.log("Threading OFF");
    }
}
// MARK: Help display
function toggleHelp() {
    if (!helpActive) {
        helpOverlay.style.display = "block";
    } else {
        helpOverlay.style.display = "none";
        cookieContents.firstTime = false;
        writeCookie();
    }
    helpActive = !helpActive;
}

// MARK: Cookie
function parseCookie() {
    if (!document.cookie) { writeCookie(); return };
    cookieContents = {};
    document.cookie.split(";")
        .forEach((r) => {
            cookieContents[r.split("=")[0]] = r.split("=")[1];
        });
    console.log("cookie", cookieContents);
}
function writeCookie() {
    let cookieStr = "";
    Object.keys(cookieContents).forEach((k) => {
        if (k != "") {
            cookieStr += k+"="+cookieContents[k]+"; ";
        }
    });
    console.log(cookieStr);
    console.log(cookieContents);
    document.cookie = cookieStr;
    console.log(document.cookie);
}
function checkCookie() {
    parseCookie();
    if (cookieContents.firstTime == "true") {
        console.log("first time")
        toggleHelp();
    }
}
checkCookie();

// MARK: Pause
function forcePause() {
    document.getElementById("pause_btn").innerHTML = "<span class=\"material-symbols-outlined\">play_arrow</span>";
    clearInterval(tickTask);
    ticksThisSecond = 0;
    recordTps();
}
function forcePlay() {
    document.getElementById("pause_btn").innerHTML = "<span class=\"material-symbols-outlined\">pause</span>";
    tickTask = setInterval(tick, tickInterval);
    recordTps();
}

function togglePause() {
    paused = !paused;
    if (paused) {
        forcePause();
    } else {
        forcePlay();
    }
}