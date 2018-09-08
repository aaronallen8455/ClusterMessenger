const cluster = require ('cluster');
const os = require('os');
const messenger = require('./index');
const testmod = require('./testmod');


let counter = 0;
const increment = messenger.register(() => {
    counter++;
    return counter;
});

const saySomething = messenger.register(message => {
    console.log(message);
    return null;
});

const square = messenger.register(num => {
    return Promise.resolve(num*num);
});

if (cluster.isMaster) {
    let numCpus = os.cpus().length;

    for (let i=0; i<numCpus; i++) {
        cluster.fork();
    }

    messenger.init(cluster.workers);

    square(7).then(x => {
        console.log(`7^2=${x}  -- from master process`);
    })
} else {
    increment().then(v => {
        console.log(`incrementer is at ${v}`);
    });

    saySomething('yo yo!');

    square(5).then(v => {
        console.log(v);
        console.log(`5 squared is ${v}`)
    });

    testmod.test().then(v => {
        console.log(`from test mod: ${v}`);
    })
}