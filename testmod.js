const messenger = require('./index');

const testing = messenger.register(n => n * n);

module.exports.test = () => {
    return testing(7);
}