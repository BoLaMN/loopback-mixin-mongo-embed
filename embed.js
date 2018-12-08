var HttpError, ValidationError, async, debug, singularize,
  hasProp = {}.hasOwnProperty;

debug = require('debug')('loopback:mixin:embed');

HttpError = require('standard-http-error');

singularize = require('inflection').singularize;

ValidationError = require('loopback-datasource-juggler/lib/validations').ValidationError;

async = require('async');

module.exports = function(Model, options) {
  var Errors, accepted, buildManyMethods, buildManyRoutes, createEmbedManyModel, props, relations;
  relations = options.relations;
  props = Model.settings.relations;
  accepted = ['$currentDate', '$inc', '$max', '$min', '$mul', '$rename', '$setOnInsert', '$set', '$instance', '$unset', '$addToSet', '$pop', '$pullAll', '$pull', '$pushAll', '$push', '$each', '$bit'];
  Errors = (function() {
    function Errors() {
      this.codes = {};
    }

    Errors.prototype.add = function(field, message, code) {
      var base1;
      if (code == null) {
        code = 'invalid';
      }
      if (this[field] == null) {
        this[field] = [];
      }
      this[field].push(message);
      if ((base1 = this.codes)[field] == null) {
        base1[field] = [];
      }
      return this.codes[field].push(code);
    };

    return Errors;

  })();
  Model.parseUpdateData = function(base, data, operator) {
    var base1, i, key, len, obj, op, val;
    obj = {};
    for (i = 0, len = accepted.length; i < len; i++) {
      op = accepted[i];
      if (!data[op]) {
        continue;
      }
      if (op === '$push' && Array.isArray(data[op]) && data[op].length) {
        obj[op] = {
          $each: data[op]
        };
      } else {
        obj[op] = data[op];
      }
      delete data[op];
    }
    if (operator === '$push' && Array.isArray(data) && data.length) {
      if (obj[operator] == null) {
        obj[operator] = {};
      }
      obj[operator][base] = {
        $each: data
      };
    } else if (Object.keys(data).length > 0) {
      if (obj[operator] == null) {
        obj[operator] = {};
      }
      for (key in data) {
        if (!hasProp.call(data, key)) continue;
        val = data[key];
        if (val != null) {
          if (operator === '$push' || operator === 'pull') {
            if ((base1 = obj[operator])[base] == null) {
              base1[base] = {};
            }
            obj[operator][base][key] = val;
          } else {
            obj[operator][base + key] = val;
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
  buildManyRoutes = function(type, key) {
    var singular;
    singular = singularize(key);
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
          path: "/" + singular
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
          path: "/" + singular + "/:fk"
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
          path: "/" + singular + "/:fk"
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
          path: "/" + singular
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
          path: "/" + singular + "/:fk"
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
  buildManyMethods = function(type, key, as) {
    var model;
    model = Model.app.models[type];
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
        filter.where.id = this.id;
        filter.aggregate = Model.generateAggregateFilter(key);
        debug('get', this, filter);
        hookState = {};
        finish = function(err, instances) {
          return async.map(instances, function(instance, next) {
            var context;
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
        filter.where.id = this.id;
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
          context.instance = instance != null ? instance[0] : void 0;
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
        filter.where[key + ".id"] = id;
        filter.where.id = this.id;
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
          context.instance = instance != null ? instance[0] : void 0;
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
      },
      updateById: function(id, data, options, cb) {
        var context, obj1, obj2;
        if (typeof options === 'function') {
          cb = options;
          options = {};
        }
        debug('updateById', (
          obj1 = {},
          obj1[key + ".id"] = id,
          obj1
        ), data);
        context = {
          Model: model,
          where: (
            obj2 = {
              id: this.id
            },
            obj2[key + ".id"] = id,
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
            update = Model.parseUpdateData(key + ".$.", context.data, '$set');
            return Model.update(context.where, update, done);
          };
        })(this)), cb);
      },
      create: function(data, options, cb) {
        var attr, build, ctor, finish, hookState, name, notify, process, properties, propertyName, propertyNames, single, validate, where;
        if (typeof options === 'function') {
          cb = options;
          options = {};
        }
        ctor = this;
        where = {
          id: this.id
        };
        if (!ctor) {
          return cb(new HttpError(500));
        }
        properties = model.definition.properties;
        propertyNames = Object.keys(properties);
        propertyName = propertyNames.find(function(property) {
          return !!properties[property].id;
        });
        attr = properties[propertyName];
        name = model.getIdName();
        hookState = {};
        single = false;
        if (!Array.isArray(data)) {
          single = true;
          data = [data];
        }
        build = function(obj) {
          var id, inst;
          id = obj[name];
          if (typeof attr.type === 'function') {
            obj[name] = attr.type(id);
          }
          inst = new model(obj);
          inst.parent = function() {
            return ctor;
          };
          return {
            Model: model,
            where: where,
            instance: inst,
            hookState: hookState,
            isNewInstance: true,
            options: options
          };
        };
        notify = function(phase, next) {
          debug('notify %s %s %o', key, phase, data);
          return async.map(data, function(item, callback) {
            return model.notifyObserversOf(phase + ' save', build(item), function(err, ctx) {
              if (ctx == null) {
                ctx = {};
              }
              return callback(err, ctx.instance);
            });
          }, next);
        };
        finish = function(err) {
          if (err) {
            return cb(err);
          }
          return notify('after', function(err, obj) {
            if (err) {
              return cb(err);
            }
            if (single) {
              obj = obj[0];
            }
            return cb(null, obj);
          });
        };
        process = function(err, arr) {
          var update;
          if (err) {
            return cb(err);
          }
          update = Model.parseUpdateData("" + key, arr, '$push');
          debug('updating %s %o %o', key, where, update);
          return Model.update(where, update, finish);
        };
        validate = function(err, arr) {
          var errors, ref;
          if (err) {
            return cb(err);
          }
          if (!!((ref = props[as].options) != null ? ref.validate : void 0)) {
            return process(null, arr.map(function(inst) {
              return inst.toObject(false);
            }));
          }
          debug('validating %s %o', key, arr);
          errors = void 0;
          return async.forEachOf(arr, function(inst, idx, next) {
            return inst.isValid(function(valid) {
              var first, id, msg;
              if (!valid) {
                id = inst[name];
                first = Object.keys(inst.errors)[0];
                if (id) {
                  msg = 'contains invalid item: `' + id + '`';
                } else {
                  msg = 'contains invalid item at index `' + idx + '`';
                }
                msg += ' (`' + first + '` ' + inst.errors[first] + ')';
                if (ctor.errors == null) {
                  ctor.errors = new Errors;
                }
                ctor.errors.add(key, msg, 'invalid');
              }
              arr[idx] = inst.toObject(false);
              return next();
            });
          }, function() {
            if (ctor.errors != null) {
              err = new ValidationError(ctor);
            }
            return process(err, arr);
          });
        };
        notify('before', validate);
      },
      deleteById: function(id, options, cb) {
        var update;
        if (typeof options === 'function') {
          cb = options;
          options = {};
        }
        update = Model.parseUpdateData("" + key, {
          id: id
        }, '$pull');
        debug('deleteById', {
          id: this.id
        }, update);
        return Model.update({
          id: this.id
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
        filter.where.id = this.id;
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
  createEmbedManyModel = function(relation) {
    var methods, model, names, property, ref, routes;
    debug(props, relation);
    ref = props[relation], model = ref.model, property = ref.property;
    methods = buildManyMethods(model, property, relation);
    routes = buildManyRoutes(model, property);
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
      return Model.prototype[key] = fn;
    });
  };
  Model.once('attached', function() {
    return async.forEachOf(Model.app.models, function(name, model, next) {
      return model._runWhenAttachedToApp(next);
    }, function() {
      return process.nextTick(function() {
        return relations.forEach(createEmbedManyModel);
      });
    });
  });
};
