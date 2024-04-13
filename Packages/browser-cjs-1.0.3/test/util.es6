const keys = require('./keys.es6');

var utils = {
  convertKeyCode: function (keyCode) {
    return keys[keyCode];
  },

  getName: function () {
    return "utils";
  }
};

module.exports = utils;