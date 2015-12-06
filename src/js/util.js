let $ = require("jquery");
let _ = require("lodash");

let Settings = require("./settings");
let miner = require("./miner");

exports.maybeRunFns = function (fns, chance_of_executing, interval) {
  interval = interval || 1000;
  let fns_index = 0; 
  
  let intervalID =
    setInterval( () => {
      if(fns_index >= fns.length) {
        clearInterval(intervalID);
        return;
      } else if(_.random(0, 1, true) < chance_of_executing) {
        fns[fns_index++]();
      }
    },
  1000);
}

exports.isValidOrderLetter = function (order_letter) {
  try {
    return typeof order_letter === "string" &&
      order_letter.length === 1 &&
      /[a|b|c]/i.test(order_letter);
  } catch (error) {
    return false;
  }
}

exports.hasEnoughUnits = function (units) {
  let current_units = miner.mineCurrentUnits();
  
  return _.all(_.map(_.keys(units), function(k) { return current_units[k] >= units[k]; }));
}