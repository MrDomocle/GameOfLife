let born;
let survive;

let bornNow;
let popNow;

let map_prev;
let map;

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

        MAP_SIZE = e.data.MAP_SIZE;
        map_prev = new MapMatrix(MAP_SIZE[0], MAP_SIZE[1]);
        map = new MapMatrix(MAP_SIZE[0], MAP_SIZE[1]);
        
        map_prev.array = new Int8Array(e.data.map_prev_arr);
        map.array.set(map_prev.array);
        
        born = e.data.born;
        survive = e.data.survive;
        
        xStart = e.data.xStart;
        yStart = e.data.yStart;
        xEnd = e.data.xEnd;
        yEnd = e.data.yEnd;
        MAP_CHUNK_SIZE = [xEnd-xStart, yEnd-yStart];        
    }
    if (e.data.type == "first-tick") {
        tick();
    }
    if (e.data.type == "tick") {
        map.array = new Int8Array(e.data.map);
        tick();
    }
}
function sendMapBack() {
    postMessage(
        {
            type: "done",
            id: id,
            map: map.array.buffer,
            bornNow: bornNow,
            popNow: popNow
        }, [map.array.buffer]
    );
}

function mapToMapPrev() {
    map_prev.array.set(map.array);
}
function updateState(x,y) {
    nbs = map_prev.getNeighbours(x,y);
    if (map_prev.getState(x,y)) {
        // if alive, check survival
        if (survive[nbs]) {
            popNow++;
            return true;
        } else {
            return false;
        }
    } else if (born[nbs]) {
        // else, check born
        bornNow++;
        popNow++;
        return true;
    }
    // otherwise, cell remains dead
    return false;
}

function tick() {
    bornNow = 0;
    popNow = 0;
    mapToMapPrev();
    for (x = xStart; x < xEnd; x++) {
        for (y = yStart; y < yEnd; y++) {
            map.setState(x,y, updateState(x,y));
        }
    }
    sendMapBack();
}