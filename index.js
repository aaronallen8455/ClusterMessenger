const cluster = require('cluster');

const mo = module.exports;

/** @type {Map<number, Function>} */
const handlers = new Map();

let handlerSeq = 0;

/** @type {Map<number, {resolve: Function, reject: Function}>} */
const resolvers = new Map();

let resolverSeq = 0;

/**
 * Initialized the cluster messager. Should be called only once from the master process only.
 * @param {Worker[]} workers 
 */
mo.init = workers => {
    if (cluster.isWorker) return;

    for (let id in workers) {
        let worker = workers[id];

        worker.on('message', async msg => {
            if (msg._handlerId === undefined || msg._resolverId === undefined) {
                return;
            }

            let handler = handlers.get(msg._handlerId);

            if (!handler) {
                console.error('clusterMessenger: Message handler not found! Ensure that all calls to register are in scope for both master and worker processes.');
                return;
            }

            let result = handler.apply(null, msg._arguments);

            if (result && result.then && result.catch) {
                // result is a promise
                try {
                    result = await result;
                } catch (err) {
                    result = err;
                    msg._failed = true;
                }
            }

            msg._result = result;

            worker.send(msg);
        })
    }
};

if (cluster.isWorker) {
    // attach the response handler for workers
    process.on('message', msg => {
        if (msg._handlerId === undefined || msg._resolverId === undefined) {
            return;
        }

        let resolver = resolvers.get(msg._resolverId);

        if (!resolver) {
            throw new Error('Message resolver not found!');
        }

        resolvers.delete(msg._resolverId);

        if (msg._failed) {
            return resolver.reject(msg._result);
        }

        resolver.resolve(msg._result);
    })
}

/**
 * Takes a handler function that will be executed by the master process
 * and returns a function that when called from a worker process, will
 * send it's argument to the master process where the handler will be
 * executed and the result will be returned asynchronously.
 * You can also call the result function from the master process, it
 * will also be asynchronous.
 * 
 * @param {Function} handler 
 * @returns {function(any): Promise<any>}
 */
mo.register = handler => {
    if (typeof handler !== 'function') {
        throw new Error('Handler must be a function.');
    }

    let handlerId = handlerSeq++;
    if (cluster.isMaster) {
        handlers.set(handlerId, handler);
    }

    return (...args) => {
        // handle directly if on master thread.
        if (cluster.isMaster) {
            let result = handler.apply(null, args);

            return new Promise(async (resolve, reject) => {
                // check if the handler is async
                if (result.then && result.catch) {
                    try {
                        result = await result;

                        resolve(result);
                    } catch (err) {
                        reject(result);
                    }
                } else {
                    process.nextTick(() => {
                        resolve(result);
                    })
                }
            })
        }
        
        // use messages if on a worker thread
        return new Promise((resolve, reject) => {
            let resolverId = resolverSeq++;
            resolvers.set(resolverId, {resolve: resolve, reject: reject});

            process.send({
                _handlerId: handlerId,
                _resolverId: resolverId,
                _arguments: args
            });
        });
    };
};