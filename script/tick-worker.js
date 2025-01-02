let born;
let survive;

let map_prev;
let map;

// offsets of this worker's chunk
let xStart;
let yStart;
let xEnd;
let yEnd;

id = 69;
onmessage = (e) => {
    if (e.data.type == "init") {
        id = e.data.id;

        map_prev = e.data.map_prev;
        map = map_prev.map((x) => x);
        MAP_SIZE = e.data.MAP_SIZE;
        
        born = e.data.born;
        survive = e.data.survive;
        
        xStart = e.data.xStart;
        yStart = e.data.yStart;
        xEnd = e.data.xEnd;
        yEnd = e.data.yEnd;

        tick();
    }
}
function sendMapBack() {
    console.log(id, "done")
    postMessage(
        {
            type: "done",
            id: id,
            map: map
        }
    )
}

// wrapper to handle out of bounds coordinates
function getState(x,y) {
    let rx = x;
    let ry = y;
    if (rx < map_prev.length && ry < map_prev[0].length && rx >= 0 && ry >= 0) {
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
    for (x = 0; x < xStart-xEnd; x++) {
        for (y = 0; y < yStart-yEnd; y++) {
            map[x][y] = updateState(x,y);
        }
        console.log("a");
    }
    sendMapBack();
}