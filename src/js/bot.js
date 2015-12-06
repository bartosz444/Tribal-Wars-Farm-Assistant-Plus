let $ = require("jquery");
let _ = require("lodash");

let constants = require('./const.js');
let PlunderableVillage = require("./data/plunderable-village");
let BotOrder = require("./data/bot-order.js");
let miner = require("./miner");
let util = require("./util");
let settings = require("./settings");

function hasEnougthUnits (units) {
  "use strict;"
    
  let current_units = miner.mineCurrentUnits();
  
  for (let unit_name in units) {
    if(current_units[unit_name] < units[unit_name]) {
      return false;
    }
  }
  
  return true;
}


exports.createOrders = function (plunderable_villages) {
  "use strict;"
  
  let orders = [];
  let bot_settings = settings.BotSettings;
  
  for (let i = 0; i < plunderable_villages.length; i++) {
    let pv = plunderable_villages[i];
    
    if(!pv.is_attacking) {
      /* Not already attacking */
            
      if(pv.wall > 0) { /* Has Wall */
        // Send a high priority attack with 10 ligth cav, 1 spy, and n rams
        let units = _.clone(bot_settings.RAM_UNITS);
        units.ram = bot_settings.RAMS_PER_WALL_LEVEL[pv.wall]; 
        orders.push(new BotOrder.CustomOrder(pv, units, -100));
        
      } else if(pv.getTotalRes() >= bot_settings.MIN_RES) {
        /* Doesn't have walls && Has resources */
        
        if (pv.distance <= bot_settings.MAX_DIST) {
          if(pv.getTotalRes() >= bot_settings.MAX_RES) {
            orders.push(new BotOrder.TemplateOrder(pv, bot_settings.MAX_TEMPLATE, 0));
            
          } else {
            orders.push(new BotOrder.TemplateOrder(pv, "C", 0));
          }
        }
      } 
    }
  }
    
  return orders;
}

function runFnsEveryInterval (orders, ms) {
  "use strict";
  
  const ORDERS_EXECUTION_MIN_INTERVAL = 250;
  const ORDERS_EXECUTION_MAX_INTERVAL = 60000;
  
  ms = Math.min(Math.max(ms, ORDERS_EXECUTION_MIN_INTERVAL), ORDERS_EXECUTION_MAX_INTERVAL);
  
  let orders_fns = _.map(orders, o => _.bind(o.execute, o));
  util.maybeRunFns(orders_fns, 1, ms);    
}

function delay(interval) {
    return new Promise(function(resolve) {
        setTimeout(resolve, interval);
    });
}

exports.execute = function () {
  "use strict";
    
  // Gather villages info
  let plunderable_villages = miner.minePlunderVillages();
  
  // Create orders
  let orders = exports.createOrders(plunderable_villages);
  orders = _.sortByAll(orders, 'priority'); // Sort by higher priority
  
  /* Execute orders */
  let progress_bar = $("#TWFAP-progress-execution");
  let execute_promise = Promise.resolve();
  
  // Clear progressbar
  progress_bar.attr("max", orders.length);
  progress_bar.val(0);
  
  // Create promise
  for (let i = 0; i < orders.length; i++) {
    let order = orders[i];
    
    execute_promise = execute_promise.then(() => {
      progress_bar.val(progress_bar.val() + 1);
      return order.execute() ? delay(500) : null;
    });
  }
  
  execute_promise = execute_promise.catch(console.error.bind(console));
  
  return execute_promise;
}

function clearSimulation() {
  "use strict";
  
  $("." + constants.SIMULATION_BTN_CLASS)
    .each((i, e) => $(e).removeClass(constants.SIMULATION_BTN_CLASS));
}
exports.clearSimulation = clearSimulation;

exports.simulate = function () {
  "use strict";
  
  // Remove previous simulation
  clearSimulation();
    
  // Gather villages info
  let plunderable_villages = miner.minePlunderVillages();
  
  // Create orders
  let orders = exports.createOrders(plunderable_villages);
  orders = _.sortByAll(orders, 'priority'); // Sort by higher priority
  
  // Draw simulation
  for (let i = 0; i < orders.length; i++) {
    orders[i].simulate();
  }
}