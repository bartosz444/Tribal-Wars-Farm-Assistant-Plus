/* global GM_addStyle */

let fs = require("fs");

let $ = require("jquery");
let _ = require("lodash");
let log = require('loglevel').getLogger("UI");
let StateMachine = require("javascript-state-machine");

let constants = require("./const");
let settings = require("./settings");
let miner = require("./miner");
let bot = require("./bot");

/*** Execution FSM ***/
var execution_fsm = StateMachine.create({
  initial: 'init',
  events: [
    { name: 'execute',  from: 'init',  to: 'executing' },
    { name: 'done', from: 'executing', to: 'executed'},
    { name: 'reload',  from: 'executed',    to: 'reloading'}
]});

execution_fsm.onexecute = function () {
  bot.execute()
    .then(_.bind(execution_fsm.done, execution_fsm));
}

execution_fsm.onreload = function () {
  location.reload();
}

function appendTotalResCol () {
  /** Append total resources to resources column **/
  $('#plunder_list tr td:nth-child(6)').each(function () {
    "use strict";
    
    let res_jq = $(this);
    let res = miner.parseResource(res_jq.text());
    let res_sum = _.sum(_.values(res));
    
    res_jq.append(' <span class="icon header ressources"></span> ' + res_sum);
  });
}



exports.injectUI = function () {
  // Load files
  let ui_html = fs.readFileSync('./src/html/ui.html', 'utf8');
  let css = fs.readFileSync('./src/css/TWFAP.css'); 
  
  // Inject stylesheet
  GM_addStyle(css);
   
  // Inject bot interface
  $("#farm_units").parent().after(ui_html);
  
  // Bind events
  $("#TWFAP-btn-execute").click(() => {
    if(execution_fsm.can("execute")) {
      execution_fsm.execute();
    } else {
      execution_fsm.reload();
    }
  });
  
  $("#TWFAP-btn-simulate").click(_.bind(bot.simulate, bot));
  $("#TWFAP-btn-clear-simulation").click(_.bind(bot.clearSimulation, bot));
  $("#TWFAP-txtarea-settings").val(JSON.stringify(settings));
  
  $("#TWFAP-btn-save-settings").click(() => {
    let newSettings = JSON.parse($("#TWFAP-txtarea-settings").val());
    log.info("UI new Settings:", newSettings);
    
    for (var member in settings) delete settings[member];
    _.assign(settings, newSettings);
  });
  
  $("#TWFAP-btn-reset-settings").click(() => {
    let newSettings = constants.DEFAULT_SETTINGS;
    log.info("UI reset Settings:", newSettings);
    
    for (var member in settings) delete settings[member];
    _.assign(settings, newSettings);
    
    $("#TWFAP-txtarea-settings").val(JSON.stringify(settings));
  });
  
  appendTotalResCol();
  
}