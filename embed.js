var async, debug, mongodb, query,
  hasProp = {}.hasOwnProperty;

debug = require('debug')('loopback:mixin:embed');

query = require('./filter').query;

async = require('async');

mongodb = require('mongodb');

module.exports = function(Model, options) {
  var ObjectID, accepted, buildManyMethods, buildManyRoutes, createEmbedManyModel, overWriteEmbedModelFunctions, props;
  props = Model.definition.settings.relations;
  ObjectID = function(id) {
    var e;
    if (!id) {
      return new mongodb.ObjectID();
    }
    if (id instanceof mongodb.ObjectID) {
      return id;
    }
    if (typeof id !== 'string') {
      return id;
    }
    try {
      if (/^[0-9a-fA-F]{24}$/.test(id)) {
        return new mongodb.ObjectID(id);
      } else {
        return id;
      }
    } catch (error) {
      e = error;
      return id;
    }
  };
  accepted = ['$currentDate', '$inc', '$max', '$min', '$mul', '$rename', '$setOnInsert', '$set', '$instance', '$unset', '$addToSet', '$pop', '$pullAll', '$pull', '$pushAll', '$push', '$bit'];
  Model.parseUpdateData = function(base, data, operator) {
    var base1, i, key, len, obj, op, val;
    obj = {};
    data = (typeof data.toObject === "function" ? data.toObject(false) : void 0) || data;
    for (i = 0, len = accepted.length; i < len; i++) {
      op = accepted[i];
      if (!data[op]) {
        continue;
      }
      obj[op] = data[op];
      delete data[op];
    }
    if (Object.keys(data).length > 0) {
      if (obj[operator] == null) {
        obj[operator] = {};
      }
      for (key in data) {
        if (!hasProp.call(data, key)) continue;
        val = data[key];
        if (val != null) {
          if (operator === '$push' || operator === '$pull') {
            if (base) {
              if ((base1 = obj[operator])[base] == null) {
                base1[base] = {};
              }
              obj[operator][base][key] = val;
            } else {
              obj[operator][key] = val;
            }
          } else {
            if (base) {
              obj[operator][base + '.' + key] = val;
            } else {
              obj[operator][key] = val;
            }
          }
        }
      }
    }
    return obj;
  };
  if (Model.generateAggregateFilter == null) {
    Model.generateAggregateFilter = function(key) {
      return [
        {
          $unwind: {
            path: "$" + key,
            includeArrayIndex: key + ".index",
            preserveNullAndEmptyArrays: false
          }
        }, {
          $replaceRoot: {
            newRoot: "$" + key
          }
        }
      ];
    };
  }
  overWriteEmbedModelFunctions = function(type, key) {
    var getInstance, model;
    model = Model.app.models[type];
    debug('embed overwrite', model.modelName, type, key);
    getInstance = function(data) {
      return new model(data, {
        applyDefaultValues: true,
        applySetters: false,
        persisted: true
      });
    };
    model.find = function(filter, options, cb) {
      var finish, hookState;
      if (filter == null) {
        filter = {};
      }
      if (options == null) {
        options = {};
      }
      if (typeof filter === 'function') {
        cb = filter;
        filter = {};
        options = {};
      }
      if (typeof options === 'function') {
        cb = options;
        options = {};
      }
      if (filter == null) {
        filter = {};
      }
      if (filter.where == null) {
        filter.where = {};
      }
      filter.aggregate = Model.generateAggregateFilter(key);
      hookState = {};
      finish = function(err, instances) {
        return async.map(instances, function(instance, next) {
          var context;
          context = {
            Model: model,
            instance: getInstance(instance),
            where: filter.where,
            hookState: hookState,
            options: options
          };
          return model.notifyObserversOf('loaded', context, function(err, context) {
            return next(err, context.instance);
          });
        }, cb);
      };
      return Model.aggregate(filter, function(err, data) {
        if (err || !(filter != null ? filter.include : void 0)) {
          return finish(err, data);
        }
        return model.include(data, filter.include, finish);
      });
    };
    model.findOne = function(filter, options, cb) {
      var context, finish;
      if (filter == null) {
        filter = {};
      }
      if (options == null) {
        options = {};
      }
      if (typeof filter === 'function') {
        cb = filter;
        filter = {};
        options = {};
      }
      if (typeof options === 'function') {
        cb = options;
        options = {};
      }
      if (filter == null) {
        filter = {};
      }
      if (filter.where == null) {
        filter.where = {};
      }
      filter.limit = 1;
      filter.aggregate = Model.generateAggregateFilter(key);
      context = {
        Model: model,
        where: filter.where,
        hookState: {},
        options: options
      };
      finish = function(err, instance) {
        context.instance = getInstance(instance != null ? instance[0] : void 0);
        return model.notifyObserversOf('loaded', context, function(err, context) {
          return cb(err, context.instance);
        });
      };
      return Model.aggregate(filter, function(err, data) {
        if (err || !(filter != null ? filter.include : void 0)) {
          return finish(err, data);
        }
        return model.include(data, filter.include, finish);
      });
    };
    model.findById = function(id, filter, options, cb) {
      var context, finish;
      if (filter == null) {
        filter = {};
      }
      if (options == null) {
        options = {};
      }
      if (typeof filter === 'function') {
        cb = filter;
        filter = {};
        options = {};
      }
      if (typeof options === 'function') {
        cb = options;
        options = {};
      }
      if (filter == null) {
        filter = {};
      }
      if (filter.where == null) {
        filter.where = {};
      }
      filter.where[key + ".id"] = ObjectID(id);
      filter.limit = 1;
      filter.aggregate = Model.generateAggregateFilter(key);
      context = {
        Model: model,
        where: filter.where,
        hookState: {},
        options: options
      };
      finish = function(err, instance) {
        context.instance = getInstance(instance != null ? instance[0] : void 0);
        return model.notifyObserversOf('loaded', context, function(err, context) {
          return cb(err, context.instance);
        });
      };
      return Model.aggregate(filter, function(err, data) {
        if (err || !(filter != null ? filter.include : void 0)) {
          return finish(err, data);
        }
        return model.include(data, filter.include, finish);
      });
    };
    model.updateById = function(id, data, options, cb) {
      var context, obj1;
      if (typeof options === 'function') {
        cb = options;
        options = {};
      }
      context = {
        Model: model,
        where: (
          obj1 = {},
          obj1[key + ".id"] = ObjectID(id),
          obj1
        ),
        data: data,
        hookState: {},
        isNewInstance: false,
        options: options
      };
      return model.notifyObserversAround('save', context, ((function(_this) {
        return function(context, done) {
          var update;
          update = Model.parseUpdateData(key + ".$", context.data, '$set');
          return Model.update(context.where, update, done);
        };
      })(this)), cb);
    };
    model.prototype.patchAttributes = function(data, options, cb) {
      var context, finish, obj1;
      if (typeof options === 'function') {
        cb = options;
        options = {};
      }
      context = {
        Model: model,
        where: (
          obj1 = {},
          obj1[key + ".id"] = ObjectID(this.id),
          obj1
        ),
        data: data,
        hookState: {},
        isNewInstance: false,
        options: options
      };
      finish = (function(_this) {
        return function(err) {
          var update;
          if (err) {
            return cb(err);
          }
          update = Model.parseUpdateData(false, context.data, '$set');
          query(_this, context.where, update);
          cb(null, _this);
        };
      })(this);
      model.notifyObserversAround('save', context, ((function(_this) {
        return function(context, done) {
          var update;
          update = Model.parseUpdateData(key + ".$", context.data, '$set');
          return Model.update(context.where, update, done);
        };
      })(this)), finish);
    };
    model.prototype.destroyById = function(options, cb) {
      var $pull, context, obj1, obj2, obj3;
      if (typeof options === 'function') {
        cb = options;
        options = {};
      }
      context = {
        Model: model,
        where: (
          obj1 = {},
          obj1[key + ".id"] = ObjectID(this.id),
          obj1
        ),
        hookState: {},
        options: options
      };
      $pull = (
        obj2 = {},
        obj2["" + key] = {
          id: ObjectID(this.id)
        },
        obj2
      );
      debug('deleteById', (
        obj3 = {},
        obj3[key + ".id"] = ObjectID(this.id),
        obj3
      ), $pull);
      return model.notifyObserversAround('delete', context, ((function(_this) {
        return function(context, done) {
          return Model.update(context.where, {
            $pull: $pull
          }, done);
        };
      })(this)), cb);
    };
    model.create = function(data, options, cb) {
      var context, orderProductId;
      if (typeof options === 'function') {
        cb = options;
        options = {};
      }
      orderProductId = ObjectID(data.orderProductId);
      delete data.orderProductId;
      debug('create', {
        id: orderProductId
      }, data);
      context = {
        Model: model,
        where: {
          id: orderProductId
        },
        data: data,
        hookState: {},
        isNewInstance: true,
        options: options
      };
      return model.notifyObserversAround('save', context, ((function(_this) {
        return function(context, done) {
          var update;
          update = Model.parseUpdateData(key + ".$", context.data, '$push');
          return Model.update(context.where, update, function(err) {
            return done(err, data);
          });
        };
      })(this)), cb);
    };
    return model.deleteById = function(id, options, cb) {
      var $pull, context, obj1, obj2, obj3;
      if (typeof options === 'function') {
        cb = options;
        options = {};
      }
      context = {
        Model: model,
        where: (
          obj1 = {},
          obj1[key + ".id"] = ObjectID(id),
          obj1
        ),
        hookState: {},
        options: options
      };
      $pull = (
        obj2 = {},
        obj2["" + key] = {
          id: ObjectID(id)
        },
        obj2
      );
      debug('deleteById', (
        obj3 = {},
        obj3[key + ".id"] = ObjectID(id),
        obj3
      ), $pull);
      return model.notifyObserversAround('delete', context, ((function(_this) {
        return function(context, done) {
          return Model.update(context.where, {
            $pull: $pull
          }, done);
        };
      })(this)), cb);
    };
  };
  buildManyRoutes = function(type, key, as) {
    return {
      get: {
        isStatic: false,
        accepts: [
          {
            arg: "filter",
            description: "Filter defining fields and include",
            type: "object",
            "default": {}
          }, {
            arg: "options",
            description: "options",
            type: "object",
            "default": {}
          }
        ],
        returns: [
          {
            arg: 'data',
            type: type,
            root: true
          }
        ],
        http: {
          verb: 'get',
          path: "/" + key
        }
      },
      findOne: {
        isStatic: false,
        accepts: [
          {
            arg: "filter",
            description: "Filter defining fields and include",
            type: "object",
            "default": {}
          }, {
            arg: "options",
            description: "options",
            type: "object",
            "default": {}
          }
        ],
        returns: [
          {
            arg: 'data',
            type: type,
            root: true
          }
        ],
        http: {
          verb: 'get',
          path: "/" + as
        }
      },
      findById: {
        isStatic: false,
        accepts: [
          {
            arg: "fk",
            description: type + " Id",
            http: {
              source: "path"
            },
            required: true,
            type: "any"
          }, {
            arg: "filter",
            description: "Filter defining fields and include",
            type: "object",
            "default": {}
          }, {
            arg: "options",
            description: "options",
            type: "object",
            "default": {}
          }
        ],
        returns: [
          {
            arg: 'data',
            type: type,
            root: true
          }
        ],
        http: {
          verb: 'get',
          path: "/" + as + "/:fk"
        }
      },
      updateById: {
        isStatic: false,
        accepts: [
          {
            arg: "fk",
            description: type + " Id",
            http: {
              source: "path"
            },
            required: true,
            type: "any"
          }, {
            arg: "data",
            description: "Model instance data",
            http: {
              source: "body"
            },
            type: type
          }, {
            arg: "options",
            description: "options",
            type: "object",
            "default": {}
          }
        ],
        returns: [
          {
            arg: 'data',
            type: type,
            root: true
          }
        ],
        http: {
          verb: 'put',
          path: "/" + as + "/:fk"
        }
      },
      create: {
        isStatic: false,
        accepts: [
          {
            arg: "data",
            description: "Model instance data",
            http: {
              source: "body"
            },
            type: type
          }, {
            arg: "options",
            description: "options",
            type: "object",
            "default": {}
          }
        ],
        returns: [
          {
            arg: 'data',
            type: type,
            root: true
          }
        ],
        http: {
          verb: 'post',
          path: "/" + as
        }
      },
      deleteById: {
        isStatic: false,
        accepts: [
          {
            arg: "fk",
            description: type + " Id",
            http: {
              source: "path"
            },
            required: true,
            type: "any"
          }, {
            arg: "options",
            description: "options",
            type: "object",
            "default": {}
          }
        ],
        returns: [
          {
            arg: 'data',
            type: type,
            root: true
          }
        ],
        http: {
          verb: 'delete',
          path: "/" + as + "/:fk"
        }
      },
      destroyAll: {
        isStatic: false,
        accepts: [
          {
            arg: "filter",
            description: "Filter defining fields and include",
            type: "object",
            "default": {}
          }, {
            arg: "options",
            description: "options",
            type: "object",
            "default": {}
          }
        ],
        returns: [
          {
            arg: 'data',
            type: 'boolean',
            root: true
          }
        ],
        http: {
          verb: 'delete',
          path: "/" + key
        }
      }
    };
  };
  buildManyMethods = function(type, key) {
    var getInstance, model;
    model = Model.app.models[type];
    getInstance = function(data) {
      return new model(data, {
        applyDefaultValues: true,
        applySetters: false,
        persisted: true
      });
    };
    return {
      get: function(filter, options, cb) {
        var finish, hookState;
        if (filter == null) {
          filter = {};
        }
        if (options == null) {
          options = {};
        }
        if (typeof options === 'function') {
          cb = options;
          options = {};
        }
        filter.where = filter.where || {};
        filter.where.id = ObjectID(this.id);
        filter.aggregate = Model.generateAggregateFilter(key);
        debug('get', this, filter);
        hookState = {};
        finish = function(err, instances) {
          return async.map(instances, function(data, next) {
            var context, instance;
            instance = getInstance(data);
            context = {
              Model: model,
              instance: instance,
              where: filter.where,
              hookState: hookState,
              options: options
            };
            return model.notifyObserversOf('loaded', context, function(err, context) {
              return next(err, context.instance);
            });
          }, cb);
        };
        return Model.aggregate(filter, function(err, data) {
          if (err || !(filter != null ? filter.include : void 0)) {
            return finish(err, data);
          }
          return model.include(data, filter.include, finish);
        });
      },
      findOne: function(filter, options, cb) {
        var context, finish;
        if (filter == null) {
          filter = {};
        }
        if (typeof options === 'function') {
          cb = options;
          options = {};
        }
        filter.where = filter.where || {};
        filter.where.id = ObjectID(this.id);
        filter.limit = 1;
        filter.aggregate = Model.generateAggregateFilter(key);
        debug('findOne', this, filter);
        context = {
          Model: model,
          where: filter.where,
          hookState: {},
          options: options
        };
        finish = function(err, instance) {
          context.instance = getInstance(instance != null ? instance[0] : void 0);
          return model.notifyObserversOf('loaded', context, function(err, context) {
            var base1;
            return cb(err, (typeof (base1 = context.instance).toObject === "function" ? base1.toObject(false, true, true) : void 0) || context.instance);
          });
        };
        return Model.aggregate(filter, function(err, data) {
          if (err || !(filter != null ? filter.include : void 0)) {
            return finish(err, data);
          }
          return model.include(data, filter.include, finish);
        });
      },
      findById: function(id, filter, options, cb) {
        var context, finish;
        if (filter == null) {
          filter = {};
        }
        if (options == null) {
          options = {};
        }
        if (typeof filter === 'function') {
          cb = filter;
          filter = {};
          options = {};
        }
        if (typeof options === 'function') {
          cb = options;
          options = {};
        }
        filter.where = filter.where || {};
        filter.where[key + ".id"] = ObjectID(id);
        filter.where.id = ObjectID(this.id);
        filter.limit = 1;
        filter.aggregate = Model.generateAggregateFilter(key);
        debug('findById', this, filter);
        context = {
          Model: model,
          where: filter.where,
          hookState: {},
          options: options
        };
        finish = function(err, instance) {
          context.instance = getInstance(instance != null ? instance[0] : void 0);
          return model.notifyObserversOf('loaded', context, function(err, context) {
            var base1;
            return cb(err, (typeof (base1 = context.instance).toObject === "function" ? base1.toObject(false, true, true) : void 0) || context.instance);
          });
        };
        return Model.aggregate(filter, function(err, data) {
          if (err || !(filter != null ? filter.include : void 0)) {
            return finish(err, data);
          }
          return model.include(data, filter.include, finish);
        });
      },
      updateById: function(id, data, options, cb) {
        var context, obj1, obj2;
        if (typeof options === 'function') {
          cb = options;
          options = {};
        }
        debug('updateById', (
          obj1 = {},
          obj1[key + ".id"] = ObjectID(id),
          obj1
        ), data);
        context = {
          Model: model,
          where: (
            obj2 = {
              id: this.id
            },
            obj2[key + ".id"] = ObjectID(id),
            obj2
          ),
          data: data,
          hookState: {},
          isNewInstance: false,
          options: options
        };
        return model.notifyObserversAround('save', context, ((function(_this) {
          return function(context, done) {
            var update;
            update = Model.parseUpdateData(key + ".$", context.data, '$set');
            return Model.update(context.where, update, done);
          };
        })(this)), cb);
      },
      create: function(data, options, cb) {
        var context;
        if (data == null) {
          data = {};
        }
        if (options == null) {
          options = {};
        }
        if (typeof options === 'function') {
          cb = options;
          options = {};
        }
        if (typeof data === 'function') {
          data = {};
          options = {};
          cb = data;
        }
        debug('create', {
          id: ObjectID(this.id)
        }, data);
        context = {
          Model: model,
          where: {
            id: ObjectID(this.id)
          },
          data: data,
          hookState: {},
          isNewInstance: true,
          options: options
        };
        return model.notifyObserversAround('save', context, ((function(_this) {
          return function(context, done) {
            var update;
            update = Model.parseUpdateData("" + key, data, '$push');
            debug('create.do', context.where, update);
            return Model.update(context.where, update, function(err) {
              return done(err, data);
            });
          };
        })(this)), cb);
      },
      destroyById: function(id, options, cb) {
        var update;
        if (typeof options === 'function') {
          cb = options;
          options = {};
        }
        update = Model.parseUpdateData("" + key, {
          id: ObjectID(id)
        }, '$pull');
        debug('destroyById', {
          id: ObjectID(this.id)
        }, update);
        return Model.update({
          id: ObjectID(this.id)
        }, update, cb);
      },
      destroyAll: function(filter, options, cb) {
        var obj1, obj2;
        if (filter == null) {
          filter = {};
        }
        if (typeof options === 'function') {
          cb = options;
          options = {};
        }
        debug('destroyAll', filter.where, {
          $unset: (
            obj1 = {},
            obj1["" + key] = '',
            obj1
          )
        });
        if (filter.where == null) {
          filter.where = {};
        }
        filter.where.id = ObjectID(this.id);
        return Model.update(filter.where, {
          $unset: (
            obj2 = {},
            obj2["" + key] = '',
            obj2
          )
        }, cb);
      }
    };
  };
  createEmbedManyModel = function(arg) {
    var as, methods, model, names, property, ref, relation, routes;
    relation = arg.relation, as = arg.as;
    debug(props, relation);
    ref = props[relation], model = ref.model, property = ref.property;
    methods = buildManyMethods(model, property);
    routes = buildManyRoutes(model, property, as);
    names = Object.keys(methods);
    return names.forEach(function(method) {
      var fn, key, route;
      key = ("__" + method + "__") + relation;
      fn = methods[method];
      route = routes[method];
      Model.sharedClass.resolve(function(define) {
        return define(key, route, fn);
      });
      debug('overwriting', key);
      Model.prototype[key] = fn;
      return overWriteEmbedModelFunctions(model, property);
    });
  };
  Model.once('attached', function() {
    return async.forEachOf(Model.app.models, function(name, model, next) {
      return model._runWhenAttachedToApp(next);
    }, function() {
      return process.nextTick(function() {
        var i, keys, len, relation, relations;
        keys = Object.keys(Model.relations).filter(function(relation) {
          return !!Model.relations[relation].embed;
        });
        relations = [];
        for (i = 0, len = keys.length; i < len; i++) {
          relation = keys[i];
          relations.push({
            as: Model.relations[relation].keyFrom,
            relation: relation
          });
        }
        return relations.forEach(createEmbedManyModel);
      });
    });
  });
};
