var eql, get, parent, service, type,
  hasProp = {}.hasOwnProperty;

parent = function(obj, key, init) {
  var i, pieces, ret;
  if (~key.indexOf('.')) {
    pieces = key.split('.');
    ret = obj;
    i = 0;
    while (i < pieces.length - 1) {
      if (type(ret) === 'array') {
        ret = ret[pieces[i]];
      } else if ('object' === type(ret)) {
        if (init && !ret.hasOwnProperty(pieces[i])) {
          ret[pieces[i]] = {};
        }
        if (ret) {
          ret = ret[pieces[i]];
        }
      }
      i++;
    }
    return ret;
  } else {
    return obj;
  }
};

get = function(obj, path) {
  var key, par, ref;
  if (~path.indexOf('.')) {
    par = parent(obj, path);
    key = path.split('.').pop();
    if ((ref = type(par)) === 'object' || ref === 'array') {
      return par[key];
    }
  } else {
    return obj[path];
  }
};

type = function(val) {
  var isBuffer, toString;
  toString = Object.prototype.toString;
  isBuffer = function(obj) {
    return !!(obj !== null && (obj._isBuffer || obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)));
  };
  switch (toString.call(val)) {
    case '[object Date]':
      return 'date';
    case '[object RegExp]':
      return 'regexp';
    case '[object Arguments]':
      return 'arguments';
    case '[object Array]':
      return 'array';
    case '[object Error]':
      return 'error';
  }
  if (val === null) {
    return 'null';
  }
  if (val === void 0) {
    return 'undefined';
  }
  if (val !== val) {
    return 'nan';
  }
  if (val && val.nodeType === 1) {
    return 'element';
  }
  if (isBuffer(val)) {
    return 'buffer';
  }
  val = val.valueOf ? val.valueOf() : Object.prototype.valueOf.apply(val);
  return typeof val;
};

eql = function(matcher, val) {
  var i, j, keys, len, match;
  if ((matcher != null ? matcher._bsontype : void 0) && (val != null ? val._bsontype : void 0)) {
    return matcher.equals(val);
  }
  matcher = matcher != null ? typeof matcher.toString === "function" ? matcher.toString() : void 0 : void 0;
  val = val != null ? typeof val.toString === "function" ? val.toString() : void 0 : void 0;
  switch (type(matcher)) {
    case 'null':
    case 'undefined':
      return null === val || val === void 0;
    case 'regexp':
      return matcher.test(val);
    case 'array':
      if ('array' === type(val) && matcher.length === val.length) {
        for (i = j = 0, len = matcher.length; j < len; i = ++j) {
          match = matcher[i];
          if (!eql(val[i], match)) {
            return false;
          }
        }
        return true;
      } else {
        return false;
      }
      break;
    case 'object':
      keys = {};
      for (i in matcher) {
        if (!hasProp.call(matcher, i)) continue;
        if (!val.hasOwnProperty(i) || !eql(matcher[i], val[i])) {
          return false;
        }
        keys[i] = true;
      }
      for (i in val) {
        if (!hasProp.call(val, i)) continue;
        if (!keys.hasOwnProperty(i)) {
          return false;
        }
      }
      return true;
    default:
      return matcher === val;
  }
};

