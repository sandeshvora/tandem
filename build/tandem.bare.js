/*! Tandem Realtime Coauthoring Engine - v0.13.3 - 2014-05-05
 *  Copyright (c) 2014
 *  Jason Chen, Salesforce.com
 *  Byron Milligan, Salesforce.com
 */

!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Tandem=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
Tandem         = _dereq_('tandem-core');
Tandem.Client  = _dereq_('./build/client/tandem');
Tandem.File    = _dereq_('./build/client/file');
Tandem.Network = {
  Adapter: _dereq_('./build/client/network/adapter')
};

module.exports = Tandem

},{"./build/client/file":2,"./build/client/network/adapter":3,"./build/client/tandem":4,"tandem-core":13}],2:[function(_dereq_,module,exports){
(function() {
  var Delta, EventEmitter2, TandemFile, initAdapterListeners, initHealthListeners, initListeners, onResync, onUpdate, sendResync, sendSync, sendUpdate, setReady, warn, _,
    __slice = [].slice,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  _ = _dereq_('lodash');

  EventEmitter2 = _dereq_('eventemitter2');

  Delta = _dereq_('tandem-core/delta');

  if (EventEmitter2.EventEmitter2 != null) {
    EventEmitter2 = EventEmitter2.EventEmitter2;
  }

  initAdapterListeners = function() {
    return this.adapter.listen(TandemFile.routes.UPDATE, (function(_this) {
      return function(packet) {
        if (!_this.ready) {
          return;
        }
        if (packet.fileId !== _this.fileId) {
          return warn("Got update for other file", packet.fileId);
        }
        if (!_this.remoteUpdate(packet.delta, packet.version)) {
          warn("Remote update failed, requesting resync");
          return sendResync.call(_this);
        }
      };
    })(this));
  };

  initHealthListeners = function() {
    this.adapter.on(this.adapter.constructor.events.RECONNECT, (function(_this) {
      return function(transport, attempts) {
        return sendSync.call(_this);
      };
    })(this)).on(this.adapter.constructor.events.RECONNECTING, (function(_this) {
      return function(timeout, attempts) {
        if (attempts === 1) {
          return _this.emit(TandemFile.events.HEALTH, TandemFile.health.ERROR, _this.health);
        }
      };
    })(this)).on(this.adapter.constructor.events.DISCONNECT, (function(_this) {
      return function() {
        return _this.emit(TandemFile.events.HEALTH, TandemFile.health.ERROR, _this.health);
      };
    })(this)).on(this.adapter.constructor.events.ERROR, (function(_this) {
      return function() {
        var args;
        args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
        _this.emit.apply(_this, [TandemFile.events.ERROR].concat(__slice.call(args)));
        return _this.emit(TandemFile.events.HEALTH, TandemFile.health.ERROR, _this.health);
      };
    })(this));
    return this.on(TandemFile.events.HEALTH, (function(_this) {
      return function(newHealth, oldHealth) {
        return _this.health = newHealth;
      };
    })(this));
  };

  initListeners = function() {
    initAdapterListeners.call(this);
    return initHealthListeners.call(this);
  };

  onResync = function(response) {
    var decomposed, delta;
    delta = Delta.makeDelta(response.head);
    decomposed = delta.decompose(this.arrived);
    this.remoteUpdate(decomposed, response.version);
    return this.emit(TandemFile.events.HEALTH, TandemFile.health.HEALTHY, this.health);
  };

  onUpdate = function(response) {
    this.version = response.version;
    this.arrived = this.arrived.compose(this.inFlight);
    this.inFlight = Delta.getIdentity(this.arrived.endLength);
    return sendUpdateIfReady.call(this);
  };

  sendResync = function(callback) {
    this.emit(TandemFile.events.HEALTH, TandemFile.health.WARNING, this.health);
    return this.send(TandemFile.routes.RESYNC, {}, (function(_this) {
      return function(response) {
        onResync.call(_this, response);
        if (callback != null) {
          return callback();
        }
      };
    })(this));
  };

  sendSync = function(callback) {
    return this.send(TandemFile.routes.SYNC, {
      version: this.version
    }, (function(_this) {
      return function(response) {
        if (_.isFunction(callback)) {
          callback(response.error, _this);
          _this.emit(TandemFile.events.OPEN, response.error, _this);
        }
        if (response.error != null) {
          return;
        }
        _this.emit(TandemFile.events.HEALTH, TandemFile.health.HEALTHY, _this.health);
        if (response.resync) {
          _this.ready = false;
          warn("Sync requesting resync");
          return onResync.call(_this, response);
        } else if (_this.remoteUpdate(response.delta, response.version)) {
          return setReady.call(_this, response.delta, response.version, false);
        } else {
          warn("Remote update failed on sync, requesting resync");
          return sendResync.call(_this, function() {
            return setReady.call(_this, response.delta, response.version, true);
          });
        }
      };
    })(this), true);
  };

  sendUpdate = function() {
    var packet, updateTimeout;
    packet = {
      delta: this.inFlight,
      version: this.version
    };
    updateTimeout = setTimeout((function(_this) {
      return function() {
        warn('Update taking over 10s to respond');
        return _this.emit(TandemFile.events.HEALTH, TandemFile.health.WARNING, _this.health);
      };
    })(this), 10000);
    return this.send(TandemFile.routes.UPDATE, packet, (function(_this) {
      return function(response) {
        clearTimeout(updateTimeout);
        if (response.error) {
          _.each(_this.updateCallbacks.inFlight, function(callback) {
            return callback.call(_this, response.error);
          });
          _this.sendIfReady();
          return;
        }
        if (_this.health !== TandemFile.health.HEALTHY) {
          _this.emit(TandemFile.events.HEALTH, TandemFile.health.HEALTHY, _this.health);
        }
        if (response.resync) {
          warn("Update requesting resync", _this.id, packet, response);
          onResync.call(_this, response);
          return sendUpdate.call(_this);
        } else {
          _this.version = response.version;
          _this.arrived = _this.arrived.compose(_this.inFlight);
          _this.inFlight = Delta.getIdentity(_this.arrived.endLength);
          _.each(_this.updateCallbacks.inFlight, function(callback) {
            return callback.call(_this, null, _this.arrived);
          });
          return _this.sendIfReady();
        }
      };
    })(this));
  };

  setReady = function(delta, version, resend) {
    if (resend == null) {
      resend = false;
    }
    this.ready = true;
    if (resend && !this.inFlight.isIdentity()) {
      sendUpdate.call(this);
    }
    return this.emit(TandemFile.events.READY, delta, version);
  };

  warn = function() {
    var args;
    args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    if ((typeof console !== "undefined" && console !== null ? console.warn : void 0) == null) {
      return;
    }
    if (_.isFunction(console.warn.apply)) {
      return console.warn.apply(console, args);
    } else {
      return console.warn(args);
    }
  };

  TandemFile = (function(_super) {
    __extends(TandemFile, _super);

    TandemFile.events = {
      ERROR: 'file-error',
      HEALTH: 'file-health',
      OPEN: 'file-open',
      READY: 'file-ready',
      UPDATE: 'file-update'
    };

    TandemFile.health = {
      HEALTHY: 'healthy',
      WARNING: 'warning',
      ERROR: 'error'
    };

    TandemFile.routes = {
      BROADCAST: 'broadcast',
      RESYNC: 'ot/resync',
      SYNC: 'ot/sync',
      UPDATE: 'ot/update'
    };

    function TandemFile(fileId, adapter, initial, callback) {
      this.fileId = fileId;
      this.adapter = adapter;
      if ((callback == null) && _.isFunction(initial)) {
        callback = initial;
        initial = {};
      }
      if (initial == null) {
        initial = {};
      }
      this.id = _.uniqueId('file-');
      this.health = TandemFile.health.WARNING;
      this.ready = false;
      this.version = initial.version || 0;
      this.arrived = initial.head || Delta.getInitial('');
      this.inFlight = Delta.getIdentity(this.arrived.endLength);
      this.inLine = Delta.getIdentity(this.arrived.endLength);
      this.updateCallbacks = {
        inFlight: [],
        inLine: []
      };
      if (this.adapter.ready) {
        this.emit(TandemFile.events.HEALTH, TandemFile.health.HEALTHY, this.health);
        sendSync.call(this, callback);
      } else {
        this.adapter.once(this.adapter.constructor.events.READY, (function(_this) {
          return function() {
            _this.emit(TandemFile.events.HEALTH, TandemFile.health.HEALTHY, _this.health);
            return sendSync.call(_this, callback);
          };
        })(this));
      }
      initListeners.call(this);
    }

    TandemFile.prototype.broadcast = function(type, packet, callback) {
      packet = _.clone(packet);
      packet.type = type;
      return this.adapter.send(TandemFile.routes.BROADCAST, packet, callback);
    };

    TandemFile.prototype.close = function() {
      this.adapter.close();
      return this.removeAllListeners();
    };

    TandemFile.prototype.isDirty = function() {
      return !this.inFlight.isIdentity() || !this.inLine.isIdentity();
    };

    TandemFile.prototype.remoteUpdate = function(delta, version) {
      var flightDeltaTranform, textTransform;
      this.version = version;
      delta = Delta.makeDelta(delta);
      if (this.arrived.canCompose(delta)) {
        this.arrived = this.arrived.compose(delta);
        flightDeltaTranform = delta.transform(this.inFlight, false);
        textTransform = flightDeltaTranform.transform(this.inLine, false);
        this.inFlight = this.inFlight.transform(delta, true);
        this.inLine = this.inLine.transform(flightDeltaTranform, true);
        this.emit(TandemFile.events.UPDATE, textTransform);
        return true;
      } else {
        return false;
      }
    };

    TandemFile.prototype.update = function(delta, callback) {
      if (this.inLine.canCompose(delta)) {
        this.inLine = this.inLine.compose(delta);
        return this.sendIfReady(callback);
      } else {
        this.emit(TandemFile.events.ERROR, 'Cannot compose inLine with local delta', this.inLine, delta);
        warn("Local update error, attempting resync", this.id, this.inLine, this.delta);
        return sendResync.call(this);
      }
    };

    TandemFile.prototype.send = function(route, packet, callback, priority) {
      if (callback == null) {
        callback = null;
      }
      if (priority == null) {
        priority = false;
      }
      return this.adapter.queue(route, packet, (function(_this) {
        return function(response) {
          if (response.error != null) {
            _this.emit(TandemFile.events.ERROR, response.error);
          }
          if (callback != null) {
            return callback(response);
          }
        };
      })(this), priority);
    };

    TandemFile.prototype.sendIfReady = function(callback) {
      if (callback != null) {
        this.updateCallbacks.inLine.push(callback);
      }
      if (this.inFlight.isIdentity() && !this.inLine.isIdentity()) {
        this.inFlight = this.inLine;
        this.inLine = Delta.getIdentity(this.inFlight.endLength);
        this.updateCallbacks.inFlight = this.updateCallbacks.inLine;
        this.updateCallbacks.inLine = [];
        sendUpdate.call(this);
        return true;
      }
      return false;
    };

    TandemFile.prototype.transform = function(indexes) {};

    return TandemFile;

  })(EventEmitter2);

  module.exports = TandemFile;

}).call(this);

},{"eventemitter2":false,"lodash":false,"tandem-core/delta":12}],3:[function(_dereq_,module,exports){
(function() {
  var EventEmitter2, TandemNetworkAdapter, async,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    __slice = [].slice;

  async = _dereq_('async');

  EventEmitter2 = _dereq_('eventemitter2');

  if (EventEmitter2.EventEmitter2 != null) {
    EventEmitter2 = EventEmitter2.EventEmitter2;
  }

  TandemNetworkAdapter = (function(_super) {
    __extends(TandemNetworkAdapter, _super);

    TandemNetworkAdapter.events = {
      DISCONNECT: 'adapter-disconnect',
      ERROR: 'adapter-error',
      READY: 'adapter-ready',
      RECONNECT: 'adapter-reconnect',
      RECONNECTING: 'adapter-reconnecting'
    };

    function TandemNetworkAdapter() {
      this.ready = false;
      this.sendQueue = [];
    }

    TandemNetworkAdapter.prototype.close = function() {
      return this.removeAllListeners();
    };

    TandemNetworkAdapter.prototype.listen = function(route, callback) {
      console.warn("Should be overwritten by descendant");
      return this;
    };

    TandemNetworkAdapter.prototype.queue = function(route, packet, callback, priority) {
      if (priority == null) {
        priority = false;
      }
      if (this.ready) {
        return this.send(route, packet, callback, priority);
      } else {
        if (priority) {
          return this.sendQueue.unshift([route, packet, callback]);
        } else {
          return this.sendQueue.push([route, packet, callback]);
        }
      }
    };

    TandemNetworkAdapter.prototype.send = function(route, packet, callback) {
      return console.warn("Should be overwritten by descendant");
    };

    TandemNetworkAdapter.prototype.setReady = function() {
      this.emit(TandemNetworkAdapter.events.READY);
      return async.until((function(_this) {
        return function() {
          return _this.sendQueue.length === 0;
        };
      })(this), (function(_this) {
        return function(callback) {
          var elem, packet, route, sendCallback;
          elem = _this.sendQueue.shift();
          route = elem[0], packet = elem[1], sendCallback = elem[2];
          return _this.send(route, packet, function() {
            var args;
            args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
            if (sendCallback != null) {
              sendCallback.apply(_this, args);
            }
            return callback();
          });
        };
      })(this), (function(_this) {
        return function(err) {
          return _this.ready = true;
        };
      })(this));
    };

    return TandemNetworkAdapter;

  })(EventEmitter2);

  module.exports = TandemNetworkAdapter;

}).call(this);

},{"async":false,"eventemitter2":false}],4:[function(_dereq_,module,exports){
(function() {
  var TandemAdapter, TandemClient, TandemFile, _;

  _ = _dereq_('lodash');

  TandemFile = _dereq_('./file');

  TandemAdapter = _dereq_('./network/adapter');

  TandemClient = (function() {
    TandemClient.DEFAULTS = {
      userId: null,
      network: TandemAdapter
    };

    function TandemClient(endpointUrl, options) {
      this.endpointUrl = endpointUrl;
      this.options = options != null ? options : {};
      options = _.pick(this.options, _.keys(TandemClient.DEFAULTS));
      this.settings = _.extend({}, TandemClient.DEFAULTS, options);
      if (this.settings.userId == null) {
        this.settings.userId = 'anonymous-' + _.random(1000000);
      }
    }

    TandemClient.prototype.open = function(fileId, authObj, initial, callback) {
      this.adapter = _.isFunction(this.settings.network) ? new this.settings.network(this.endpointUrl, fileId, this.settings.userId, authObj, this.options) : this.settings.network;
      return new TandemFile(fileId, this.adapter, initial, callback);
    };

    return TandemClient;

  })();

  module.exports = TandemClient;

}).call(this);

},{"./file":2,"./network/adapter":3,"lodash":false}],5:[function(_dereq_,module,exports){
(function() {
  var Delta, InsertOp, Op, RetainOp, diff_match_patch, dmp, _;

  _ = _dereq_('lodash');

  diff_match_patch = _dereq_('./diff_match_patch');

  Op = _dereq_('./op');

  InsertOp = _dereq_('./insert');

  RetainOp = _dereq_('./retain');

  dmp = new diff_match_patch();

  Delta = (function() {
    var _insertInsertCase, _retainRetainCase;

    Delta.getIdentity = function(length) {
      return new Delta(length, length, [new RetainOp(0, length)]);
    };

    Delta.getInitial = function(contents) {
      return new Delta(0, contents.length, [new InsertOp(contents)]);
    };

    Delta.isDelta = function(delta) {
      var op, _i, _len, _ref;
      if ((delta != null) && typeof delta === "object" && typeof delta.startLength === "number" && typeof delta.endLength === "number" && typeof delta.ops === "object") {
        _ref = delta.ops;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          op = _ref[_i];
          if (!(Op.isRetain(op) || Op.isInsert(op))) {
            return false;
          }
        }
        return true;
      }
      return false;
    };

    Delta.makeDelta = function(obj) {
      return new Delta(obj.startLength, obj.endLength, _.map(obj.ops, function(op) {
        if (Op.isInsert(op)) {
          return new InsertOp(op.value, op.attributes);
        } else if (Op.isRetain(op)) {
          return new RetainOp(op.start, op.end, op.attributes);
        } else {
          return null;
        }
      }));
    };

    Delta.makeDeleteDelta = function(startLength, index, length) {
      var ops;
      ops = [];
      if (0 < index) {
        ops.push(new RetainOp(0, index));
      }
      if (index + length < startLength) {
        ops.push(new RetainOp(index + length, startLength));
      }
      return new Delta(startLength, ops);
    };

    Delta.makeInsertDelta = function(startLength, index, value, attributes) {
      var ops;
      ops = [new InsertOp(value, attributes)];
      if (0 < index) {
        ops.unshift(new RetainOp(0, index));
      }
      if (index < startLength) {
        ops.push(new RetainOp(index, startLength));
      }
      return new Delta(startLength, ops);
    };

    Delta.makeRetainDelta = function(startLength, index, length, attributes) {
      var ops;
      ops = [new RetainOp(index, index + length, attributes)];
      if (0 < index) {
        ops.unshift(new RetainOp(0, index));
      }
      if (index + length < startLength) {
        ops.push(new RetainOp(index + length, startLength));
      }
      return new Delta(startLength, ops);
    };

    function Delta(startLength, endLength, ops) {
      var length;
      this.startLength = startLength;
      this.endLength = endLength;
      this.ops = ops;
      if (this.ops == null) {
        this.ops = this.endLength;
        this.endLength = null;
      }
      this.ops = _.map(this.ops, function(op) {
        if (Op.isRetain(op)) {
          return op;
        } else if (Op.isInsert(op)) {
          return op;
        } else {
          throw new Error("Creating delta with invalid op. Expecting an insert or retain.");
        }
      });
      this.compact();
      length = _.reduce(this.ops, function(count, op) {
        return count + op.getLength();
      }, 0);
      if ((this.endLength != null) && length !== this.endLength) {
        throw new Error("Expecting end length of " + length);
      } else {
        this.endLength = length;
      }
    }

    Delta.prototype.apply = function(insertFn, deleteFn, applyAttrFn, context) {
      var index, offset, retains;
      if (insertFn == null) {
        insertFn = (function() {});
      }
      if (deleteFn == null) {
        deleteFn = (function() {});
      }
      if (applyAttrFn == null) {
        applyAttrFn = (function() {});
      }
      if (context == null) {
        context = null;
      }
      if (this.isIdentity()) {
        return;
      }
      index = 0;
      offset = 0;
      retains = [];
      _.each(this.ops, (function(_this) {
        return function(op) {
          if (Op.isInsert(op)) {
            insertFn.call(context, index + offset, op.value, op.attributes);
            return offset += op.getLength();
          } else if (Op.isRetain(op)) {
            if (op.start > index) {
              deleteFn.call(context, index + offset, op.start - index);
              offset -= op.start - index;
            }
            retains.push(new RetainOp(op.start + offset, op.end + offset, op.attributes));
            return index = op.end;
          }
        };
      })(this));
      if (this.endLength < this.startLength + offset) {
        deleteFn.call(context, this.endLength, this.startLength + offset - this.endLength);
      }
      return _.each(retains, (function(_this) {
        return function(op) {
          _.each(op.attributes, function(value, format) {
            if (value === null) {
              return applyAttrFn.call(context, op.start, op.end - op.start, format, value);
            }
          });
          return _.each(op.attributes, function(value, format) {
            if (value != null) {
              return applyAttrFn.call(context, op.start, op.end - op.start, format, value);
            }
          });
        };
      })(this));
    };

    Delta.prototype.applyToText = function(text) {
      var appliedText, delta, op, result, _i, _len, _ref;
      delta = this;
      if (text.length !== delta.startLength) {
        throw new Error("Start length of delta: " + delta.startLength + " is not equal to the text: " + text.length);
      }
      appliedText = [];
      _ref = delta.ops;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        op = _ref[_i];
        if (Op.isInsert(op)) {
          appliedText.push(op.value);
        } else {
          appliedText.push(text.substring(op.start, op.end));
        }
      }
      result = appliedText.join("");
      if (delta.endLength !== result.length) {
        throw new Error("End length of delta: " + delta.endLength + " is not equal to result text: " + result.length);
      }
      return result;
    };

    Delta.prototype.canCompose = function(delta) {
      return Delta.isDelta(delta) && this.endLength === delta.startLength;
    };

    Delta.prototype.compact = function() {
      var compacted;
      compacted = [];
      _.each(this.ops, function(op) {
        var last;
        if (op.getLength() === 0) {
          return;
        }
        if (compacted.length === 0) {
          return compacted.push(op);
        } else {
          last = _.last(compacted);
          if (Op.isInsert(last) && Op.isInsert(op) && last.attributesMatch(op)) {
            return compacted[compacted.length - 1] = new InsertOp(last.value + op.value, op.attributes);
          } else if (Op.isRetain(last) && Op.isRetain(op) && last.end === op.start && last.attributesMatch(op)) {
            return compacted[compacted.length - 1] = new RetainOp(last.start, op.end, op.attributes);
          } else {
            return compacted.push(op);
          }
        }
      });
      return this.ops = compacted;
    };

    Delta.prototype.compose = function(deltaB) {
      var composed, deltaA, opInB, opsInRange, _i, _len, _ref;
      if (!this.canCompose(deltaB)) {
        throw new Error('Cannot compose delta');
      }
      deltaA = this;
      composed = [];
      _ref = deltaB.ops;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        opInB = _ref[_i];
        if (Op.isInsert(opInB)) {
          composed.push(opInB);
        } else if (Op.isRetain(opInB)) {
          opsInRange = deltaA.getOpsAt(opInB.start, opInB.getLength());
          opsInRange = _.map(opsInRange, function(opInA) {
            if (Op.isInsert(opInA)) {
              return new InsertOp(opInA.value, opInA.composeAttributes(opInB.attributes));
            } else {
              return new RetainOp(opInA.start, opInA.end, opInA.composeAttributes(opInB.attributes));
            }
          });
          composed = composed.concat(opsInRange);
        } else {
          throw new Error('Invalid op in deltaB when composing');
        }
      }
      return new Delta(deltaA.startLength, deltaB.endLength, composed);
    };

    Delta.prototype.decompose = function(deltaA) {
      var decomposeAttributes, deltaB, deltaC, insertDelta, offset, ops;
      deltaC = this;
      if (!Delta.isDelta(deltaA)) {
        throw new Error("Decompose called when deltaA is not a Delta, type: " + typeof deltaA);
      }
      if (deltaA.startLength !== this.startLength) {
        throw new Error("startLength " + deltaA.startLength + " / startLength " + this.startLength + " mismatch");
      }
      if (!_.all(deltaA.ops, (function(op) {
        return Op.isInsert(op);
      }))) {
        throw new Error("DeltaA has retain in decompose");
      }
      if (!_.all(deltaC.ops, (function(op) {
        return Op.isInsert(op);
      }))) {
        throw new Error("DeltaC has retain in decompose");
      }
      decomposeAttributes = function(attrA, attrC) {
        var decomposedAttributes, key, value;
        decomposedAttributes = {};
        for (key in attrC) {
          value = attrC[key];
          if (attrA[key] === void 0 || attrA[key] !== value) {
            if (attrA[key] !== null && typeof attrA[key] === 'object' && value !== null && typeof value === 'object') {
              decomposedAttributes[key] = decomposeAttributes(attrA[key], value);
            } else {
              decomposedAttributes[key] = value;
            }
          }
        }
        for (key in attrA) {
          value = attrA[key];
          if (attrC[key] === void 0) {
            decomposedAttributes[key] = null;
          }
        }
        return decomposedAttributes;
      };
      insertDelta = deltaA.diff(deltaC);
      ops = [];
      offset = 0;
      _.each(insertDelta.ops, function(op) {
        var offsetC, opsInC;
        opsInC = deltaC.getOpsAt(offset, op.getLength());
        offsetC = 0;
        _.each(opsInC, function(opInC) {
          var d, offsetA, opsInA;
          if (Op.isInsert(op)) {
            d = new InsertOp(op.value.substring(offsetC, offsetC + opInC.getLength()), opInC.attributes);
            ops.push(d);
          } else if (Op.isRetain(op)) {
            opsInA = deltaA.getOpsAt(op.start + offsetC, opInC.getLength());
            offsetA = 0;
            _.each(opsInA, function(opInA) {
              var attributes, e, start;
              attributes = decomposeAttributes(opInA.attributes, opInC.attributes);
              start = op.start + offsetA + offsetC;
              e = new RetainOp(start, start + opInA.getLength(), attributes);
              ops.push(e);
              return offsetA += opInA.getLength();
            });
          } else {
            throw new Error("Invalid delta in deltaB when composing");
          }
          return offsetC += opInC.getLength();
        });
        return offset += op.getLength();
      });
      deltaB = new Delta(insertDelta.startLength, insertDelta.endLength, ops);
      return deltaB;
    };

    Delta.prototype.diff = function(other) {
      var diff, finalLength, insertDelta, operation, ops, originalLength, textA, textC, value, _i, _len, _ref, _ref1;
      _ref = _.map([this, other], function(delta) {
        return _.map(delta.ops, function(op) {
          if (op.value != null) {
            return op.value;
          } else {
            return "";
          }
        }).join('');
      }), textA = _ref[0], textC = _ref[1];
      if (!(textA === '' && textC === '')) {
        diff = dmp.diff_main(textA, textC);
        if (diff.length <= 0) {
          throw new Error("diffToDelta called with diff with length <= 0");
        }
        originalLength = 0;
        finalLength = 0;
        ops = [];
        for (_i = 0, _len = diff.length; _i < _len; _i++) {
          _ref1 = diff[_i], operation = _ref1[0], value = _ref1[1];
          switch (operation) {
            case diff_match_patch.DIFF_DELETE:
              originalLength += value.length;
              break;
            case diff_match_patch.DIFF_INSERT:
              ops.push(new InsertOp(value));
              finalLength += value.length;
              break;
            case diff_match_patch.DIFF_EQUAL:
              ops.push(new RetainOp(originalLength, originalLength + value.length));
              originalLength += value.length;
              finalLength += value.length;
          }
        }
        insertDelta = new Delta(originalLength, finalLength, ops);
      } else {
        insertDelta = new Delta(0, 0, []);
      }
      return insertDelta;
    };

    _insertInsertCase = function(elemA, elemB, indexes, aIsRemote) {
      var length, results;
      results = _.extend({}, indexes);
      length = Math.min(elemA.getLength(), elemB.getLength());
      if (aIsRemote) {
        results.transformOp = new RetainOp(results.indexA, results.indexA + length);
        results.indexA += length;
        if (length === elemA.getLength()) {
          results.elemIndexA++;
        } else if (length < elemA.getLength()) {
          results.elemA = _.last(elemA.split(length));
        } else {
          throw new Error("Invalid elem length in transform");
        }
      } else {
        results.transformOp = _.first(elemB.split(length));
        results.indexB += length;
        if (length === elemB.getLength()) {
          results.elemIndexB++;
        } else {
          results.elemB = _.last(elemB.split(length));
        }
      }
      return results;
    };

    _retainRetainCase = function(elemA, elemB, indexes) {
      var addedAttributes, elemIndexA, elemIndexB, errMsg, indexA, indexB, length, results;
      indexA = indexes.indexA, indexB = indexes.indexB, elemIndexA = indexes.elemIndexA, elemIndexB = indexes.elemIndexB;
      results = _.extend({}, indexes);
      if (elemA.end < elemB.start) {
        results.indexA += elemA.getLength();
        results.elemIndexA++;
      } else if (elemB.end < elemA.start) {
        results.indexB += elemB.getLength();
        results.elemIndexB++;
      } else {
        if (elemA.start < elemB.start) {
          results.indexA += elemB.start - elemA.start;
          elemA = results.elemA = new RetainOp(elemB.start, elemA.end, elemA.attributes);
        } else if (elemB.start < elemA.start) {
          results.indexB += elemA.start - elemB.start;
          elemB = results.elemB = new RetainOp(elemA.start, elemB.end, elemB.attributes);
        }
        errMsg = "RetainOps must have same start length in transform";
        if (elemA.start !== elemB.start) {
          throw new Error(errMsg);
        }
        length = Math.min(elemA.end, elemB.end) - elemA.start;
        addedAttributes = elemA.addAttributes(elemB.attributes);
        results.transformOp = new RetainOp(results.indexA, results.indexA + length, addedAttributes);
        results.indexA += length;
        results.indexB += length;
        if (elemA.end === elemB.end) {
          results.elemIndexA++;
          results.elemIndexB++;
        } else if (elemA.end < elemB.end) {
          results.elemIndexA++;
          results.elemB = _.last(elemB.split(length));
        } else {
          results.elemIndexB++;
          results.elemA = _.last(elemA.split(length));
        }
      }
      if (results.elemIndexA !== indexes.elemIndexA) {
        results.elemA = null;
      }
      if (results.elemIndexB !== indexes.elemIndexB) {
        results.elemB = null;
      }
      return results;
    };

    Delta.prototype.transform = function(deltaA, aIsRemote) {
      var deltaB, elemA, elemB, elemIndexA, elemIndexB, errMsg, indexA, indexB, results, transformEndLength, transformOps, transformStartLength, _applyResults, _buildIndexes;
      if (aIsRemote == null) {
        aIsRemote = false;
      }
      if (!Delta.isDelta(deltaA)) {
        errMsg = "Transform called when deltaA is not a Delta, type: ";
        throw new Error(errMsg + typeof deltaA);
      }
      deltaA = new Delta(deltaA.startLength, deltaA.endLength, deltaA.ops);
      deltaB = new Delta(this.startLength, this.endLength, this.ops);
      transformOps = [];
      indexA = indexB = 0;
      elemIndexA = elemIndexB = 0;
      _applyResults = function(results) {
        if (results.indexA != null) {
          indexA = results.indexA;
        }
        if (results.indexB != null) {
          indexB = results.indexB;
        }
        if (results.elemIndexA != null) {
          elemIndexA = results.elemIndexA;
        }
        if (results.elemIndexB != null) {
          elemIndexB = results.elemIndexB;
        }
        if (results.elemA != null) {
          deltaA.ops[elemIndexA] = results.elemA;
        }
        if (results.elemB != null) {
          deltaB.ops[elemIndexB] = results.elemB;
        }
        if (results.transformOp != null) {
          return transformOps.push(results.transformOp);
        }
      };
      _buildIndexes = function() {
        return {
          indexA: indexA,
          indexB: indexB,
          elemIndexA: elemIndexA,
          elemIndexB: elemIndexB
        };
      };
      while (elemIndexA < deltaA.ops.length && elemIndexB < deltaB.ops.length) {
        elemA = deltaA.ops[elemIndexA];
        elemB = deltaB.ops[elemIndexB];
        if (Op.isInsert(elemA) && Op.isInsert(elemB)) {
          results = _insertInsertCase(elemA, elemB, _buildIndexes(), aIsRemote);
          _applyResults(results);
        } else if (Op.isRetain(elemA) && Op.isRetain(elemB)) {
          results = _retainRetainCase(elemA, elemB, _buildIndexes());
          _applyResults(results);
        } else if (Op.isInsert(elemA) && Op.isRetain(elemB)) {
          transformOps.push(new RetainOp(indexA, indexA + elemA.getLength()));
          indexA += elemA.getLength();
          elemIndexA++;
        } else if (Op.isRetain(elemA) && Op.isInsert(elemB)) {
          transformOps.push(elemB);
          indexB += elemB.getLength();
          elemIndexB++;
        }
      }
      while (elemIndexA < deltaA.ops.length) {
        elemA = deltaA.ops[elemIndexA];
        if (Op.isInsert(elemA)) {
          transformOps.push(new RetainOp(indexA, indexA + elemA.getLength()));
        }
        indexA += elemA.getLength();
        elemIndexA++;
      }
      while (elemIndexB < deltaB.ops.length) {
        elemB = deltaB.ops[elemIndexB];
        if (Op.isInsert(elemB)) {
          transformOps.push(elemB);
        }
        indexB += elemB.getLength();
        elemIndexB++;
      }
      transformStartLength = deltaA.endLength;
      transformEndLength = _.reduce(transformOps, function(transformEndLength, op) {
        return transformEndLength + op.getLength();
      }, 0);
      return new Delta(transformStartLength, transformEndLength, transformOps);
    };

    Delta.prototype.getOpsAt = function(index, length) {
      var changes, getLength, offset, op, opLength, start, _i, _len, _ref;
      changes = [];
      if ((this.savedOpOffset != null) && this.savedOpOffset < index) {
        offset = this.savedOpOffset;
      } else {
        offset = this.savedOpOffset = this.savedOpIndex = 0;
      }
      _ref = this.ops.slice(this.savedOpIndex);
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        op = _ref[_i];
        if (offset >= index + length) {
          break;
        }
        opLength = op.getLength();
        if (index < offset + opLength) {
          start = Math.max(index - offset, 0);
          getLength = Math.min(opLength - start, index + length - offset - start);
          changes.push(op.getAt(start, getLength));
        }
        offset += opLength;
        this.savedOpIndex += 1;
        this.savedOpOffset += opLength;
      }
      return changes;
    };

    Delta.prototype.invert = function(deltaB) {
      var deltaA, deltaC, inverse;
      if (!this.isInsertsOnly()) {
        throw new Error("Invert called on invalid delta containing non-insert ops");
      }
      deltaA = this;
      deltaC = deltaA.compose(deltaB);
      inverse = deltaA.decompose(deltaC);
      return inverse;
    };

    Delta.prototype.isEqual = function(other) {
      if (!other) {
        return false;
      }
      if (this.startLength !== other.startLength || this.endLength !== other.endLength) {
        return false;
      }
      if (!_.isArray(other.ops) || this.ops.length !== other.ops.length) {
        return false;
      }
      return _.all(this.ops, function(op, i) {
        return op.isEqual(other.ops[i]);
      });
    };

    Delta.prototype.isIdentity = function() {
      var index, op, _i, _len, _ref;
      if (this.startLength === this.endLength) {
        if (this.ops.length === 0) {
          return true;
        }
        index = 0;
        _ref = this.ops;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          op = _ref[_i];
          if (!Op.isRetain(op)) {
            return false;
          }
          if (op.start !== index) {
            return false;
          }
          if (!(op.numAttributes() === 0 || (op.numAttributes() === 1 && _.has(op.attributes, 'authorId')))) {
            return false;
          }
          index = op.end;
        }
        if (index !== this.endLength) {
          return false;
        }
        return true;
      }
      return false;
    };

    Delta.prototype.isInsertsOnly = function() {
      return _.every(this.ops, function(op) {
        return Op.isInsert(op);
      });
    };

    Delta.prototype.merge = function(other) {
      var ops;
      ops = _.map(other.ops, (function(_this) {
        return function(op) {
          if (Op.isRetain(op)) {
            return new RetainOp(op.start + _this.startLength, op.end + _this.startLength, op.attributes);
          } else {
            return op;
          }
        };
      })(this));
      ops = this.ops.concat(ops);
      return new Delta(this.startLength + other.startLength, ops);
    };

    Delta.prototype.split = function(index) {
      var leftOps, rightOps;
      if (!this.isInsertsOnly()) {
        throw new Error("Split only implemented for inserts only");
      }
      if (!(0 <= index && index <= this.endLength)) {
        throw new Error("Split at invalid index");
      }
      leftOps = [];
      rightOps = [];
      _.reduce(this.ops, function(offset, op) {
        var left, right, _ref;
        if (offset + op.getLength() <= index) {
          leftOps.push(op);
        } else if (offset >= index) {
          rightOps.push(op);
        } else {
          _ref = op.split(index - offset), left = _ref[0], right = _ref[1];
          leftOps.push(left);
          rightOps.push(right);
        }
        return offset + op.getLength();
      }, 0);
      return [new Delta(0, leftOps), new Delta(0, rightOps)];
    };

    Delta.prototype.toString = function() {
      return "{(" + this.startLength + "->" + this.endLength + ") [" + (this.ops.join(', ')) + "]}";
    };

    return Delta;

  })();

  module.exports = Delta;

}).call(this);

},{"./diff_match_patch":7,"./insert":8,"./op":9,"./retain":10,"lodash":false}],6:[function(_dereq_,module,exports){
(function() {
  var Delta, DeltaGenerator, InsertOp, RetainOp, getUtils, setDomain, _, _domain;

  _ = _dereq_('lodash');

  Delta = _dereq_('./delta');

  InsertOp = _dereq_('./insert');

  RetainOp = _dereq_('./retain');

  _domain = {
    alphabet: "abcdefghijklmnopqrstuvwxyz\n\n\n\n  ",
    booleanAttributes: {
      'bold': [true, false],
      'italic': [true, false],
      'strike': [true, false]
    },
    nonBooleanAttributes: {
      'back-color': ['white', 'black', 'red', 'blue', 'lime', 'teal', 'magenta', 'yellow'],
      'fore-color': ['white', 'black', 'red', 'blue', 'lime', 'teal', 'magenta', 'yellow'],
      'font-name': ['monospace', 'serif'],
      'font-size': ['huge', 'large', 'small']
    },
    defaultAttributeValue: {
      'back-color': 'white',
      'fore-color': 'black',
      'font-name': 'san-serif',
      'font-size': 'normal'
    }
  };

  setDomain = function(domain) {
    if (domain != null) {
      return _domain = domain;
    }
  };

  getUtils = function(domain) {
    domain = domain || _domain;
    if (domain == null) {
      throw new Error("Must provide DeltaGenerator with a domain.");
    }
    if (domain.alphabet == null) {
      throw new Error("Domain must define alphabet.");
    }
    if (domain.booleanAttributes == null) {
      throw new Error("Domain must define booleanAttributes.");
    }
    if (domain.nonBooleanAttributes == null) {
      throw new Error("Domain must define nonBooleanAttributes.");
    }
    if (domain.defaultAttributeValue == null) {
      throw new Error("Domain must define defaultAttributeValue.");
    }
    return {
      getDomain: function(domain) {
        return _domain;
      },
      getRandomString: function(length) {
        var _i, _ref, _results;
        return _.map((function() {
          _results = [];
          for (var _i = 0, _ref = length - 1; 0 <= _ref ? _i <= _ref : _i >= _ref; 0 <= _ref ? _i++ : _i--){ _results.push(_i); }
          return _results;
        }).apply(this), function() {
          return domain.alphabet[_.random(0, domain.alphabet.length - 1)];
        }).join('');
      },
      getRandomLength: function() {
        var rand;
        rand = Math.random();
        if (rand < 0.6) {
          return _.random(1, 2);
        } else if (rand < 0.8) {
          return _.random(3, 4);
        } else if (rand < 0.9) {
          return _.random(5, 9);
        } else {
          return _.random(10, 50);
        }
      },
      insertAt: function(delta, insertionPoint, insertions) {
        var charIndex, head, op, opIndex, tail, _i, _len, _ref, _ref1;
        charIndex = opIndex = 0;
        _ref = delta.ops;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          op = _ref[_i];
          if (charIndex === insertionPoint) {
            break;
          }
          if (insertionPoint < charIndex + op.getLength()) {
            _ref1 = op.split(insertionPoint - charIndex), head = _ref1[0], tail = _ref1[1];
            delta.ops.splice(opIndex, 1, head, tail);
            opIndex++;
            break;
          }
          charIndex += op.getLength();
          opIndex++;
        }
        delta.ops.splice(opIndex, 0, new InsertOp(insertions));
        delta.endLength += insertions.length;
        return delta.compact();
      },
      deleteAt: function(delta, deletionPoint, numToDelete) {
        var charIndex, curDelete, head, newText, op, ops, reachedDeletionPoint, tail, _i, _len, _ref;
        charIndex = 0;
        ops = [];
        _ref = delta.ops;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          op = _ref[_i];
          reachedDeletionPoint = charIndex === deletionPoint || deletionPoint < charIndex + op.getLength();
          if (numToDelete > 0 && reachedDeletionPoint) {
            curDelete = Math.min(numToDelete, op.getLength() - (deletionPoint - charIndex));
            numToDelete -= curDelete;
            if (InsertOp.isInsert(op)) {
              newText = op.value.substring(0, deletionPoint - charIndex) + op.value.substring(deletionPoint - charIndex + curDelete);
              if (newText.length > 0) {
                ops.push(new InsertOp(newText));
              }
            } else {
              if (!RetainOp.isRetain(op)) {
                throw new Error("Expected retain but got " + op);
              }
              head = new RetainOp(op.start, op.start + deletionPoint - charIndex, _.clone(op.attributes));
              tail = new RetainOp(op.start + deletionPoint - charIndex + curDelete, op.end, _.clone(op.attributes));
              if (head.start < head.end) {
                ops.push(head);
              }
              if (tail.start < tail.end) {
                ops.push(tail);
              }
            }
            deletionPoint += curDelete;
          } else {
            ops.push(op);
          }
          charIndex += op.getLength();
        }
        delta.ops = ops;
        return delta.endLength = _.reduce(ops, function(length, op) {
          return length + op.getLength();
        }, 0);
      },
      formatAt: function(delta, formatPoint, numToFormat, attrs, reference) {
        var attr, charIndex, cur, curFormat, head, op, ops, reachedFormatPoint, tail, _formatBooleanAttribute, _formatNonBooleanAttribute, _i, _j, _len, _len1, _limitScope, _ref, _ref1, _splitOpInThree;
        _splitOpInThree = function(elem, splitAt, length, reference) {
          var cur, curStr, head, headStr, marker, newCur, op, origOps, tail, tailStr, _i, _len;
          if (InsertOp.isInsert(elem)) {
            headStr = elem.value.substring(0, splitAt);
            head = new InsertOp(headStr, _.clone(elem.attributes));
            curStr = elem.value.substring(splitAt, splitAt + length);
            cur = new InsertOp(curStr, _.clone(elem.attributes));
            tailStr = elem.value.substring(splitAt + length);
            tail = new InsertOp(tailStr, _.clone(elem.attributes));
            if (curStr.indexOf('\n') !== -1) {
              newCur = curStr.substring(0, curStr.indexOf('\n'));
              tailStr = curStr.substring(curStr.indexOf('\n')) + tailStr;
              cur = new InsertOp(newCur, _.clone(elem.attributes));
              tail = new InsertOp(tailStr, _.clone(elem.attributes));
            }
          } else {
            if (!RetainOp.isRetain(elem)) {
              throw new Error("Expected retain but got " + elem);
            }
            head = new RetainOp(elem.start, elem.start + splitAt, _.clone(elem.attributes));
            cur = new RetainOp(head.end, head.end + length, _.clone(elem.attributes));
            tail = new RetainOp(cur.end, elem.end, _.clone(elem.attributes));
            origOps = reference.getOpsAt(cur.start, cur.getLength());
            if (!_.every(origOps, function(op) {
              return InsertOp.isInsert(op);
            })) {
              throw new Error("Non insert op in backref");
            }
            marker = cur.start;
            for (_i = 0, _len = origOps.length; _i < _len; _i++) {
              op = origOps[_i];
              if (InsertOp.isInsert(op)) {
                if (op.value.indexOf('\n') !== -1) {
                  cur = new RetainOp(cur.start, marker + op.value.indexOf('\n'), _.clone(cur.attributes));
                  tail = new RetainOp(marker + op.value.indexOf('\n'), tail.end, _.clone(tail.attributes));
                  break;
                } else {
                  marker += op.getLength();
                }
              } else {
                throw new Error("Got retainOp in reference delta!");
              }
            }
          }
          return [head, cur, tail];
        };
        _limitScope = function(op, tail, attr, referenceOps) {
          var length, refOp, val, _i, _len, _results;
          length = 0;
          val = referenceOps[0].attributes[attr];
          _results = [];
          for (_i = 0, _len = referenceOps.length; _i < _len; _i++) {
            refOp = referenceOps[_i];
            if (refOp.attributes[attr] !== val) {
              op.end = op.start + length;
              tail.start = op.end;
              break;
            } else {
              _results.push(length += refOp.getLength());
            }
          }
          return _results;
        };
        _formatBooleanAttribute = function(op, tail, attr, reference) {
          var referenceOps;
          if (InsertOp.isInsert(op)) {
            if (op.attributes[attr] != null) {
              return delete op.attributes[attr];
            } else {
              return op.attributes[attr] = true;
            }
          } else {
            if (!RetainOp.isRetain(op)) {
              throw new Error("Expected retain but got " + op);
            }
            if (op.attributes[attr] != null) {
              return delete op.attributes[attr];
            } else {
              referenceOps = reference.getOpsAt(op.start, op.getLength());
              if (!_.every(referenceOps, function(op) {
                return InsertOp.isInsert(op);
              })) {
                throw new Error("Formatting a retain that does not refer to an insert.");
              }
              if (referenceOps.length > 0) {
                _limitScope(op, tail, attr, referenceOps);
                if (referenceOps[0].attributes[attr] != null) {
                  if (!referenceOps[0].attributes[attr]) {
                    throw new Error("Boolean attribute on reference delta should only be true!");
                  }
                  return op.attributes[attr] = null;
                } else {
                  return op.attributes[attr] = true;
                }
              }
            }
          }
        };
        _formatNonBooleanAttribute = (function(_this) {
          return function(op, tail, attr, reference) {
            var getNewAttrVal, referenceOps;
            getNewAttrVal = function(prevVal) {
              if (prevVal != null) {
                return _.first(_.shuffle(_.without(domain.nonBooleanAttributes[attr], prevVal)));
              } else {
                return _.first(_.shuffle(_.without(domain.nonBooleanAttributes[attr], domain.defaultAttributeValue[attr])));
              }
            };
            if (InsertOp.isInsert(op)) {
              return op.attributes[attr] = getNewAttrVal(attr, op.attributes[attr]);
            } else {
              if (!RetainOp.isRetain(op)) {
                throw new Error("Expected retain but got " + op);
              }
              referenceOps = reference.getOpsAt(op.start, op.getLength());
              if (!_.every(referenceOps, function(op) {
                return InsertOp.isInsert(op);
              })) {
                throw new Error("Formatting a retain that does not refer to an insert.");
              }
              if (referenceOps.length > 0) {
                _limitScope(op, tail, attr, referenceOps);
                if ((op.attributes[attr] != null) && Math.random() < 0.5) {
                  return delete op.attributes[attr];
                } else {
                  return op.attributes[attr] = getNewAttrVal(op.attributes[attr]);
                }
              }
            }
          };
        })(this);
        charIndex = 0;
        ops = [];
        _ref = delta.ops;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          op = _ref[_i];
          reachedFormatPoint = charIndex === formatPoint || charIndex + op.getLength() > formatPoint;
          if (numToFormat > 0 && reachedFormatPoint) {
            curFormat = Math.min(numToFormat, op.getLength() - (formatPoint - charIndex));
            numToFormat -= curFormat;
            _ref1 = _splitOpInThree(op, formatPoint - charIndex, curFormat, reference), head = _ref1[0], cur = _ref1[1], tail = _ref1[2];
            ops.push(head);
            ops.push(cur);
            ops.push(tail);
            for (_j = 0, _len1 = attrs.length; _j < _len1; _j++) {
              attr = attrs[_j];
              if (_.has(domain.booleanAttributes, attr)) {
                _formatBooleanAttribute(cur, tail, attr, reference);
              } else if (_.has(domain.nonBooleanAttributes, attr)) {
                _formatNonBooleanAttribute(cur, tail, attr, reference);
              } else {
                throw new Error("Received unknown attribute: " + attr);
              }
            }
            formatPoint += curFormat;
          } else {
            ops.push(op);
          }
          charIndex += op.getLength();
        }
        delta.endLength = _.reduce(ops, function(length, delta) {
          return length + delta.getLength();
        }, 0);
        delta.ops = ops;
        return delta.compact();
      },
      addRandomOp: function(newDelta, referenceDelta) {
        var attrs, finalIndex, numAttrs, opIndex, opLength, rand, shuffled_attrs;
        finalIndex = referenceDelta.endLength - 1;
        opIndex = _.random(0, finalIndex);
        rand = Math.random();
        if (rand < 0.5) {
          opLength = this.getRandomLength();
          this.insertAt(newDelta, opIndex, this.getRandomString(opLength));
        } else if (rand < 0.75) {
          if (referenceDelta.endLength <= 1) {
            return newDelta;
          }
          opIndex = _.random(0, finalIndex - 1);
          opLength = _.random(1, finalIndex - opIndex);
          this.deleteAt(newDelta, opIndex, opLength);
        } else {
          shuffled_attrs = _.shuffle(_.keys(domain.booleanAttributes).concat(_.keys(domain.nonBooleanAttributes)));
          numAttrs = _.random(1, shuffled_attrs.length);
          attrs = shuffled_attrs.slice(0, numAttrs);
          opLength = _.random(1, finalIndex - opIndex);
          this.formatAt(newDelta, opIndex, opLength, attrs, referenceDelta);
        }
        return newDelta;
      },
      getRandomDelta: function(referenceDelta, numOps) {
        var i, newDelta, _i;
        newDelta = new Delta(referenceDelta.endLength, referenceDelta.endLength, [new RetainOp(0, referenceDelta.endLength)]);
        numOps || (numOps = _.random(1, 10));
        for (i = _i = 0; 0 <= numOps ? _i < numOps : _i > numOps; i = 0 <= numOps ? ++_i : --_i) {
          this.addRandomOp(newDelta, referenceDelta);
        }
        return newDelta;
      }
    };
  };

  DeltaGenerator = {
    setDomain: setDomain,
    getUtils: getUtils
  };

  module.exports = DeltaGenerator;

}).call(this);

},{"./delta":5,"./insert":8,"./retain":10,"lodash":false}],7:[function(_dereq_,module,exports){
(function() {
  var googlediff;

  googlediff = _dereq_('googlediff');

  googlediff.DIFF_DELETE = -1;

  googlediff.DIFF_INSERT = 1;

  googlediff.DIFF_EQUAL = 0;

  module.exports = googlediff;

}).call(this);

},{"googlediff":14}],8:[function(_dereq_,module,exports){
(function() {
  var InsertOp, Op, _,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  _ = _dereq_('lodash');

  Op = _dereq_('./op');

  InsertOp = (function(_super) {
    __extends(InsertOp, _super);

    function InsertOp(value, attributes) {
      this.value = value;
      if (attributes == null) {
        attributes = {};
      }
      this.attributes = _.clone(attributes);
    }

    InsertOp.prototype.getAt = function(start, length) {
      return new InsertOp(this.value.substr(start, length), this.attributes);
    };

    InsertOp.prototype.getLength = function() {
      return this.value.length;
    };

    InsertOp.prototype.isEqual = function(other) {
      return (other != null) && this.value === other.value && _.isEqual(this.attributes, other.attributes);
    };

    InsertOp.prototype.join = function(other) {
      if (_.isEqual(this.attributes, other.attributes)) {
        return new InsertOp(this.value + second.value, this.attributes);
      } else {
        throw Error;
      }
    };

    InsertOp.prototype.split = function(offset) {
      var left, right;
      left = new InsertOp(this.value.substr(0, offset), this.attributes);
      right = new InsertOp(this.value.substr(offset), this.attributes);
      return [left, right];
    };

    InsertOp.prototype.toString = function() {
      return "{" + this.value + ", " + (this.printAttributes()) + "}";
    };

    return InsertOp;

  })(Op);

  module.exports = InsertOp;

}).call(this);

},{"./op":9,"lodash":false}],9:[function(_dereq_,module,exports){
(function() {
  var Op, _;

  _ = _dereq_('lodash');

  Op = (function() {
    Op.isInsert = function(i) {
      return (i != null) && typeof i.value === "string";
    };

    Op.isRetain = function(r) {
      return (r != null) && typeof r.start === "number" && typeof r.end === "number";
    };

    function Op(attributes) {
      if (attributes == null) {
        attributes = {};
      }
      this.attributes = _.clone(attributes);
    }

    Op.prototype.addAttributes = function(attributes) {
      var addedAttributes, key, value;
      addedAttributes = {};
      for (key in attributes) {
        value = attributes[key];
        if (this.attributes[key] === void 0) {
          addedAttributes[key] = value;
        }
      }
      return addedAttributes;
    };

    Op.prototype.attributesMatch = function(other) {
      var otherAttributes;
      otherAttributes = other.attributes || {};
      return _.isEqual(this.attributes, otherAttributes);
    };

    Op.prototype.composeAttributes = function(attributes) {
      var resolveAttributes;
      resolveAttributes = (function(_this) {
        return function(oldAttrs, newAttrs) {
          var key, resolvedAttrs, value;
          if (!newAttrs) {
            return oldAttrs;
          }
          resolvedAttrs = _.clone(oldAttrs);
          for (key in newAttrs) {
            value = newAttrs[key];
            if (Op.isInsert(_this) && value === null) {
              delete resolvedAttrs[key];
            } else if (typeof value !== 'undefined') {
              if (typeof resolvedAttrs[key] === 'object' && typeof value === 'object' && _.all([resolvedAttrs[key], newAttrs[key]], (function(val) {
                return val !== null;
              }))) {
                resolvedAttrs[key] = resolveAttributes(resolvedAttrs[key], value);
              } else {
                resolvedAttrs[key] = value;
              }
            }
          }
          return resolvedAttrs;
        };
      })(this);
      return resolveAttributes(this.attributes, attributes);
    };

    Op.prototype.numAttributes = function() {
      return _.keys(this.attributes).length;
    };

    Op.prototype.printAttributes = function() {
      return JSON.stringify(this.attributes);
    };

    return Op;

  })();

  module.exports = Op;

}).call(this);

},{"lodash":false}],10:[function(_dereq_,module,exports){
(function() {
  var Op, RetainOp, _,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  _ = _dereq_('lodash');

  Op = _dereq_('./op');

  RetainOp = (function(_super) {
    __extends(RetainOp, _super);

    function RetainOp(start, end, attributes) {
      this.start = start;
      this.end = end;
      if (attributes == null) {
        attributes = {};
      }
      this.attributes = _.clone(attributes);
    }

    RetainOp.prototype.getAt = function(start, length) {
      return new RetainOp(this.start + start, this.start + start + length, this.attributes);
    };

    RetainOp.prototype.getLength = function() {
      return this.end - this.start;
    };

    RetainOp.prototype.isEqual = function(other) {
      return (other != null) && this.start === other.start && this.end === other.end && _.isEqual(this.attributes, other.attributes);
    };

    RetainOp.prototype.split = function(offset) {
      var left, right;
      left = new RetainOp(this.start, this.start + offset, this.attributes);
      right = new RetainOp(this.start + offset, this.end, this.attributes);
      return [left, right];
    };

    RetainOp.prototype.toString = function() {
      return "{{" + this.start + " - " + this.end + "), " + (this.printAttributes()) + "}";
    };

    return RetainOp;

  })(Op);

  module.exports = RetainOp;

}).call(this);

},{"./op":9,"lodash":false}],11:[function(_dereq_,module,exports){
(function() {
  module.exports = {
    Delta: _dereq_('./delta'),
    DeltaGen: _dereq_('./delta_generator'),
    Op: _dereq_('./op'),
    InsertOp: _dereq_('./insert'),
    RetainOp: _dereq_('./retain')
  };

}).call(this);

},{"./delta":5,"./delta_generator":6,"./insert":8,"./op":9,"./retain":10}],12:[function(_dereq_,module,exports){
module.exports = _dereq_('./build/delta.js')

},{"./build/delta.js":5}],13:[function(_dereq_,module,exports){
module.exports = _dereq_('./build/tandem-core')

},{"./build/tandem-core":11}],14:[function(_dereq_,module,exports){
module.exports = _dereq_('./javascript/diff_match_patch_uncompressed.js').diff_match_patch;

},{"./javascript/diff_match_patch_uncompressed.js":15}],15:[function(_dereq_,module,exports){
/**
 * Diff Match and Patch
 *
 * Copyright 2006 Google Inc.
 * http://code.google.com/p/google-diff-match-patch/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Computes the difference between two texts to create a patch.
 * Applies the patch onto another text, allowing for errors.
 * @author fraser@google.com (Neil Fraser)
 */

/**
 * Class containing the diff, match and patch methods.
 * @constructor
 */
function diff_match_patch() {

  // Defaults.
  // Redefine these in your program to override the defaults.

  // Number of seconds to map a diff before giving up (0 for infinity).
  this.Diff_Timeout = 1.0;
  // Cost of an empty edit operation in terms of edit characters.
  this.Diff_EditCost = 4;
  // At what point is no match declared (0.0 = perfection, 1.0 = very loose).
  this.Match_Threshold = 0.5;
  // How far to search for a match (0 = exact location, 1000+ = broad match).
  // A match this many characters away from the expected location will add
  // 1.0 to the score (0.0 is a perfect match).
  this.Match_Distance = 1000;
  // When deleting a large block of text (over ~64 characters), how close do
  // the contents have to be to match the expected contents. (0.0 = perfection,
  // 1.0 = very loose).  Note that Match_Threshold controls how closely the
  // end points of a delete need to match.
  this.Patch_DeleteThreshold = 0.5;
  // Chunk size for context length.
  this.Patch_Margin = 4;

  // The number of bits in an int.
  this.Match_MaxBits = 32;
}


//  DIFF FUNCTIONS


/**
 * The data structure representing a diff is an array of tuples:
 * [[DIFF_DELETE, 'Hello'], [DIFF_INSERT, 'Goodbye'], [DIFF_EQUAL, ' world.']]
 * which means: delete 'Hello', add 'Goodbye' and keep ' world.'
 */
var DIFF_DELETE = -1;
var DIFF_INSERT = 1;
var DIFF_EQUAL = 0;

/** @typedef {{0: number, 1: string}} */
diff_match_patch.Diff;


/**
 * Find the differences between two texts.  Simplifies the problem by stripping
 * any common prefix or suffix off the texts before diffing.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {boolean=} opt_checklines Optional speedup flag. If present and false,
 *     then don't run a line-level diff first to identify the changed areas.
 *     Defaults to true, which does a faster, slightly less optimal diff.
 * @param {number} opt_deadline Optional time when the diff should be complete
 *     by.  Used internally for recursive calls.  Users should set DiffTimeout
 *     instead.
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
 */
diff_match_patch.prototype.diff_main = function(text1, text2, opt_checklines,
    opt_deadline) {
  // Set a deadline by which time the diff must be complete.
  if (typeof opt_deadline == 'undefined') {
    if (this.Diff_Timeout <= 0) {
      opt_deadline = Number.MAX_VALUE;
    } else {
      opt_deadline = (new Date).getTime() + this.Diff_Timeout * 1000;
    }
  }
  var deadline = opt_deadline;

  // Check for null inputs.
  if (text1 == null || text2 == null) {
    throw new Error('Null input. (diff_main)');
  }

  // Check for equality (speedup).
  if (text1 == text2) {
    if (text1) {
      return [[DIFF_EQUAL, text1]];
    }
    return [];
  }

  if (typeof opt_checklines == 'undefined') {
    opt_checklines = true;
  }
  var checklines = opt_checklines;

  // Trim off common prefix (speedup).
  var commonlength = this.diff_commonPrefix(text1, text2);
  var commonprefix = text1.substring(0, commonlength);
  text1 = text1.substring(commonlength);
  text2 = text2.substring(commonlength);

  // Trim off common suffix (speedup).
  commonlength = this.diff_commonSuffix(text1, text2);
  var commonsuffix = text1.substring(text1.length - commonlength);
  text1 = text1.substring(0, text1.length - commonlength);
  text2 = text2.substring(0, text2.length - commonlength);

  // Compute the diff on the middle block.
  var diffs = this.diff_compute_(text1, text2, checklines, deadline);

  // Restore the prefix and suffix.
  if (commonprefix) {
    diffs.unshift([DIFF_EQUAL, commonprefix]);
  }
  if (commonsuffix) {
    diffs.push([DIFF_EQUAL, commonsuffix]);
  }
  this.diff_cleanupMerge(diffs);
  return diffs;
};


/**
 * Find the differences between two texts.  Assumes that the texts do not
 * have any common prefix or suffix.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {boolean} checklines Speedup flag.  If false, then don't run a
 *     line-level diff first to identify the changed areas.
 *     If true, then run a faster, slightly less optimal diff.
 * @param {number} deadline Time when the diff should be complete by.
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
 * @private
 */
diff_match_patch.prototype.diff_compute_ = function(text1, text2, checklines,
    deadline) {
  var diffs;

  if (!text1) {
    // Just add some text (speedup).
    return [[DIFF_INSERT, text2]];
  }

  if (!text2) {
    // Just delete some text (speedup).
    return [[DIFF_DELETE, text1]];
  }

  var longtext = text1.length > text2.length ? text1 : text2;
  var shorttext = text1.length > text2.length ? text2 : text1;
  var i = longtext.indexOf(shorttext);
  if (i != -1) {
    // Shorter text is inside the longer text (speedup).
    diffs = [[DIFF_INSERT, longtext.substring(0, i)],
             [DIFF_EQUAL, shorttext],
             [DIFF_INSERT, longtext.substring(i + shorttext.length)]];
    // Swap insertions for deletions if diff is reversed.
    if (text1.length > text2.length) {
      diffs[0][0] = diffs[2][0] = DIFF_DELETE;
    }
    return diffs;
  }

  if (shorttext.length == 1) {
    // Single character string.
    // After the previous speedup, the character can't be an equality.
    return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
  }

  // Check to see if the problem can be split in two.
  var hm = this.diff_halfMatch_(text1, text2);
  if (hm) {
    // A half-match was found, sort out the return data.
    var text1_a = hm[0];
    var text1_b = hm[1];
    var text2_a = hm[2];
    var text2_b = hm[3];
    var mid_common = hm[4];
    // Send both pairs off for separate processing.
    var diffs_a = this.diff_main(text1_a, text2_a, checklines, deadline);
    var diffs_b = this.diff_main(text1_b, text2_b, checklines, deadline);
    // Merge the results.
    return diffs_a.concat([[DIFF_EQUAL, mid_common]], diffs_b);
  }

  if (checklines && text1.length > 100 && text2.length > 100) {
    return this.diff_lineMode_(text1, text2, deadline);
  }

  return this.diff_bisect_(text1, text2, deadline);
};


/**
 * Do a quick line-level diff on both strings, then rediff the parts for
 * greater accuracy.
 * This speedup can produce non-minimal diffs.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {number} deadline Time when the diff should be complete by.
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
 * @private
 */
diff_match_patch.prototype.diff_lineMode_ = function(text1, text2, deadline) {
  // Scan the text on a line-by-line basis first.
  var a = this.diff_linesToChars_(text1, text2);
  text1 = a.chars1;
  text2 = a.chars2;
  var linearray = a.lineArray;

  var diffs = this.diff_main(text1, text2, false, deadline);

  // Convert the diff back to original text.
  this.diff_charsToLines_(diffs, linearray);
  // Eliminate freak matches (e.g. blank lines)
  this.diff_cleanupSemantic(diffs);

  // Rediff any replacement blocks, this time character-by-character.
  // Add a dummy entry at the end.
  diffs.push([DIFF_EQUAL, '']);
  var pointer = 0;
  var count_delete = 0;
  var count_insert = 0;
  var text_delete = '';
  var text_insert = '';
  while (pointer < diffs.length) {
    switch (diffs[pointer][0]) {
      case DIFF_INSERT:
        count_insert++;
        text_insert += diffs[pointer][1];
        break;
      case DIFF_DELETE:
        count_delete++;
        text_delete += diffs[pointer][1];
        break;
      case DIFF_EQUAL:
        // Upon reaching an equality, check for prior redundancies.
        if (count_delete >= 1 && count_insert >= 1) {
          // Delete the offending records and add the merged ones.
          diffs.splice(pointer - count_delete - count_insert,
                       count_delete + count_insert);
          pointer = pointer - count_delete - count_insert;
          var a = this.diff_main(text_delete, text_insert, false, deadline);
          for (var j = a.length - 1; j >= 0; j--) {
            diffs.splice(pointer, 0, a[j]);
          }
          pointer = pointer + a.length;
        }
        count_insert = 0;
        count_delete = 0;
        text_delete = '';
        text_insert = '';
        break;
    }
    pointer++;
  }
  diffs.pop();  // Remove the dummy entry at the end.

  return diffs;
};


/**
 * Find the 'middle snake' of a diff, split the problem in two
 * and return the recursively constructed diff.
 * See Myers 1986 paper: An O(ND) Difference Algorithm and Its Variations.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {number} deadline Time at which to bail if not yet complete.
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
 * @private
 */
diff_match_patch.prototype.diff_bisect_ = function(text1, text2, deadline) {
  // Cache the text lengths to prevent multiple calls.
  var text1_length = text1.length;
  var text2_length = text2.length;
  var max_d = Math.ceil((text1_length + text2_length) / 2);
  var v_offset = max_d;
  var v_length = 2 * max_d;
  var v1 = new Array(v_length);
  var v2 = new Array(v_length);
  // Setting all elements to -1 is faster in Chrome & Firefox than mixing
  // integers and undefined.
  for (var x = 0; x < v_length; x++) {
    v1[x] = -1;
    v2[x] = -1;
  }
  v1[v_offset + 1] = 0;
  v2[v_offset + 1] = 0;
  var delta = text1_length - text2_length;
  // If the total number of characters is odd, then the front path will collide
  // with the reverse path.
  var front = (delta % 2 != 0);
  // Offsets for start and end of k loop.
  // Prevents mapping of space beyond the grid.
  var k1start = 0;
  var k1end = 0;
  var k2start = 0;
  var k2end = 0;
  for (var d = 0; d < max_d; d++) {
    // Bail out if deadline is reached.
    if ((new Date()).getTime() > deadline) {
      break;
    }

    // Walk the front path one step.
    for (var k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
      var k1_offset = v_offset + k1;
      var x1;
      if (k1 == -d || (k1 != d && v1[k1_offset - 1] < v1[k1_offset + 1])) {
        x1 = v1[k1_offset + 1];
      } else {
        x1 = v1[k1_offset - 1] + 1;
      }
      var y1 = x1 - k1;
      while (x1 < text1_length && y1 < text2_length &&
             text1.charAt(x1) == text2.charAt(y1)) {
        x1++;
        y1++;
      }
      v1[k1_offset] = x1;
      if (x1 > text1_length) {
        // Ran off the right of the graph.
        k1end += 2;
      } else if (y1 > text2_length) {
        // Ran off the bottom of the graph.
        k1start += 2;
      } else if (front) {
        var k2_offset = v_offset + delta - k1;
        if (k2_offset >= 0 && k2_offset < v_length && v2[k2_offset] != -1) {
          // Mirror x2 onto top-left coordinate system.
          var x2 = text1_length - v2[k2_offset];
          if (x1 >= x2) {
            // Overlap detected.
            return this.diff_bisectSplit_(text1, text2, x1, y1, deadline);
          }
        }
      }
    }

    // Walk the reverse path one step.
    for (var k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
      var k2_offset = v_offset + k2;
      var x2;
      if (k2 == -d || (k2 != d && v2[k2_offset - 1] < v2[k2_offset + 1])) {
        x2 = v2[k2_offset + 1];
      } else {
        x2 = v2[k2_offset - 1] + 1;
      }
      var y2 = x2 - k2;
      while (x2 < text1_length && y2 < text2_length &&
             text1.charAt(text1_length - x2 - 1) ==
             text2.charAt(text2_length - y2 - 1)) {
        x2++;
        y2++;
      }
      v2[k2_offset] = x2;
      if (x2 > text1_length) {
        // Ran off the left of the graph.
        k2end += 2;
      } else if (y2 > text2_length) {
        // Ran off the top of the graph.
        k2start += 2;
      } else if (!front) {
        var k1_offset = v_offset + delta - k2;
        if (k1_offset >= 0 && k1_offset < v_length && v1[k1_offset] != -1) {
          var x1 = v1[k1_offset];
          var y1 = v_offset + x1 - k1_offset;
          // Mirror x2 onto top-left coordinate system.
          x2 = text1_length - x2;
          if (x1 >= x2) {
            // Overlap detected.
            return this.diff_bisectSplit_(text1, text2, x1, y1, deadline);
          }
        }
      }
    }
  }
  // Diff took too long and hit the deadline or
  // number of diffs equals number of characters, no commonality at all.
  return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
};


/**
 * Given the location of the 'middle snake', split the diff in two parts
 * and recurse.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {number} x Index of split point in text1.
 * @param {number} y Index of split point in text2.
 * @param {number} deadline Time at which to bail if not yet complete.
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
 * @private
 */
diff_match_patch.prototype.diff_bisectSplit_ = function(text1, text2, x, y,
    deadline) {
  var text1a = text1.substring(0, x);
  var text2a = text2.substring(0, y);
  var text1b = text1.substring(x);
  var text2b = text2.substring(y);

  // Compute both diffs serially.
  var diffs = this.diff_main(text1a, text2a, false, deadline);
  var diffsb = this.diff_main(text1b, text2b, false, deadline);

  return diffs.concat(diffsb);
};


/**
 * Split two texts into an array of strings.  Reduce the texts to a string of
 * hashes where each Unicode character represents one line.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {{chars1: string, chars2: string, lineArray: !Array.<string>}}
 *     An object containing the encoded text1, the encoded text2 and
 *     the array of unique strings.
 *     The zeroth element of the array of unique strings is intentionally blank.
 * @private
 */
diff_match_patch.prototype.diff_linesToChars_ = function(text1, text2) {
  var lineArray = [];  // e.g. lineArray[4] == 'Hello\n'
  var lineHash = {};   // e.g. lineHash['Hello\n'] == 4

  // '\x00' is a valid character, but various debuggers don't like it.
  // So we'll insert a junk entry to avoid generating a null character.
  lineArray[0] = '';

  /**
   * Split a text into an array of strings.  Reduce the texts to a string of
   * hashes where each Unicode character represents one line.
   * Modifies linearray and linehash through being a closure.
   * @param {string} text String to encode.
   * @return {string} Encoded string.
   * @private
   */
  function diff_linesToCharsMunge_(text) {
    var chars = '';
    // Walk the text, pulling out a substring for each line.
    // text.split('\n') would would temporarily double our memory footprint.
    // Modifying text would create many large strings to garbage collect.
    var lineStart = 0;
    var lineEnd = -1;
    // Keeping our own length variable is faster than looking it up.
    var lineArrayLength = lineArray.length;
    while (lineEnd < text.length - 1) {
      lineEnd = text.indexOf('\n', lineStart);
      if (lineEnd == -1) {
        lineEnd = text.length - 1;
      }
      var line = text.substring(lineStart, lineEnd + 1);
      lineStart = lineEnd + 1;

      if (lineHash.hasOwnProperty ? lineHash.hasOwnProperty(line) :
          (lineHash[line] !== undefined)) {
        chars += String.fromCharCode(lineHash[line]);
      } else {
        chars += String.fromCharCode(lineArrayLength);
        lineHash[line] = lineArrayLength;
        lineArray[lineArrayLength++] = line;
      }
    }
    return chars;
  }

  var chars1 = diff_linesToCharsMunge_(text1);
  var chars2 = diff_linesToCharsMunge_(text2);
  return {chars1: chars1, chars2: chars2, lineArray: lineArray};
};


/**
 * Rehydrate the text in a diff from a string of line hashes to real lines of
 * text.
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 * @param {!Array.<string>} lineArray Array of unique strings.
 * @private
 */
diff_match_patch.prototype.diff_charsToLines_ = function(diffs, lineArray) {
  for (var x = 0; x < diffs.length; x++) {
    var chars = diffs[x][1];
    var text = [];
    for (var y = 0; y < chars.length; y++) {
      text[y] = lineArray[chars.charCodeAt(y)];
    }
    diffs[x][1] = text.join('');
  }
};


/**
 * Determine the common prefix of two strings.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {number} The number of characters common to the start of each
 *     string.
 */
diff_match_patch.prototype.diff_commonPrefix = function(text1, text2) {
  // Quick check for common null cases.
  if (!text1 || !text2 || text1.charAt(0) != text2.charAt(0)) {
    return 0;
  }
  // Binary search.
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/
  var pointermin = 0;
  var pointermax = Math.min(text1.length, text2.length);
  var pointermid = pointermax;
  var pointerstart = 0;
  while (pointermin < pointermid) {
    if (text1.substring(pointerstart, pointermid) ==
        text2.substring(pointerstart, pointermid)) {
      pointermin = pointermid;
      pointerstart = pointermin;
    } else {
      pointermax = pointermid;
    }
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
  }
  return pointermid;
};


/**
 * Determine the common suffix of two strings.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {number} The number of characters common to the end of each string.
 */
diff_match_patch.prototype.diff_commonSuffix = function(text1, text2) {
  // Quick check for common null cases.
  if (!text1 || !text2 ||
      text1.charAt(text1.length - 1) != text2.charAt(text2.length - 1)) {
    return 0;
  }
  // Binary search.
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/
  var pointermin = 0;
  var pointermax = Math.min(text1.length, text2.length);
  var pointermid = pointermax;
  var pointerend = 0;
  while (pointermin < pointermid) {
    if (text1.substring(text1.length - pointermid, text1.length - pointerend) ==
        text2.substring(text2.length - pointermid, text2.length - pointerend)) {
      pointermin = pointermid;
      pointerend = pointermin;
    } else {
      pointermax = pointermid;
    }
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
  }
  return pointermid;
};


/**
 * Determine if the suffix of one string is the prefix of another.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {number} The number of characters common to the end of the first
 *     string and the start of the second string.
 * @private
 */
diff_match_patch.prototype.diff_commonOverlap_ = function(text1, text2) {
  // Cache the text lengths to prevent multiple calls.
  var text1_length = text1.length;
  var text2_length = text2.length;
  // Eliminate the null case.
  if (text1_length == 0 || text2_length == 0) {
    return 0;
  }
  // Truncate the longer string.
  if (text1_length > text2_length) {
    text1 = text1.substring(text1_length - text2_length);
  } else if (text1_length < text2_length) {
    text2 = text2.substring(0, text1_length);
  }
  var text_length = Math.min(text1_length, text2_length);
  // Quick check for the worst case.
  if (text1 == text2) {
    return text_length;
  }

  // Start by looking for a single character match
  // and increase length until no match is found.
  // Performance analysis: http://neil.fraser.name/news/2010/11/04/
  var best = 0;
  var length = 1;
  while (true) {
    var pattern = text1.substring(text_length - length);
    var found = text2.indexOf(pattern);
    if (found == -1) {
      return best;
    }
    length += found;
    if (found == 0 || text1.substring(text_length - length) ==
        text2.substring(0, length)) {
      best = length;
      length++;
    }
  }
};


/**
 * Do the two texts share a substring which is at least half the length of the
 * longer text?
 * This speedup can produce non-minimal diffs.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {Array.<string>} Five element Array, containing the prefix of
 *     text1, the suffix of text1, the prefix of text2, the suffix of
 *     text2 and the common middle.  Or null if there was no match.
 * @private
 */
diff_match_patch.prototype.diff_halfMatch_ = function(text1, text2) {
  if (this.Diff_Timeout <= 0) {
    // Don't risk returning a non-optimal diff if we have unlimited time.
    return null;
  }
  var longtext = text1.length > text2.length ? text1 : text2;
  var shorttext = text1.length > text2.length ? text2 : text1;
  if (longtext.length < 4 || shorttext.length * 2 < longtext.length) {
    return null;  // Pointless.
  }
  var dmp = this;  // 'this' becomes 'window' in a closure.

  /**
   * Does a substring of shorttext exist within longtext such that the substring
   * is at least half the length of longtext?
   * Closure, but does not reference any external variables.
   * @param {string} longtext Longer string.
   * @param {string} shorttext Shorter string.
   * @param {number} i Start index of quarter length substring within longtext.
   * @return {Array.<string>} Five element Array, containing the prefix of
   *     longtext, the suffix of longtext, the prefix of shorttext, the suffix
   *     of shorttext and the common middle.  Or null if there was no match.
   * @private
   */
  function diff_halfMatchI_(longtext, shorttext, i) {
    // Start with a 1/4 length substring at position i as a seed.
    var seed = longtext.substring(i, i + Math.floor(longtext.length / 4));
    var j = -1;
    var best_common = '';
    var best_longtext_a, best_longtext_b, best_shorttext_a, best_shorttext_b;
    while ((j = shorttext.indexOf(seed, j + 1)) != -1) {
      var prefixLength = dmp.diff_commonPrefix(longtext.substring(i),
                                               shorttext.substring(j));
      var suffixLength = dmp.diff_commonSuffix(longtext.substring(0, i),
                                               shorttext.substring(0, j));
      if (best_common.length < suffixLength + prefixLength) {
        best_common = shorttext.substring(j - suffixLength, j) +
            shorttext.substring(j, j + prefixLength);
        best_longtext_a = longtext.substring(0, i - suffixLength);
        best_longtext_b = longtext.substring(i + prefixLength);
        best_shorttext_a = shorttext.substring(0, j - suffixLength);
        best_shorttext_b = shorttext.substring(j + prefixLength);
      }
    }
    if (best_common.length * 2 >= longtext.length) {
      return [best_longtext_a, best_longtext_b,
              best_shorttext_a, best_shorttext_b, best_common];
    } else {
      return null;
    }
  }

  // First check if the second quarter is the seed for a half-match.
  var hm1 = diff_halfMatchI_(longtext, shorttext,
                             Math.ceil(longtext.length / 4));
  // Check again based on the third quarter.
  var hm2 = diff_halfMatchI_(longtext, shorttext,
                             Math.ceil(longtext.length / 2));
  var hm;
  if (!hm1 && !hm2) {
    return null;
  } else if (!hm2) {
    hm = hm1;
  } else if (!hm1) {
    hm = hm2;
  } else {
    // Both matched.  Select the longest.
    hm = hm1[4].length > hm2[4].length ? hm1 : hm2;
  }

  // A half-match was found, sort out the return data.
  var text1_a, text1_b, text2_a, text2_b;
  if (text1.length > text2.length) {
    text1_a = hm[0];
    text1_b = hm[1];
    text2_a = hm[2];
    text2_b = hm[3];
  } else {
    text2_a = hm[0];
    text2_b = hm[1];
    text1_a = hm[2];
    text1_b = hm[3];
  }
  var mid_common = hm[4];
  return [text1_a, text1_b, text2_a, text2_b, mid_common];
};


/**
 * Reduce the number of edits by eliminating semantically trivial equalities.
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 */
diff_match_patch.prototype.diff_cleanupSemantic = function(diffs) {
  var changes = false;
  var equalities = [];  // Stack of indices where equalities are found.
  var equalitiesLength = 0;  // Keeping our own length var is faster in JS.
  /** @type {?string} */
  var lastequality = null;
  // Always equal to diffs[equalities[equalitiesLength - 1]][1]
  var pointer = 0;  // Index of current position.
  // Number of characters that changed prior to the equality.
  var length_insertions1 = 0;
  var length_deletions1 = 0;
  // Number of characters that changed after the equality.
  var length_insertions2 = 0;
  var length_deletions2 = 0;
  while (pointer < diffs.length) {
    if (diffs[pointer][0] == DIFF_EQUAL) {  // Equality found.
      equalities[equalitiesLength++] = pointer;
      length_insertions1 = length_insertions2;
      length_deletions1 = length_deletions2;
      length_insertions2 = 0;
      length_deletions2 = 0;
      lastequality = diffs[pointer][1];
    } else {  // An insertion or deletion.
      if (diffs[pointer][0] == DIFF_INSERT) {
        length_insertions2 += diffs[pointer][1].length;
      } else {
        length_deletions2 += diffs[pointer][1].length;
      }
      // Eliminate an equality that is smaller or equal to the edits on both
      // sides of it.
      if (lastequality && (lastequality.length <=
          Math.max(length_insertions1, length_deletions1)) &&
          (lastequality.length <= Math.max(length_insertions2,
                                           length_deletions2))) {
        // Duplicate record.
        diffs.splice(equalities[equalitiesLength - 1], 0,
                     [DIFF_DELETE, lastequality]);
        // Change second copy to insert.
        diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;
        // Throw away the equality we just deleted.
        equalitiesLength--;
        // Throw away the previous equality (it needs to be reevaluated).
        equalitiesLength--;
        pointer = equalitiesLength > 0 ? equalities[equalitiesLength - 1] : -1;
        length_insertions1 = 0;  // Reset the counters.
        length_deletions1 = 0;
        length_insertions2 = 0;
        length_deletions2 = 0;
        lastequality = null;
        changes = true;
      }
    }
    pointer++;
  }

  // Normalize the diff.
  if (changes) {
    this.diff_cleanupMerge(diffs);
  }
  this.diff_cleanupSemanticLossless(diffs);

  // Find any overlaps between deletions and insertions.
  // e.g: <del>abcxxx</del><ins>xxxdef</ins>
  //   -> <del>abc</del>xxx<ins>def</ins>
  // e.g: <del>xxxabc</del><ins>defxxx</ins>
  //   -> <ins>def</ins>xxx<del>abc</del>
  // Only extract an overlap if it is as big as the edit ahead or behind it.
  pointer = 1;
  while (pointer < diffs.length) {
    if (diffs[pointer - 1][0] == DIFF_DELETE &&
        diffs[pointer][0] == DIFF_INSERT) {
      var deletion = diffs[pointer - 1][1];
      var insertion = diffs[pointer][1];
      var overlap_length1 = this.diff_commonOverlap_(deletion, insertion);
      var overlap_length2 = this.diff_commonOverlap_(insertion, deletion);
      if (overlap_length1 >= overlap_length2) {
        if (overlap_length1 >= deletion.length / 2 ||
            overlap_length1 >= insertion.length / 2) {
          // Overlap found.  Insert an equality and trim the surrounding edits.
          diffs.splice(pointer, 0,
              [DIFF_EQUAL, insertion.substring(0, overlap_length1)]);
          diffs[pointer - 1][1] =
              deletion.substring(0, deletion.length - overlap_length1);
          diffs[pointer + 1][1] = insertion.substring(overlap_length1);
          pointer++;
        }
      } else {
        if (overlap_length2 >= deletion.length / 2 ||
            overlap_length2 >= insertion.length / 2) {
          // Reverse overlap found.
          // Insert an equality and swap and trim the surrounding edits.
          diffs.splice(pointer, 0,
              [DIFF_EQUAL, deletion.substring(0, overlap_length2)]);
          diffs[pointer - 1][0] = DIFF_INSERT;
          diffs[pointer - 1][1] =
              insertion.substring(0, insertion.length - overlap_length2);
          diffs[pointer + 1][0] = DIFF_DELETE;
          diffs[pointer + 1][1] =
              deletion.substring(overlap_length2);
          pointer++;
        }
      }
      pointer++;
    }
    pointer++;
  }
};


/**
 * Look for single edits surrounded on both sides by equalities
 * which can be shifted sideways to align the edit to a word boundary.
 * e.g: The c<ins>at c</ins>ame. -> The <ins>cat </ins>came.
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 */
diff_match_patch.prototype.diff_cleanupSemanticLossless = function(diffs) {
  /**
   * Given two strings, compute a score representing whether the internal
   * boundary falls on logical boundaries.
   * Scores range from 6 (best) to 0 (worst).
   * Closure, but does not reference any external variables.
   * @param {string} one First string.
   * @param {string} two Second string.
   * @return {number} The score.
   * @private
   */
  function diff_cleanupSemanticScore_(one, two) {
    if (!one || !two) {
      // Edges are the best.
      return 6;
    }

    // Each port of this function behaves slightly differently due to
    // subtle differences in each language's definition of things like
    // 'whitespace'.  Since this function's purpose is largely cosmetic,
    // the choice has been made to use each language's native features
    // rather than force total conformity.
    var char1 = one.charAt(one.length - 1);
    var char2 = two.charAt(0);
    var nonAlphaNumeric1 = char1.match(diff_match_patch.nonAlphaNumericRegex_);
    var nonAlphaNumeric2 = char2.match(diff_match_patch.nonAlphaNumericRegex_);
    var whitespace1 = nonAlphaNumeric1 &&
        char1.match(diff_match_patch.whitespaceRegex_);
    var whitespace2 = nonAlphaNumeric2 &&
        char2.match(diff_match_patch.whitespaceRegex_);
    var lineBreak1 = whitespace1 &&
        char1.match(diff_match_patch.linebreakRegex_);
    var lineBreak2 = whitespace2 &&
        char2.match(diff_match_patch.linebreakRegex_);
    var blankLine1 = lineBreak1 &&
        one.match(diff_match_patch.blanklineEndRegex_);
    var blankLine2 = lineBreak2 &&
        two.match(diff_match_patch.blanklineStartRegex_);

    if (blankLine1 || blankLine2) {
      // Five points for blank lines.
      return 5;
    } else if (lineBreak1 || lineBreak2) {
      // Four points for line breaks.
      return 4;
    } else if (nonAlphaNumeric1 && !whitespace1 && whitespace2) {
      // Three points for end of sentences.
      return 3;
    } else if (whitespace1 || whitespace2) {
      // Two points for whitespace.
      return 2;
    } else if (nonAlphaNumeric1 || nonAlphaNumeric2) {
      // One point for non-alphanumeric.
      return 1;
    }
    return 0;
  }

  var pointer = 1;
  // Intentionally ignore the first and last element (don't need checking).
  while (pointer < diffs.length - 1) {
    if (diffs[pointer - 1][0] == DIFF_EQUAL &&
        diffs[pointer + 1][0] == DIFF_EQUAL) {
      // This is a single edit surrounded by equalities.
      var equality1 = diffs[pointer - 1][1];
      var edit = diffs[pointer][1];
      var equality2 = diffs[pointer + 1][1];

      // First, shift the edit as far left as possible.
      var commonOffset = this.diff_commonSuffix(equality1, edit);
      if (commonOffset) {
        var commonString = edit.substring(edit.length - commonOffset);
        equality1 = equality1.substring(0, equality1.length - commonOffset);
        edit = commonString + edit.substring(0, edit.length - commonOffset);
        equality2 = commonString + equality2;
      }

      // Second, step character by character right, looking for the best fit.
      var bestEquality1 = equality1;
      var bestEdit = edit;
      var bestEquality2 = equality2;
      var bestScore = diff_cleanupSemanticScore_(equality1, edit) +
          diff_cleanupSemanticScore_(edit, equality2);
      while (edit.charAt(0) === equality2.charAt(0)) {
        equality1 += edit.charAt(0);
        edit = edit.substring(1) + equality2.charAt(0);
        equality2 = equality2.substring(1);
        var score = diff_cleanupSemanticScore_(equality1, edit) +
            diff_cleanupSemanticScore_(edit, equality2);
        // The >= encourages trailing rather than leading whitespace on edits.
        if (score >= bestScore) {
          bestScore = score;
          bestEquality1 = equality1;
          bestEdit = edit;
          bestEquality2 = equality2;
        }
      }

      if (diffs[pointer - 1][1] != bestEquality1) {
        // We have an improvement, save it back to the diff.
        if (bestEquality1) {
          diffs[pointer - 1][1] = bestEquality1;
        } else {
          diffs.splice(pointer - 1, 1);
          pointer--;
        }
        diffs[pointer][1] = bestEdit;
        if (bestEquality2) {
          diffs[pointer + 1][1] = bestEquality2;
        } else {
          diffs.splice(pointer + 1, 1);
          pointer--;
        }
      }
    }
    pointer++;
  }
};

// Define some regex patterns for matching boundaries.
diff_match_patch.nonAlphaNumericRegex_ = /[^a-zA-Z0-9]/;
diff_match_patch.whitespaceRegex_ = /\s/;
diff_match_patch.linebreakRegex_ = /[\r\n]/;
diff_match_patch.blanklineEndRegex_ = /\n\r?\n$/;
diff_match_patch.blanklineStartRegex_ = /^\r?\n\r?\n/;

/**
 * Reduce the number of edits by eliminating operationally trivial equalities.
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 */
diff_match_patch.prototype.diff_cleanupEfficiency = function(diffs) {
  var changes = false;
  var equalities = [];  // Stack of indices where equalities are found.
  var equalitiesLength = 0;  // Keeping our own length var is faster in JS.
  /** @type {?string} */
  var lastequality = null;
  // Always equal to diffs[equalities[equalitiesLength - 1]][1]
  var pointer = 0;  // Index of current position.
  // Is there an insertion operation before the last equality.
  var pre_ins = false;
  // Is there a deletion operation before the last equality.
  var pre_del = false;
  // Is there an insertion operation after the last equality.
  var post_ins = false;
  // Is there a deletion operation after the last equality.
  var post_del = false;
  while (pointer < diffs.length) {
    if (diffs[pointer][0] == DIFF_EQUAL) {  // Equality found.
      if (diffs[pointer][1].length < this.Diff_EditCost &&
          (post_ins || post_del)) {
        // Candidate found.
        equalities[equalitiesLength++] = pointer;
        pre_ins = post_ins;
        pre_del = post_del;
        lastequality = diffs[pointer][1];
      } else {
        // Not a candidate, and can never become one.
        equalitiesLength = 0;
        lastequality = null;
      }
      post_ins = post_del = false;
    } else {  // An insertion or deletion.
      if (diffs[pointer][0] == DIFF_DELETE) {
        post_del = true;
      } else {
        post_ins = true;
      }
      /*
       * Five types to be split:
       * <ins>A</ins><del>B</del>XY<ins>C</ins><del>D</del>
       * <ins>A</ins>X<ins>C</ins><del>D</del>
       * <ins>A</ins><del>B</del>X<ins>C</ins>
       * <ins>A</del>X<ins>C</ins><del>D</del>
       * <ins>A</ins><del>B</del>X<del>C</del>
       */
      if (lastequality && ((pre_ins && pre_del && post_ins && post_del) ||
                           ((lastequality.length < this.Diff_EditCost / 2) &&
                            (pre_ins + pre_del + post_ins + post_del) == 3))) {
        // Duplicate record.
        diffs.splice(equalities[equalitiesLength - 1], 0,
                     [DIFF_DELETE, lastequality]);
        // Change second copy to insert.
        diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;
        equalitiesLength--;  // Throw away the equality we just deleted;
        lastequality = null;
        if (pre_ins && pre_del) {
          // No changes made which could affect previous entry, keep going.
          post_ins = post_del = true;
          equalitiesLength = 0;
        } else {
          equalitiesLength--;  // Throw away the previous equality.
          pointer = equalitiesLength > 0 ?
              equalities[equalitiesLength - 1] : -1;
          post_ins = post_del = false;
        }
        changes = true;
      }
    }
    pointer++;
  }

  if (changes) {
    this.diff_cleanupMerge(diffs);
  }
};


/**
 * Reorder and merge like edit sections.  Merge equalities.
 * Any edit section can move as long as it doesn't cross an equality.
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 */
diff_match_patch.prototype.diff_cleanupMerge = function(diffs) {
  diffs.push([DIFF_EQUAL, '']);  // Add a dummy entry at the end.
  var pointer = 0;
  var count_delete = 0;
  var count_insert = 0;
  var text_delete = '';
  var text_insert = '';
  var commonlength;
  while (pointer < diffs.length) {
    switch (diffs[pointer][0]) {
      case DIFF_INSERT:
        count_insert++;
        text_insert += diffs[pointer][1];
        pointer++;
        break;
      case DIFF_DELETE:
        count_delete++;
        text_delete += diffs[pointer][1];
        pointer++;
        break;
      case DIFF_EQUAL:
        // Upon reaching an equality, check for prior redundancies.
        if (count_delete + count_insert > 1) {
          if (count_delete !== 0 && count_insert !== 0) {
            // Factor out any common prefixies.
            commonlength = this.diff_commonPrefix(text_insert, text_delete);
            if (commonlength !== 0) {
              if ((pointer - count_delete - count_insert) > 0 &&
                  diffs[pointer - count_delete - count_insert - 1][0] ==
                  DIFF_EQUAL) {
                diffs[pointer - count_delete - count_insert - 1][1] +=
                    text_insert.substring(0, commonlength);
              } else {
                diffs.splice(0, 0, [DIFF_EQUAL,
                                    text_insert.substring(0, commonlength)]);
                pointer++;
              }
              text_insert = text_insert.substring(commonlength);
              text_delete = text_delete.substring(commonlength);
            }
            // Factor out any common suffixies.
            commonlength = this.diff_commonSuffix(text_insert, text_delete);
            if (commonlength !== 0) {
              diffs[pointer][1] = text_insert.substring(text_insert.length -
                  commonlength) + diffs[pointer][1];
              text_insert = text_insert.substring(0, text_insert.length -
                  commonlength);
              text_delete = text_delete.substring(0, text_delete.length -
                  commonlength);
            }
          }
          // Delete the offending records and add the merged ones.
          if (count_delete === 0) {
            diffs.splice(pointer - count_insert,
                count_delete + count_insert, [DIFF_INSERT, text_insert]);
          } else if (count_insert === 0) {
            diffs.splice(pointer - count_delete,
                count_delete + count_insert, [DIFF_DELETE, text_delete]);
          } else {
            diffs.splice(pointer - count_delete - count_insert,
                count_delete + count_insert, [DIFF_DELETE, text_delete],
                [DIFF_INSERT, text_insert]);
          }
          pointer = pointer - count_delete - count_insert +
                    (count_delete ? 1 : 0) + (count_insert ? 1 : 0) + 1;
        } else if (pointer !== 0 && diffs[pointer - 1][0] == DIFF_EQUAL) {
          // Merge this equality with the previous one.
          diffs[pointer - 1][1] += diffs[pointer][1];
          diffs.splice(pointer, 1);
        } else {
          pointer++;
        }
        count_insert = 0;
        count_delete = 0;
        text_delete = '';
        text_insert = '';
        break;
    }
  }
  if (diffs[diffs.length - 1][1] === '') {
    diffs.pop();  // Remove the dummy entry at the end.
  }

  // Second pass: look for single edits surrounded on both sides by equalities
  // which can be shifted sideways to eliminate an equality.
  // e.g: A<ins>BA</ins>C -> <ins>AB</ins>AC
  var changes = false;
  pointer = 1;
  // Intentionally ignore the first and last element (don't need checking).
  while (pointer < diffs.length - 1) {
    if (diffs[pointer - 1][0] == DIFF_EQUAL &&
        diffs[pointer + 1][0] == DIFF_EQUAL) {
      // This is a single edit surrounded by equalities.
      if (diffs[pointer][1].substring(diffs[pointer][1].length -
          diffs[pointer - 1][1].length) == diffs[pointer - 1][1]) {
        // Shift the edit over the previous equality.
        diffs[pointer][1] = diffs[pointer - 1][1] +
            diffs[pointer][1].substring(0, diffs[pointer][1].length -
                                        diffs[pointer - 1][1].length);
        diffs[pointer + 1][1] = diffs[pointer - 1][1] + diffs[pointer + 1][1];
        diffs.splice(pointer - 1, 1);
        changes = true;
      } else if (diffs[pointer][1].substring(0, diffs[pointer + 1][1].length) ==
          diffs[pointer + 1][1]) {
        // Shift the edit over the next equality.
        diffs[pointer - 1][1] += diffs[pointer + 1][1];
        diffs[pointer][1] =
            diffs[pointer][1].substring(diffs[pointer + 1][1].length) +
            diffs[pointer + 1][1];
        diffs.splice(pointer + 1, 1);
        changes = true;
      }
    }
    pointer++;
  }
  // If shifts were made, the diff needs reordering and another shift sweep.
  if (changes) {
    this.diff_cleanupMerge(diffs);
  }
};


/**
 * loc is a location in text1, compute and return the equivalent location in
 * text2.
 * e.g. 'The cat' vs 'The big cat', 1->1, 5->8
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 * @param {number} loc Location within text1.
 * @return {number} Location within text2.
 */
diff_match_patch.prototype.diff_xIndex = function(diffs, loc) {
  var chars1 = 0;
  var chars2 = 0;
  var last_chars1 = 0;
  var last_chars2 = 0;
  var x;
  for (x = 0; x < diffs.length; x++) {
    if (diffs[x][0] !== DIFF_INSERT) {  // Equality or deletion.
      chars1 += diffs[x][1].length;
    }
    if (diffs[x][0] !== DIFF_DELETE) {  // Equality or insertion.
      chars2 += diffs[x][1].length;
    }
    if (chars1 > loc) {  // Overshot the location.
      break;
    }
    last_chars1 = chars1;
    last_chars2 = chars2;
  }
  // Was the location was deleted?
  if (diffs.length != x && diffs[x][0] === DIFF_DELETE) {
    return last_chars2;
  }
  // Add the remaining character length.
  return last_chars2 + (loc - last_chars1);
};


/**
 * Convert a diff array into a pretty HTML report.
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 * @return {string} HTML representation.
 */
diff_match_patch.prototype.diff_prettyHtml = function(diffs) {
  var html = [];
  var pattern_amp = /&/g;
  var pattern_lt = /</g;
  var pattern_gt = />/g;
  var pattern_para = /\n/g;
  for (var x = 0; x < diffs.length; x++) {
    var op = diffs[x][0];    // Operation (insert, delete, equal)
    var data = diffs[x][1];  // Text of change.
    var text = data.replace(pattern_amp, '&amp;').replace(pattern_lt, '&lt;')
        .replace(pattern_gt, '&gt;').replace(pattern_para, '&para;<br>');
    switch (op) {
      case DIFF_INSERT:
        html[x] = '<ins style="background:#e6ffe6;">' + text + '</ins>';
        break;
      case DIFF_DELETE:
        html[x] = '<del style="background:#ffe6e6;">' + text + '</del>';
        break;
      case DIFF_EQUAL:
        html[x] = '<span>' + text + '</span>';
        break;
    }
  }
  return html.join('');
};


/**
 * Compute and return the source text (all equalities and deletions).
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 * @return {string} Source text.
 */
diff_match_patch.prototype.diff_text1 = function(diffs) {
  var text = [];
  for (var x = 0; x < diffs.length; x++) {
    if (diffs[x][0] !== DIFF_INSERT) {
      text[x] = diffs[x][1];
    }
  }
  return text.join('');
};


/**
 * Compute and return the destination text (all equalities and insertions).
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 * @return {string} Destination text.
 */
diff_match_patch.prototype.diff_text2 = function(diffs) {
  var text = [];
  for (var x = 0; x < diffs.length; x++) {
    if (diffs[x][0] !== DIFF_DELETE) {
      text[x] = diffs[x][1];
    }
  }
  return text.join('');
};


/**
 * Compute the Levenshtein distance; the number of inserted, deleted or
 * substituted characters.
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 * @return {number} Number of changes.
 */
diff_match_patch.prototype.diff_levenshtein = function(diffs) {
  var levenshtein = 0;
  var insertions = 0;
  var deletions = 0;
  for (var x = 0; x < diffs.length; x++) {
    var op = diffs[x][0];
    var data = diffs[x][1];
    switch (op) {
      case DIFF_INSERT:
        insertions += data.length;
        break;
      case DIFF_DELETE:
        deletions += data.length;
        break;
      case DIFF_EQUAL:
        // A deletion and an insertion is one substitution.
        levenshtein += Math.max(insertions, deletions);
        insertions = 0;
        deletions = 0;
        break;
    }
  }
  levenshtein += Math.max(insertions, deletions);
  return levenshtein;
};


/**
 * Crush the diff into an encoded string which describes the operations
 * required to transform text1 into text2.
 * E.g. =3\t-2\t+ing  -> Keep 3 chars, delete 2 chars, insert 'ing'.
 * Operations are tab-separated.  Inserted text is escaped using %xx notation.
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
 * @return {string} Delta text.
 */
diff_match_patch.prototype.diff_toDelta = function(diffs) {
  var text = [];
  for (var x = 0; x < diffs.length; x++) {
    switch (diffs[x][0]) {
      case DIFF_INSERT:
        text[x] = '+' + encodeURI(diffs[x][1]);
        break;
      case DIFF_DELETE:
        text[x] = '-' + diffs[x][1].length;
        break;
      case DIFF_EQUAL:
        text[x] = '=' + diffs[x][1].length;
        break;
    }
  }
  return text.join('\t').replace(/%20/g, ' ');
};


/**
 * Given the original text1, and an encoded string which describes the
 * operations required to transform text1 into text2, compute the full diff.
 * @param {string} text1 Source string for the diff.
 * @param {string} delta Delta text.
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
 * @throws {!Error} If invalid input.
 */
diff_match_patch.prototype.diff_fromDelta = function(text1, delta) {
  var diffs = [];
  var diffsLength = 0;  // Keeping our own length var is faster in JS.
  var pointer = 0;  // Cursor in text1
  var tokens = delta.split(/\t/g);
  for (var x = 0; x < tokens.length; x++) {
    // Each token begins with a one character parameter which specifies the
    // operation of this token (delete, insert, equality).
    var param = tokens[x].substring(1);
    switch (tokens[x].charAt(0)) {
      case '+':
        try {
          diffs[diffsLength++] = [DIFF_INSERT, decodeURI(param)];
        } catch (ex) {
          // Malformed URI sequence.
          throw new Error('Illegal escape in diff_fromDelta: ' + param);
        }
        break;
      case '-':
        // Fall through.
      case '=':
        var n = parseInt(param, 10);
        if (isNaN(n) || n < 0) {
          throw new Error('Invalid number in diff_fromDelta: ' + param);
        }
        var text = text1.substring(pointer, pointer += n);
        if (tokens[x].charAt(0) == '=') {
          diffs[diffsLength++] = [DIFF_EQUAL, text];
        } else {
          diffs[diffsLength++] = [DIFF_DELETE, text];
        }
        break;
      default:
        // Blank tokens are ok (from a trailing \t).
        // Anything else is an error.
        if (tokens[x]) {
          throw new Error('Invalid diff operation in diff_fromDelta: ' +
                          tokens[x]);
        }
    }
  }
  if (pointer != text1.length) {
    throw new Error('Delta length (' + pointer +
        ') does not equal source text length (' + text1.length + ').');
  }
  return diffs;
};


//  MATCH FUNCTIONS


/**
 * Locate the best instance of 'pattern' in 'text' near 'loc'.
 * @param {string} text The text to search.
 * @param {string} pattern The pattern to search for.
 * @param {number} loc The location to search around.
 * @return {number} Best match index or -1.
 */
diff_match_patch.prototype.match_main = function(text, pattern, loc) {
  // Check for null inputs.
  if (text == null || pattern == null || loc == null) {
    throw new Error('Null input. (match_main)');
  }

  loc = Math.max(0, Math.min(loc, text.length));
  if (text == pattern) {
    // Shortcut (potentially not guaranteed by the algorithm)
    return 0;
  } else if (!text.length) {
    // Nothing to match.
    return -1;
  } else if (text.substring(loc, loc + pattern.length) == pattern) {
    // Perfect match at the perfect spot!  (Includes case of null pattern)
    return loc;
  } else {
    // Do a fuzzy compare.
    return this.match_bitap_(text, pattern, loc);
  }
};


/**
 * Locate the best instance of 'pattern' in 'text' near 'loc' using the
 * Bitap algorithm.
 * @param {string} text The text to search.
 * @param {string} pattern The pattern to search for.
 * @param {number} loc The location to search around.
 * @return {number} Best match index or -1.
 * @private
 */
diff_match_patch.prototype.match_bitap_ = function(text, pattern, loc) {
  if (pattern.length > this.Match_MaxBits) {
    throw new Error('Pattern too long for this browser.');
  }

  // Initialise the alphabet.
  var s = this.match_alphabet_(pattern);

  var dmp = this;  // 'this' becomes 'window' in a closure.

  /**
   * Compute and return the score for a match with e errors and x location.
   * Accesses loc and pattern through being a closure.
   * @param {number} e Number of errors in match.
   * @param {number} x Location of match.
   * @return {number} Overall score for match (0.0 = good, 1.0 = bad).
   * @private
   */
  function match_bitapScore_(e, x) {
    var accuracy = e / pattern.length;
    var proximity = Math.abs(loc - x);
    if (!dmp.Match_Distance) {
      // Dodge divide by zero error.
      return proximity ? 1.0 : accuracy;
    }
    return accuracy + (proximity / dmp.Match_Distance);
  }

  // Highest score beyond which we give up.
  var score_threshold = this.Match_Threshold;
  // Is there a nearby exact match? (speedup)
  var best_loc = text.indexOf(pattern, loc);
  if (best_loc != -1) {
    score_threshold = Math.min(match_bitapScore_(0, best_loc), score_threshold);
    // What about in the other direction? (speedup)
    best_loc = text.lastIndexOf(pattern, loc + pattern.length);
    if (best_loc != -1) {
      score_threshold =
          Math.min(match_bitapScore_(0, best_loc), score_threshold);
    }
  }

  // Initialise the bit arrays.
  var matchmask = 1 << (pattern.length - 1);
  best_loc = -1;

  var bin_min, bin_mid;
  var bin_max = pattern.length + text.length;
  var last_rd;
  for (var d = 0; d < pattern.length; d++) {
    // Scan for the best match; each iteration allows for one more error.
    // Run a binary search to determine how far from 'loc' we can stray at this
    // error level.
    bin_min = 0;
    bin_mid = bin_max;
    while (bin_min < bin_mid) {
      if (match_bitapScore_(d, loc + bin_mid) <= score_threshold) {
        bin_min = bin_mid;
      } else {
        bin_max = bin_mid;
      }
      bin_mid = Math.floor((bin_max - bin_min) / 2 + bin_min);
    }
    // Use the result from this iteration as the maximum for the next.
    bin_max = bin_mid;
    var start = Math.max(1, loc - bin_mid + 1);
    var finish = Math.min(loc + bin_mid, text.length) + pattern.length;

    var rd = Array(finish + 2);
    rd[finish + 1] = (1 << d) - 1;
    for (var j = finish; j >= start; j--) {
      // The alphabet (s) is a sparse hash, so the following line generates
      // warnings.
      var charMatch = s[text.charAt(j - 1)];
      if (d === 0) {  // First pass: exact match.
        rd[j] = ((rd[j + 1] << 1) | 1) & charMatch;
      } else {  // Subsequent passes: fuzzy match.
        rd[j] = (((rd[j + 1] << 1) | 1) & charMatch) |
                (((last_rd[j + 1] | last_rd[j]) << 1) | 1) |
                last_rd[j + 1];
      }
      if (rd[j] & matchmask) {
        var score = match_bitapScore_(d, j - 1);
        // This match will almost certainly be better than any existing match.
        // But check anyway.
        if (score <= score_threshold) {
          // Told you so.
          score_threshold = score;
          best_loc = j - 1;
          if (best_loc > loc) {
            // When passing loc, don't exceed our current distance from loc.
            start = Math.max(1, 2 * loc - best_loc);
          } else {
            // Already passed loc, downhill from here on in.
            break;
          }
        }
      }
    }
    // No hope for a (better) match at greater error levels.
    if (match_bitapScore_(d + 1, loc) > score_threshold) {
      break;
    }
    last_rd = rd;
  }
  return best_loc;
};


/**
 * Initialise the alphabet for the Bitap algorithm.
 * @param {string} pattern The text to encode.
 * @return {!Object} Hash of character locations.
 * @private
 */
diff_match_patch.prototype.match_alphabet_ = function(pattern) {
  var s = {};
  for (var i = 0; i < pattern.length; i++) {
    s[pattern.charAt(i)] = 0;
  }
  for (var i = 0; i < pattern.length; i++) {
    s[pattern.charAt(i)] |= 1 << (pattern.length - i - 1);
  }
  return s;
};


//  PATCH FUNCTIONS


/**
 * Increase the context until it is unique,
 * but don't let the pattern expand beyond Match_MaxBits.
 * @param {!diff_match_patch.patch_obj} patch The patch to grow.
 * @param {string} text Source text.
 * @private
 */
diff_match_patch.prototype.patch_addContext_ = function(patch, text) {
  if (text.length == 0) {
    return;
  }
  var pattern = text.substring(patch.start2, patch.start2 + patch.length1);
  var padding = 0;

  // Look for the first and last matches of pattern in text.  If two different
  // matches are found, increase the pattern length.
  while (text.indexOf(pattern) != text.lastIndexOf(pattern) &&
         pattern.length < this.Match_MaxBits - this.Patch_Margin -
         this.Patch_Margin) {
    padding += this.Patch_Margin;
    pattern = text.substring(patch.start2 - padding,
                             patch.start2 + patch.length1 + padding);
  }
  // Add one chunk for good luck.
  padding += this.Patch_Margin;

  // Add the prefix.
  var prefix = text.substring(patch.start2 - padding, patch.start2);
  if (prefix) {
    patch.diffs.unshift([DIFF_EQUAL, prefix]);
  }
  // Add the suffix.
  var suffix = text.substring(patch.start2 + patch.length1,
                              patch.start2 + patch.length1 + padding);
  if (suffix) {
    patch.diffs.push([DIFF_EQUAL, suffix]);
  }

  // Roll back the start points.
  patch.start1 -= prefix.length;
  patch.start2 -= prefix.length;
  // Extend the lengths.
  patch.length1 += prefix.length + suffix.length;
  patch.length2 += prefix.length + suffix.length;
};


/**
 * Compute a list of patches to turn text1 into text2.
 * Use diffs if provided, otherwise compute it ourselves.
 * There are four ways to call this function, depending on what data is
 * available to the caller:
 * Method 1:
 * a = text1, b = text2
 * Method 2:
 * a = diffs
 * Method 3 (optimal):
 * a = text1, b = diffs
 * Method 4 (deprecated, use method 3):
 * a = text1, b = text2, c = diffs
 *
 * @param {string|!Array.<!diff_match_patch.Diff>} a text1 (methods 1,3,4) or
 * Array of diff tuples for text1 to text2 (method 2).
 * @param {string|!Array.<!diff_match_patch.Diff>} opt_b text2 (methods 1,4) or
 * Array of diff tuples for text1 to text2 (method 3) or undefined (method 2).
 * @param {string|!Array.<!diff_match_patch.Diff>} opt_c Array of diff tuples
 * for text1 to text2 (method 4) or undefined (methods 1,2,3).
 * @return {!Array.<!diff_match_patch.patch_obj>} Array of Patch objects.
 */
diff_match_patch.prototype.patch_make = function(a, opt_b, opt_c) {
  var text1, diffs;
  if (typeof a == 'string' && typeof opt_b == 'string' &&
      typeof opt_c == 'undefined') {
    // Method 1: text1, text2
    // Compute diffs from text1 and text2.
    text1 = /** @type {string} */(a);
    diffs = this.diff_main(text1, /** @type {string} */(opt_b), true);
    if (diffs.length > 2) {
      this.diff_cleanupSemantic(diffs);
      this.diff_cleanupEfficiency(diffs);
    }
  } else if (a && typeof a == 'object' && typeof opt_b == 'undefined' &&
      typeof opt_c == 'undefined') {
    // Method 2: diffs
    // Compute text1 from diffs.
    diffs = /** @type {!Array.<!diff_match_patch.Diff>} */(a);
    text1 = this.diff_text1(diffs);
  } else if (typeof a == 'string' && opt_b && typeof opt_b == 'object' &&
      typeof opt_c == 'undefined') {
    // Method 3: text1, diffs
    text1 = /** @type {string} */(a);
    diffs = /** @type {!Array.<!diff_match_patch.Diff>} */(opt_b);
  } else if (typeof a == 'string' && typeof opt_b == 'string' &&
      opt_c && typeof opt_c == 'object') {
    // Method 4: text1, text2, diffs
    // text2 is not used.
    text1 = /** @type {string} */(a);
    diffs = /** @type {!Array.<!diff_match_patch.Diff>} */(opt_c);
  } else {
    throw new Error('Unknown call format to patch_make.');
  }

  if (diffs.length === 0) {
    return [];  // Get rid of the null case.
  }
  var patches = [];
  var patch = new diff_match_patch.patch_obj();
  var patchDiffLength = 0;  // Keeping our own length var is faster in JS.
  var char_count1 = 0;  // Number of characters into the text1 string.
  var char_count2 = 0;  // Number of characters into the text2 string.
  // Start with text1 (prepatch_text) and apply the diffs until we arrive at
  // text2 (postpatch_text).  We recreate the patches one by one to determine
  // context info.
  var prepatch_text = text1;
  var postpatch_text = text1;
  for (var x = 0; x < diffs.length; x++) {
    var diff_type = diffs[x][0];
    var diff_text = diffs[x][1];

    if (!patchDiffLength && diff_type !== DIFF_EQUAL) {
      // A new patch starts here.
      patch.start1 = char_count1;
      patch.start2 = char_count2;
    }

    switch (diff_type) {
      case DIFF_INSERT:
        patch.diffs[patchDiffLength++] = diffs[x];
        patch.length2 += diff_text.length;
        postpatch_text = postpatch_text.substring(0, char_count2) + diff_text +
                         postpatch_text.substring(char_count2);
        break;
      case DIFF_DELETE:
        patch.length1 += diff_text.length;
        patch.diffs[patchDiffLength++] = diffs[x];
        postpatch_text = postpatch_text.substring(0, char_count2) +
                         postpatch_text.substring(char_count2 +
                             diff_text.length);
        break;
      case DIFF_EQUAL:
        if (diff_text.length <= 2 * this.Patch_Margin &&
            patchDiffLength && diffs.length != x + 1) {
          // Small equality inside a patch.
          patch.diffs[patchDiffLength++] = diffs[x];
          patch.length1 += diff_text.length;
          patch.length2 += diff_text.length;
        } else if (diff_text.length >= 2 * this.Patch_Margin) {
          // Time for a new patch.
          if (patchDiffLength) {
            this.patch_addContext_(patch, prepatch_text);
            patches.push(patch);
            patch = new diff_match_patch.patch_obj();
            patchDiffLength = 0;
            // Unlike Unidiff, our patch lists have a rolling context.
            // http://code.google.com/p/google-diff-match-patch/wiki/Unidiff
            // Update prepatch text & pos to reflect the application of the
            // just completed patch.
            prepatch_text = postpatch_text;
            char_count1 = char_count2;
          }
        }
        break;
    }

    // Update the current character count.
    if (diff_type !== DIFF_INSERT) {
      char_count1 += diff_text.length;
    }
    if (diff_type !== DIFF_DELETE) {
      char_count2 += diff_text.length;
    }
  }
  // Pick up the leftover patch if not empty.
  if (patchDiffLength) {
    this.patch_addContext_(patch, prepatch_text);
    patches.push(patch);
  }

  return patches;
};


/**
 * Given an array of patches, return another array that is identical.
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.
 * @return {!Array.<!diff_match_patch.patch_obj>} Array of Patch objects.
 */
diff_match_patch.prototype.patch_deepCopy = function(patches) {
  // Making deep copies is hard in JavaScript.
  var patchesCopy = [];
  for (var x = 0; x < patches.length; x++) {
    var patch = patches[x];
    var patchCopy = new diff_match_patch.patch_obj();
    patchCopy.diffs = [];
    for (var y = 0; y < patch.diffs.length; y++) {
      patchCopy.diffs[y] = patch.diffs[y].slice();
    }
    patchCopy.start1 = patch.start1;
    patchCopy.start2 = patch.start2;
    patchCopy.length1 = patch.length1;
    patchCopy.length2 = patch.length2;
    patchesCopy[x] = patchCopy;
  }
  return patchesCopy;
};


/**
 * Merge a set of patches onto the text.  Return a patched text, as well
 * as a list of true/false values indicating which patches were applied.
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.
 * @param {string} text Old text.
 * @return {!Array.<string|!Array.<boolean>>} Two element Array, containing the
 *      new text and an array of boolean values.
 */
diff_match_patch.prototype.patch_apply = function(patches, text) {
  if (patches.length == 0) {
    return [text, []];
  }

  // Deep copy the patches so that no changes are made to originals.
  patches = this.patch_deepCopy(patches);

  var nullPadding = this.patch_addPadding(patches);
  text = nullPadding + text + nullPadding;

  this.patch_splitMax(patches);
  // delta keeps track of the offset between the expected and actual location
  // of the previous patch.  If there are patches expected at positions 10 and
  // 20, but the first patch was found at 12, delta is 2 and the second patch
  // has an effective expected position of 22.
  var delta = 0;
  var results = [];
  for (var x = 0; x < patches.length; x++) {
    var expected_loc = patches[x].start2 + delta;
    var text1 = this.diff_text1(patches[x].diffs);
    var start_loc;
    var end_loc = -1;
    if (text1.length > this.Match_MaxBits) {
      // patch_splitMax will only provide an oversized pattern in the case of
      // a monster delete.
      start_loc = this.match_main(text, text1.substring(0, this.Match_MaxBits),
                                  expected_loc);
      if (start_loc != -1) {
        end_loc = this.match_main(text,
            text1.substring(text1.length - this.Match_MaxBits),
            expected_loc + text1.length - this.Match_MaxBits);
        if (end_loc == -1 || start_loc >= end_loc) {
          // Can't find valid trailing context.  Drop this patch.
          start_loc = -1;
        }
      }
    } else {
      start_loc = this.match_main(text, text1, expected_loc);
    }
    if (start_loc == -1) {
      // No match found.  :(
      results[x] = false;
      // Subtract the delta for this failed patch from subsequent patches.
      delta -= patches[x].length2 - patches[x].length1;
    } else {
      // Found a match.  :)
      results[x] = true;
      delta = start_loc - expected_loc;
      var text2;
      if (end_loc == -1) {
        text2 = text.substring(start_loc, start_loc + text1.length);
      } else {
        text2 = text.substring(start_loc, end_loc + this.Match_MaxBits);
      }
      if (text1 == text2) {
        // Perfect match, just shove the replacement text in.
        text = text.substring(0, start_loc) +
               this.diff_text2(patches[x].diffs) +
               text.substring(start_loc + text1.length);
      } else {
        // Imperfect match.  Run a diff to get a framework of equivalent
        // indices.
        var diffs = this.diff_main(text1, text2, false);
        if (text1.length > this.Match_MaxBits &&
            this.diff_levenshtein(diffs) / text1.length >
            this.Patch_DeleteThreshold) {
          // The end points match, but the content is unacceptably bad.
          results[x] = false;
        } else {
          this.diff_cleanupSemanticLossless(diffs);
          var index1 = 0;
          var index2;
          for (var y = 0; y < patches[x].diffs.length; y++) {
            var mod = patches[x].diffs[y];
            if (mod[0] !== DIFF_EQUAL) {
              index2 = this.diff_xIndex(diffs, index1);
            }
            if (mod[0] === DIFF_INSERT) {  // Insertion
              text = text.substring(0, start_loc + index2) + mod[1] +
                     text.substring(start_loc + index2);
            } else if (mod[0] === DIFF_DELETE) {  // Deletion
              text = text.substring(0, start_loc + index2) +
                     text.substring(start_loc + this.diff_xIndex(diffs,
                         index1 + mod[1].length));
            }
            if (mod[0] !== DIFF_DELETE) {
              index1 += mod[1].length;
            }
          }
        }
      }
    }
  }
  // Strip the padding off.
  text = text.substring(nullPadding.length, text.length - nullPadding.length);
  return [text, results];
};


/**
 * Add some padding on text start and end so that edges can match something.
 * Intended to be called only from within patch_apply.
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.
 * @return {string} The padding string added to each side.
 */
diff_match_patch.prototype.patch_addPadding = function(patches) {
  var paddingLength = this.Patch_Margin;
  var nullPadding = '';
  for (var x = 1; x <= paddingLength; x++) {
    nullPadding += String.fromCharCode(x);
  }

  // Bump all the patches forward.
  for (var x = 0; x < patches.length; x++) {
    patches[x].start1 += paddingLength;
    patches[x].start2 += paddingLength;
  }

  // Add some padding on start of first diff.
  var patch = patches[0];
  var diffs = patch.diffs;
  if (diffs.length == 0 || diffs[0][0] != DIFF_EQUAL) {
    // Add nullPadding equality.
    diffs.unshift([DIFF_EQUAL, nullPadding]);
    patch.start1 -= paddingLength;  // Should be 0.
    patch.start2 -= paddingLength;  // Should be 0.
    patch.length1 += paddingLength;
    patch.length2 += paddingLength;
  } else if (paddingLength > diffs[0][1].length) {
    // Grow first equality.
    var extraLength = paddingLength - diffs[0][1].length;
    diffs[0][1] = nullPadding.substring(diffs[0][1].length) + diffs[0][1];
    patch.start1 -= extraLength;
    patch.start2 -= extraLength;
    patch.length1 += extraLength;
    patch.length2 += extraLength;
  }

  // Add some padding on end of last diff.
  patch = patches[patches.length - 1];
  diffs = patch.diffs;
  if (diffs.length == 0 || diffs[diffs.length - 1][0] != DIFF_EQUAL) {
    // Add nullPadding equality.
    diffs.push([DIFF_EQUAL, nullPadding]);
    patch.length1 += paddingLength;
    patch.length2 += paddingLength;
  } else if (paddingLength > diffs[diffs.length - 1][1].length) {
    // Grow last equality.
    var extraLength = paddingLength - diffs[diffs.length - 1][1].length;
    diffs[diffs.length - 1][1] += nullPadding.substring(0, extraLength);
    patch.length1 += extraLength;
    patch.length2 += extraLength;
  }

  return nullPadding;
};


/**
 * Look through the patches and break up any which are longer than the maximum
 * limit of the match algorithm.
 * Intended to be called only from within patch_apply.
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.
 */
diff_match_patch.prototype.patch_splitMax = function(patches) {
  var patch_size = this.Match_MaxBits;
  for (var x = 0; x < patches.length; x++) {
    if (patches[x].length1 <= patch_size) {
      continue;
    }
    var bigpatch = patches[x];
    // Remove the big old patch.
    patches.splice(x--, 1);
    var start1 = bigpatch.start1;
    var start2 = bigpatch.start2;
    var precontext = '';
    while (bigpatch.diffs.length !== 0) {
      // Create one of several smaller patches.
      var patch = new diff_match_patch.patch_obj();
      var empty = true;
      patch.start1 = start1 - precontext.length;
      patch.start2 = start2 - precontext.length;
      if (precontext !== '') {
        patch.length1 = patch.length2 = precontext.length;
        patch.diffs.push([DIFF_EQUAL, precontext]);
      }
      while (bigpatch.diffs.length !== 0 &&
             patch.length1 < patch_size - this.Patch_Margin) {
        var diff_type = bigpatch.diffs[0][0];
        var diff_text = bigpatch.diffs[0][1];
        if (diff_type === DIFF_INSERT) {
          // Insertions are harmless.
          patch.length2 += diff_text.length;
          start2 += diff_text.length;
          patch.diffs.push(bigpatch.diffs.shift());
          empty = false;
        } else if (diff_type === DIFF_DELETE && patch.diffs.length == 1 &&
                   patch.diffs[0][0] == DIFF_EQUAL &&
                   diff_text.length > 2 * patch_size) {
          // This is a large deletion.  Let it pass in one chunk.
          patch.length1 += diff_text.length;
          start1 += diff_text.length;
          empty = false;
          patch.diffs.push([diff_type, diff_text]);
          bigpatch.diffs.shift();
        } else {
          // Deletion or equality.  Only take as much as we can stomach.
          diff_text = diff_text.substring(0,
              patch_size - patch.length1 - this.Patch_Margin);
          patch.length1 += diff_text.length;
          start1 += diff_text.length;
          if (diff_type === DIFF_EQUAL) {
            patch.length2 += diff_text.length;
            start2 += diff_text.length;
          } else {
            empty = false;
          }
          patch.diffs.push([diff_type, diff_text]);
          if (diff_text == bigpatch.diffs[0][1]) {
            bigpatch.diffs.shift();
          } else {
            bigpatch.diffs[0][1] =
                bigpatch.diffs[0][1].substring(diff_text.length);
          }
        }
      }
      // Compute the head context for the next patch.
      precontext = this.diff_text2(patch.diffs);
      precontext =
          precontext.substring(precontext.length - this.Patch_Margin);
      // Append the end context for this patch.
      var postcontext = this.diff_text1(bigpatch.diffs)
                            .substring(0, this.Patch_Margin);
      if (postcontext !== '') {
        patch.length1 += postcontext.length;
        patch.length2 += postcontext.length;
        if (patch.diffs.length !== 0 &&
            patch.diffs[patch.diffs.length - 1][0] === DIFF_EQUAL) {
          patch.diffs[patch.diffs.length - 1][1] += postcontext;
        } else {
          patch.diffs.push([DIFF_EQUAL, postcontext]);
        }
      }
      if (!empty) {
        patches.splice(++x, 0, patch);
      }
    }
  }
};


/**
 * Take a list of patches and return a textual representation.
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.
 * @return {string} Text representation of patches.
 */
diff_match_patch.prototype.patch_toText = function(patches) {
  var text = [];
  for (var x = 0; x < patches.length; x++) {
    text[x] = patches[x];
  }
  return text.join('');
};


/**
 * Parse a textual representation of patches and return a list of Patch objects.
 * @param {string} textline Text representation of patches.
 * @return {!Array.<!diff_match_patch.patch_obj>} Array of Patch objects.
 * @throws {!Error} If invalid input.
 */
diff_match_patch.prototype.patch_fromText = function(textline) {
  var patches = [];
  if (!textline) {
    return patches;
  }
  var text = textline.split('\n');
  var textPointer = 0;
  var patchHeader = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@$/;
  while (textPointer < text.length) {
    var m = text[textPointer].match(patchHeader);
    if (!m) {
      throw new Error('Invalid patch string: ' + text[textPointer]);
    }
    var patch = new diff_match_patch.patch_obj();
    patches.push(patch);
    patch.start1 = parseInt(m[1], 10);
    if (m[2] === '') {
      patch.start1--;
      patch.length1 = 1;
    } else if (m[2] == '0') {
      patch.length1 = 0;
    } else {
      patch.start1--;
      patch.length1 = parseInt(m[2], 10);
    }

    patch.start2 = parseInt(m[3], 10);
    if (m[4] === '') {
      patch.start2--;
      patch.length2 = 1;
    } else if (m[4] == '0') {
      patch.length2 = 0;
    } else {
      patch.start2--;
      patch.length2 = parseInt(m[4], 10);
    }
    textPointer++;

    while (textPointer < text.length) {
      var sign = text[textPointer].charAt(0);
      try {
        var line = decodeURI(text[textPointer].substring(1));
      } catch (ex) {
        // Malformed URI sequence.
        throw new Error('Illegal escape in patch_fromText: ' + line);
      }
      if (sign == '-') {
        // Deletion.
        patch.diffs.push([DIFF_DELETE, line]);
      } else if (sign == '+') {
        // Insertion.
        patch.diffs.push([DIFF_INSERT, line]);
      } else if (sign == ' ') {
        // Minor equality.
        patch.diffs.push([DIFF_EQUAL, line]);
      } else if (sign == '@') {
        // Start of next patch.
        break;
      } else if (sign === '') {
        // Blank line?  Whatever.
      } else {
        // WTF?
        throw new Error('Invalid patch mode "' + sign + '" in: ' + line);
      }
      textPointer++;
    }
  }
  return patches;
};


/**
 * Class representing one patch operation.
 * @constructor
 */
diff_match_patch.patch_obj = function() {
  /** @type {!Array.<!diff_match_patch.Diff>} */
  this.diffs = [];
  /** @type {?number} */
  this.start1 = null;
  /** @type {?number} */
  this.start2 = null;
  /** @type {number} */
  this.length1 = 0;
  /** @type {number} */
  this.length2 = 0;
};


/**
 * Emmulate GNU diff's format.
 * Header: @@ -382,8 +481,9 @@
 * Indicies are printed as 1-based, not 0-based.
 * @return {string} The GNU diff string.
 */
diff_match_patch.patch_obj.prototype.toString = function() {
  var coords1, coords2;
  if (this.length1 === 0) {
    coords1 = this.start1 + ',0';
  } else if (this.length1 == 1) {
    coords1 = this.start1 + 1;
  } else {
    coords1 = (this.start1 + 1) + ',' + this.length1;
  }
  if (this.length2 === 0) {
    coords2 = this.start2 + ',0';
  } else if (this.length2 == 1) {
    coords2 = this.start2 + 1;
  } else {
    coords2 = (this.start2 + 1) + ',' + this.length2;
  }
  var text = ['@@ -' + coords1 + ' +' + coords2 + ' @@\n'];
  var op;
  // Escape the body of the patch with %xx notation.
  for (var x = 0; x < this.diffs.length; x++) {
    switch (this.diffs[x][0]) {
      case DIFF_INSERT:
        op = '+';
        break;
      case DIFF_DELETE:
        op = '-';
        break;
      case DIFF_EQUAL:
        op = ' ';
        break;
    }
    text[x + 1] = op + encodeURI(this.diffs[x][1]) + '\n';
  }
  return text.join('').replace(/%20/g, ' ');
};


// Export these global variables so that they survive Google's JS compiler.
// In a browser, 'this' will be 'window'.
// Users of node.js should 'require' the uncompressed version since Google's
// JS compiler may break the following exports for non-browser environments.
this['diff_match_patch'] = diff_match_patch;
this['DIFF_DELETE'] = DIFF_DELETE;
this['DIFF_INSERT'] = DIFF_INSERT;
this['DIFF_EQUAL'] = DIFF_EQUAL;

},{}]},{},[1])
(1)
});