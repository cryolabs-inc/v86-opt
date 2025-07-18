
// -------------------------------------------------
// ----------------- FILESYSTEM---------------------
// -------------------------------------------------
// Implementation of a unix filesystem in memory.


import { LOG_9P } from "../src/const.js";
import { h } from "../src/lib.js";
import { dbg_assert, dbg_log } from "../src/log.js";
import * as marshall from "../lib/marshall.js";
import { EEXIST, ENOTEMPTY, ENOENT, EPERM, EINVAL } from "./9p.js";
import { P9_LOCK_SUCCESS, P9_LOCK_BLOCKED, P9_LOCK_TYPE_UNLCK, P9_LOCK_TYPE_WRLCK, P9_LOCK_TYPE_RDLCK } from "./9p.js";
/**
 * Direntries: Name To INODE
 * INODE: Data, or direntries
 * 
 * 
 */
// For Types Only
import { FileStorageInterface, MemoryFileStorage } from "../src/browser/filestorage.js";

export const S_IRWXUGO = 0x1FF;
export const S_IFMT = 0xF000;
export const S_IFSOCK = 0xC000;
export const S_IFLNK = 0xA000;
export const S_IFREG = 0x8000;
export const S_IFBLK = 0x6000;
export const S_IFDIR = 0x4000;
export const S_IFCHR = 0x2000;
const PROTOCOL = {
    methodCall: ['s']

}

for (let a of PROTOCOL.methodCall) {
    switch (a) {
        case 's':
            break;
    }
}
function Unmarshall(types, data) {
    let ptr = 0;
    let view = new DataView(data.buffer);
    let lenRead = 0;
    let textEncoder = new TextEncoder();
    let r = [];
    for (let i = 0; i < types.length; i++) {
        let type = types[i];


        let newPtr = ptr;
        switch (type) {
            case 's':
                newPtr = ptr + 4;
                let len = view.getUint32(ptr, true);
                ptr = newPtr;
                newPtr += len;

                let str = '';
                for (let a = 0; a < len; a++) {
                    str += String.fromCharCode(view.getUint8(ptr + a));
                }
                r.push(str);
                break;
            case 'i32':
                newPtr = ptr + 4;
                r.push(view.getUint32(ptr, true));
                break;
            case 'ab':
                newPtr = ptr + 4;
                let l = view.getUint32(ptr, true);
                let dataPtr = newPtr;
                r.push(new Uint8Array(view.buffer, dataPtr, l));
                newPtr += l;

                break;
            case 'i8':
                newPtr = ptr + 1;
                r.push(view.getUint8(ptr));
                break;
        }
        ptr = newPtr;
    }
    return [ptr, r];
}
function Marshall(types, data, toWriteTo = new Uint8Array(4096)) {
    let ptr = 0;
    let view = new DataView(toWriteTo.buffer);
    let lenWritten = 0;
    let textEncoder = new TextEncoder();
    for (let i = 0; i < types.length; i++) {
        let type = types[i];
        let d = data[i];
        let newPtr = ptr;
        switch (type) {
            case 'ab':
                newPtr = ptr + d.length + 4;
                view.setUint32(ptr, d.length, true);
                let startPtr = ptr + 4;
                for (let a = 0; a < d.length; a++) {
                    view.setUint8(startPtr + a, d[a]);
                }
                break;
            case 's':
                newPtr = ptr + d.length + 4;
                view.setUint32(ptr, d.length, true);
                ptr += 4;
                for (let c of d) {
                    view.setUint8(ptr++, c.charCodeAt(0));
                }
                break;
            case 'i32':
                newPtr = ptr + 4;
                view.setUint32(ptr, d, true);
                break;
            case 'i8':
                newPtr = ptr + 1;
                view.setUint8(ptr, d);
                break;
        }
        ptr = newPtr;
    }
    return [ptr, toWriteTo];
}

function WorkerState() {

}
WorkerState.qid = 0;
WorkerState.actualWorker = null;
WorkerState.handlersForQid = {};
/**
 * @param {MessageEvent} msg
 */
WorkerState.OnMessage = function ({ data }) {
    let q = data.qid;
    let handler = WorkerState.handlersForQid[q];
    delete WorkerState.handlersForQid[q];
    
    if (handler)
        handler(data.metadata, data);
    else
        console.warn("ignored response to unknown qid");
}
WorkerState.sendMessage = function (type, objectArgs, callback, estSizeOfResponse = 8192) {
    let i = /** @type {Worker} */(WorkerState.actualWorker);
    let sabRoute = typeof SharedArrayBuffer !== "undefined";
    let metadata = objectArgs;
    let txBuffer = new ArrayBuffer(Math.ceil(estSizeOfResponse / 4) * 4);
    let lockingArray = null;
    let qid = WorkerState.qid++;

    if (sabRoute) {
        txBuffer = new SharedArrayBuffer(Math.ceil(estSizeOfResponse / 4) * 4);
        lockingArray = new SharedArrayBuffer(4);
    }
    let ObjectToPost = {
        metadata,
        txBuffer,
        lockingArray,
        qid,
        type
    }
    WorkerState.handlersForQid[qid] = callback;
    i.postMessage(ObjectToPost);
    if (sabRoute) {
        while (new Int32Array(lockingArray)[0] === 0) { };
        delete WorkerState.handlersForQid[qid];
        return txBuffer;
    } else {
        // idk async, rip
    }
}
WorkerState.OpenInode = function (inoIdx) {
    let metadata = {
        inode: inoIdx
    };

    WorkerState.sendMessage("open", metadata, 0,)
}
/** @typedef {{
    type: string,
    lockingArray: ArrayBuffer,
    metadata: ?,
    qid: number,
    txBuffer: ArrayBuffer
        
}} */
let AA;

Object.defineProperty(self, 'WorkerState', {
    value: WorkerState
});
(function WorkerPlungerStaticInit() {

    const MSGTYPES = {
        OPEN: { id: 0, types: ['i32'] },
        //
        OPEN_RESPONSE: { id: 1, types: [] },
        // bytes to write 
        WRITE: { id: 2, types: ['i32', 'ab'] },
        // bytes written
        WRITE_RESPONSE: { id: 3, types: ['i32'] },
        // offset, length
        READ: { id: 4, types: ['i32', 'i32'] },
        READ_RESPONSE: { id: 5, types: ['ab'] },
        TRUNCATE: { id: 6, types: ['i32'] },

    }


    function workerSourceCode() {

        const MSGTYPES = {
            OPEN: { id: 0, types: ['i32'] },
            //
            OPEN_RESPONSE: { id: 1, types: [] },
            // bytes to write 
            WRITE: { id: 2, types: ['i32', 'i32', 'ab'] },
            // bytes written
            WRITE_RESPONSE: { id: 3, types: ['i32'] },
            // offset, length
            READ: { id: 4, types: ['i32', 'i32'] },
            READ_RESPONSE: { id: 5, types: ['ab'] },
            TRUNCATE: { id: 6, types: ['i32'] },

        }
        let txBuffer = null;
        let rxBuffer = null;

        /**
         * @type {?}
         */
        let handles = [];
        function fastRoute() {

        }
        function slowRoute(outputBuffer) {
            postMessage({ txBuffer: null, rxBuffer: null });
        }
        function passMessageRouter(d) {
            let theOnly = d.rxBuffer;
            let respId = d.qid;
            let theTransmission = new Uint8Array(d.txBuffer, 2);

            let [, umarsh] = Unmarshall(['i8', 'ab'], new Uint8Array(theOnly));
            let type = umarsh[0];
            let pkt = umarsh[1];
            if (type === 0) {
                // open
                let fmt = MSGTYPES.OPEN;
                let [, [ino]] = Unmarshall(fmt.types, pkt);
                Marshall(MSGTYPES.OPEN_RESPONSE.types, [], theTransmission);
                return;
            }
            if (type === 1) {
                throw new Error("unexpected open response");
            }
            if (type === 2) {
                //write
                let fmt = MSGTYPES.WRITE;

            }
        }
        let dataHandle = null;
        /**
         * @suppress {checkTypes}
         * @suppress {missingProperties}
         * @returns {Promise<FileSystemDirectoryHandle>}
         */
        async function ensureDATAHandle() {
            if (dataHandle) {
                return dataHandle;
            }

            let rootHandle = await navigator.storage.getDirectory();
            dataHandle = rootHandle.getDirectoryHandle('data', {
                "create": true
            });
            return dataHandle;
        }
        /**
         * @suppress {checkTypes}
         * @suppress {missingProperties}
         * @param {?} data 
         * @returns 
         */
        let listener = async ({ data }) => {
            let deserializedData = /** @type {AA} */(data);
            let handl = await ensureDATAHandle();

            let transmitBuffer = deserializedData.txBuffer;


            let sabRoute = deserializedData.lockingArray;
            let toLock = sabRoute ? new Int32Array(deserializedData.lockingArray) : null;
            data = deserializedData.metadata;
            try {
                if (deserializedData.type === "getsize") {
                    let { inode, sizeValue } = data;
                    let hand = /** @type {?}*/(handles[inode]);
                    if (!hand) {
                        hand = handles[inode] = await (await handl.getFileHandle(inode.toString(), {
                            create: true
                        })).createSyncAccessHandle();
                    }
                    if (!handles[inode]) {
                        if (sabRoute) {
                            toLock[0] = 1;
                        }
                        else {
                            postMessage({
                                qid: deserializedData.qid,
                                metadata: {

                                }
                            })
                        }
                        return;
                    }
                    let theSize = hand.getSize();
                    if (sizeValue) {
                        sizeValue[0] = theSize;
                    }
                    if (sabRoute) {
                        toLock[0] = 1;
                    }
                    else {
                        postMessage({
                            qid: deserializedData.qid,
                            metadata: {
                                theSize
                            }
                        })
                    }
                }
                if (deserializedData.type === "close") {
                    let { inode } = data;

                    if (!handles[inode]) {
                        if (sabRoute) {
                            toLock[0] = 1;
                        }
                        else {
                            postMessage({
                                qid: deserializedData.qid,
                                metadata: {}
                            })
                        }
                        return;
                    }
                    if (sabRoute) {
                        toLock[0] = 1;
                    }
                    else {
                        postMessage({
                            qid: deserializedData.qid,
                            metadata: {}
                        })
                    }
                }
                if (deserializedData.type === "open") {
                    let { inode } = data;
                    if (handles[inode]) {
                        if (sabRoute) {
                            toLock[0] = 1;

                        } else {
                            postMessage({
                                qid: deserializedData.qid,
                                metadata: {}
                            })
                        }
                        return;
                    }
                    let fh = await handl.getFileHandle(inode.toString(), { create: true });
                    handles[inode] = await fh.createSyncAccessHandle();
                    self.handles = handles;
                    if (sabRoute) {
                        toLock[0] = 1;

                    } else {
                        postMessage({
                            qid: deserializedData.qid,
                            metadata: {}
                        })
                    }
                    return;
                }
                if (deserializedData.type === "truncate") {
                    let { newSize, inode } = data;
                    let hand = /** @type {?}*/(handles[inode]);
                    if (!hand) {
                        hand = handles[inode] = await (await handl.getFileHandle(inode.toString(), {
                            create: true
                        })).createSyncAccessHandle();
                    }
                    if (newSize < hand.getSize()) {
                        if (sabRoute) {
                            toLock[0] = 1;
                        }
                        else {
                            postMessage({
                                txBuffer: transmitBuffer,
                                metadata: {},
                                qid: deserializedData.qid
                            })
                        }
                        return;
                    }
                    if (sabRoute) {
                        toLock[0] = 1;
                    }
                    else {
                        postMessage({
                            txBuffer: transmitBuffer,
                            metadata: {},
                            qid: deserializedData.qid
                        })
                    }
                    hand.truncate(newSize);
                    hand.flush();
                    

                }
                if (deserializedData.type === "read") {
                    let { offset, length, inode, readBuffer } = data;

                    let hand = /** @type {?}*/(handles[inode]);
                    if (!hand) {
                        hand = handles[inode] = await (await handl.getFileHandle(inode.toString(), {
                            create: true
                        })).createSyncAccessHandle();
                    }

                    let numRead = hand.read(readBuffer, { at: offset });
                    new Uint32Array(transmitBuffer)[0] = numRead
                    if (sabRoute) {
                        toLock[0] = 1;
                    } else {
                        // rip
                        postMessage({
                            txBuffer: transmitBuffer,
                            qid: deserializedData.qid,
                            metadata: {
                                readBuffer
                            }
                        })
                    }
                    return;
                }
                if (deserializedData.type === "write") {
                    let { offset, inode } = data;
                    let hand = /** @type {?}*/(handles[inode]);
                    if (!hand) {
                        hand = handles[inode] = await (await handl.getFileHandle(inode.toString(), {
                            create: true
                        })).createSyncAccessHandle();
                    }
                    if (sabRoute) {
                        toLock[0] = 1;

                    } else {
                        // rip
                        postMessage({
                            txBuffer: transmitBuffer,
                            qid: deserializedData.qid,
                            metadata: {}
                        })
                    }
                    let r = hand.write(new Uint8Array(data.recvBuffer), { at: offset });
                    hand.flush();

                    return;
                }
            } catch (e) {
                if (toLock) {
                    toLock[0] = 1; // still unlock the browser
                }

                new Uint8Array(transmitBuffer)[0] = 0xff;
                throw e;
            }

        }
        self.addEventListener('message', listener);

    }
    function generateSourceCode() {
        let MarshallUnmarshall = Marshall.toString() + "\n" + Unmarshall.toString() + '\n';
        let workerSrcIIFE = `(${workerSourceCode.toString()})()`;
        return MarshallUnmarshall + workerSrcIIFE;
    }
    let wSrc = generateSourceCode();
    let blob = new Blob([wSrc]);
    let u = URL.createObjectURL(blob);
    let worker = new Worker(u);
    WorkerState.actualWorker = worker;
    worker.onmessage = WorkerState.OnMessage.bind(WorkerState);

})();
//var S_IFIFO  0010000
//var S_ISUID  0004000
//var S_ISGID  0002000
//var S_ISVTX  0001000

