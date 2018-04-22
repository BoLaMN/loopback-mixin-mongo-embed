'use strict'

embed = require './embed'

module.exports = (app) ->
  app.loopback.modelBuilder.mixins.define 'MongoEmbed', embed

  return
