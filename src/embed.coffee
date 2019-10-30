debug = require('debug') 'loopback:mixin:embed'

HttpError = require 'standard-http-error'

{ singularize } = require 'inflection'
{ ValidationError } = require 'loopback-datasource-juggler/lib/validations'

async = require 'async'

module.exports = (Model, options) ->
  relations = options.relations
  props = Model.settings.relations

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
    '$each'
    '$bit'
  ]

  class Errors
    constructor: ->
      @codes = {}

    add: (field, message, code = 'invalid') ->
      @[field] ?= []
      @[field].push message

      @codes[field] ?= []
      @codes[field].push code

  Model.parseUpdateData = (base, data, operator) ->
    obj = {}

    for op in accepted when data[op]
      if op is '$push' and Array.isArray(data[op]) and data[op].length
        obj[op] = $each: data[op]
      else
        obj[op] = data[op]

      delete data[op]

    if operator is '$push' and Array.isArray(data) and data.length
      obj[operator] ?= {}
      obj[operator][base] = $each: data
    else if Object.keys(data).length > 0
      obj[operator] ?= {}

      for own key, val of data when val?
        if operator in [ '$push', 'pull' ]
          obj[operator][base] ?= {}
          obj[operator][base][key] = val
        else
          obj[operator][base + key] = val

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

  buildManyRoutes = (type, key) ->
    singular = singularize key

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
        path: "/#{ singular }"
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
        path: "/#{ singular }/:fk"
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
        path: "/#{ singular }/:fk"
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
        path: "/#{ singular }"
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
        path: "/#{ singular }/:fk"
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

  buildManyMethods = (type, key, as) ->
    model = Model.app.models[type]

    get: (filter = {}, options = {}, cb) ->
      if typeof options is 'function'
        cb = options
        options = {}

      filter.where = filter.where or {}
      filter.where.id = @id
      filter.aggregate = Model.generateAggregateFilter key

      debug 'get', @, filter

      hookState = {}

      finish = (err, instances) ->
        async.map instances, (instance, next) ->
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
      filter.where.id = @id
      filter.limit = 1
      filter.aggregate = Model.generateAggregateFilter key

      debug 'findOne', @, filter

      context =
        Model: model
        where: filter.where
        hookState: {}
        options: options

      finish = (err, instance) ->
        context.instance = instance?[0]

        model.notifyObserversOf 'loaded', context, (err, context) ->
          cb err, context.instance

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
      filter.where["#{ key }.id"] = id
      filter.where.id = @id
      filter.limit = 1
      filter.aggregate = Model.generateAggregateFilter key

      debug 'findById', @, filter

      context =
        Model: model
        where: filter.where
        hookState: {}
        options: options

      finish = (err, instance) ->
        context.instance = instance?[0]

        model.notifyObserversOf 'loaded', context, (err, context) ->
          cb err, context.instance

      Model.aggregate filter, (err, data) ->
        if err or not filter?.include
          return finish err, data

        model.include data, filter.include, finish
    updateById: (id, data, options, cb) ->
      if typeof options is 'function'
        cb = options
        options = {}

      debug 'updateById', { "#{ key }.id": id }, data

      context =
        Model: model
        where: { @id, "#{ key }.id": id }
        data: data
        hookState: {}
        isNewInstance: false
        options: options

      model.notifyObserversAround 'save', context, ((context, done) =>
        update = Model.parseUpdateData "#{ key }.$.", context.data, '$set'
        Model.update context.where, update, done
      ), cb

    create: (data, options, cb) ->
      if typeof options is 'function'
        cb = options
        options = {}

      ctor = @
      where = { @id }

      if not ctor
        return cb new HttpError 500

      { properties } = model.definition

      propertyNames = Object.keys properties

      propertyName = propertyNames.find (property) ->
        not not properties[property].id

      attr = properties[propertyName]
      name = model.getIdName()

      hookState = {}

      single = false

      if not Array.isArray data
        single = true
        data = [ data ]

      build = (obj) ->
        id = obj[name]

        if typeof attr.type is 'function'
          obj[name] = attr.type id

        inst = new model obj
        inst.parent = -> ctor

        Model: model
        where: where
        instance: inst
        hookState: hookState
        isNewInstance: true
        options: options

      notify = (phase, next) ->
        debug 'notify %s %s %o', key, phase, data

        async.map data, (item, callback) ->
          model.notifyObserversOf phase + ' save', build(item), (err, ctx = {}) ->
            callback err, ctx.instance
        , next

      finish = (err) ->
        if err
          return cb err

        notify 'after', (err, obj) ->
          if err
            return cb err

          if single
            [ obj ] = obj

          cb null, obj

      process = (err, arr) ->
        if err
          return cb err

        update = Model.parseUpdateData "#{ key }", arr, '$push'

        debug 'updating %s %o %o', key, where, update

        obj =
          Model: model
          where: where
          data: update
          hookState: hookState
          isNewInstance: true
          options: options

        model.notifyObserversOf 'persist', obj, (err, ctx = {}) ->
          if err
            return cb err

          Model.update ctx.where, ctx.data, finish

      validate = (err, arr) ->
        if err
          return cb err

        if not not props[as].options?.validate
          return process null, arr.map (inst) ->
            inst.toObject false

        debug 'validating %s %o', key, arr

        errors = undefined

        async.forEachOf arr, (inst, idx, next) ->
          inst.isValid (valid) ->
            if not valid
              id = inst[name]
              first = Object.keys(inst.errors)[0]

              if id
                msg = 'contains invalid item: `' + id + '`'
              else
                msg = 'contains invalid item at index `' + idx + '`'

              msg += ' (`' + first + '` ' + inst.errors[first] + ')'

              ctor.errors ?= new Errors
              ctor.errors.add key, msg, 'invalid'

            arr[idx] = inst.toObject false

            next()
        , ->
          if ctor.errors?
            err = new ValidationError ctor

          process err, arr

      notify 'before', validate

      return
    deleteById: (id, options, cb) ->
      if typeof options is 'function'
        cb = options
        options = {}

      update = Model.parseUpdateData "#{ key }", { id }, '$pull'

      debug 'deleteById', { @id }, update

      Model.update { @id }, update, cb
    destroyAll: (filter = {}, options, cb) ->
      if typeof options is 'function'
        cb = options
        options = {}

      debug 'destroyAll', filter.where, { $unset: "#{ key }": '' }

      filter.where ?= {}
      filter.where.id = @id

      Model.update filter.where,
        { $unset: "#{ key }": '' }
      , cb

  createEmbedManyModel = (relation) ->
    debug props, relation

    { model, property } = props[relation]

    methods = buildManyMethods model, property, relation
    routes  = buildManyRoutes model, property

    names = Object.keys methods

    names.forEach (method) ->
      key = "__#{ method }__" + relation

      fn = methods[method]
      route = routes[method]

      Model.sharedClass.resolve (define) ->
        define key, route, fn

      debug 'overwriting', key

      Model.prototype[key] = fn

  Model.once 'attached', ->

    async.forEachOf Model.app.models, (name, model, next) ->
      model._runWhenAttachedToApp next
    , ->
      process.nextTick ->
        relations.forEach createEmbedManyModel

  return