var O_RDONLY = 0x0000; // open for reading only
var O_WRONLY = 0x0001; // open for writing only
var O_RDWR = 0x0002; // open for reading and writing
var O_ACCMODE = 0x0003; // mask for above modes

export const STATUS_INVALID = -0x1;
export const STATUS_OK = 0x0;
export const STATUS_ON_STORAGE = 0x2;
export const STATUS_UNLINKED = 0x4;
export const STATUS_FORWARDING = 0x5;

const texten = new TextEncoder();

/** @const */ var JSONFS_VERSION = 3;


/** @const */ var JSONFS_IDX_NAME = 0;
/** @const */ var JSONFS_IDX_SIZE = 1;
/** @const */ var JSONFS_IDX_MTIME = 2;
/** @const */ var JSONFS_IDX_MODE = 3;
/** @const */ var JSONFS_IDX_UID = 4;
/** @const */ var JSONFS_IDX_GID = 5;
/** @const */ var JSONFS_IDX_TARGET = 6;
/** @const */ var JSONFS_IDX_SHA256 = 6;




/**
 * @constructor
 * @param {!FileStorageInterface} storage
 * @param {{ last_qidnumber: number }=} qidcounter Another fs's qidcounter to synchronise with.
 */
export function FSOpfs(storage, qidcounter) {
    /** @type {Array.<!Inode>} */
    this.inodes = [];
    this.events = [];
    this.watchers = [];

    this.request_in_progress = false;
    this.transactions = {};

    this.storage = storage;
    if (!this.storage) {
        this.storage = new MemoryFileStorage();
    }
    this.qidcounter = qidcounter || { last_qidnumber: 0 };

    //this.tar = new TAR(this);

    this.inodedata = {};

    this.total_size = 256 * 1024 * 1024 * 1024;
    this.used_size = 0;

    globalThis['fsOpfs'] = this;

    /** @type {!Array<!FSMountInfo>} */
    this.mounts = [];

    //RegisterMessage("LoadFilesystem", this.LoadFilesystem.bind(this) );
    //RegisterMessage("MergeFile", this.MergeFile.bind(this) );
    //RegisterMessage("tar",
    //    function(data) {
    //        SendToMaster("tar", this.tar.Pack(data));
    //    }.bind(this)
    //);
    //RegisterMessage("sync",
    //    function(data) {
    //        SendToMaster("sync", this.tar.Pack(data));
    //    }.bind(this)
    //);

    // root entry
    this.CreateDirectory("", -1);

}

/** @type {FileSystemDirectoryHandle|null} */
FSOpfs.prototype.OPFSRootHandle = null;

/** @type {FileSystemDirectoryHandle|null} */
FSOpfs.prototype.OPFSDataHandle = null;

/**
 *   @suppress {checkTypes}
 * @suppress {missingProperties}
 */
FSOpfs.prototype.EnsureHandles = async function () {
    if (this.OPFSRootHandle) {
        return;
    }
    this.OPFSRootHandle = this.OPFSRootHandle ?? await navigator.storage.getDirectory();
    this.OPFSDataHandle = this.OPFSDataHandle ?? await this.OPFSRootHandle.getDirectoryHandle('data', { create: true });

}

/**
 * 
 * @param {Inode} ino 
 */
FSOpfs.prototype.CheckReadSafety = async function (ino) {
    let r = (this.transactions[ino.fid]);
    if (r.writableStream) {
        await r.writableStream.close(); // commit changes and then read
        r.writableStream = null;
        return;
    }
    return;
}
/**
 * @suppress {checkTypes}
 */
FSOpfs.prototype.initialize = async function () {
    if (this.initialized) {
        return this.initialized;
    }
    await this.EnsureHandles();
    let thiz = this;
    this.initialized = new Promise(async (resolve)=>{


    
    this.AllDelayedWrites = [];
    if (!this.OPFSDataHandle || !this.OPFSRootHandle) throw new Error("Could not open directory");
    let highestQid = -1;
    this.inodes = [];
    this.inodedata = {};
    for await (let [n, handle] of this.OPFSRootHandle) {
        if (handle instanceof FileSystemDirectoryHandle) {
            continue;
        }

        let c = thiz.CreateInode();
        /**
         * @type {FileSystemFileHandle|null}
         */
        let fileHandle = handle;
        let fil = await fileHandle.getFile();
        let reviver = function (k, v) {
            if (k === "direntries") {
                let newMap = new SerializableMap(parseInt(n));

                if (!v[Symbol.iterator]) {
                    console.error("couldn't find symbol.iterator which indicates potential array for", n);
                    return;
                }
                for (let [m, c] of v) {
                    newMap.set(m, c);
                }
                return newMap
            } else {
                return v;
            }
        }
        let inodeData = /** @type {Inode} */ (JSON.parse(await fil.text(), reviver));
        // recover inode

        if (inodeData.fid > highestQid) {
            highestQid = inodeData.fid;
        }
        inodeData.__proto__ = Inode.prototype;
        delete inodeData.ssid;

        inodeData.TapeProperties();
        let a = thiz;
        inodeData.changeCallback = function () {
            a.SaveSpecificInode(inodeData);
        }
        thiz.inodes[inodeData.fid] = inodeData;

    }
    for await (let [n, handle] of this.OPFSDataHandle) {
        if (handle instanceof FileSystemDirectoryHandle) {
            continue;
        }

        /**
         * @type {FileSystemFileHandle|null}
         */
        let fileHandle = handle;
        let fil = await fileHandle.getFile();

        this.inodedata[parseInt(n)] = fil;
    }
    this.qidcounter.last_qidnumber = highestQid;

    if (this.inodes.length === 0) {
        this.CreateDirectory("", -1);
    }
    resolve();
    this.initialized = 2;
    });
    return this.initialized;
}
FSOpfs.prototype.SaveSpecificInode = function (ino) {
    if (ino.ssid && ino.ssid >= 0) {
        return;
    }
    ino.ssid = setTimeout(async () => {
        if (this.initialized !== 2) {
            return;
        }
        let fh = await this.OPFSRootHandle.getFileHandle(ino.fid.toString(), {
            "create": true
        })
        let writer = await fh.createWritable({
            keepExistingData: false
        })
        await writer.write(JSON.stringify(ino));
        await writer.close();
        ino.ssid = -1;
    })
}
FSOpfs.prototype.saveinodes = async function () {
    if (!this.OPFSRootHandle) {
        return;
    }
    let iterable = /** @type {Array<Inode>} */ (this.inodes ?? []);
    if (!iterable) {
        return;
    }
    let toSave = this.inodes.map(async (ino) => {
        let id = ino.fid;
        let rh = await this.OPFSRootHandle.getFileHandle(id.toString(), {
            create: true
        });
        let wirtable = await rh.createWritable({
            "keepExistingData": false
        });
        await wirtable.write(JSON.stringify(ino));
        await wirtable.close();
    })
    function splitIntoFour(arr) {
        const result = [];
        const size = Math.ceil(arr.length / 4);

        for (let i = 0; i < 4; i++) {
            result.push(arr.slice(i * size, (i + 1) * size));
        }

        return result;
    }
    let [p1, p2, p3, p4] = splitIntoFour(toSave)
    await Promise.all(p1);
    await Promise.all(p2);
    await Promise.all(p3);
    await Promise.all(p4);

}
FSOpfs.prototype.persist = async function () {

}
FSOpfs.prototype.get_state = function () {

    let state = [];

    state[0] = this.inodes;
    state[1] = this.qidcounter.last_qidnumber;
    state[2] = [];
    for (const [id, data] of Object.entries(this.inodedata)) {
        if ((this.inodes[id].mode & S_IFDIR) === 0) {
            state[2].push([id, data]);
        }
    }
    state[3] = this.total_size;
    state[4] = this.used_size;
    state = state.concat(this.mounts);

    return state;
};

FSOpfs.prototype.set_state = function (state) {
    this.inodes = state[0].map(state => { const inode = new Inode(0); inode.set_state(state); return inode; });
    this.qidcounter.last_qidnumber = state[1];
    this.inodedata = {};
    for (let [key, value] of state[2]) {
        if (value.buffer.byteLength !== value.byteLength) {
            // make a copy if we didn't get one
            value = value.slice();
        }

        this.inodedata[key] = value;
    }
    this.total_size = state[3];
    this.used_size = state[4];
    this.mounts = state.slice(5);
};


// -----------------------------------------------------

FSOpfs.prototype.AddEvent = function (id, OnEvent) {
    var inode = this.inodes[id];
    if (inode.status === STATUS_OK || inode.status === STATUS_ON_STORAGE) {
        OnEvent();
    }
    else if (this.is_forwarder(inode)) {
        this.follow_fs(inode).AddEvent(inode.foreign_id, OnEvent);
    }
    else {
        this.events.push({ id: id, OnEvent: OnEvent });
    }
};

FSOpfs.prototype.HandleEvent = function (id) {
    const inode = this.inodes[id];
    if (this.is_forwarder(inode)) {
        this.follow_fs(inode).HandleEvent(inode.foreign_id);
    }
    //dbg_log("number of events: " + this.events.length, LOG_9P);
    var newevents = [];
    for (var i = 0; i < this.events.length; i++) {
        if (this.events[i].id === id) {
            this.events[i].OnEvent();
        } else {
            newevents.push(this.events[i]);
        }
    }
    this.events = newevents;
};

FSOpfs.prototype.load_from_json = function (fs) {
    dbg_assert(fs, "Invalid fs passed to load_from_json");

    if (fs["version"] !== JSONFS_VERSION) {
        throw "The filesystem JSON format has changed. " +
        "Please update your fs2json (https://github.com/copy/fs2json) and recreate the filesystem JSON.";
    }

    var fsroot = fs["fsroot"];
    this.used_size = fs["size"];

    for (var i = 0; i < fsroot.length; i++) {
        this.LoadRecursive(fsroot[i], 0);
    }

    //if(DEBUG)
    //{
    //    this.Check();
    //}
};

