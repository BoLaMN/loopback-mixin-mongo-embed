'use strict';
var embed;

embed = require('./embed');

module.exports = function(app) {
  app.loopback.modelBuilder.mixins.define('MongoEmbed', embed);
};
