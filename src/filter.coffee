
parent = (obj, key, init) ->
  if ~key.indexOf('.')
    pieces = key.split('.')
    ret = obj

    i = 0

    while i < pieces.length - 1
      if type(ret) is 'array' 
        ret = ret[pieces[i]]
      else if 'object' is type(ret)
        if init and not ret.hasOwnProperty(pieces[i])
          ret[pieces[i]] = {}
        if ret
          ret = ret[pieces[i]]

      i++
    ret
  else
    obj

get = (obj, path) ->
  if ~path.indexOf '.'
    par = parent(obj, path)
    key = path.split('.').pop()

    if type(par) in [ 'object', 'array' ]
      return par[key]
  else
    return obj[path]

  return

type = (val) ->
  
  toString = Object::toString

  isBuffer = (obj) ->
    not not (obj isnt null and (obj._isBuffer or obj.constructor and typeof obj.constructor.isBuffer is 'function' and obj.constructor.isBuffer(obj)))

  switch toString.call(val)
    when '[object Date]'
      return 'date'
    when '[object RegExp]'
      return 'regexp'
    when '[object Arguments]'
      return 'arguments'
    when '[object Array]'
      return 'array'
    when '[object Error]'
      return 'error'
  
  if val is null
    return 'null'
  
  if val is undefined
    return 'undefined'
  
  if val isnt val
    return 'nan'

  if val and val.nodeType is 1
    return 'element'
  
  if isBuffer(val)
    return 'buffer'
  
  val = if val.valueOf  
    val.valueOf() 
  else Object::valueOf.apply(val)
  
  typeof val

eql = (matcher, val) ->
  if matcher?._bsontype and val?._bsontype
    return matcher.equals val

  matcher = matcher?.toString?()
  val = val?.toString?()

  switch type matcher
    when 'null', 'undefined'
      return null is val or val is undefined
    when 'regexp'
      return matcher.test val
    when 'array'
      if 'array' is type(val) and matcher.length is val.length
        for match, i in matcher
          if not eql val[i], match
            return false
        return true
      else
        return false
    when 'object'
      keys = {}

      for own i of matcher
        if not val.hasOwnProperty(i) or not eql(matcher[i], val[i])
          return false
        
        keys[i] = true

      for own i of val
        if not keys.hasOwnProperty(i)
          return false
        
      return true
    else
      return matcher is val