module.exports = service = {
  filter: function(o, where) {
    var check, compare, debug, filter, ops, types;
    if (o == null) {
      o = {};
    }
    debug = require('debug')('loopback:filter:match');
    types = {
      1: 'number',
      2: 'string',
      3: 'object',
      4: 'array',
      5: 'buffer',
      6: 'undefined',
      8: 'boolean',
      9: 'date',
      10: 'null',
      11: 'regexp',
      13: 'function',
      16: 'number',
      18: 'number'
    };
    filter = function(obj, query) {
      var i, ii, key, keys, matches, prefix, q, ret, search, subset, target, val;
      if (obj == null) {
        obj = {};
      }
      ret = {};
      for (key in query) {
        if (!hasProp.call(query, key)) continue;
        val = query[key];
        keys = key.split('.');
        target = obj;
        matches = [];
        i = 0;
        walk_keys: //;
        while (i < keys.length) {
          target = target[keys[i]];
          switch (type(target)) {
            case 'array':
              prefix = keys.slice(0, i + 1).join('.');
              search = keys.slice(i + 1).join('.');
              debug('searching array "%s"', prefix);
              if (val.$size && !search.length) {
                return compare(val, target);
              }
              subset = ret[prefix] || target;
              ii = 0;
              while (ii < subset.length) {
                if (search.length) {
                  q = {};
                  q[search] = val;
                  if ('object' === type(subset[ii])) {
                    debug('attempting subdoc search with query %j', q);
                  }
                  if (filter(subset[ii], q)) {
                    if (!ret[prefix] || !~ret[prefix].indexOf(subset[ii])) {
                      matches.push(subset[ii]);
                    }
                  }
                } else {
                  debug('performing simple array item search');
                  if (compare(val, subset[ii])) {
                    if (!ret[prefix] || !~ret[prefix].indexOf(subset[ii])) {
                      matches.push(subset[ii]);
                    }
                  }
                }
                ii++;
              }
              if (matches.length) {
                ret[prefix] = ret[prefix] || [];
                ret[prefix].push.apply(ret[prefix], matches);
              }
              break walk_keys;
              break;
            case 'undefined':
              return false;
            case 'object':
              if (null !== keys[i + 1]) {
                i++;
                continue;
              } else if (!compare(val, target)) {
                return false;
              }
              break;
            default:
              if (!compare(val, target)) {
                return false;
              }
          }
          i++;
        }
      }
      return ret;
    };
    ops = {
      $ne: function(matcher, val) {
        return !eql(matcher, val);
      },
      $type: function(matcher, val) {
        return type(matcher) === 'number' && type(val) === types[matcher];
      },
      $between: function(arg, val) {
        var a, e, format, isDate, isTime, parsed, s, start, stop;
        start = arg[0], stop = arg[1];
        if (~[null, void 0].indexOf(val)) {
          return false;
        }
        isDate = function(value) {
          var isoformat;
          isoformat = new RegExp(['^\\d{4}-\\d{2}-\\d{2}', '((T\\d{2}:\\d{2}(:\\d{2})?)', '(\\.\\d{1,6})?', '(Z|(\\+|-)\\d{2}:\\d{2})?)?$'].join(''));
          return typeof value === 'string' && isoformat.test(value) && !isNaN(Date.parse(value));
        };
        isTime = function(value) {
          var timeformat;
          timeformat = new RegExp(/^(\d{2}:\d{2}(:\d{2})?)$/g);
          return typeof value === 'string' && timeformat.test(value);
        };
        if (isTime(start) && isTime(stop)) {
          format = 'HH:mm:ss';
          if (typeof val === 'string') {
            parsed = moment(val).format(format);
          } else {
            parsed = val.format(format);
          }
          a = moment(parsed, format);
          e = moment(stop, format);
          s = moment(start, format);
          debug('found times', a, start, stop, a.isBetween(s, e));
          return a.isBetween(s, e);
        } else if (isDate(start) && isDate(stop)) {
          if (typeof val === 'string') {
            a = moment(val);
          } else {
            a = val;
          }
          e = moment(stop);
          s = moment(start);
          debug('found dates', a, start, stop, a.isBetween(s, e));
          return a.isBetween(s, e);
        } else {
          a = typeof val === 'number' ? val : parseFloat(val);
          return a >= start && val <= stop;
        }
      },
      $gt: function(matcher, val) {
        return type(matcher) === 'number' && val > matcher;
      },
      $gte: function(matcher, val) {
        return type(matcher) === 'number' && val >= matcher;
      },
      $lt: function(matcher, val) {
        return type(matcher) === 'number' && val < matcher;
      },
      $lte: function(matcher, val) {
        return type(matcher) === 'number' && val <= matcher;
      },
      $regex: function(matcher, val) {
        if ('regexp' !== type(matcher)) {
          matcher = new RegExp(matcher);
        }
        return matcher.test(val);
      },
      $exists: function(matcher, val) {
        if (matcher) {
          return val !== void 0;
        } else {
          return val === void 0;
        }
      },
      $in: function(matcher, val) {
        if (type(matcher) === val) {
          return false;
        }
        matcher.some(function(match) {
          return eql(match, val);
        });
        return false;
      },
      $nin: function(matcher, val) {
        return !this.$in(matcher, val);
      },
      $size: function(matcher, val) {
        return Array.isArray(val) && matcher === val.length;
      }
    };
    compare = function(matcher, val) {
      var j, key, keys, len;
      if ('object' !== type(matcher)) {
        return eql(matcher, val);
      }
      keys = Object.keys(matcher);
      if ('$' !== keys[0][0]) {
        return eql(matcher, val);
      }
      for (j = 0, len = keys.length; j < len; j++) {
        key = keys[j];
        if ('$elemMatch' === key) {
          return false !== filter(val, matcher.$elemMatch);
        } else {
          if (!ops[key](matcher[key], val)) {
            return false;
          }
        }
      }
      return true;
    };
    check = function(val) {
      return filter(obj, val);
    };
    return filter(o, where);
  },

  /**
   * Execute a query.
   *
   * Options:
   *  - `strict` only modify if query matches
   *
   * @param {Object} object to alter
   * @param {Object} query to filter modifications by
   * @param {Object} update object
   * @param {Object} options
   */
  query: function(data, query, update) {
    var debug, fn, has, index, j, key, len, log, match, mod, mods, numeric, op, pos, prefix, pull, suffix, transactions, val;
    if (data == null) {
      data = {};
    }
    if (query == null) {
      query = {};
    }
    if (update == null) {
      update = {};
    }
    debug = require('debug')('loopback:filter:update');

    /**
     * Helper for determining if an array has the given value.
     *
     * @param {Array} array
     * @param {Object} value to check
     * @return {Boolean}
     */
    has = function(array, val) {
      var i, l;
      i = 0;
      l = array.length;
      while (i < l) {
        if (eql(val, array[i])) {
          return true;
        }
        i++;
      }
      return false;
    };

    /**
     * Array#filter function generator for `$pull`/`$pullAll` operations.
     *
     * @param {Array} array of values to match
     * @param {Array} array to populate with results
     * @return {Function} that splices the array
     */
    pull = function(arr, vals, pulled) {
      var a, i, indexes, match, matcher, val;
      indexes = [];
      a = 0;
      while (a < arr.length) {
        val = arr[a];
        i = 0;
        while (i < vals.length) {
          matcher = vals[i];
          if ('object' === type(matcher)) {
            if ('object' === type(val)) {
              match = false;
              if (Object.keys(matcher).length) {
                for (i in matcher) {
                  if (matcher.hasOwnProperty(i)) {
                    if (eql(matcher[i], val[i])) {
                      match = true;
                    } else {
                      match = false;
                      break;
                    }
                  }
                }
              } else if (!Object.keys(val).length) {
                match = true;
              }
              if (match) {
                indexes.push(a);
                pulled.push(val);
                i++;
                continue;
              }
            } else {
              debug('ignoring pull match against object');
            }
          } else {
            if (eql(matcher, val)) {
              indexes.push(a);
              pulled.push(val);
              i++;
              continue;
            }
          }
          i++;
        }
        a++;
      }
      return function() {
        var index;
        i = 0;
        while (i < indexes.length) {
          index = indexes[i];
          arr.splice(index - i, 1);
          i++;
        }
      };
    };

    /**
     * Helper to determine if a value is numeric.
     *
     * @param {String|Number} value
     * @return {Boolean} true if numeric
     * @api private
     */
    numeric = function(val) {
      return 'number' === type(val) || Number(val) === val || !isNaN(val) && !isNaN(parseFloat(val));
    };
    mods = {
      $set: function(obj, path, val) {
        var key;
        key = path.split('.').pop();
        obj = parent(obj, path, true);
        switch (type(obj)) {
          case 'object':
            if (!eql(obj[key], val)) {
              return function() {
                obj[key] = val;
                return val;
              };
            }
            break;
          case 'array':
            if (numeric(key)) {
              if (!eql(obj[key], val)) {
                return function() {
                  obj[key] = val;
                  return val;
                };
              }
            } else {
              throw new Error('can\'t append to array using string field name [' + key + ']');
            }
            break;
          default:
            throw new Error('$set only supports object not ' + type(obj));
        }
      },

      /**
       * Performs an `$unset`.
       *
       * @param {Object} object to modify
       * @param {String} path to alter
       * @param {String} value to set
       * @return {Function} transaction (unless noop)
       */
      $unset: function(obj, path) {
        var key;
        key = path.split('.').pop();
        obj = parent(obj, path);
        switch (type(obj)) {
          case 'array':
          case 'object':
            if (obj.hasOwnProperty(key)) {
              return function() {
                delete obj[key];
              };
            } else {
              debug('ignoring unset of inexisting key');
            }
        }
      },

      /**
       * Performs a `$rename`.
       *
       * @param {Object} object to modify
       * @param {String} path to alter
       * @param {String} value to set
       * @return {Function} transaction (unless noop)
       */
      $rename: function(obj, path, newKey) {
        var key, p, t;
        if (path === newKey) {
          throw new Error('$rename source must differ from target');
        }
        if (0 === path.indexOf(newKey + '.')) {
          throw new Error('$rename target may not be a parent of source');
        }
        p = parent(obj, path);
        t = type(p);
        if ('object' === t) {
          key = path.split('.').pop();
          if (p.hasOwnProperty(key)) {
            return function() {
              var newp, val;
              val = p[key];
              delete p[key];
              newp = parent(obj, newKey, true);
              if ('object' === type(newp)) {
                newp[newKey.split('.').pop()] = val;
              } else {
                debug('invalid $rename target path type');
              }
              return newKey;
            };
          } else {
            debug('ignoring rename from inexisting source');
          }
        } else if ('undefined' !== t) {
          throw new Error('$rename source field invalid');
        }
      },

      /**
       * Performs an `$inc`.
       *
       * @param {Object} object to modify
       * @param {String} path to alter
       * @param {String} value to set
       * @return {Function} transaction (unless noop)
       */
      $inc: function(obj, path, inc) {
        var key;
        if ('number' !== type(inc)) {
          throw new Error('Modifier $inc allowed for numbers only');
        }
        obj = parent(obj, path, true);
        key = path.split('.').pop();
        switch (type(obj)) {
          case 'array':
          case 'object':
            if (obj.hasOwnProperty(key)) {
              if ('number' !== type(obj[key])) {
                throw new Error('Cannot apply $inc modifier to non-number');
              }
              return function() {
                obj[key] += inc;
                return inc;
              };
            } else if ('object' === type(obj) || numeric(key)) {
              return function() {
                obj[key] = inc;
                return inc;
              };
            } else {
              throw new Error('can\'t append to array using string field name [' + key + ']');
            }
            break;
          default:
            throw new Error('Cannot apply $inc modifier to non-number');
        }
      },

      /**
       * Performs an `$pop`.
       *
       * @param {Object} object to modify
       * @param {String} path to alter
       * @param {String} value to set
       * @return {Function} transaction (unless noop)
       */
      $pop: function(obj, path, val) {
        var key;
        obj = parent(obj, path);
        key = path.split('.').pop();
        switch (type(obj)) {
          case 'array':
          case 'object':
            if (obj.hasOwnProperty(key)) {
              switch (type(obj[key])) {
                case 'array':
                  if (obj[key].length) {
                    return function() {
                      if (-1 === val) {
                        return obj[key].shift();
                      } else {
                        return obj[key].pop();
                      }
                    };
                  }
                  break;
                case 'undefined':
                  debug('ignoring pop to inexisting key');
                  break;
                default:
                  throw new Error('Cannot apply $pop modifier to non-array');
              }
            } else {
              debug('ignoring pop to inexisting key');
            }
            break;
          case 'undefined':
            debug('ignoring pop to inexisting key');
        }
      },

      /**
       * Performs a `$push`.
       *
       * @param {Object} object to modify
       * @param {String} path to alter
       * @param {Object} value to push
       * @return {Function} transaction (unless noop)
       */
      $push: function(obj, path, val) {
        var key;
        obj = parent(obj, path, true);
        key = path.split('.').pop();
        switch (type(obj)) {
          case 'object':
            if (obj.hasOwnProperty(key)) {
              if ('array' === type(obj[key])) {
                return function() {
                  obj[key].push(val);
                  return val;
                };
              } else {
                throw new Error('Cannot apply $push/$pushAll modifier to non-array');
              }
            } else {
              return function() {
                obj[key] = [val];
                return val;
              };
            }
            break;
          case 'array':
            if (obj.hasOwnProperty(key)) {
              if ('array' === type(obj[key])) {
                return function() {
                  obj[key].push(val);
                  return val;
                };
              } else {
                throw new Error('Cannot apply $push/$pushAll modifier to non-array');
              }
            } else if (numeric(key)) {
              return function() {
                obj[key] = [val];
                return val;
              };
            } else {
              throw new Error('can\'t append to array using string field name [' + key + ']');
            }
        }
      },

      /**
       * Performs a `$pushAll`.
       *
       * @param {Object} object to modify
       * @param {String} path to alter
       * @param {Array} values to push
       * @return {Function} transaction (unless noop)
       */
      $pushAll: function(obj, path, val) {
        var key;
        if ('array' !== type(val)) {
          throw new Error('Modifier $pushAll/pullAll allowed for arrays only');
        }
        obj = parent(obj, path, true);
        key = path.split('.').pop();
        switch (type(obj)) {
          case 'object':
            if (obj.hasOwnProperty(key)) {
              if ('array' === type(obj[key])) {
                return function() {
                  obj[key].push.apply(obj[key], val);
                  return val;
                };
              } else {
                throw new Error('Cannot apply $push/$pushAll modifier to non-array');
              }
            } else {
              return function() {
                obj[key] = val;
                return val;
              };
            }
            break;
          case 'array':
            if (obj.hasOwnProperty(key)) {
              if ('array' === type(obj[key])) {
                return function() {
                  obj[key].push.apply(obj[key], val);
                  return val;
                };
              } else {
                throw new Error('Cannot apply $push/$pushAll modifier to non-array');
              }
            } else if (numeric(key)) {
              return function() {
                obj[key] = val;
                return val;
              };
            } else {
              throw new Error('can\'t append to array using string field name [' + key + ']');
            }
        }
      },

      /**
       * Performs a `$pull`.
       */
      $pull: function(obj, path, val) {
        var key, pulled, splice, t;
        obj = parent(obj, path, true);
        key = path.split('.').pop();
        t = type(obj);
        switch (t) {
          case 'object':
            if (obj.hasOwnProperty(key)) {
              if ('array' === type(obj[key])) {
                pulled = [];
                splice = pull(obj[key], [val], pulled);
                if (pulled.length) {
                  return function() {
                    splice();
                    return pulled;
                  };
                }
              } else {
                throw new Error('Cannot apply $pull/$pullAll modifier to non-array');
              }
            }
            break;
          case 'array':
            if (obj.hasOwnProperty(key)) {
              if ('array' === type(obj[key])) {
                pulled = [];
                splice = pull(obj[key], [val], pulled);
                if (pulled.length) {
                  return function() {
                    splice();
                    return pulled;
                  };
                }
              } else {
                throw new Error('Cannot apply $pull/$pullAll modifier to non-array');
              }
            } else {
              debug('ignoring pull to non array');
            }
            break;
          default:
            if ('undefined' !== t) {
              throw new Error('LEFT_SUBFIELD only supports Object: hello not: ' + t);
            }
        }
      },

      /**
       * Performs a `$pullAll`.
       */
      $pullAll: function(obj, path, val) {
        var key, pulled, splice, t;
        if ('array' !== type(val)) {
          throw new Error('Modifier $pushAll/pullAll allowed for arrays only');
        }
        obj = parent(obj, path, true);
        key = path.split('.').pop();
        t = type(obj);
        switch (t) {
          case 'object':
            if (obj.hasOwnProperty(key)) {
              if ('array' === type(obj[key])) {
                pulled = [];
                splice = pull(obj[key], val, pulled);
                if (pulled.length) {
                  return function() {
                    splice();
                    return pulled;
                  };
                }
              } else {
                throw new Error('Cannot apply $pull/$pullAll modifier to non-array');
              }
            }
            break;
          case 'array':
            if (obj.hasOwnProperty(key)) {
              if ('array' === type(obj[key])) {
                pulled = [];
                splice = pull(obj[key], val, pulled);
                if (pulled.length) {
                  return function() {
                    splice();
                    return pulled;
                  };
                }
              } else {
                throw new Error('Cannot apply $pull/$pullAll modifier to non-array');
              }
            } else {
              debug('ignoring pull to non array');
            }
            break;
          default:
            if ('undefined' !== t) {
              throw new Error('LEFT_SUBFIELD only supports Object: hello not: ' + t);
            }
        }
      },

      /**
       * Performs a `$addToSet`.
       *
       * @param {Object} object to modify
       * @param {String} path to alter
       * @param {Object} value to push
       * @param {Boolean} internal, true if recursing
       * @return {Function} transaction (unless noop)
       */
      $addToSet: function(obj, path, val, recursing) {
        var fn, fns, i, key, l;
        if (!recursing && 'array' === type(val.$each)) {
          fns = [];
          i = 0;
          l = val.$each.length;
          while (i < l) {
            fn = this.$addToSet(obj, path, val.$each[i], true);
            if (fn) {
              fns.push(fn);
            }
            i++;
          }
          if (fns.length) {
            return function() {
              var values;
              values = [];
              i = 0;
              while (i < fns.length) {
                values.push(fns[i]());
                i++;
              }
              return values;
            };
          } else {
            return;
          }
        }
        obj = parent(obj, path, true);
        key = path.split('.').pop();
        switch (type(obj)) {
          case 'object':
            if (obj.hasOwnProperty(key)) {
              if ('array' === type(obj[key])) {
                if (!has(obj[key], val)) {
                  return function() {
                    obj[key].push(val);
                    return val;
                  };
                }
              } else {
                throw new Error('Cannot apply $addToSet modifier to non-array');
              }
            } else {
              return function() {
                obj[key] = [val];
                return val;
              };
            }
            break;
          case 'array':
            if (obj.hasOwnProperty(key)) {
              if ('array' === type(obj[key])) {
                if (!has(obj[key], val)) {
                  return function() {
                    obj[key].push(val);
                    return val;
                  };
                }
              } else {
                throw new Error('Cannot apply $addToSet modifier to non-array');
              }
            } else if (numeric(key)) {
              return function() {
                obj[key] = [val];
                return val;
              };
            } else {
              throw new Error('can\'t append to array using string field name [' + key + ']');
            }
        }
      }
    };
    log = [];
    if (Object.keys(query).length) {
      match = service.filter(data, query);
      debug('found match', match);
    }
    transactions = [];
    for (op in update) {
      mod = update[op];
      if (!mods[op]) {
        continue;
      }
      debug('found modifier "%s"', op);
      for (key in mod) {
        val = mod[key];
        pos = key.indexOf('.$.');
        if (~pos) {
          prefix = key.substr(0, pos);
          suffix = key.substr(pos + 3);
          if (match[prefix]) {
            debug('executing "%s" %s on first match within "%s"', key, op, prefix);
            fn = mods[op](match[prefix][0], suffix, val);
            if (fn) {
              index = get(data, prefix).indexOf(match[prefix][0]);
              fn.key = prefix + '.' + index + '.' + suffix;
              fn.op = op;
              transactions.push(fn);
            }
          } else {
            debug('ignoring "%s" %s - no matches within "%s"', key, op, prefix);
          }
        } else {
          fn = mods[op](data, key, val);
          if (fn) {
            fn.key = key;
            fn.op = op;
            transactions.push(fn);
          }
        }
      }
    }
    if (transactions.length) {
      for (j = 0, len = transactions.length; j < len; j++) {
        fn = transactions[j];
        log.push({
          op: fn.op.replace('$', ''),
          key: fn.key,
          from: get(data, fn.key),
          to: fn()
        });
      }
    }
    return log;
  }
};
