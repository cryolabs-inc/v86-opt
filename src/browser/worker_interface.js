/**
 * Handle incoming messages to a worker
 * @param {MessageEvent} msg 
 */
function msgHandler(msg) {

}

/**
 * @typedef {{
 *  respondWith: (response)=>void
 *  id: number
 *  interfaceName: string
 * }}
 */
let Responder;

/**
 * @typedef {{
 *  methodName: string
 *  arguments: any[]
 * }} 
 */
let DesireInterfacesExtension;

/**
 * 
 * @typedef {{
 *  name: string,
 *  [methodName: string]: (responder: Responder)=>void
 * }}
 */
let Extension; 




/**
 * Aka a serialized request
 * @typedef {{
 *    id: number,
 *    targetInterface: string,
 *    interfaceSpecific: DesireInterfacesExtension
 * 
 * }}
 * 
 * 
 */
let Desire;


/**
 * @constructor
 */
class Request {
    
    
    

    /**
     * 
     * @param {string} interfaceName 
     * @param {Extension} ext 
     */
    static registerExtension(interfaceName, ext) {

    }
    /**
     * Get the extenion from a name
     * @param {Desire} desire
     * @returns {Extension}
     */
    static getExtensionFromInterfaceName(desire) {
        return 
    }
    /**
     * Input: Desire
     * Output: Action
     * @param {Desire} msg 
     */
    static from(msg) {
        let nReq = new Request();
        nReq.id = msg.id;
        nReq.methodName = msg.interfaceSpecific.methodName;
    }

    createResponder() {

    }
}




/**
 * 
 * @param {*} Interface 
 */
function registerInterface(Interface) {

}
if (!('window' in self)) {
    // this is most likely a worker
    console.warn('[INTIIALIZING WORKER MESSAGE SYSTEM]');
    
}
export {};