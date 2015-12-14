/* global UI */
/* global TribalWars */

let $ = require("jquery");
let _ = require("lodash");
let log = require('loglevel').getLogger("BotOrder");

let constants = require('./../const.js');
let miner = require("./../miner");
let util = require("./../util");


class Order {
  constructor (plunderable_village, priority) {    
    this.plunderable_village = plunderable_village;
    this.priority = priority;
  }
  
  get order_button () {
    throw new Error('Not implemented.');
  }
  
  execute () { ; }
  
  simulate () { ; }
  
  get units () { throw Error("Not inplemented."); }
  
  hasEnoughUnits () { 
    return !_.isEmpty(this.units) && util.hasEnoughUnits(this.units);
  }
}
exports.Order = Order;



class TemplateOrder extends Order {
  constructor (plunderable_village, order_letter, priority) {
    if(!util.isValidOrderLetter(order_letter)) {
      throw new Error("order_letter invalid.", order_letter);
    }
    super(plunderable_village, priority);
    
    this.order_letter = order_letter.toLowerCase();
  }
  
  get order_button () {
    return this.plunderable_village.getOrderButton(this.order_letter);
  }
  
  execute () {
    if(this.hasEnoughUnits()) {
      log.trace("TemplateOrder execute", this);      
      this.order_button.click();
      return true;
    } else {
      log.trace("TemplateOrder not enough units", this);
      return false;
    } 
  }
  
  simulate () {
    log.trace("TemplateOrder simulate", this);
    
    let css_class = constants.SIMULATION_BTN_CLASS;
    this.order_button.addClass(css_class);
  }
  
  get units () {
    let templates = miner.mineTemplates(); 
    
    if(this.order_letter === "a") {
      return templates["A"];
    } else if (this.order_letter === "b") {
      return templates["B"];
    } else if (this.order_letter === "c") {
      return this.plunderable_village.template_c;
    } 
    
    throw new Error('Invalid order letter "' + this.order_letter + '".');
  }
}
exports.TemplateOrder = TemplateOrder;



class CustomOrder extends Order {
  constructor (plunderable_village, units, priority) {
    const DEFAULT_UNITS = {spear:0, sword:0, axe:0, archer:0, spy:0, light:0, marcher:0, heavy:0, ram:0, catapult:0, knight:0, snob:0, militia:0};
    
    super(plunderable_village, priority);
    
    this._units = _.defaults(units, DEFAULT_UNITS);
  }
    
  get order_button () {
    return this.plunderable_village.attack_place_button;
  }
    
  execute () {
    if(!this.hasEnoughUnits()) {
      log.trace("TemplateOrder not enough units", this);
      return false;
    } 
    
    let pv = this.plunderable_village;
    
    // Open the command popup
    var params = $.extend({ajax:'command'}, { target : pv.id } );
    
    TribalWars.get('place', params, // Send request for a command popup
      (response) => {
        let d_jq = $("<div>" + response.dialog + "</div>");
        
        // Units
        _.forIn(this.units, (v, k) => d_jq.find("#command-data-form input[name=" + k + "]").val(v));
        
        // Position
        d_jq.find("#command-data-form input[name=x]").val(pv.coordinates.x);
        d_jq.find("#command-data-form input[name=y]").val(pv.coordinates.y);
        
        let data = d_jq.find("#command-data-form").serializeArray();
        data.push({ name: "attack", value: 'l' });
        
        TribalWars.post('place', { ajax: 'confirm' }, data, // Confirm attack
          (response_confirm) => {
            let d_confirm_jq = $("<div>" + response_confirm.dialog + "</div>");
            let confirm_data = d_confirm_jq.find('#command-data-form').serializeArray();
                    
            TribalWars.post('place', { ajaxaction: 'popup_command' }, confirm_data, // Final response
              (response_final) => {
                UI.SuccessMessage(response_final.message);
                console.log(response_final);
              }
            );
          }
        );
      }
    );
    
    return true;
  }
  
  simulate () {
    log.trace("CustomOrder simulate", this);
    
    let css_class = constants.SIMULATION_BTN_CLASS;
    this.order_button.addClass(css_class);
  }
  
  get units () {
    return this._units;
  }
}
exports.CustomOrder = CustomOrder;