FSOpfs.prototype.LoadRecursive = function (data, parentid) {
    var inode = this.CreateInode();

    const name = data[JSONFS_IDX_NAME];
    inode.size = data[JSONFS_IDX_SIZE];
    inode.mtime = data[JSONFS_IDX_MTIME];
    inode.ctime = inode.mtime;
    inode.atime = inode.mtime;
    inode.mode = data[JSONFS_IDX_MODE];
    inode.uid = data[JSONFS_IDX_UID];
    inode.gid = data[JSONFS_IDX_GID];

    var ifmt = inode.mode & S_IFMT;

    if (ifmt === S_IFDIR) {
        this.PushInode(inode, parentid, name);
        this.LoadDir(this.inodes.length - 1, data[JSONFS_IDX_TARGET]);
    }
    else if (ifmt === S_IFREG) {
        inode.status = STATUS_ON_STORAGE;
        inode.sha256sum = data[JSONFS_IDX_SHA256];
        dbg_assert(inode.sha256sum);
        this.PushInode(inode, parentid, name);
    }
    else if (ifmt === S_IFLNK) {
        inode.symlink = data[JSONFS_IDX_TARGET];
        this.PushInode(inode, parentid, name);
    }
    else if (ifmt === S_IFSOCK) {
        // socket: ignore
    }
    else {
        dbg_log("Unexpected ifmt: " + h(ifmt) + " (" + name + ")", LOG_9P);
    }
};
/**
 * @param {Inode} ino
 */
FSOpfs.prototype.CreateTransaction = async function (ino) {
    let i = ino.fid;
    if (this.transactions[i]) {
        return this.transactions[i];
    }
    let q = await this.GetFHForID(i);
    this.transactions[i] = {
        writableStream: await q.createWritable(),
        com: null
    }
    return this.transactions[i];
}
FSOpfs.prototype.LoadDir = function (parentid, children) {
    for (var i = 0; i < children.length; i++) {
        this.LoadRecursive(children[i], parentid);
    }
};


// -----------------------------------------------------

/**
 * @private
 * @param {Inode} inode
 * @return {boolean}
 */
FSOpfs.prototype.should_be_linked = function (inode) {
    // Note: Non-root forwarder inode could still have a non-forwarder parent, so don't use
    // parent inode to check.
    return !this.is_forwarder(inode) || inode.foreign_id === 0;
};

/**
 * @private
 * @param {number} parentid
 * @param {number} idx
 * @param {string} name
 */
FSOpfs.prototype.link_under_dir = function (parentid, idx, name) {
    const inode = this.inodes[idx];
    const parent_inode = this.inodes[parentid];

    dbg_assert(!this.is_forwarder(parent_inode),
        "Filesystem: Shouldn't link under fowarder parents");
    dbg_assert(this.IsDirectory(parentid),
        "Filesystem: Can't link under non-directories");
    dbg_assert(this.should_be_linked(inode),
        "Filesystem: Can't link across filesystems apart from their root");
    dbg_assert(inode.nlinks >= 0,
        "Filesystem: Found negative nlinks value of " + inode.nlinks);
    dbg_assert(!parent_inode.direntries.has(name),
        "Filesystem: Name '" + name + "' is already taken");

    parent_inode.direntries.set(name, idx);
    inode.nlinks++;

    if (this.IsDirectory(idx)) {
        dbg_assert(!inode.direntries.has(".."),
            "Filesystem: Cannot link a directory twice");

        if (!inode.direntries.has(".")) inode.nlinks++;
        inode.direntries.set(".", idx);

        inode.direntries.set("..", parentid);
        parent_inode.nlinks++;
    }
};

/**
 * @private
 * @param {number} parentid
 * @param {string} name
 */
FSOpfs.prototype.unlink_from_dir = function (parentid, name) {
    console.debug("deleting file under parent");
    const idx = this.Search(parentid, name);
    const inode = this.inodes[idx];
    const parent_inode = this.inodes[parentid];

    dbg_assert(!this.is_forwarder(parent_inode), "Filesystem: Can't unlink from forwarders");
    dbg_assert(this.IsDirectory(parentid), "Filesystem: Can't unlink from non-directories");

    const exists = parent_inode.direntries.delete(name);
    if (!exists) {
        dbg_assert(false, "Filesystem: Can't unlink non-existent file: " + name);
        return;
    }

    inode.nlinks--;

    if (this.IsDirectory(idx)) {
        dbg_assert(inode.direntries.get("..") === parentid,
            "Filesystem: Found directory with bad parent id");

        inode.direntries.delete("..");
        parent_inode.nlinks--;
    }

    dbg_assert(inode.nlinks >= 0,
        "Filesystem: Found negative nlinks value of " + inode.nlinks);
    this.ScheduleInodePersist();
};
FSOpfs.prototype.PushInode = function (inode, parentid, name) {
    this.ScheduleInodePersist();
    let a = this;

    inode.changeCallback = function () {
        a.SaveSpecificInode(inode);
    }
    if (parentid !== -1) {
        this.inodes.push(inode);
        inode.fid = this.inodes.length - 1;

        this.link_under_dir(parentid, inode.fid, name);

        return;
    } else {
        if (this.inodes.length === 0) { // if root directory
            this.inodes.push(inode);
            inode.direntries.set(".", 0);
            inode.direntries.set("..", 0);
            inode.nlinks = 2;
            return;
        }
    }

    dbg_assert(false, "Error in Filesystem: Pushed inode with name = " + name + " has no parent");
};
class SerializableMap extends Map {
    constructor(ino = null) {
        super();
        this.watchers = [];
        this.ino = ino;
    }

    addWatcher(watcher, once = false) {
        this.watchers = this.watchers ?? [];
        this.watchers.push({ watcher, once });
    }
    remvoeWatcher(watcher) {
        if (!this.watchers) {
            return false;
        }
        this.watchers = this.watchers.filter((w) => w.watcher !== watcher);
        return true;
    }
    toJSON() {
        return [...super.entries()];
    }
    set(key, value) {
        if (this.ino !== undefined) {
            if (this.ino.changeCallback) {
                this.ino.changeCallback();
            }
        }
        super.set(key, value);
        setTimeout(() => {
            this.watchers ? this.watchers.forEach(v => {
                v.watcher(key, "rename");
                if (v.once) {
                    this.remvoeWatcher(v);
                }
            }) : null;
        });
    }

    delete(key) {
        if (this.ino !== undefined) {
            if (this.ino.changeCallback) {
                this.ino.changeCallback();
            }
        }
        if (key === "." || key === "..") {
            return super.delete(key);
        }
        setTimeout(() => {
            this.watchers ? this.watchers.forEach(v => v.watcher(key, "removal")) : null;
        });
        return super.delete(key);
    }

}


/** @constructor */
function Inode(qidnumber) {
    this.direntries = new SerializableMap(this); // maps filename to inode id
    this.status = 0;
    this.size = 0x0;
    this.uid = 0x0;
    this.gid = 0x0;
    this.fid = 0;
    this.ctime = 0;
    this.atime = 0;
    this.mtime = 0;
    this.major = 0x0;
    this.minor = 0x0;
    this.symlink = "";
    this.mode = 0x01ED;
    this.qid = {
        type: 0,
        version: 0,
        path: qidnumber,
    };
    this.caps = undefined;
    this.nlinks = 0;
    let a = this;

    this.changeCallback = null;
    Object.keys(this).forEach((v) => {
        if (v.endsWith('_')) {
            return;
        }
        a[v + '_'] = a[v];
        Object.defineProperty(a, v, {
            get() {
                return a[v + '_'];
            },
            set(vc) {
                a[v + '_'] = vc;
                if (a.changeCallback) {
                    a.changeCallback();
                }
                return a[v + '_'];
            }
        })
    })

    this.sha256sum = "";

    /** @type{!Array<!FSLockRegion>} */
    this.locks = []; // lock regions applied to the file, sorted by starting offset.

    // For forwarders:
    this.mount_id = -1; // which fs in this.mounts does this inode forward to?
    this.foreign_id = -1; // which foreign inode id does it represent?

    //this.qid_type = 0;
    //this.qid_version = 0;
    //this.qid_path = qidnumber;
}
Inode.prototype.TapeProperties = function () {
    let a = this;

    Object.keys(this).forEach((v) => {
        if (v.endsWith('_')) {
            return;
        }
        a[v + '_'] = a[v];
        Object.defineProperty(a, v, {
            get() {
                return a[v + '_'];
            },
            set(vc) {
                a[v + '_'] = vc;
                if (a.changeCallback) {
                    a.changeCallback();
                }
                return a[v + '_'];
            }
        })
    })
    this.direntries.ino = this;
}
Inode.prototype.add_watcher = function (fs, cb) {
    if ((this.mode & S_IFMT) === S_IFDIR) {
        this.direntries.addWatcher(cb);

    } else {
        fs.watchers[this.fid] = fs.watchers[this.fid] ?? [];
        fs.watchers[this.fid].push(cb);
    }

}
Inode.prototype.get_state = function () {
    const state = [];
    state[0] = this.mode;

    if ((this.mode & S_IFMT) === S_IFDIR) {
        state[1] = [...this.direntries];
    }
    else if ((this.mode & S_IFMT) === S_IFREG) {
        state[1] = this.sha256sum;
    }
    else if ((this.mode & S_IFMT) === S_IFLNK) {
        state[1] = this.symlink;
    }
    else if ((this.mode & S_IFMT) === S_IFSOCK) {
        state[1] = [this.minor, this.major];
    }
    else {
        state[1] = null;
    }

    state[2] = this.locks;
    state[3] = this.status;
    state[4] = this.size;
    state[5] = this.uid;
    state[6] = this.gid;
    state[7] = this.fid;
    state[8] = this.ctime;
    state[9] = this.atime;
    state[10] = this.mtime;
    state[11] = this.qid.version;
    state[12] = this.qid.path;
    state[13] = this.nlinks;

    //state[23] = this.mount_id;
    //state[24] = this.foreign_id;
    //state[25] = this.caps; // currently not writable
    return state;
};

Inode.prototype.set_state = function (state) {
    this.mode = state[0];
    throw new Error("states are not supported")


    //this.mount_id = state[23];
    //this.foreign_id = state[24];
    //this.caps = state[20];
};

/**
 * Clones given inode to new idx, effectively diverting the inode to new idx value.
 * Hence, original idx value is now free to use without losing the original information.
 * @private
 * @param {number} parentid Parent of target to divert.
 * @param {string} filename Name of target to divert.
 * @return {number} New idx of diversion.
 */
FSOpfs.prototype.divert = function (parentid, filename) {
    const old_idx = this.Search(parentid, filename);
    const old_inode = this.inodes[old_idx];
    const new_inode = new Inode(-1);

    dbg_assert(old_inode, "Filesystem divert: name (" + filename + ") not found");
    dbg_assert(this.IsDirectory(old_idx) || old_inode.nlinks <= 1,
        "Filesystem: can't divert hardlinked file '" + filename + "' with nlinks=" +
        old_inode.nlinks);

    // Shallow copy is alright.
    Object.assign(new_inode, old_inode);

    const idx = this.inodes.length;
    this.inodes.push(new_inode);
    new_inode.fid = idx;

    // Relink references
    if (this.is_forwarder(old_inode)) {
        this.mounts[old_inode.mount_id].backtrack.set(old_inode.foreign_id, idx);
    }
    if (this.should_be_linked(old_inode)) {
        this.unlink_from_dir(parentid, filename);
        this.link_under_dir(parentid, idx, filename);
    }

    // Update children
    if (this.IsDirectory(old_idx) && !this.is_forwarder(old_inode)) {
        for (const [name, child_id] of new_inode.direntries) {
            if (name === "." || name === "..") continue;
            if (this.IsDirectory(child_id)) {
                this.inodes[child_id].direntries.set("..", idx);
            }
        }
    }

    // Relocate local data if any.
    this.inodedata[idx] = this.inodedata[old_idx];
    delete this.inodedata[old_idx];

    // Retire old reference information.
    old_inode.direntries = new SerializableMap();
    old_inode.nlinks = 0;

    return idx;
};

