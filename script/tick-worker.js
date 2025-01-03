let born;
let survive;

let map_prev;
let map;

let MAP_SIZE;
let MAP_CHUNK_SIZE;

// offsets of this worker's chunk
let xStart;
let yStart;
let xEnd;
let yEnd;

let id;
onmessage = (e) => {
    if (e.data.type == "init") {
        id = e.data.id;

        map_prev = e.data.map_prev;
        MAP_SIZE = e.data.MAP_SIZE;
        
        born = e.data.born;
        survive = e.data.survive;
        
        xStart = e.data.xStart;
        yStart = e.data.yStart;
        xEnd = e.data.xEnd;
        yEnd = e.data.yEnd;
        MAP_CHUNK_SIZE = [xEnd-xStart, yEnd-yStart];
        //console.log(MAP_CHUNK_SIZE);
        //console.log(MAP_SIZE);
        //console.log(xStart);

        initMap();
    }
    if (e.data.type == "tick") {
        tick();
    }
}
function sendMapBack() {
    postMessage(
        {
            type: "done",
            id: id,
            map: map
        }, 
    );
}

function initMap() {
    map = Array(MAP_CHUNK_SIZE[0]).fill(false).map(() => Array(MAP_CHUNK_SIZE[1]).fill(false));
    for (x = 0; x < MAP_CHUNK_SIZE[0]; x++) {
        for (y = 0; y < MAP_CHUNK_SIZE[1]; y++) {
            map[x][y] = map_prev[x+xStart][y+yStart];
        }
    }
    console.log(map.length, map[0].length);
}

function mapToMapPrev() {
    for (i = 0; i < MAP_CHUNK_SIZE[0]; i++) {
        map_prev[i] = map[i].map((x) => x);
    }
    
}

// wrapper to convert global coordinates to chunk coordinates
function getState(x,y) {
    let rx = x-xStart;
    let ry = y-yStart;
    if (rx < MAP_CHUNK_SIZE[0] && ry < MAP_CHUNK_SIZE[1] && rx >= 0 && ry >= 0) {
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
    if (getState(x,y)) {
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

function tick() {
    mapToMapPrev();
    for (x = xStart; x < xEnd; x++) {
        for (y = yStart; y < yEnd; y++) {
            let state = updateState(x,y)
            map[x-xStart][y-yStart] = state;
        }
    }
    sendMapBack();
}