module.exports = service =

  filter: (o = {}, where) ->

    debug = require('debug') 'loopback:filter:match'
     
    types =
      1: 'number'
      2: 'string'
      3: 'object'
      4: 'array'
      5: 'buffer'
      6: 'undefined'
      8: 'boolean'
      9: 'date'
      10: 'null'
      11: 'regexp'
      13: 'function'
      16: 'number'
      18: 'number'

    filter = (obj = {}, query) ->
      ret = {}
 
      for own key, val of query
        keys = key.split('.')
        target = obj
        
        matches = []
        
        i = 0
        
        `walk_keys: //`
        while i < keys.length
          target = target[keys[i]]
          
          switch type(target)
            when 'array'
              prefix = keys.slice(0, i + 1).join('.')
              search = keys.slice(i + 1).join('.')
              
              debug 'searching array "%s"', prefix

              if val.$size and not search.length
                return compare(val, target)

              subset = ret[prefix] or target
              
              ii = 0
              
              while ii < subset.length
                if search.length
                  q = {}
                  q[search] = val
                  
                  if 'object' is type(subset[ii])
                    debug 'attempting subdoc search with query %j', q
                  
                  if filter(subset[ii], q)
                      if not ret[prefix] or not ~ret[prefix].indexOf(subset[ii])
                        matches.push subset[ii]
                else
                  debug 'performing simple array item search'
                  
                  if compare(val, subset[ii])
                    if not ret[prefix] or not ~ret[prefix].indexOf(subset[ii])
                      matches.push subset[ii]
                
                ii++
              
              if matches.length
                ret[prefix] = ret[prefix] or []
                ret[prefix].push.apply ret[prefix], matches

              `break walk_keys`
            when 'undefined'
              return false
            when 'object'
              if null isnt keys[i + 1]
                i++
                continue
              else if not compare(val, target)
                return false
              break
            else
              if not compare(val, target)
                return false
              
          i++
          
      ret

    ops = 

      $ne: (matcher, val) ->
        not eql matcher, val

      $type: (matcher, val) ->
        type(matcher) is 'number' and 
        type(val) is types[matcher] 

      $between: ([ start, stop ], val) ->
        if ~[ null, undefined ].indexOf val 
          return false

        isDate = (value) ->
          isoformat = new RegExp [
            '^\\d{4}-\\d{2}-\\d{2}'        # Match YYYY-MM-DD
            '((T\\d{2}:\\d{2}(:\\d{2})?)'  # Match THH:mm:ss
            '(\\.\\d{1,6})?'               # Match .sssss
            '(Z|(\\+|-)\\d{2}:\\d{2})?)?$' # Time zone (Z or +hh:mm)
          ].join ''

          typeof value is 'string' and isoformat.test(value) and not isNaN(Date.parse(value))

        isTime = (value) ->
          timeformat = new RegExp /^(\d{2}:\d{2}(:\d{2})?)$/g # Match HH:mm:ss

          typeof value is 'string' and timeformat.test(value)

        if isTime(start) and isTime(stop)
          format = 'HH:mm:ss'

          if typeof val is 'string'
            parsed = moment(val).format format
          else
            parsed = val.format format

          a = moment parsed, format
          e = moment stop, format
          s = moment start, format

          debug 'found times', a, start, stop, a.isBetween s, e

          a.isBetween s, e
        else if isDate(start) and isDate(stop)
          if typeof val is 'string'
            a = moment val 
          else
            a = val 

          e = moment stop
          s = moment start

          debug 'found dates', a, start, stop, a.isBetween s, e

          a.isBetween s, e
        else
          a = if typeof val is 'number' then val else parseFloat(val)
          a >= start and val <= stop

      $gt: (matcher, val) ->
        type(matcher) is 'number' and 
        val > matcher

      $gte: (matcher, val) ->
        type(matcher) is 'number' and 
        val >= matcher

      $lt: (matcher, val) ->
        type(matcher) is 'number' and 
        val < matcher

      $lte: (matcher, val) ->
        type(matcher) is 'number' and 
        val <= matcher

      $regex: (matcher, val) ->
        if 'regexp' isnt type matcher
          matcher = new RegExp matcher
        matcher.test val

      $exists: (matcher, val) ->
        if matcher
          val isnt undefined
        else
          val is undefined

      $in: (matcher, val) ->
        if type(matcher) is val
          return false

        matcher.some (match) ->
          eql match, val

        false

      $nin: (matcher, val) ->
        not @$in matcher, val

      $size: (matcher, val) ->
        Array.isArray(val) and 
        matcher is val.length

    compare = (matcher, val) ->
      if 'object' isnt type(matcher)
        return eql(matcher, val)
      
      keys = Object.keys(matcher)
      
      if '$' isnt keys[0][0]
        return eql matcher, val

      for key in keys
        if '$elemMatch' is key
          return false isnt filter(val, matcher.$elemMatch)
        else
          if not ops[key](matcher[key], val)
            return false

      true

    check = (val) -> 
      filter obj, val

    filter o, where

  ###*
  # Execute a query.
  #
  # Options:
  #  - `strict` only modify if query matches
  #
  # @param {Object} object to alter
  # @param {Object} query to filter modifications by
  # @param {Object} update object
  # @param {Object} options
  ###

  query: (data = {}, query = {}, update = {}) ->

    debug = require('debug') 'loopback:filter:update'

    ###*
    # Helper for determining if an array has the given value.
    #
    # @param {Array} array
    # @param {Object} value to check
    # @return {Boolean}
    ###

    has = (array, val) ->
      i = 0
      l = array.length

      while i < l
        if eql(val, array[i])
          return true
        i++
      
      false

    ###*
    # Array#filter function generator for `$pull`/`$pullAll` operations.
    #
    # @param {Array} array of values to match
    # @param {Array} array to populate with results
    # @return {Function} that splices the array
    ###

    pull = (arr, vals, pulled) ->
      indexes = []
      a = 0

      while a < arr.length
        val = arr[a]
        i = 0

        while i < vals.length
          matcher = vals[i]
          
          if 'object' is type(matcher)
            if 'object' is type(val)
              match = false

              if Object.keys(matcher).length
                for i of matcher
                  if matcher.hasOwnProperty(i)
                    if eql(matcher[i], val[i])
                      match = true
                    else
                      match = false
                      break
              else if not Object.keys(val).length
                match = true

              if match
                indexes.push a
                pulled.push val

                i++
                continue
            else
              debug 'ignoring pull match against object'
          else
            if eql(matcher, val)
              indexes.push a
              pulled.push val

              i++
              continue

          i++
        a++

      ->
        i = 0
        
        while i < indexes.length
          index = indexes[i]
          arr.splice index - i, 1
        
          i++
        
        return

    ###*
    # Helper to determine if a value is numeric.
    #
    # @param {String|Number} value
    # @return {Boolean} true if numeric
    # @api private
    ###

    numeric = (val) ->
      'number' is type(val) or 
      Number(val) is val or
      not isNaN(val) and 
      not isNaN(parseFloat(val))

    mods = 

      $set: (obj, path, val) ->
        key = path.split('.').pop()
        obj = parent(obj, path, true)

        switch type(obj)
          when 'object'
            if not eql(obj[key], val)
              return ->
                obj[key] = val
                val
          when 'array'
            if numeric(key)
              if not eql(obj[key], val)
                return ->
                  obj[key] = val
                  val
            else
              throw new Error('can\'t append to array using string field name [' + key + ']')
          else
            throw new Error('$set only supports object not ' + type(obj))

        return

      ###*
      # Performs an `$unset`.
      #
      # @param {Object} object to modify
      # @param {String} path to alter
      # @param {String} value to set
      # @return {Function} transaction (unless noop)
      ###

      $unset: (obj, path) ->
        key = path.split('.').pop()
        obj = parent(obj, path)

        switch type(obj)
          when 'array', 'object'
            if obj.hasOwnProperty(key)
              return ->
                delete obj[key]
                return
            else
              debug 'ignoring unset of inexisting key'

        return

      ###*
      # Performs a `$rename`.
      #
      # @param {Object} object to modify
      # @param {String} path to alter
      # @param {String} value to set
      # @return {Function} transaction (unless noop)
      ###

      $rename: (obj, path, newKey) ->
        if path is newKey
          throw new Error('$rename source must differ from target')

        if 0 is path.indexOf(newKey + '.')
          throw new Error('$rename target may not be a parent of source')
        
        p = parent(obj, path)
        t = type(p)
        
        if 'object' is t
          key = path.split('.').pop()

          if p.hasOwnProperty(key)
            return ->
              val = p[key]
              delete p[key]
              newp = parent(obj, newKey, true)

              if 'object' is type(newp)
                newp[newKey.split('.').pop()] = val
              else
                debug 'invalid $rename target path type'
              newKey
          else
            debug 'ignoring rename from inexisting source'
        else if 'undefined' isnt t
          throw new Error('$rename source field invalid')

        return

      ###*
      # Performs an `$inc`.
      #
      # @param {Object} object to modify
      # @param {String} path to alter
      # @param {String} value to set
      # @return {Function} transaction (unless noop)
      ###

      $inc: (obj, path, inc) ->
        if 'number' isnt type(inc)
          throw new Error('Modifier $inc allowed for numbers only')
        
        obj = parent(obj, path, true)
        key = path.split('.').pop()

        switch type(obj)
          when 'array', 'object'
            if obj.hasOwnProperty(key)
              if 'number' isnt type(obj[key])
                throw new Error('Cannot apply $inc modifier to non-number')
              return ->
                obj[key] += inc
                inc
            else if 'object' is type(obj) or numeric(key)
              return ->
                obj[key] = inc
                inc
            else
              throw new Error('can\'t append to array using string field name [' + key + ']')
          else
            throw new Error('Cannot apply $inc modifier to non-number')

        return

      ###*
      # Performs an `$pop`.
      #
      # @param {Object} object to modify
      # @param {String} path to alter
      # @param {String} value to set
      # @return {Function} transaction (unless noop)
      ###

      $pop: (obj, path, val) ->
        obj = parent(obj, path)
        key = path.split('.').pop()

        switch type(obj)
          when 'array', 'object'
            if obj.hasOwnProperty(key)
              switch type(obj[key])
                when 'array'
                  if obj[key].length
                    return ->
                      if -1 is val
                        obj[key].shift()
                      else
                        obj[key].pop()
                when 'undefined'
                  debug 'ignoring pop to inexisting key'
                else
                  throw new Error('Cannot apply $pop modifier to non-array')
            else
              debug 'ignoring pop to inexisting key'
          when 'undefined'
            debug 'ignoring pop to inexisting key'

        return

      ###*
      # Performs a `$push`.
      #
      # @param {Object} object to modify
      # @param {String} path to alter
      # @param {Object} value to push
      # @return {Function} transaction (unless noop)
      ###

      $push: (obj, path, val) ->
        obj = parent(obj, path, true)
        key = path.split('.').pop()

        switch type(obj)
          when 'object'
            if obj.hasOwnProperty(key)
              if 'array' is type(obj[key])
                return ->
                  obj[key].push val
                  val
              else
                throw new Error('Cannot apply $push/$pushAll modifier to non-array')
            else
              return ->
                obj[key] = [ val ]
                val
          when 'array'
            if obj.hasOwnProperty(key)
              if 'array' is type(obj[key])
                return ->
                  obj[key].push val
                  val
              else
                throw new Error('Cannot apply $push/$pushAll modifier to non-array')
            else if numeric(key)
              return ->
                obj[key] = [ val ]
                val
            else
              throw new Error('can\'t append to array using string field name [' + key + ']')

        return

      ###*
      # Performs a `$pushAll`.
      #
      # @param {Object} object to modify
      # @param {String} path to alter
      # @param {Array} values to push
      # @return {Function} transaction (unless noop)
      ###

      $pushAll: (obj, path, val) ->
        if 'array' isnt type(val)
          throw new Error('Modifier $pushAll/pullAll allowed for arrays only')

        obj = parent(obj, path, true)
        key = path.split('.').pop()

        switch type(obj)
          when 'object'
            if obj.hasOwnProperty(key)
              if 'array' is type(obj[key])
                return ->
                  obj[key].push.apply obj[key], val
                  val
              else
                throw new Error('Cannot apply $push/$pushAll modifier to non-array')
            else
              return ->
                obj[key] = val
                val
          when 'array'
            if obj.hasOwnProperty(key)
              if 'array' is type(obj[key])
                return ->
                  obj[key].push.apply obj[key], val
                  val
              else
                throw new Error('Cannot apply $push/$pushAll modifier to non-array')
            else if numeric(key)
              return ->
                obj[key] = val
                val
            else
              throw new Error('can\'t append to array using string field name [' + key + ']')

        return

      ###*
      # Performs a `$pull`.
      ###

      $pull: (obj, path, val) ->
        obj = parent(obj, path, true)
        key = path.split('.').pop()

        t = type(obj)

        switch t
          when 'object'
            if obj.hasOwnProperty(key)
              if 'array' is type(obj[key])
                pulled = []
                splice = pull(obj[key], [ val ], pulled)

                if pulled.length
                  return ->
                    splice()
                    pulled
              else
                throw new Error('Cannot apply $pull/$pullAll modifier to non-array')
          when 'array'
            if obj.hasOwnProperty(key)
              if 'array' is type(obj[key])
                pulled = []
                splice = pull(obj[key], [ val ], pulled)

                if pulled.length
                  return ->
                    splice()
                    pulled
              else
                throw new Error('Cannot apply $pull/$pullAll modifier to non-array')
            else
              debug 'ignoring pull to non array'
          else
            if 'undefined' isnt t
              throw new Error('LEFT_SUBFIELD only supports Object: hello not: ' + t)
        
        return

      ###*
      # Performs a `$pullAll`.
      ###

      $pullAll: (obj, path, val) ->
        if 'array' isnt type(val)
          throw new Error('Modifier $pushAll/pullAll allowed for arrays only')
        
        obj = parent(obj, path, true)
        key = path.split('.').pop()
        
        t = type(obj)

        switch t
          when 'object'
            if obj.hasOwnProperty(key)
              if 'array' is type(obj[key])
                pulled = []
                splice = pull(obj[key], val, pulled)

                if pulled.length
                  return ->
                    splice()
                    pulled
              else
                throw new Error('Cannot apply $pull/$pullAll modifier to non-array')
          when 'array'
            if obj.hasOwnProperty(key)
              if 'array' is type(obj[key])
                pulled = []
                splice = pull(obj[key], val, pulled)

                if pulled.length
                  return ->
                    splice()
                    pulled
              else
                throw new Error('Cannot apply $pull/$pullAll modifier to non-array')
            else
              debug 'ignoring pull to non array'
          else
            if 'undefined' isnt t
              throw new Error('LEFT_SUBFIELD only supports Object: hello not: ' + t)
        
        return

      ###*
      # Performs a `$addToSet`.
      #
      # @param {Object} object to modify
      # @param {String} path to alter
      # @param {Object} value to push
      # @param {Boolean} internal, true if recursing
      # @return {Function} transaction (unless noop)
      ###

      $addToSet: (obj, path, val, recursing) ->
        if not recursing and 'array' is type(val.$each)
          fns = []
          
          i = 0
          l = val.$each.length
          
          while i < l
            fn = @$addToSet(obj, path, val.$each[i], true)
            
            if fn
              fns.push fn
            
            i++

          if fns.length
            return ->
              values = []
              i = 0

              while i < fns.length
                values.push fns[i]()
                i++
              
              values
          else
            return
        
        obj = parent(obj, path, true)
        key = path.split('.').pop()

        switch type(obj)
          when 'object'
            if obj.hasOwnProperty(key)
              if 'array' is type(obj[key])
                if not has(obj[key], val)
                  return ->
                    obj[key].push val
                    val
              else
                throw new Error('Cannot apply $addToSet modifier to non-array')
            else
              return ->
                obj[key] = [ val ]
                val
          when 'array'
            if obj.hasOwnProperty(key)
              if 'array' is type(obj[key])
                if not has(obj[key], val)
                  return ->
                    obj[key].push val
                    val
              else
                throw new Error('Cannot apply $addToSet modifier to non-array')
            else if numeric(key)
              return ->
                obj[key] = [ val ]
                val
            else
              throw new Error('can\'t append to array using string field name [' + key + ']')

        return

    log = []

    if Object.keys(query).length
      match = service.filter(data, query)
      debug 'found match', match

    transactions = []

    for op, mod of update when mods[op]
      debug 'found modifier "%s"', op
      
      for key, val of mod
        pos = key.indexOf '.$.'
        
        if ~pos
          prefix = key.substr 0, pos
          suffix = key.substr pos + 3
          
          if match[prefix]
            debug 'executing "%s" %s on first match within "%s"', key, op, prefix
            
            fn = mods[op] match[prefix][0], suffix, val
            
            if fn
              index = get(data, prefix).indexOf match[prefix][0]
            
              fn.key = prefix + '.' + index + '.' + suffix
              fn.op = op
            
              transactions.push fn
          else
            debug 'ignoring "%s" %s - no matches within "%s"', key, op, prefix
        else
          fn = mods[op] data, key, val

          if fn
            fn.key = key
            fn.op = op
            transactions.push fn

    if transactions.length
      for fn in transactions

        log.push
          op: fn.op.replace '$', ''
          key: fn.key
          from: get data, fn.key
          to: fn()

    log