/**
 * Copy all non-redundant info.
 * References left untouched: local idx value and links
 * @private
 * @param {!Inode} src_inode
 * @param {!Inode} dest_inode
 */
FSOpfs.prototype.copy_inode = function (src_inode, dest_inode) {
    Object.assign(dest_inode, src_inode, {
        fid: dest_inode.fid,
        direntries: dest_inode.direntries,
        nlinks: dest_inode.nlinks,
    });
};

FSOpfs.prototype.CreateInode = function () {
    const now = Math.round(Date.now() / 1000);
    const inode = new Inode(++this.qidcounter.last_qidnumber);
    inode.atime = inode.ctime = inode.mtime = now;
    return inode;
};


// Note: parentid = -1 for initial root directory.
FSOpfs.prototype.CreateDirectory = function (name, parentid) {
    const parent_inode = this.inodes[parentid];
    if (parentid >= 0 && this.is_forwarder(parent_inode)) {
        const foreign_parentid = parent_inode.foreign_id;
        const foreign_id = this.follow_fs(parent_inode).CreateDirectory(name, foreign_parentid);
        return this.create_forwarder(parent_inode.mount_id, foreign_id);
    }
    var x = this.CreateInode();
    x.mode = 0x01FF | S_IFDIR;
    if (parentid >= 0) {
        x.uid = this.inodes[parentid].uid;
        x.gid = this.inodes[parentid].gid;
        x.mode = (this.inodes[parentid].mode & 0x1FF) | S_IFDIR;
    }
    x.qid.type = S_IFDIR >> 8;
    this.PushInode(x, parentid, name);
    this.NotifyListeners(this.inodes.length - 1, "newdir");
    return this.inodes.length - 1;
};

FSOpfs.prototype.CreateFile = function (filename, parentid) {
    const parent_inode = this.inodes[parentid];
    if (this.is_forwarder(parent_inode)) {
        const foreign_parentid = parent_inode.foreign_id;
        const foreign_id = this.follow_fs(parent_inode).CreateFile(filename, foreign_parentid);
        return this.create_forwarder(parent_inode.mount_id, foreign_id);
    }
    var x = this.CreateInode();
    x.uid = this.inodes[parentid].uid;
    x.gid = this.inodes[parentid].gid;
    x.qid.type = S_IFREG >> 8;
    x.mode = (this.inodes[parentid].mode & 0x1B6) | S_IFREG;
    this.PushInode(x, parentid, filename);
    this.NotifyListeners(this.inodes.length - 1, "newfile");
    this.inodedata[x.fid] = new Blob([]);
    return this.inodes.length - 1;
};


FSOpfs.prototype.CreateNode = function (filename, parentid, major, minor) {
    const parent_inode = this.inodes[parentid];
    if (this.is_forwarder(parent_inode)) {
        const foreign_parentid = parent_inode.foreign_id;
        const foreign_id =
            this.follow_fs(parent_inode).CreateNode(filename, foreign_parentid, major, minor);
        return this.create_forwarder(parent_inode.mount_id, foreign_id);
    }
    var x = this.CreateInode();
    x.major = major;
    x.minor = minor;
    x.uid = this.inodes[parentid].uid;
    x.gid = this.inodes[parentid].gid;
    x.qid.type = S_IFSOCK >> 8;
    x.mode = (this.inodes[parentid].mode & 0x1B6);
    this.PushInode(x, parentid, filename);
    return this.inodes.length - 1;
};

FSOpfs.prototype.CreateSymlink = function (filename, parentid, symlink) {
    const parent_inode = this.inodes[parentid];
    if (this.is_forwarder(parent_inode)) {
        const foreign_parentid = parent_inode.foreign_id;
        const foreign_id =
            this.follow_fs(parent_inode).CreateSymlink(filename, foreign_parentid, symlink);
        return this.create_forwarder(parent_inode.mount_id, foreign_id);
    }
    var x = this.CreateInode();
    x.uid = this.inodes[parentid].uid;
    x.gid = this.inodes[parentid].gid;
    x.qid.type = S_IFLNK >> 8;
    x.symlink = symlink;
    x.mode = S_IFLNK;
    this.PushInode(x, parentid, filename);
    return this.inodes.length - 1;
};

FSOpfs.prototype.CreateTextFile = async function (filename, parentid, str) {
    const parent_inode = this.inodes[parentid];
    if (this.is_forwarder(parent_inode)) {
        const foreign_parentid = parent_inode.foreign_id;
        const foreign_id = await
            this.follow_fs(parent_inode).CreateTextFile(filename, foreign_parentid, str);
        return this.create_forwarder(parent_inode.mount_id, foreign_id);
    }
    var id = this.CreateFile(filename, parentid);
    var x = this.inodes[id];
    var data = new Uint8Array(str.length);
    x.size = str.length;
    for (var j = 0; j < str.length; j++) {
        data[j] = str.charCodeAt(j);
    }
    this.ScheduleFileWrite(id, async (writer) => {
        await writer.truncate(data.length);
        await writer.write(data);
    })
    await this.DrainAllOperationsForId(id);
    return id;
};

/**
 * @param {Uint8Array} buffer
 */
FSOpfs.prototype.CreateBinaryFile = async function (filename, parentid, buffer) {
    const parent_inode = this.inodes[parentid];
    if (this.is_forwarder(parent_inode)) {
        const foreign_parentid = parent_inode.foreign_id;
        const foreign_id = await
            this.follow_fs(parent_inode).CreateBinaryFile(filename, foreign_parentid, buffer);
        return this.create_forwarder(parent_inode.mount_id, foreign_id);
    }
    var id = this.CreateFile(filename, parentid);
    var x = this.inodes[id];
    var data = new Uint8Array(buffer.length);
    data.set(buffer);
    this.ScheduleFileWrite(id, async (writer) => {
        await writer.truncate(data.length);
        await writer.write(data);
    })
    x.size = buffer.length;
    await this.DrainAllOperationsForId(id);

    return id;
};

let O_TRUNC = 0o00001000;
FSOpfs.prototype.OpenInode = async function (id, mode) {
    var inode = this.inodes[id];
    if (this.is_forwarder(inode)) {
        return this.follow_fs(inode).OpenInode(inode.foreign_id, mode);
    }
    if ((inode.mode & S_IFMT) === S_IFDIR) {
        this.FillDirectory(id);
    } else {
        if (mode & O_TRUNC) {
            inode.size = 0;

        }
        WorkerState.sendMessage("open", {
            inode: id
        }, () => {
            // opened inode
        }, 20);
        if (mode & O_TRUNC)
            this.ChangeSize(inode.fid, 0);
    }
    /*

var type = "";
switch(inode.mode&S_IFMT) {
    case S_IFREG: type = "File"; break;
    case S_IFBLK: type = "Block Device"; break;
    case S_IFDIR: type = "Directory"; break;
    case S_IFCHR: type = "Character Device"; break;
}
*/
    //dbg_log("open:" + this.GetFullPath(id) +  " type: " + inode.mode + " status:" + inode.status, LOG_9P);
    return true;
};
FSOpfs.prototype.ScheduleInodePersist = function () {
    return;
}
FSOpfs.prototype.ReloadWritableStream = async function (id) {
    let t = await this.CreateTransaction(this.inodes[id]);
    await t.writableStream.close();
}
FSOpfs.prototype.DrainAllOperationsForId = async function (id = -1) {
    return;

}
FSOpfs.prototype.SchedulePersist = function () {
    let thiz = this;
    setTimeout((function () {
        thiz.persist().then(() => {
        });
    }).bind(this), 0);
}
FSOpfs.prototype.CloseInode = async function (id) {
    //dbg_log("close: " + this.GetFullPath(id), LOG_9P);
    var inode = this.inodes[id];

    return new Promise(async (resolve) => {
        WorkerState.sendMessage('close', { inode: id }, () => {
            resolve();
        }, 8);
        if (this.is_forwarder(inode)) {
            return await this.follow_fs(inode).CloseInode(inode.foreign_id);
        }
        if (inode.status === STATUS_ON_STORAGE) {
            this.storage.uncache(inode.sha256sum);
        }
        if (inode.status === STATUS_UNLINKED) {
            //dbg_log("Filesystem: Delete unlinked file", LOG_9P);
            inode.status = STATUS_INVALID;
            await this.DeleteData(id);
        }
        resolve();

    });
};
FSOpfs.prototype.Watch = async function (inonum, callback) {
    this.inodes[inonum].add_watcher(this, callback)

}
/**
 * @return {!Promise<number>} 0 if success, or -errno if failured.
 */
FSOpfs.prototype.Rename = async function (olddirid, oldname, newdirid, newname) {
    // dbg_log("Rename " + oldname + " to " + newname, LOG_9P);
    if ((olddirid === newdirid) && (oldname === newname)) {
        return 0;
    }
    var oldid = this.Search(olddirid, oldname);
    if (oldid === -1) {
        return -ENOENT;
    }

    // For event notification near end of method.
    var oldpath = this.GetFullPath(olddirid) + "/" + oldname;

    var newid = this.Search(newdirid, newname);
    if (newid !== -1) {
        const ret = this.Unlink(newdirid, newname);
        if (ret < 0) return ret;
    }

    var idx = oldid; // idx contains the id which we want to rename
    var inode = this.inodes[idx];
    const olddir = this.inodes[olddirid];
    const newdir = this.inodes[newdirid];

    if (!this.is_forwarder(olddir) && !this.is_forwarder(newdir)) {
        // Move inode within current filesystem.

        this.unlink_from_dir(olddirid, oldname);
        this.link_under_dir(newdirid, idx, newname);

        inode.qid.version++;
    }
    else if (this.is_forwarder(olddir) && olddir.mount_id === newdir.mount_id) {
        // Move inode within the same child filesystem.

        const ret = await
            this.follow_fs(olddir).Rename(olddir.foreign_id, oldname, newdir.foreign_id, newname);

        if (ret < 0) return ret;
    }
    else if (this.is_a_root(idx)) {
        // The actual inode is a root of some descendant filesystem.
        // Moving mountpoint across fs not supported - needs to update all corresponding forwarders.
        dbg_log("XXX: Attempted to move mountpoint (" + oldname + ") - skipped", LOG_9P);
        return -EPERM;
    }
    else if (!this.IsDirectory(idx) && this.GetInode(idx).nlinks > 1) {
        // Move hardlinked inode vertically in mount tree.
        dbg_log("XXX: Attempted to move hardlinked file (" + oldname + ") " +
            "across filesystems - skipped", LOG_9P);
        return -EPERM;
    }
    else {
        // Jump between filesystems.

        // Can't work with both old and new inode information without first diverting the old
        // information into a new idx value.
        const diverted_old_idx = this.divert(olddirid, oldname);
        const old_real_inode = this.GetInode(idx);

        const data = await this.Read(diverted_old_idx, 0, old_real_inode.size);

        if (this.is_forwarder(newdir)) {
            // Create new inode.
            const foreign_fs = this.follow_fs(newdir);
            const foreign_id = this.IsDirectory(diverted_old_idx) ?
                foreign_fs.CreateDirectory(newname, newdir.foreign_id) :
                foreign_fs.CreateFile(newname, newdir.foreign_id);

            const new_real_inode = foreign_fs.GetInode(foreign_id);
            this.copy_inode(old_real_inode, new_real_inode);

            // Point to this new location.
            this.set_forwarder(idx, newdir.mount_id, foreign_id);
        }
        else {
            // Replace current forwarder with real inode.
            this.delete_forwarder(inode);
            this.copy_inode(old_real_inode, inode);

            // Link into new location in this filesystem.
            this.link_under_dir(newdirid, idx, newname);
        }

        // Rewrite data to newly created destination.
        await this.ChangeSize(idx, old_real_inode.size);
        if (data && data.length) {
            await this.Write(idx, 0, data.length, data);
        }

        // Move children to newly created destination.
        if (this.IsDirectory(idx)) {
            for (const child_filename of this.GetChildren(diverted_old_idx)) {
                const ret = await this.Rename(diverted_old_idx, child_filename, idx, child_filename);
                if (ret < 0) return ret;
            }
        }

        // Perform destructive changes only after migration succeeded.
        await this.DeleteData(diverted_old_idx);
        const ret = this.Unlink(olddirid, oldname);
        if (ret < 0) return ret;
    }

    this.NotifyListeners(idx, "rename", { oldpath: oldpath });

    return 0;
};
/**
 * 
 * @param {FSOpfs} fs 
 * @param {Inode} ino
 * @param {number} off 
 * @param {Uint8Array} bytes 
 */
