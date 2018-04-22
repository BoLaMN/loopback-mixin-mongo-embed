debug = require('debug') 'loopback:mixin:embed'

{ query } = require './filter'

async = require 'async'
mongodb = require 'mongodb'

module.exports = (Model, options) ->

  props = Model.definition.settings.relations

  ObjectID = (id) ->
    if not id
      return new mongodb.ObjectID()

    if id instanceof mongodb.ObjectID
      return id

    if typeof id != 'string'
      return id

    try
      if /^[0-9a-fA-F]{24}$/.test(id)
        return new mongodb.ObjectID(id)
      else
        return id
    catch e
      return id

    return

  accepted = [
    '$currentDate'
    '$inc'
    '$max'
    '$min'
    '$mul'
    '$rename'
    '$setOnInsert'
    '$set'
    '$instance'
    '$unset'
    '$addToSet'
    '$pop'
    '$pullAll'
    '$pull'
    '$pushAll'
    '$push'
    '$bit'
  ]

  Model.parseUpdateData = (base, data, operator) ->
    obj = {}

    data = data.toObject?(false) or data 
    
    for op in accepted when data[op]
      obj[op] = data[op]
      delete data[op]

    if Object.keys(data).length > 0
      obj[operator] ?= {}

      for own key, val of data when val?
        if operator in [ '$push', '$pull' ]
          if base 
            obj[operator][base] ?= {}
            obj[operator][base][key] = val
          else 
            obj[operator][key] = val
        else
          if base 
            obj[operator][base + '.' + key] = val
          else 
            obj[operator][key] = val
    obj

  Model.generateAggregateFilter ?= (key) ->
    [
      {
        $unwind: {
            path : "$#{ key }",
            includeArrayIndex : "#{ key }.index",
            preserveNullAndEmptyArrays : false
        }
      },
      {
        $replaceRoot: {
            newRoot: "$#{ key }"
        }
      }
    ]

  overWriteEmbedModelFunctions = (type, key) ->
    model = Model.app.models[type]

    debug 'embed overwrite', model.modelName, type, key

    getInstance = (data) ->
      new model data, 
        applyDefaultValues: true 
        applySetters: false
        persisted: true 

    model.find = (filter = {}, options = {}, cb) ->
      if typeof filter is 'function'
        cb = filter
        filter = {}
        options = {}

      if typeof options is 'function'
        cb = options
        options = {}

      filter ?= {}
      filter.where ?= {}
      filter.aggregate = Model.generateAggregateFilter key

      hookState = {}

      finish = (err, instances) ->
        async.map instances, (instance, next) ->
          context =
            Model: model
            instance: getInstance instance 
            where: filter.where
            hookState: hookState
            options: options

          model.notifyObserversOf 'loaded', context, (err, context) ->
            next err, context.instance
        , cb

      Model.aggregate filter, (err, data) ->
        if err or not filter?.include
          return finish err, data

        model.include data, filter.include, finish

    model.findOne = (filter = {}, options = {}, cb) ->
      if typeof filter is 'function'
        cb = filter
        filter = {}
        options = {}

      if typeof options is 'function'
        cb = options
        options = {}

      filter ?= {}
      filter.where ?= {}
      filter.limit = 1
      filter.aggregate = Model.generateAggregateFilter key

      context =
        Model: model
        where: filter.where
        hookState: {}
        options: options

      finish = (err, instance) ->
        context.instance = getInstance instance?[0]

        model.notifyObserversOf 'loaded', context, (err, context) ->
          cb err, context.instance

      Model.aggregate filter, (err, data) ->
        if err or not filter?.include
          return finish err, data

        model.include data, filter.include, finish

    model.findById = (id, filter = {}, options = {}, cb) ->
      if typeof filter is 'function'
        cb = filter
        filter = {}
        options = {}

      if typeof options is 'function'
        cb = options
        options = {}

      filter ?= {}
      filter.where ?= {}
      filter.where["#{ key }.id"] = ObjectID id
      filter.limit = 1
      filter.aggregate = Model.generateAggregateFilter key

      context =
        Model: model
        where: filter.where
        hookState: {}
        options: options

      finish = (err, instance) ->
        context.instance = getInstance instance?[0]

        model.notifyObserversOf 'loaded', context, (err, context) ->
          cb err, context.instance

      Model.aggregate filter, (err, data) ->
        if err or not filter?.include
          return finish err, data

        model.include data, filter.include, finish

    model.updateById = (id, data, options, cb) ->
      if typeof options is 'function'
        cb = options
        options = {}

      context =
        Model: model
        where: "#{ key }.id": ObjectID id 
        data: data
        hookState: {}
        isNewInstance: false
        options: options

      model.notifyObserversAround 'save', context, ((context, done) =>
        update = Model.parseUpdateData "#{ key }.$", context.data, '$set'
        Model.update context.where, update, done
      ), cb

    model::patchAttributes = (data, options, cb) ->
      if typeof options is 'function'
        cb = options
        options = {}

      context =
        Model: model
        where: "#{ key }.id": ObjectID @id
        data: data
        hookState: {}
        isNewInstance: false
        options: options

      finish = (err) =>
        if err 
          return cb err 

        update = Model.parseUpdateData false, context.data, '$set'

        query @, context.where, update

        cb null, @

        return 

      model.notifyObserversAround 'save', context, ((context, done) =>
        update = Model.parseUpdateData "#{ key }.$", context.data, '$set'
        Model.update context.where, update, done
      ), finish

      return 

    model::destroyById = (options, cb) ->
      if typeof options is 'function'
        cb = options
        options = {}

      context =
        Model: model
        where: "#{ key }.id": ObjectID @id
        hookState: {}
        options: options

      $pull = "#{ key }": { id: ObjectID @id }

      debug 'deleteById', { "#{ key }.id": ObjectID @id }, $pull

      model.notifyObserversAround 'delete', context, ((context, done) =>
        Model.update context.where, { $pull }, done
      ), cb

    model.create = (data, options, cb) ->
      if typeof options is 'function'
        cb = options
        options = {}

      orderProductId = ObjectID data.orderProductId
      delete data.orderProductId

      debug 'create', { id: orderProductId }, data

      context =
        Model: model
        where: 
          id: orderProductId
        data: data
        hookState: {}
        isNewInstance: true
        options: options

      model.notifyObserversAround 'save', context, ((context, done) =>
        update = Model.parseUpdateData "#{ key }.$", context.data, '$push'
        Model.update context.where, update, (err) ->
          done err, data
      ), cb

    model.deleteById = (id, options, cb) ->
      if typeof options is 'function'
        cb = options
        options = {}

      context =
        Model: model
        where: "#{ key }.id": ObjectID id 
        hookState: {}
        options: options

      $pull = "#{ key }": { id: ObjectID id }

      debug 'deleteById', { "#{ key }.id": ObjectID id }, $pull

      model.notifyObserversAround 'delete', context, ((context, done) =>
        Model.update context.where, { $pull }, done
      ), cb

  buildManyRoutes = (type, key, as) ->

    get:
      isStatic: false
      accepts: [
        {
          arg: "filter"
          description: "Filter defining fields and include"
          type: "object"
          default: {}
        }
        {
          arg: "options"
          description: "options"
          type: "object"
          default: {}
        }
      ]
      returns: [
        {
          arg: 'data'
          type: type
          root: true
        }
      ]
      http:
        verb: 'get'
        path: "/#{ key }"
    findOne:
      isStatic: false
      accepts: [
        {
          arg: "filter"
          description: "Filter defining fields and include"
          type: "object"
          default: {}
        }
        {
          arg: "options"
          description: "options"
          type: "object"
          default: {}
        }
      ]
      returns: [
        {
          arg: 'data'
          type: type
          root: true
        }
      ]
      http:
        verb: 'get'
        path: "/#{ as }"
    findById:
      isStatic: false
      accepts: [
        {
          arg: "fk"
          description: "#{ type } Id"
          http:
            source: "path"
          required: true
          type: "any"
        }
        {
          arg: "filter"
          description: "Filter defining fields and include"
          type: "object"
          default: {}
        }
        {
          arg: "options"
          description: "options"
          type: "object"
          default: {}
        }
      ]
      returns: [
        {
          arg: 'data'
          type: type
          root: true
        }
      ]
      http:
        verb: 'get'
        path: "/#{ as }/:fk"
    updateById:
      isStatic: false
      accepts: [
        {
          arg: "fk"
          description: "#{ type } Id"
          http:
            source: "path"
          required: true
          type: "any"
        }
        {
          arg: "data"
          description: "Model instance data"
          http:
            source: "body"
          type: type
        }
        {
          arg: "options"
          description: "options"
          type: "object"
          default: {}
        }
      ]
      returns: [
        {
          arg: 'data'
          type: type
          root: true
        }
      ]
      http:
        verb: 'put'
        path: "/#{ as }/:fk"
    create:
      isStatic: false
      accepts: [
        {
          arg: "data"
          description: "Model instance data"
          http:
            source: "body"
          type: type
        }
        {
          arg: "options"
          description: "options"
          type: "object"
          default: {}
        }
      ]
      returns: [
        {
          arg: 'data'
          type: type
          root: true
        }
      ]
      http:
        verb: 'post'
        path: "/#{ as }"
    deleteById:
      isStatic: false
      accepts: [
        {
          arg: "fk"
          description: "#{ type } Id"
          http:
            source: "path"
          required: true
          type: "any"
        }
        {
          arg: "options"
          description: "options"
          type: "object"
          default: {}
        }
      ]
      returns: [
        {
          arg: 'data'
          type: type
          root: true
        }
      ]
      http:
        verb: 'delete'
        path: "/#{ as }/:fk"
    destroyAll:
      isStatic: false
      accepts: [
        {
          arg: "filter"
          description: "Filter defining fields and include"
          type: "object"
          default: {}
        }
        {
          arg: "options"
          description: "options"
          type: "object"
          default: {}
        }
      ]
      returns: [
        {
          arg: 'data'
          type: 'boolean'
          root: true
        }
      ]
      http:
        verb: 'delete'
        path: "/#{ key }"

  buildManyMethods = (type, key) ->
    model = Model.app.models[type]

    getInstance = (data) ->
      new model data, 
        applyDefaultValues: true 
        applySetters: false
        persisted: true 

    get: (filter = {}, options = {}, cb) ->
      if typeof options is 'function'
        cb = options
        options = {}

      filter.where = filter.where or {}
      filter.where.id = ObjectID @id
      filter.aggregate = Model.generateAggregateFilter key

      debug 'get', @, filter

      hookState = {}

      finish = (err, instances) ->
        async.map instances, (data, next) ->
          instance = getInstance data

          context =
            Model: model
            instance: instance
            where: filter.where
            hookState: hookState
            options: options

          model.notifyObserversOf 'loaded', context, (err, context) ->
            next err, context.instance
        , cb

      Model.aggregate filter, (err, data) ->
        if err or not filter?.include
          return finish err, data 

        model.include data, filter.include, finish
    findOne: (filter = {}, options, cb) ->
      if typeof options is 'function'
        cb = options
        options = {}

      filter.where = filter.where or {}
      filter.where.id = ObjectID @id
      filter.limit = 1
      filter.aggregate = Model.generateAggregateFilter key

      debug 'findOne', @, filter

      context =
        Model: model
        where: filter.where
        hookState: {}
        options: options

      finish = (err, instance) ->
        context.instance = getInstance instance?[0]  

        model.notifyObserversOf 'loaded', context, (err, context) ->
          cb err, context.instance.toObject?(false, true, true) or context.instance

      Model.aggregate filter, (err, data) ->
        if err or not filter?.include
          return finish err, data

        model.include data, filter.include, finish
    findById: (id, filter = {}, options = {}, cb) ->
      if typeof filter is 'function'
        cb = filter
        filter = {}
        options = {}

      if typeof options is 'function'
        cb = options
        options = {}

      filter.where = filter.where or {}
      filter.where["#{ key }.id"] = ObjectID id 
      filter.where.id = ObjectID @id
      filter.limit = 1
      filter.aggregate = Model.generateAggregateFilter key

      debug 'findById', @, filter

      context =
        Model: model
        where: filter.where
        hookState: {}
        options: options

      finish = (err, instance) ->
        context.instance = getInstance instance?[0] 

        model.notifyObserversOf 'loaded', context, (err, context) ->
          cb err, context.instance.toObject?(false, true, true) or context.instance

      Model.aggregate filter, (err, data) -> 
        if err or not filter?.include
          return finish err, data

        model.include data, filter.include, finish
    updateById: (id, data, options, cb) ->
      if typeof options is 'function'
        cb = options
        options = {}

      debug 'updateById', { "#{ key }.id": ObjectID id }, data

      context =
        Model: model
        where: { @id, "#{ key }.id": ObjectID id }
        data: data
        hookState: {}
        isNewInstance: false
        options: options

      model.notifyObserversAround 'save', context, ((context, done) =>
        update = Model.parseUpdateData "#{ key }.$", context.data, '$set'
        Model.update context.where, update, done
      ), cb

    create: (data = {}, options = {}, cb) ->
      if typeof options is 'function'
        cb = options; options = {}

      if typeof data is 'function'
        data = {}; options = {}; cb = data 

      debug 'create', { id: ObjectID @id }, data

      context =
        Model: model
        where: { id: ObjectID @id }
        data: data
        hookState: {}
        isNewInstance: true
        options: options

      model.notifyObserversAround 'save', context, ((context, done) =>
        update = Model.parseUpdateData "#{ key }", data, '$push'

        debug 'create.do', context.where, update

        Model.update context.where, update, (err) ->
          done err, data
      ), cb
    destroyById: (id, options, cb) ->
      if typeof options is 'function'
        cb = options
        options = {}

      update = Model.parseUpdateData "#{ key }", { id: ObjectID id }, '$pull'

      debug 'destroyById', { id: ObjectID @id }, update

      Model.update { id: ObjectID @id }, update, cb
    destroyAll: (filter = {}, options, cb) ->
      if typeof options is 'function'
        cb = options
        options = {}

      debug 'destroyAll', filter.where, { $unset: "#{ key }": '' }

      filter.where ?= {}
      filter.where.id = ObjectID @id

      Model.update filter.where,
        { $unset: "#{ key }": '' }
      , cb

  createEmbedManyModel = ({ relation, as }) ->
    debug props, relation

    { model, property } = props[relation]

    methods = buildManyMethods model, property
    routes  = buildManyRoutes model, property, as

    names = Object.keys methods

    names.forEach (method) ->
      key = "__#{ method }__" + relation

      fn = methods[method]
      route = routes[method]

      Model.sharedClass.resolve (define) ->
        define key, route, fn

      debug 'overwriting', key

      Model.prototype[key] = fn

      overWriteEmbedModelFunctions model, property

  Model.once 'attached', ->

    async.forEachOf Model.app.models, (name, model, next) ->
      model._runWhenAttachedToApp next
    , ->
      process.nextTick ->

        keys = Object.keys(Model.relations).filter (relation) ->
          not not Model.relations[relation].embed

        relations = []
        
        for relation in keys 
          relations.push
            as: Model.relations[relation].keyFrom
            relation: relation

        relations.forEach createEmbedManyModel

  return