async function writeAtOffset(fs, ino, off, bytes, wri) {

    await wri.write(
        {
            position: off,
            data: bytes,
            "size": bytes.length,
            type: "write"
        }
    )
    return true;
}
FSOpfs.prototype.ScheduleFileWrite = function (fid, callback) {
    this.AllDelayedWrites[fid] = this.AllDelayedWrites[fid] ?? [];
    this.AllDelayedWrites[fid].push(callback);
}
FSOpfs.prototype.GetDataHandle = async function () {

}
FSOpfs.prototype.GetFHForID = async function (id) {
    this.OPFSDataHandle = await this.OPFSRootHandle.getDirectoryHandle("data", { "create": true });
    if (!this.OPFSDataHandle) {
        return null;
    }

    let q = await this.OPFSDataHandle.getFileHandle(id.toString(), {
        "create": true
    });

    return q;
}
/**
 * 
 * @param {number} idx 
 * @returns {Promise<number>}
 */
FSOpfs.prototype.GetSizeForFile = async function (idx) {
    
    return new Promise((resolve)=>{
        let sabRoute = typeof SharedArrayBuffer !== 'undefined';
    let readBuffer = new ArrayBuffer(4);
    if (sabRoute) {
        readBuffer = new SharedArrayBuffer(4);
    }
    WorkerState.sendMessage("getsize", {
        sizeValue: new Uint32Array(readBuffer),
        inode: idx
    }, (cb)=>{
        resolve(cb.theSize);
    }, 20);
    if (sabRoute) {
        resolve(new Uint32Array(readBuffer)[0]);
    }
    })
}
FSOpfs.prototype.Write = async function (id, offset, count, buffer) {
    this.NotifyListeners(id, "write");
    var inode = this.inodes[id];
    if (this.is_forwarder(inode)) {
        const foreign_id = inode.foreign_id;
        await this.follow_fs(inode).Write(foreign_id, offset, count, buffer);
        return;
    }

    var data = this.inodedata[id];
    var trySize =  0;
    if (((data instanceof Blob && data.size ))) {
        trySize = data.size
    }else {
        trySize = await this.GetSizeForFile(id);
    }
    if (!data ||  trySize < (offset+count)) {
        await this.ChangeSize(id, Math.floor(((offset + count) * 3) / 2));
        inode.size = offset + count;
    } else
        if (inode.size < (offset + count)) {
            inode.size = offset + count;
        }

    WorkerState.sendMessage('write', { offset, length: count, recvBuffer: buffer.subarray(0, count).slice().buffer, inode: id }, () => { }, 8192);
    this.ScheduleInodePersist();
};

FSOpfs.prototype.Read = async function (inodeid, offset, count) {
    const inode = this.inodes[inodeid];
    if (this.is_forwarder(inode)) {
        const foreign_id = inode.foreign_id;
        return await this.follow_fs(inode).Read(foreign_id, offset, count);
    }
    if ((inode.mode & S_IFMT) !== S_IFREG) {
        return new Uint8Array(await (this.inodedata[inode.fid].slice(offset, offset + count)).arrayBuffer());
    }
    let fil = this.inodedata[inodeid];
    return new Promise((resolve) => {
        let sabRoute = typeof SharedArrayBuffer !== 'undefined';
        let readBuffer = new ArrayBuffer(count);
        if (sabRoute) {
            readBuffer = new SharedArrayBuffer(count);
        }
        WorkerState.sendMessage("read", { offset, length: count, inode: inodeid, readBuffer }, (value, v2) => {

            resolve(new Uint8Array(value.readBuffer));
        }, count + 4);
        if (sabRoute) {
            resolve(new Uint8Array(readBuffer));
        }

    })
};
FSOpfs.prototype.readdir = function (inodeid) {
    let ino = this.inodes[inodeid];
    if ((ino.mode & S_IFMT) !== S_IFDIR) {
        throw new Error('Could not read ddirectory as this is NOT a directory');

    }
    let arr = [...ino.direntries.keys()];
    return arr;
}
FSOpfs.prototype.Search = function (parentid, name) {
    const parent_inode = this.inodes[parentid];

    if (this.is_forwarder(parent_inode)) {
        const foreign_parentid = parent_inode.foreign_id;
        const foreign_id = this.follow_fs(parent_inode).Search(foreign_parentid, name);
        if (foreign_id === -1) return -1;
        return this.get_forwarder(parent_inode.mount_id, foreign_id);
    }

    const childid = parent_inode.direntries.get(name);
    return childid === undefined ? -1 : childid;
};

FSOpfs.prototype.CountUsedInodes = function () {
    let count = this.inodes.length;
    for (const { fs, backtrack } of this.mounts) {
        count += fs.CountUsedInodes();

        // Forwarder inodes don't count.
        count -= backtrack.size;
    }
    return count;
};

FSOpfs.prototype.CountFreeInodes = function () {
    let count = 1024 * 1024;
    for (const { fs } of this.mounts) {
        count += fs.CountFreeInodes();
    }
    return count;
};

FSOpfs.prototype.GetTotalSize = function () {
    let size = this.used_size;
    for (const { fs } of this.mounts) {
        size += fs.GetTotalSize();
    }
    return size;
    //var size = 0;
    //for(var i=0; i<this.inodes.length; i++) {
    //    var d = this.inodes[i].data;
    //    size += d ? d.length : 0;
    //}
    //return size;
};

FSOpfs.prototype.GetSpace = function () {
    let size = this.total_size;
    for (const { fs } of this.mounts) {
        size += fs.GetSpace();
    }
    return this.total_size;
};

/**
 * XXX: Not ideal.
 * @param {number} idx
 * @return {string}
 */
FSOpfs.prototype.GetDirectoryName = function (idx) {
    const parent_inode = this.inodes[this.GetParent(idx)];

    if (this.is_forwarder(parent_inode)) {
        return this.follow_fs(parent_inode).GetDirectoryName(this.inodes[idx].foreign_id);
    }

    // Root directory.
    if (!parent_inode) return "";

    for (const [name, childid] of parent_inode.direntries) {
        if (childid === idx) return name;
    }

    dbg_assert(false, "Filesystem: Found directory inode whose parent doesn't link to it");
    return "";
};

FSOpfs.prototype.GetFullPath = function (idx) {
    dbg_assert(this.IsDirectory(idx), "Filesystem: Cannot get full path of non-directory inode");

    var path = "";

    while (idx !== 0) {
        path = "/" + this.GetDirectoryName(idx) + path;
        idx = this.GetParent(idx);
    }
    return path.substring(1);
};

/**
 * @param {number} parentid
 * @param {number} targetid
 * @param {string} name
 * @return {number} 0 if success, or -errno if failured.
 */
FSOpfs.prototype.Link = function (parentid, targetid, name) {
    if (this.IsDirectory(targetid)) {
        return -EPERM;
    }

    const parent_inode = this.inodes[parentid];
    const inode = this.inodes[targetid];

    if (this.is_forwarder(parent_inode)) {
        if (!this.is_forwarder(inode) || inode.mount_id !== parent_inode.mount_id) {
            dbg_log("XXX: Attempted to hardlink a file into a child filesystem - skipped", LOG_9P);
            return -EPERM;
        }
        return this.follow_fs(parent_inode).Link(parent_inode.foreign_id, inode.foreign_id, name);
    }

    if (this.is_forwarder(inode)) {
        dbg_log("XXX: Attempted to hardlink file across filesystems - skipped", LOG_9P);
        return -EPERM;
    }

    this.link_under_dir(parentid, targetid, name);
    return 0;
};
FSOpfs.prototype.Unlink = function (parentid, name) {
    if (name === "." || name === "..") {
        // Also guarantees that root cannot be deleted.
        return -EPERM;
    }
    const idx = this.Search(parentid, name);
    const inode = this.inodes[idx];
    const parent_inode = this.inodes[parentid];
    //dbg_log("Unlink " + inode.name, LOG_9P);

    // forward if necessary
    if (this.is_forwarder(parent_inode)) {
        dbg_assert(this.is_forwarder(inode), "Children of forwarders should be forwarders");

        const foreign_parentid = parent_inode.foreign_id;
        return this.follow_fs(parent_inode).Unlink(foreign_parentid, name);

        // Keep the forwarder dangling - file is still accessible.
    }

    if (this.IsDirectory(idx) && !this.IsEmpty(idx)) {
        return -ENOTEMPTY;
    }

    this.unlink_from_dir(parentid, name);

    if (inode.nlinks === 0) {
        // don't delete the content. The file is still accessible
        inode.status = STATUS_UNLINKED;
        this.NotifyListeners(idx, "delete");

    }
    return 0;
};

FSOpfs.prototype.DeleteData = async function (idx) {
    const inode = this.inodes[idx];

    inode.size = 0;
    delete this.inodes[idx];

    delete this.inodedata[idx];
    try {
        let hs = await this.OPFSDataHandle.removeEntry(idx.toString(), {
            recursive: true
        })
    } catch {
        // already deleted so what
    }
};

/**
 * @private
 * @param {number} idx
 * @return {!Promise<Blob>} The buffer that contains the file contents, which may be larger
 *      than the data itself. To ensure that any modifications done to this buffer is reflected
 *      to the file, call set_data with the modified buffer.
 */
FSOpfs.prototype.get_buffer = async function (idx) {
    const inode = this.inodes[idx];
    dbg_assert(inode, `Filesystem get_buffer: idx ${idx} does not point to an inode`);

    if (this.inodedata[idx]) {
        return this.inodedata[idx];
    }
    return null;
};

/**
 * @private
 * @param {number} idx
 * @param {number} offset
 * @param {number} count
 * @return {!Promise<Blob>}
 */
FSOpfs.prototype.get_data = async function (idx, offset, count) {
    const inode = this.inodes[idx];
    dbg_assert(inode, `Filesystem get_data: idx ${idx} does not point to an inode`);

    if (this.inodedata[idx]) {
        let blo = /** @type {Blob} */ (this.inodedata[idx]);
        return blo.slice(offset, offset + count);
    }
    return null;
};
function createOnce(callback) {
    let called = false;
    return function (n) {
        if (n === true) {
            called = false;
        }
        if (!called) {
            called = true;
            return callback();
        }
    }
}

/**
 * @private
 * @param {number} idx
 * @param {Blob|Uint8Array} buffer
 */
FSOpfs.prototype.set_data = async function (idx, buffer) {
    this.inodedata[idx] = new Blob([buffer]);
    if (this.inodes[idx].status === STATUS_ON_STORAGE) {
        this.inodes[idx].status = STATUS_OK;
    }
};

/**
 * @param {number} idx
 * @return {!Inode}
 */
FSOpfs.prototype.GetInode = function (idx) {
    dbg_assert(!isNaN(idx), "Filesystem GetInode: NaN idx");
    dbg_assert(idx >= 0 && idx < this.inodes.length, "Filesystem GetInode: out of range idx:" + idx);

    const inode = this.inodes[idx];
    if (this.is_forwarder(inode)) {
        return this.follow_fs(inode).GetInode(inode.foreign_id);
    }

    return inode;
};

FSOpfs.prototype.ChangeSize = async function (idx, newsize) {
    var inode = this.GetInode(idx);
    //dbg_log("change size to: " + newsize, LOG_9P);
    if (newsize === inode.size) return;
    inode.size = newsize;
    this.ScheduleInodePersist();

    let thiz = this;
    return new Promise(resolve => {
        let result = WorkerState.sendMessage('truncate', { newSize: newsize, inode: idx }, function (v) {
            resolve();

        }.bind(thiz), 8192);
        if (result) {
            resolve();
        }

    })
};
FSOpfs.prototype.RemoveWatcher = function (id, func) {
    let potentialIno = this.inodes[id];
    if (!potentialIno) {
        return;
    };
    potentialIno.direntries.remvoeWatcher(func);

    let chK = this.watchers[id];
    if (!chK || !(chK instanceof Array)) {
        return;
    }
    this.watchers[id] = chK.filter((val) => val !== func);
}

FSOpfs.prototype.SearchPathNoSymlinks = function (path) {
    //path = path.sace(/\/\//g, "/");
    path = path.replace("//", "/");
    var walk = path.split("/");
    if (walk.length > 0 && walk[walk.length - 1].length === 0) walk.pop();
    if (walk.length > 0 && walk[0].length === 0) walk.shift();
    const n = walk.length;

    var parentid = -1;
    var id = 0;
    let forward_path = null;
    for (var i = 0; i < n; i++) {
        parentid = id;
        id = this.Search(parentid, walk[i]);
        if (!forward_path && this.is_forwarder(this.inodes[parentid])) {
            forward_path = "/" + walk.slice(i).join("/");
        }
        if (id === -1) {
            if (i < n - 1) return { id: -1, parentid: -1, name: walk[i], forward_path }; // one name of the path cannot be found
            return { id: -1, parentid: parentid, name: walk[i], forward_path }; // the last element in the path does not exist, but the parent
        }
    }
    return { id: id, parentid: parentid, name: walk[i], forward_path };
};
/**
 * @constructor
 * @param {number} id 
 * @param {number} parentid 
 * @param {string} name 
 * @param {string|null} forward_path 
 */
function SearchPathResult(id, parentid, name, forward_path) {
    this.id = id;
    this.parentid = parentid;
    this.name = name;
    this.forward_path = forward_path;

}
SearchPathResult.prototype = {};
/**
 * Lookup system. Follows symlinks. For non-symlink version, look at SearchPathNoSymlink
 * @param {string} path Path to look up
 * @param {number} loopcount DO not fill in. interla symlink tracking
 * @returns {SearchPathResult}
 */
FSOpfs.prototype.SearchPath = function (path, loopcount = 0) {
    //path = path.replace(/\/\//g, "/");
    path = path.replace("//", "/");
    var walk = path.split("/");
    if (walk.length > 0 && walk[walk.length - 1].length === 0) walk.pop();
    if (walk.length > 0 && walk[0].length === 0) walk.shift();
    const n = walk.length;
    if (loopcount > 70) {
        return new SearchPathResult(-40, -1, "(not available)", null); // ELOOP: TOo mnay symbolic links
    }
    var parentid = -1;
    var id = 0;
    let forward_path = null;
    for (var i = 0; i < n; i++) {
        parentid = id;
        id = this.Search(parentid, walk[i]);
        if ((this.inodes[id].mode & S_IFMT) === S_IFLNK) {
            let q = this.SearchPath(this.inodes[id].symlink, loopcount + 1);
            if (i === n - 1) {
                return new SearchPathResult(q.id, q.parentid, q.name, q.forward_path);
            } else {
                id = q.id;
                console.debug("following symlink");
                continue;
            }


        }
        if (!forward_path && this.is_forwarder(this.inodes[parentid])) {
            forward_path = "/" + walk.slice(i).join("/");
        }
        if (id === -1) {
            if (i < n - 1) return new SearchPathResult(-1, -1, walk[i], forward_path); // one name of the path cannot be found
            return new SearchPathResult(-1, -1, walk[i], forward_path); // the last element in the path does not exist, but the parent
        }
    }
    return new SearchPathResult(id, parentid, walk[i], forward_path);
};
// -----------------------------------------------------

/**
 * @param {number} dirid
 * @param {Array<{parentid: number, name: string}>} list
 */
FSOpfs.prototype.GetRecursiveList = function (dirid, list) {
    if (this.is_forwarder(this.inodes[dirid])) {
        const foreign_fs = this.follow_fs(this.inodes[dirid]);
        const foreign_dirid = this.inodes[dirid].foreign_id;
        const mount_id = this.inodes[dirid].mount_id;

        const foreign_start = list.length;
        foreign_fs.GetRecursiveList(foreign_dirid, list);
        for (let i = foreign_start; i < list.length; i++) {
            list[i].parentid = this.get_forwarder(mount_id, list[i].parentid);
        }
        return;
    }
    for (const [name, id] of this.inodes[dirid].direntries) {
        if (name !== "." && name !== "..") {
            list.push({ parentid: dirid, name });
            if (this.IsDirectory(id)) {
                this.GetRecursiveList(id, list);
            }
        }
    }
};

FSOpfs.prototype.RecursiveDelete = function (path) {
    var toDelete = [];
    var ids = this.SearchPath(path);
    if (ids.id === -1) return;

    this.GetRecursiveList(ids.id, toDelete);

    for (var i = toDelete.length - 1; i >= 0; i--) {
        const ret = this.Unlink(toDelete[i].parentid, toDelete[i].name);
        dbg_assert(ret === 0, "Filesystem RecursiveDelete failed at parent=" + toDelete[i].parentid +
            ", name='" + toDelete[i].name + "' with error code: " + (-ret));
    }
};

FSOpfs.prototype.DeleteNode = function (path) {
    var ids = this.SearchPath(path);
    if (ids.id === -1) return;

    if ((this.inodes[ids.id].mode & S_IFMT) === S_IFREG) {
        const ret = this.Unlink(ids.parentid, ids.name);
        dbg_assert(ret === 0, "Filesystem DeleteNode failed with error code: " + (-ret));
    }
    else if ((this.inodes[ids.id].mode & S_IFMT) === S_IFDIR) {
        this.RecursiveDelete(path);
        const ret = this.Unlink(ids.parentid, ids.name);
        dbg_assert(ret === 0, "Filesystem DeleteNode failed with error code: " + (-ret));
    }
};

/** @param {*=} info */
FSOpfs.prototype.NotifyListeners = function (id, action, info) {

    //if(info==undefined)
    //    info = {};

    //var path = this.GetFullPath(id);
    //if (this.watchFiles[path] === true && action=='write') {
    //  message.Send("WatchFileEvent", path);
    //}
    //for (var directory of this.watchDirectories) {
    //    if (this.watchDirectories.hasOwnProperty(directory)) {
    //        var indexOf = path.indexOf(directory)
    //        if(indexOf === 0 || indexOf === 1)
    //            message.Send("WatchDirectoryEvent", {path: path, event: action, info: info});
    //    }
    //}
};


FSOpfs.prototype.Check = function () {
    for (var i = 1; i < this.inodes.length; i++) {
        if (this.inodes[i].status === STATUS_INVALID) continue;

        var inode = this.GetInode(i);
        if (inode.nlinks < 0) {
            dbg_log("Error in filesystem: negative nlinks=" + inode.nlinks + " at id =" + i, LOG_9P);
        }

        if (this.IsDirectory(i)) {
            const inode = this.GetInode(i);
            if (this.IsDirectory(i) && this.GetParent(i) < 0) {
                dbg_log("Error in filesystem: negative parent id " + i, LOG_9P);
            }
            for (const [name, id] of inode.direntries) {
                if (name.length === 0) {
                    dbg_log("Error in filesystem: inode with no name and id " + id, LOG_9P);
                }

                for (const c of name) {
                    if (c < 32) {
                        dbg_log("Error in filesystem: Unallowed char in filename", LOG_9P);
                    }
                }
            }
        }
    }

};


FSOpfs.prototype.FillDirectory = function (dirid) {
    const inode = this.inodes[dirid];
    if (this.is_forwarder(inode)) {
        // XXX: The ".." of a mountpoint should point back to an inode in this fs.
        // Otherwise, ".." gets the wrong qid and mode.
        this.follow_fs(inode).FillDirectory(inode.foreign_id);
        return;
    }

    let size = 0;
    for (const name of inode.direntries.keys()) {
        size += 13 + 8 + 1 + 2 + texten.encode(name).length;
    }
    const data = new Uint8Array(size);
    inode.size = size;

    let offset = 0x0;
    for (const [name, id] of inode.direntries) {
        const child = this.GetInode(id);
        offset += marshall.Marshall(
            ["Q", "d", "b", "s"],
            [child.qid,
            offset + 13 + 8 + 1 + 2 + texten.encode(name).length,
            child.mode >> 12,
                name],
            data, offset);
    }
    this.set_data(dirid, data);
    this.ScheduleInodePersist();

};

FSOpfs.prototype.RoundToDirentry = function (dirid, offset_target) {
    const data = this.inodedata[dirid];
    dbg_assert(data, `FS directory data for dirid=${dirid} should be generated`);
    dbg_assert(data.length, "FS directory should have at least an entry");

    if (offset_target >= data.length) {
        return data.length;
    }

    let offset = 0;
    while (true) {
        const next_offset = marshall.Unmarshall(["Q", "d"], data, { offset })[1];
        if (next_offset > offset_target) break;
        offset = next_offset;
    }

    return offset;
};

/**
 * @param {number} idx
 * @return {boolean}
 */
FSOpfs.prototype.IsDirectory = function (idx) {
    const inode = this.inodes[idx];
    if (this.is_forwarder(inode)) {
        return this.follow_fs(inode).IsDirectory(inode.foreign_id);
    }
    return (inode.mode & S_IFMT) === S_IFDIR;
};

/**
 * @param {number} idx
 * @return {boolean}
 */
FSOpfs.prototype.IsEmpty = function (idx) {
    const inode = this.inodes[idx];
    if (this.is_forwarder(inode)) {
        return this.follow_fs(inode).IsDirectory(inode.foreign_id);
    }
    for (const name of inode.direntries.keys()) {
        if (name !== "." && name !== "..") return false;
    }
    return true;
};

/**
 * @param {number} idx
 * @return {!Array<string>} List of children names
 */
FSOpfs.prototype.GetChildren = function (idx) {
    dbg_assert(this.IsDirectory(idx), "Filesystem: cannot get children of non-directory inode");
    const inode = this.inodes[idx];
    if (this.is_forwarder(inode)) {
        return this.follow_fs(inode).GetChildren(inode.foreign_id);
    }
    const children = [];
    for (const name of inode.direntries.keys()) {
        if (name !== "." && name !== "..") {
            children.push(name);
        }
    }
    return children;
};

/**
 * @param {number} idx
 * @return {number} Local idx of parent
 */
FSOpfs.prototype.GetParent = function (idx) {
    dbg_assert(this.IsDirectory(idx), "Filesystem: cannot get parent of non-directory inode");

    const inode = this.inodes[idx];

    if (this.should_be_linked(inode)) {
        return inode.direntries.get("..");
    }
    else {
        const foreign_dirid = this.follow_fs(inode).GetParent(inode.foreign_id);
        dbg_assert(foreign_dirid !== -1, "Filesystem: should not have invalid parent ids");
        return this.get_forwarder(inode.mount_id, foreign_dirid);
    }
};


// -----------------------------------------------------

// only support for security.capabilities
// should return a  "struct vfs_cap_data" defined in
// linux/capability for format
// check also:
//   sys/capability.h
//   http://lxr.free-electrons.com/source/security/commoncap.c#L376
//   http://man7.org/linux/man-pages/man7/capabilities.7.html
//   http://man7.org/linux/man-pages/man8/getcap.8.html
//   http://man7.org/linux/man-pages/man3/libcap.3.html
FSOpfs.prototype.PrepareCAPs = function (id) {
    var inode = this.GetInode(id);
    if (inode.caps) return inode.caps.length;
    inode.caps = new Uint8Array(20);
    // format is little endian
    // note: getxattr returns -EINVAL if using revision 1 format.
    // note: getxattr presents revision 3 as revision 2 when revision 3 is not needed.
    // magic_etc (revision=0x02: 20 bytes)
    inode.caps[0] = 0x00;
    inode.caps[1] = 0x00;
    inode.caps[2] = 0x00;
    inode.caps[3] = 0x02;

    // lower
    // permitted (first 32 capabilities)
    inode.caps[4] = 0xFF;
    inode.caps[5] = 0xFF;
    inode.caps[6] = 0xFF;
    inode.caps[7] = 0xFF;
    // inheritable (first 32 capabilities)
    inode.caps[8] = 0xFF;
    inode.caps[9] = 0xFF;
    inode.caps[10] = 0xFF;
    inode.caps[11] = 0xFF;

    // higher
    // permitted (last 6 capabilities)
    inode.caps[12] = 0x3F;
    inode.caps[13] = 0x00;
    inode.caps[14] = 0x00;
    inode.caps[15] = 0x00;
    // inheritable (last 6 capabilities)
    inode.caps[16] = 0x3F;
    inode.caps[17] = 0x00;
    inode.caps[18] = 0x00;
    inode.caps[19] = 0x00;

    return inode.caps.length;
};

// -----------------------------------------------------

/**
 * @constructor
 * @param {FSOpfs} filesystem
 */
function FSMountInfo(filesystem) {
    /** @type {FSOpfs}*/
    this.fs = filesystem;

    /**
     * Maps foreign inode id back to local inode id.
     * @type {!Map<number,number>}
     */
    this.backtrack = new Map();
}

FSMountInfo.prototype.get_state = function () {
    const state = [];

    state[0] = this.fs;
    state[1] = [...this.backtrack];

    return state;
};

FSMountInfo.prototype.set_state = function (state) {
    this.fs = state[0];
    this.backtrack = new Map(state[1]);
};

/**
 * @private
 * @param {number} idx Local idx of inode.
 * @param {number} mount_id Mount number of the destination fs.
 * @param {number} foreign_id Foreign idx of destination inode.
 */
FSOpfs.prototype.set_forwarder = function (idx, mount_id, foreign_id) {
    const inode = this.inodes[idx];

    dbg_assert(inode.nlinks === 0,
        "Filesystem: attempted to convert an inode into forwarder before unlinking the inode");

    if (this.is_forwarder(inode)) {
        this.mounts[inode.mount_id].backtrack.delete(inode.foreign_id);
    }

    inode.status = STATUS_FORWARDING;
    inode.mount_id = mount_id;
    inode.foreign_id = foreign_id;

    this.mounts[mount_id].backtrack.set(foreign_id, idx);
};

/**
 * @private
 * @param {number} mount_id Mount number of the destination fs.
 * @param {number} foreign_id Foreign idx of destination inode.
 * @return {number} Local idx of newly created forwarder.
 */
FSOpfs.prototype.create_forwarder = function (mount_id, foreign_id) {
    const inode = this.CreateInode();

    const idx = this.inodes.length;
    this.inodes.push(inode);
    inode.fid = idx;

    this.set_forwarder(idx, mount_id, foreign_id);
    return idx;
};

/**
 * @private
 * @param {Inode} inode
 * @return {boolean}
 */
FSOpfs.prototype.is_forwarder = function (inode) {
    return inode.status === STATUS_FORWARDING;
};

/**
 * Whether the inode it points to is a root of some filesystem.
 * @private
 * @param {number} idx
 * @return {boolean}
 */
FSOpfs.prototype.is_a_root = function (idx) {
    return this.GetInode(idx).fid === 0;
};

/**
 * Ensures forwarder exists, and returns such forwarder, for the described foreign inode.
 * @private
 * @param {number} mount_id
 * @param {number} foreign_id
 * @return {number} Local idx of a forwarder to described inode.
 */
FSOpfs.prototype.get_forwarder = function (mount_id, foreign_id) {
    const mount = this.mounts[mount_id];

    dbg_assert(foreign_id >= 0, "Filesystem get_forwarder: invalid foreign_id: " + foreign_id);
    dbg_assert(mount, "Filesystem get_forwarder: invalid mount number: " + mount_id);

    const result = mount.backtrack.get(foreign_id);

    if (result === undefined) {
        // Create if not already exists.
        return this.create_forwarder(mount_id, foreign_id);
    }

    return result;
};

/**
 * @private
 * @param {Inode} inode
 */
FSOpfs.prototype.delete_forwarder = function (inode) {
    dbg_assert(this.is_forwarder(inode), "Filesystem delete_forwarder: expected forwarder");

    inode.status = STATUS_INVALID;
    this.mounts[inode.mount_id].backtrack.delete(inode.foreign_id);
};

/**
 * @private
 * @param {Inode} inode
 * 
 */
FSOpfs.prototype.follow_fs = function (inode) {
    const mount = this.mounts[inode.mount_id];

    dbg_assert(this.is_forwarder(inode),
        "Filesystem follow_fs: inode should be a forwarding inode");
    dbg_assert(mount, "Filesystem follow_fs: inode<id=" + inode.fid +
        "> should point to valid mounted FS");

    return mount.fs;
};

/**
 * Mount another filesystem to given path.
 * @param {string} path
 * @param {FSOpfs} fs
 * @return {number} inode id of mount point if successful, or -errno if mounting failed.
 */
FSOpfs.prototype.Mount = function (path, fs) {
    dbg_assert(fs.qidcounter === this.qidcounter,
        "Cannot mount filesystem whose qid numbers aren't synchronised with current filesystem.");

    const path_infos = this.SearchPath(path);

    if (path_infos.parentid === -1) {
        dbg_log("Mount failed: parent for path not found: " + path, LOG_9P);
        return -ENOENT;
    }
    if (path_infos.id !== -1) {
        dbg_log("Mount failed: file already exists at path: " + path, LOG_9P);
        return -EEXIST;
    }
    if (path_infos.forward_path) {
        const parent = this.inodes[path_infos.parentid];
        const ret = this.follow_fs(parent).Mount(path_infos.forward_path, fs);
        if (ret < 0) return ret;
        return this.get_forwarder(parent.mount_id, ret);
    }

    const mount_id = this.mounts.length;
    this.mounts.push(new FSMountInfo(fs));

    const idx = this.create_forwarder(mount_id, 0);
    this.link_under_dir(path_infos.parentid, idx, path_infos.name);

    return idx;
};

/**
 * @constructor
 */
function FSLockRegion() {
    this.type = P9_LOCK_TYPE_UNLCK;
    this.start = 0;
    this.length = Infinity;
    this.proc_id = -1;
    this.client_id = "";
}

FSLockRegion.prototype.get_state = function () {
    const state = [];

    state[0] = this.type;
    state[1] = this.start;
    // Infinity is not JSON.stringify-able
    state[2] = this.length === Infinity ? 0 : this.length;
    state[3] = this.proc_id;
    state[4] = this.client_id;

    return state;
};

FSLockRegion.prototype.set_state = function (state) {
    this.type = state[0];
    this.start = state[1];
    this.length = state[2] === 0 ? Infinity : state[2];
    this.proc_id = state[3];
    this.client_id = state[4];
};

/**
 * @return {FSLockRegion}
 */
FSLockRegion.prototype.clone = function () {
    const new_region = new FSLockRegion();
    new_region.set_state(this.get_state());
    return new_region;
};

/**
 * @param {FSLockRegion} region
 * @return {boolean}
 */
FSLockRegion.prototype.conflicts_with = function (region) {
    if (this.proc_id === region.proc_id && this.client_id === region.client_id) return false;
    if (this.type === P9_LOCK_TYPE_UNLCK || region.type === P9_LOCK_TYPE_UNLCK) return false;
    if (this.type !== P9_LOCK_TYPE_WRLCK && region.type !== P9_LOCK_TYPE_WRLCK) return false;
    if (this.start + this.length <= region.start) return false;
    if (region.start + region.length <= this.start) return false;
    return true;
};

/**
 * @param {FSLockRegion} region
 * @return {boolean}
 */
FSLockRegion.prototype.is_alike = function (region) {
    return region.proc_id === this.proc_id &&
        region.client_id === this.client_id &&
        region.type === this.type;
};

/**
 * @param {FSLockRegion} region
 * @return {boolean}
 */
FSLockRegion.prototype.may_merge_after = function (region) {
    return this.is_alike(region) && region.start + region.length === this.start;
};

/**
 * @param {number} type
 * @param {number} start
 * @param {number} length
 * @param {number} proc_id
 * @param {string} client_id
 * @return {!FSLockRegion}
 */
FSOpfs.prototype.DescribeLock = function (type, start, length, proc_id, client_id) {
    dbg_assert(type === P9_LOCK_TYPE_RDLCK ||
        type === P9_LOCK_TYPE_WRLCK ||
        type === P9_LOCK_TYPE_UNLCK,
        "Filesystem: Invalid lock type: " + type);
    dbg_assert(start >= 0, "Filesystem: Invalid negative lock starting offset: " + start);
    dbg_assert(length > 0, "Filesystem: Invalid non-positive lock length: " + length);

    const lock = new FSLockRegion();
    lock.type = type;
    lock.start = start;
    lock.length = length;
    lock.proc_id = proc_id;
    lock.client_id = client_id;

    return lock;
};

/**
 * @param {number} id
 * @param {FSLockRegion} request
 * @return {FSLockRegion} The first conflicting lock found, or null if requested lock is possible.
 */
FSOpfs.prototype.GetLock = function (id, request) {
    const inode = this.inodes[id];

    if (this.is_forwarder(inode)) {
        const foreign_id = inode.foreign_id;
        return this.follow_fs(inode).GetLock(foreign_id, request);
    }

    for (const region of inode.locks) {
        if (request.conflicts_with(region)) {
            return region.clone();
        }
    }
    return null;
};

/**
 * @param {number} id
 * @param {FSLockRegion} request
 * @param {number} flags
 * @return {number} One of P9_LOCK_SUCCESS / P9_LOCK_BLOCKED / P9_LOCK_ERROR / P9_LOCK_GRACE.
 */
FSOpfs.prototype.Lock = function (id, request, flags) {
    const inode = this.inodes[id];

    if (this.is_forwarder(inode)) {
        const foreign_id = inode.foreign_id;
        return this.follow_fs(inode).Lock(foreign_id, request, flags);
    }

    request = request.clone();

    // (1) Check whether lock is possible before any modification.
    if (request.type !== P9_LOCK_TYPE_UNLCK && this.GetLock(id, request)) {
        return P9_LOCK_BLOCKED;
    }

    // (2) Subtract requested region from locks of the same owner.
    for (let i = 0; i < inode.locks.length; i++) {
        const region = inode.locks[i];

        dbg_assert(region.length > 0,
            "Filesystem: Found non-positive lock region length: " + region.length);
        dbg_assert(region.type === P9_LOCK_TYPE_RDLCK || region.type === P9_LOCK_TYPE_WRLCK,
            "Filesystem: Found invalid lock type: " + region.type);
        dbg_assert(!inode.locks[i - 1] || inode.locks[i - 1].start <= region.start,
            "Filesystem: Locks should be sorted by starting offset");

        // Skip to requested region.
        if (region.start + region.length <= request.start) continue;

        // Check whether we've skipped past the requested region.
        if (request.start + request.length <= region.start) break;

        // Skip over locks of different owners.
        if (region.proc_id !== request.proc_id || region.client_id !== request.client_id) {
            dbg_assert(!region.conflicts_with(request),
                "Filesytem: Found conflicting lock region, despite already checked for conflicts");
            continue;
        }

        // Pretend region would be split into parts 1 and 2.
        const start1 = region.start;
        const start2 = request.start + request.length;
        const length1 = request.start - start1;
        const length2 = region.start + region.length - start2;

        if (length1 > 0 && length2 > 0 && region.type === request.type) {
            // Requested region is already locked with the required type.
            // Return early - no need to modify anything.
            return P9_LOCK_SUCCESS;
        }

        if (length1 > 0) {
            // Shrink from right / first half of the split.
            region.length = length1;
        }

        if (length1 <= 0 && length2 > 0) {
            // Shrink from left.
            region.start = start2;
            region.length = length2;
        }
        else if (length2 > 0) {
            // Add second half of the split.

            // Fast-forward to correct location.
            while (i < inode.locks.length && inode.locks[i].start < start2) i++;

            inode.locks.splice(i, 0,
                this.DescribeLock(region.type, start2, length2, region.proc_id, region.client_id));
        }
        else if (length1 <= 0) {
            // Requested region completely covers this region. Delete.
            inode.locks.splice(i, 1);
            i--;
        }
    }

    // (3) Insert requested lock region as a whole.
    // No point in adding the requested lock region as fragmented bits in the above loop
    // and having to merge them all back into one.
    if (request.type !== P9_LOCK_TYPE_UNLCK) {
        let new_region = request;
        let has_merged = false;
        let i = 0;

        // Fast-forward to requested position, and try merging with previous region.
        for (; i < inode.locks.length; i++) {
            if (new_region.may_merge_after(inode.locks[i])) {
                inode.locks[i].length += request.length;
                new_region = inode.locks[i];
                has_merged = true;
            }
            if (request.start <= inode.locks[i].start) break;
        }

        if (!has_merged) {
            inode.locks.splice(i, 0, new_region);
            i++;
        }

        // Try merging with the subsequent alike region.
        for (; i < inode.locks.length; i++) {
            if (!inode.locks[i].is_alike(new_region)) continue;

            if (inode.locks[i].may_merge_after(new_region)) {
                new_region.length += inode.locks[i].length;
                inode.locks.splice(i, 1);
            }

            // No more mergable regions after this.
            break;
        }
    }

    return P9_LOCK_SUCCESS;
};

FSOpfs.prototype.read_dir = function (path) {
    const p = this.SearchPath(path);

    if (p.id === -1) {
        return undefined;
    }

    const dir = this.GetInode(p.id);

    return Array.from(dir.direntries.keys()).filter(path => path !== "." && path !== "..");
};
FSOpfs.prototype.walk = async function walk(callback, path = "/", fid = 0) {
    let filesUnder = this.read_dir(path);
    let parentFid = fid;
    if (path === "/") {
        path = ""
    }
    for (let file of filesUnder) {
        let a = this.Search(parentFid, file);

        let ino = this.inodes[a];
        let fmode = ino.mode;
        await callback(path + '/' + file, ino);
        if ((fmode & allNodeConstants.fsConstants.S_IFMT) === allNodeConstants.fsConstants.S_IFDIR) {
            await this.walk(callback, path + '/' + file, ino.fid);
        }
    }
}
FSOpfs.prototype.read_file = function (file) {
    const p = this.SearchPath(file);
    this.OpenInode(p.id, 0);

    if (p.id === -1) {
        return Promise.resolve(null);
    }

    const inode = this.GetInode(p.id);
    return this.Read(p.id, 0, inode.size);
};
let allNodeConstants = {
    FILE_SYSTEM_NAME: 'local',

    FILE_STORE_NAME: 'files',

    IDB_RO: 'readonly',
    IDB_RW: 'readwrite',

    WSQL_VERSION: '1',
    WSQL_SIZE: 5 * 1024 * 1024,
    WSQL_DESC: 'FileSystem Storage',

    NODE_TYPE_FILE: 'FILE',
    NODE_TYPE_DIRECTORY: 'DIRECTORY',
    NODE_TYPE_SYMBOLIC_LINK: 'SYMLINK',
    NODE_TYPE_META: 'META',


    DEFAULT_DIR_PERMISSIONS: 0x1ED, // 755
    DEFAULT_FILE_PERMISSIONS: 0x1A4, // 644
    FULL_READ_WRITE_EXEC_PERMISSIONS: 0x1FF, // 777
    READ_WRITE_PERMISSIONS: 0x1B6, /// 666

    SYMLOOP_MAX: 10,

    BINARY_MIME_TYPE: 'application/octet-stream',
    JSON_MIME_TYPE: 'application/json',

    ROOT_DIRECTORY_NAME: '/', // basename(normalize(path))

    // FS Mount Flags
    FS_FORMAT: 'FORMAT',
    FS_NOCTIME: 'NOCTIME',
    FS_NOMTIME: 'NOMTIME',
    FS_NODUPEIDCHECK: 'FS_NODUPEIDCHECK',

    // FS File Open Flags

    FS_READY: 'READY',
    FS_PENDING: 'PENDING',
    FS_ERROR: 'ERROR',

    SUPER_NODE_ID: '00000000-0000-0000-0000-000000000000',

    // Reserved File Descriptors for streams
    STDIN: 0,
    STDOUT: 1,
    STDERR: 2,
    FIRST_DESCRIPTOR: 3,

    ENVIRONMENT: {
        TMP: '/tmp',
        PATH: ''
    },

    // Duplicate Node's fs.constants
    fsConstants: {
        O_RDONLY: 0,
        O_WRONLY: 1,
        O_RDWR: 2,
        S_IFMT: 61440,
        S_IFREG: 32768,
        S_IFDIR: 16384,
        S_IFCHR: 8192,
        S_IFBLK: 24576,
        S_IFIFO: 4096,
        S_IFLNK: 40960,
        S_IFSOCK: 49152,
        O_CREAT: 512,
        O_EXCL: 2048,
        O_NOCTTY: 131072,
        O_TRUNC: 1024,
        O_APPEND: 8,
        O_DIRECTORY: 1048576,
        O_NOFOLLOW: 256,
        O_SYNC: 128,
        O_DSYNC: 4194304,
        O_SYMLINK: 2097152,
        O_NONBLOCK: 4,
        S_IRWXU: 448,
        S_IRUSR: 256,
        S_IWUSR: 128,
        S_IXUSR: 64,
        S_IRWXG: 56,
        S_IRGRP: 32,
        S_IWGRP: 16,
        S_IXGRP: 8,
        S_IRWXO: 7,
        S_IROTH: 4,
        S_IWOTH: 2,
        S_IXOTH: 1,
        F_OK: 0,
        R_OK: 4,
        W_OK: 2,
        X_OK: 1,
        UV_FS_COPYFILE_EXCL: 1,
        COPYFILE_EXCL: 1
    }
};

Object.defineProperty(FSOpfs.prototype, 'fs', {
    get: async function () {
        let s = /** @type {?} */ ({});

        let thiz = this;
        let fsc = allNodeConstants.fsConstants
        let fdToInode = /** @type {Map<number,number>} */ (new Map());
        let lastFd = 0;
        s.access = function (path, mode, callback) {
            let value = s.accessSync(path, mode);
            setTimeout(callback, 0, value);
        }
        s.accessSync = function (path, mode) {
            let q = thiz.SearchPath(path);
            let ino = /** @type {Inode} */(thiz.inodes[q]);
            let result = true;
            if ((mode & fsc.R_OK)) {
                result = result && ((ino.mode & fsc.S_IRUSR));
            }
            if ((mode & fsc.W_OK)) {
                result = result && ((ino.mode & fsc.S_IWUSR));
            }
            if ((mode & fsc.X_OK)) {
                result = result && ((ino.mode & fsc.S_IXOTH));
            }
            if (!result) {
                result = "EPERM";
                throw new Error(result);
            }
            return result;
        }
        s.appendFile = function (pth, data, options, cb) {
            // options are ingored
            let q = thiz.SearchPath(pth);

            if (q.parentid >= 0 && q.id < 0) {
                q.id = thiz.CreateFile(pth.split('/')[pth.split('/').length - 1], q.parentid);
            }
            let ino = thiz.inodes[q.id];
            if ((ino.mode & S_IFMT) !== S_IFREG) {
                throw new Error("could not append directory or other file types");
            }
            thiz.OpenInode(ino.fid, 0);


        }
        s.chmod = function (path, mode, cb) {

        }
        s.chown = function (path, uid, gid, cb) {

        }
        s.close = function (fd, cb) {

        }
        s.copyFile = function (src, dest, mode, cb) {

        }
        s.cp = function (source, desitnation, opts, callback) {

        }
        s.createReadStream = function (path, options) {
            throw new Error("unsupported on a web browser");
        }
        s.existsSync = function (path) {
            return thiz.SearchPath(path).id > 0;
        }
        s.fchmod = function (fd, mod, cb) {

        }
        s.fchown = function (fd, uid, gid, cb) {

        }
        s.fdatasync = async function (fd, cb) {
            await thiz.persist();
            cb(null);
        }
        s.fstat = async (fd, options, callback) => {
            let q = {}
            let inoNum = fdToInode.get(fd);
            if (!inoNum) {
                callback(-EINVAL, null);
                return;
            }
            let i = /** @type {Inode} */ (thiz.inodes[inoNum]);
            q.atime = new Date(i.atime);
            q.atimeMs = i.atime;
            q.birthtimeMs = i.ctime;
            q.birthtime = i.ctime;
            q.blksize = 8192;
            q.blocks = Math.ceil(i.size / 8192);
            q.rdev = i.major << 8 | i.minor;
            q.dev = 0;
            q.ino = i.fid;
            q.uid = i.uid;
            q.gid = i.gid;
            callback(null, q);

        }
        s.fsync = async function (fd, callback) {
            await thiz.persist();
        }
        s.ftruncate = async function (fd, len, callback) {
            let c = fdToInode.get(fd);
            thiz.ChangeSize(c, len ? len : 0);
        }
        s.futimes = async function (fd, atime, mtime, callback) {

            if (atime instanceof Date) {
                atime = atime.getTime();
            }
            if (mtime instanceof Date) {
                mtime = mtime.getTime();
            }
            let c = fdToInode.get(fd);
            let ino = /** @type {Inode} */ (thiz.inodes[c]);

            ino.atime = atime;
            ino.mtime = mtime;
            setTimeout(callback, 0, null);
        }
        s.glob = async function (pattern, options, callback) {
            callback(null);
        }
        s.lchown = async function (path, uid, gid, cb) {
            let spResult = thiz.SearchPathNoSymlinks(path);
            let ino = thiz.inodes[spResult.id]
            if (uid >= 0) {
                ino.uid = uid;
            }
            if (gid >= 0) {
                ino.gid = gid;
            }

        }
        s.link = async function (path, newPath, cb) {
            if (typeof path !== 'string') {
                path = new TextDecoder().decode(path);
            }
            if (typeof newPath !== 'string') {
                newPath = new TextDecoder().decode(newPath);
            }
            let dstPathParts = newPath.split('/');
            let name = dstPathParts.slice(-1)[0];
            let q = thiz.SearchPath(path);
            let q2 = thiz.SearchPath(dstPathParts.slice(0, -1).join('/'));
            let parId = q2.id;
            let a = thiz.Link(parId, q.id, name);
            if (a < 0) {
                setTimeout(cb, 0, a);
            }
            else {
                setTimeout(cb, 0, a);
            }
        }
        s.open = function (pat, callback) {

        }
        s.lstat = function (...args) {

        }
        s.lutimes = function (...args) {
            return null;
        }
        /**
         * 
         * @param {string} path 
         * @param {?} callback 
         */
        s.mkdir = function (path, callback) {
            let everything = path.split('/');
            let parent = everything.slice(0, -1).join('/');

            let q = thiz.SearchPath(parent);
            let theParentId = q.id;
            let theName = everything.slice(-1)[0];
            thiz.CreateDirectory(theName, theParentId);
            setTimeout(callback, 0, null);
        }


        return s;
    }

})
